/**
 * data_pool.js — Cache central de dados servidos como JSON estático.
 *
 * Filosofia:
 *  • Cada arquivo JSON é fetchado no máximo uma vez por sessão.
 *  • Requests concorrentes pela mesma chave são dedupados (retornam a
 *    mesma Promise em voo).
 *  • Composição "Todos" feita em memória, sem arquivo dedicado.
 *  • Preload em background depois da primeira pintura — não bloqueia UI.
 *
 * API pública:
 *   pool.meta()                  → Promise<MetaJSON>
 *   pool.fundos(inst)            → Promise<Fundo[]>
 *   pool.previdencia(inst)       → Promise<Fundo[]>
 *   pool.cotas(inst)             → Promise<CotasJSON>
 *   pool.fundosTodos()           → Promise<Fundo[]>  (concat + dedup)
 *   pool.previdenciaTodos()      → Promise<Fundo[]>
 *   pool.preload(insts, kinds)   → void  (fire-and-forget)
 *   pool.on(event, callback)     → () => void  (unsubscribe)
 *
 * Eventos:
 *   'loaded' (inst, kind)        — dispara quando um JSON terminou de chegar
 *   'error'  (inst, kind, err)   — falha de fetch
 */

const SCHEMA_ESPERADO = 1;
const INSTITUICOES_VALIDAS = ['itau', 'btg', 'xp', 'inter'];

class DataPool {
  constructor(baseUrl = './data/') {
    this.baseUrl = baseUrl;
    this._cache = new Map();           // chave → Promise<dados>
    this._listeners = { loaded: [], error: [] };
  }

  /**
   * Fetch genérico com dedup, cache permanente e validação leve de schema.
   */
  async _fetch(key, url, { cache = 'default' } = {}) {
    if (this._cache.has(key)) return this._cache.get(key);

    const promise = (async () => {
      const resp = await fetch(url, { cache });
      if (!resp.ok) {
        throw new Error(`Falha ao buscar ${url}: HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data._schema && data._schema !== SCHEMA_ESPERADO) {
        console.warn(
          `[data_pool] ${url}: schema ${data._schema}, esperado ${SCHEMA_ESPERADO}. ` +
          `Tentando processar mesmo assim.`
        );
      }
      return data;
    })();

    // Cache antes de await pra que requests concorrentes peguem a mesma Promise.
    this._cache.set(key, promise);

    // Notifica + retroage erro: se a Promise rejeitar, remove do cache pra
    // permitir retry no próximo chamado.
    promise.then(
      () => this._emit('loaded', ...key.split(':')),
      (err) => {
        this._cache.delete(key);
        this._emit('error', ...key.split(':'), err);
      }
    );

    return promise;
  }

  meta() {
    // meta.json é a fonte da "versão": sempre revalidado (304 barato) pra
    // detectar quando o pipeline gerou dados novos. NÃO leva ?v=.
    return this._fetch('meta:_', `${this.baseUrl}meta.json`, { cache: 'no-cache' });
  }

  /**
   * Versão dos dados, derivada do meta.json (gerado_em do pipeline). Usada pra
   * carimbar a URL dos arquivos versionados (?v=...): quando o pipeline roda, a
   * versão muda → a URL muda → o browser busca a cópia nova; enquanto não muda,
   * revisitas vêm do disco sem ida à rede. Memoizada; se o meta falhar, cai pra
   * '' (URL sem versão) e permite retry depois.
   */
  _version() {
    if (!this._versionPromise) {
      this._versionPromise = this.meta()
        .then(m => String(m.gerado_em || m.ultima_data_cota || '').replace(/\D/g, '').slice(0, 14))
        .catch(() => { this._versionPromise = null; return ''; });
    }
    return this._versionPromise;
  }

  async _versionParam() {
    const v = await this._version();
    return v ? `?v=${v}` : '';
  }

  async fundos(inst) {
    this._assertInst(inst);
    const vp = await this._versionParam();
    const d = await this._fetch(`fundos:${inst}`, `${this.baseUrl}fundos_${inst}.json${vp}`);
    return d.fundos;
  }

  async previdencia(inst) {
    this._assertInst(inst);
    const vp = await this._versionParam();
    const d = await this._fetch(`previdencia:${inst}`, `${this.baseUrl}prev_${inst}.json${vp}`);
    return d.fundos;
  }

  /**
   * Cotas particionadas por janela: '3m', '12m' ou 'max' (5 anos).
   * Cliente pede a menor janela que cobre o caso de uso. Pode pular pra 'max'
   * automaticamente se a janela menor não existir (ex.: mock data).
   *
   * aba = 'fundos' (default) ou 'previdencia'. Previdência usa arquivos
   * com sufixo _prev: cotas_<inst>_prev[_3m|_12m].json
   *
   * Default 'max' pra back-compat com Fase 3 inicial.
   */
  async cotas(inst, janela = 'max', aba = 'fundos') {
    this._assertInst(inst);
    const vp = await this._versionParam();
    const prevSuf = aba === 'previdencia' ? '_prev' : '';
    const janelaSuf = janela === 'max' ? '' : `_${janela}`;
    const arquivo = `cotas_${inst}${prevSuf}${janelaSuf}.json`;
    try {
      return await this._fetch(`cotas:${inst}:${aba}:${janela}`, `${this.baseUrl}${arquivo}${vp}`);
    } catch (_) {
      // Fallback: se a janela específica não existe, tenta 'max'.
      if (janela !== 'max') {
        const fallback = `cotas_${inst}${prevSuf}.json`;
        console.warn(`[data_pool] ${arquivo} não disponível, caindo pra ${fallback}`);
        return this._fetch(`cotas:${inst}:${aba}:max`, `${this.baseUrl}${fallback}${vp}`);
      }
      throw new Error(`Cotas (${aba}) indisponíveis pra ${inst}`);
    }
  }

  /** Atalho: cotas de previdência. Mesmo schema das cotas regulares. */
  cotasPrev(inst, janela = 'max') {
    return this.cotas(inst, janela, 'previdencia');
  }

  /**
   * Composição "Todos": concat de 4 instituições + dedup por serie_id.
   * Requests em paralelo. Aceita lista parcial se alguma instituição não
   * tem dados pra esse kind (ex.: só Itaú e BTG têm previdência).
   */
  async fundosTodos() {
    const meta = await this.meta();
    const insts = meta.instituicoes.filter(i => i.tem_fundos && !i.oculto).map(i => i.id);
    return this._concatDedup(insts.map(i => this.fundos(i)));
  }

  async previdenciaTodos() {
    const meta = await this.meta();
    const insts = meta.instituicoes.filter(i => i.tem_previdencia && !i.oculto).map(i => i.id);
    return this._concatDedup(insts.map(i => this.previdencia(i)));
  }

  /**
   * Cotas combinadas de todas as instituições com cotas disponíveis.
   * Implementação:
   *   1) Carrega cotas de cada instituição em paralelo (4 fetches).
   *   2) Cria um array de datas unificado (union ordenada).
   *   3) Reindexa cada série pra esse eixo unificado, preenchendo com null.
   *   4) Dedupa por cnpj — se aparece em múltiplas instituições, pega a
   *      primeira ocorrência (que tem o histórico mais consistente).
   *
   * AVISO: pode ser muito pesado (até ~10 MB gzip combinados). Use só quando
   * o usuário escolheu explicitamente "Todos".
   */
  async cotasTodos(janela = 'max', aba = 'fundos') {
    const meta = await this.meta();
    // Tenta TODAS as instituições conhecidas, independente do flag `tem_cotas`
    // do meta (o flag pode estar desatualizado se o pipeline rodou com
    // --skip-cotas). Cada fetch que falhar simplesmente é ignorado.
    const insts = meta.instituicoes.filter(i => !i.oculto).map(i => i.id);
    const payloads = (await Promise.all(
      insts.map(i => this.cotas(i, janela, aba).catch(() => null))
    )).filter(Boolean);
    if (payloads.length === 0) {
      throw new Error(`Nenhuma instituição com cotas (${aba}) disponíveis.`);
    }

    // Union ordenada de todas as datas.
    const datasSet = new Set();
    for (const p of payloads) for (const d of p.datas) datasSet.add(d);
    const datas = [...datasSet].sort();
    const idxData = new Map(datas.map((d, i) => [d, i]));
    const n = datas.length;

    const cotas = {};
    for (const p of payloads) {
      const idxLocal = new Map(p.datas.map((d, i) => [d, i]));
      for (const [cnpj, serieLocal] of Object.entries(p.cotas)) {
        if (cotas[cnpj]) continue;  // primeira ocorrência ganha
        const serie = new Array(n).fill(null);
        for (let i = 0; i < p.datas.length; i++) {
          serie[idxData.get(p.datas[i])] = serieLocal[i];
        }
        cotas[cnpj] = serie;
      }
    }
    return { _schema: 1, instituicao: 'todos', aba, datas, cotas };
  }

  /** Atalho pra cotas de previdência combinadas de todas as instituições. */
  cotasPrevTodos(janela = 'max') {
    return this.cotasTodos(janela, 'previdencia');
  }

  async _concatDedup(promises) {
    const arrays = await Promise.all(promises);
    const acc = new Map();
    for (const arr of arrays) {
      for (const f of arr) {
        const key = f.serie_id || f.cnpj;
        if (acc.has(key)) {
          const ex = acc.get(key);
          if (!ex.instituicoes) ex.instituicoes = [ex.instituicao];
          if (f.instituicao && !ex.instituicoes.includes(f.instituicao)) {
            ex.instituicoes.push(f.instituicao);
          }
        } else {
          // Clone superficial pra não mutar o original do cache.
          acc.set(key, { ...f, instituicoes: f.instituicao ? [f.instituicao] : [] });
        }
      }
    }
    return [...acc.values()];
  }

  /**
   * Dispara preload em background. Use depois da primeira pintura útil
   * pra que cliques subsequentes no switcher fiquem instantâneos.
   *
   * `kinds` default = ['fundos'] (só fundos). Passe ['fundos','prev']
   * pra incluir previdência também.
   */
  preload(insts, kinds = ['fundos']) {
    for (const inst of insts) {
      if (!INSTITUICOES_VALIDAS.includes(inst)) continue;
      if (kinds.includes('fundos')) this.fundos(inst).catch(() => {});
      if (kinds.includes('prev'))   this.previdencia(inst).catch(() => {});
    }
  }

  /**
   * Subscribe a evento. Retorna função de unsubscribe.
   */
  on(event, callback) {
    if (!this._listeners[event]) return () => {};
    this._listeners[event].push(callback);
    return () => {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    };
  }

  _emit(event, ...args) {
    const ls = this._listeners[event] || [];
    for (const cb of ls) {
      try { cb(...args); } catch (e) { console.error('[data_pool] listener:', e); }
    }
  }

  _assertInst(inst) {
    if (!INSTITUICOES_VALIDAS.includes(inst)) {
      throw new Error(`Instituição inválida: ${inst}. Use uma de: ${INSTITUICOES_VALIDAS.join(', ')}`);
    }
  }
}

/**
 * Resolve o path da pasta data/ relativo à URL da página atual.
 * Páginas estão na raiz do site (fundos.html, comparacao.html, etc.)
 * e calculadoras/ está um nível abaixo.
 */
function resolverBaseUrl() {
  const base = document.querySelector('base');
  if (base?.href) return new URL('data/', base.href).pathname;
  const path = window.location.pathname;
  if (path.includes('/calculadoras/')) return '../data/';
  return './data/';
}

// Singleton. Importe sempre `pool`, nunca crie nova instância.
export const pool = new DataPool(resolverBaseUrl());

// Pra debug no console do browser.
if (typeof window !== 'undefined') window.__pool = pool;
