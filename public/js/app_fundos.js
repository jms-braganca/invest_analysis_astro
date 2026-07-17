/**
 * app_fundos.js — Página de fundos (V2 — visual idêntico ao original).
 *
 * Estratégia:
 *  1) Shell HTML estático (topbar + hero + switcher + ap-page com search/filters).
 *  2) JS busca fundos via data_pool e gera o markup das class-blocks + tables
 *     com EXATAMENTE o mesmo HTML que o original tinha inline.
 *  3) Sort, busca, troca de janela (12m/24m) e troca de instituição rerodam
 *     a renderização — sem precisar do private-fundos.js legacy.
 *
 * Markup gerado é compatível com `shared/private-fundos.css`.
 */

import { pool } from './data_pool.js';

// ── Ordem fixa das classes (fornecida pelo user) ────────────────────────
// Cada entrada: { id, label_curto, classe (nome exato no JSON), icon }.
// O label_curto aparece na class-rail (sidebar); a classe é o nome usado no
// header do acordeão e no agrupamento.

const ICONE = {
  // SVG inline (path d="...") sem fechar — montamos no _icon().
  bars3:       'M3 7h18M3 12h18M3 17h12',
  shield:      'M3 9h18M3 9l4-5h10l4 5M5 9v11h14V9',
  bridge:      'M3 21h18M5 21v-7l3-2 4 2 4-2 3 2v7M9 14V9l3-3 3 3v5',
  trend:       'M3 13l4-4 4 4 7-7M16 6h5v5',
  bolt:        'M13 2L3 14h7l-1 8 11-13h-7l1-7',
  trendUp:     'M3 17l6-6 4 4 8-8M14 7h7v7',
  bars:        'M5 21V9M12 21V3M19 21v-7',
  diamond:     'M12 2l10 10-10 10L2 12z',
  bitcoin:     'M8 6h6a4 4 0 010 8H8M8 14h7a4 4 0 010 8H8M10 6V3M10 22v-3M14 6V3M14 22v-3',
  globeUsd:    'M2 12h20',     // combinado com circle
  globeBrl:    'M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  leaf:        'M12 22V8M5 12c0-4 3-7 7-7s7 3 7 7M5 19c0-4 3-7 7-7',
  rocket:      'M4.5 16.5L9 21l3-3-1.5-3L4.5 16.5zM14 4l6 6-9 9-6-6L14 4zM14 4l-4 4M16 6l-4 4',
  layers:      'M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  building:    'M3 21h18M5 21V3h14v18M9 8h6M9 12h6M9 16h6',
  crown:       'M3 18h18l-2-10-5 5-3-7-3 7-5-5z',
  pie:         'M12 2v10l8 5A10 10 0 1112 2z',
  star:        'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  dots:        'M5 12h.01M12 12h.01M19 12h.01',
  scales:      'M3 21h18M12 3v18M5 9l3-6 3 6M16 9l3-6 3 6M5 9a3 3 0 006 0M16 9a3 3 0 006 0',
  dollar:      'M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6',
  home:        'M3 12l9-9 9 9M5 10v10h14V10',
  cycle:       'M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5',
};

const _icone = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra}<path d="${paths}"/></svg>`;

const _iconeCircle = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="${paths}"/></svg>`;

const CLASSES_FUNDOS = [
  { id: 'rf-simples',          label_curto: 'RF Simples',           classe: 'Renda Fixa Simples',                                   icon: _icone(ICONE.bars3) },
  { id: 'credito-privado',     label_curto: 'Crédito Privado',      classe: 'Crédito Privado',                                       icon: _icone(ICONE.shield) },
  { id: 'debentures-infra',    label_curto: 'Debêntures Infra',     classe: 'Debêntures ou Infraestrutura - Isentos de IRPF',        icon: _icone(ICONE.bridge) },
  { id: 'rf-ativa',            label_curto: 'RF Ativa',             classe: 'RF Diferenciados/RF Ativa',                             icon: _icone(ICONE.trend) },
  { id: 'multimercado',        label_curto: 'Multimercado',         classe: 'Multimercado',                                          icon: _icone(ICONE.bolt) },
  { id: 'renda-variavel',      label_curto: 'Renda Variável',       classe: 'Renda Variável',                                        icon: _icone(ICONE.trendUp) },
  { id: 'rv-indexados',        label_curto: 'RV Indexados',         classe: 'Renda Variável - Indexados',                            icon: _icone(ICONE.bars) },
  { id: 'commodities',         label_curto: 'Commodities',          classe: 'Commodities',                                           icon: _icone(ICONE.diamond) },
  { id: 'cripto',              label_curto: 'Cripto',               classe: 'Criptomoedas',                                          icon: _icone(ICONE.bitcoin) },
  { id: 'internacional-brl',   label_curto: 'Internacional BRL',    classe: 'Internacional sem Variação Cambial',                    icon: _iconeCircle(ICONE.globeBrl) },
  { id: 'internacional-usd',   label_curto: 'Internacional USD',    classe: 'Internacional com Variação Cambial',                    icon: _iconeCircle(ICONE.globeUsd) },
  { id: 'esg',                 label_curto: 'ESG',                  classe: 'ESG',                                                   icon: _icone(ICONE.leaf) },
  { id: 'fmp',                 label_curto: 'FMP',                  classe: 'FMP',                                                   icon: _icone(ICONE.rocket) },
  { id: 'alocacao',            label_curto: 'Alocação',             classe: 'Alocação',                                              icon: _icone(ICONE.layers) },
  { id: 'fip-estruturado',     label_curto: 'FIP / Estruturado',    classe: 'FIP / Estruturado',                                     icon: _icone(ICONE.building) },
  { id: 'itubers',             label_curto: 'Itubers',              classe: 'Exclusivo Itubers',                                     icon: _icone(ICONE.crown) },
  { id: 'fidc',                label_curto: 'FIDC',                 classe: 'FIDC',                                                  icon: _icone(ICONE.pie) },
];

const CLASSES_PREV = [
  { id: 'prev-credito-privado',  label_curto: 'Crédito Privado',  classe: 'Crédito Privado',     icon: _icone(ICONE.shield) },
  { id: 'prev-rf-ativa',         label_curto: 'RF Ativa',         classe: 'Renda Fixa Ativa',    icon: _icone(ICONE.trend) },
  { id: 'prev-rf',               label_curto: 'Renda Fixa',       classe: 'Renda Fixa',          icon: _icone(ICONE.bars3) },
  { id: 'prev-multimercado',     label_curto: 'Multimercado',     classe: 'Multimercado',        icon: _icone(ICONE.bolt) },
  { id: 'prev-rv',               label_curto: 'Renda Variável',   classe: 'Renda Variável',      icon: _icone(ICONE.trendUp) },
  { id: 'prev-rv-v70',           label_curto: 'RV V70',           classe: 'Renda Variável V70',  icon: _icone(ICONE.bars) },
  { id: 'prev-acoes',            label_curto: 'Ações',            classe: 'Ações',               icon: _icone(ICONE.trendUp) },
  { id: 'prev-balanceados',      label_curto: 'Balanceados',      classe: 'Balanceados',         icon: _icone(ICONE.scales) },
  { id: 'prev-cripto',           label_curto: 'Criptoativos',     classe: 'Criptoativos',        icon: _icone(ICONE.bitcoin) },
  { id: 'prev-fases-vida',       label_curto: 'Fases da Vida',    classe: 'Fases da Vida',       icon: _icone(ICONE.cycle) },
  { id: 'prev-alocacao',         label_curto: 'Alocação',         classe: 'Alocação',            icon: _icone(ICONE.layers) },
  { id: 'prev-internacional',    label_curto: 'Internacional',    classe: 'Internacional',       icon: _iconeCircle(ICONE.globeBrl) },
  { id: 'prev-cambial',          label_curto: 'Cambial',          classe: 'Cambial',             icon: _icone(ICONE.dollar) },
  { id: 'prev-imobiliario',      label_curto: 'Imobiliário',      classe: 'Imobiliário',         icon: _icone(ICONE.home) },
  { id: 'prev-outros',           label_curto: 'Outros',           classe: 'Outros',              icon: _icone(ICONE.dots) },
];

/** Retorna a entrada da lista de classes pra um nome dado, ou null. */
function _classeEntry(classe, kind) {
  const lista = kind === 'previdencia' ? CLASSES_PREV : CLASSES_FUNDOS;
  return lista.find(c => c.classe === classe) || null;
}

function classeSlug(classe, kind) {
  const e = _classeEntry(classe, kind);
  if (e) return e.id;
  return 'outros';
}

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

class AppFundos {
  constructor(opts = {}) {
    this.instAtual = 'todos';
    this.janela = '12m';
    this.busca = '';
    this.sort = { key: 'pct_cdi_12m', dir: 'desc' };
    this.fundos = [];
    this.meta = null;
    this.kind = opts.kind || 'fundos';   // 'fundos' ou 'previdencia'
    // Filtros do painel "Refine"
    this.benchSel = 'cdi';   // 'cdi' | 'ibov'
    this.minBench = 0;       // % mínimo do benchmark (CDI ou Ibov)
    this.prazoMax = 0;       // teto em dias úteis pra cotização; 0 = sem filtro
    this.apenasAbertos = false;   // toggle "Apenas fundos abertos"
    // Seleção de fundos pra comparar
    this.selecionados = new Set();   // CNPJs selecionados
    // Classes recolhidas pelo usuário (preserva estado entre re-renders).
    // Usa o nome da classe como chave (não o slug, que pode colidir).
    this.classesRecolhidas = new Set();
    // Paginação (Passo 4): renderiza só as primeiras N linhas por classe e
    // carrega o resto sob demanda ("Carregar mais" + IntersectionObserver).
    // Evita reconstruir ~2.700 linhas (cada uma com vários SVGs) a cada tecla.
    this._pageSize = 50;
    this._blocks = [];               // idx → array de fundos ordenados da classe
    this._loadMoreObserver = null;
  }

  async boot() {
    this._bindUI();
    try {
      this.meta = await pool.meta();
    } catch (e) {
      this._erro(`Falha ao carregar meta.json: ${e.message}`);
      return;
    }
    this._atualizarHero();
    await this._carregar(this.instAtual);
  }

  _bindUI() {
    // Switcher de instituições.
    document.querySelectorAll('.inst-btn[data-inst]').forEach(b => {
      b.addEventListener('click', async () => {
        const inst = b.dataset.inst;
        if (inst === this.instAtual) return;
        document.querySelectorAll('.inst-btn').forEach(x => {
          x.classList.toggle('is-active', x.dataset.inst === inst);
          x.setAttribute('aria-selected', x.dataset.inst === inst);
        });
        this.instAtual = inst;
        await this._carregar(inst);
      });
    });

    // Janela 12m/24m.
    const segEl = document.querySelector('[data-window]');
    if (segEl) {
      segEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        const v = b.dataset.value;
        if (v === this.janela) return;
        this.janela = v;
        segEl.querySelectorAll('button').forEach(x =>
          x.classList.toggle('is-selected', x.dataset.value === v));
        this._renderClasses();
      });
    }

    // Busca. Debounce (~180ms) pra não re-renderizar a lista inteira a cada
    // tecla; o botão "limpar" é ação explícita e roda instantâneo (só cancela
    // qualquer render pendente antes).
    const inp = document.querySelector('[data-search]');
    let buscaTimer = null;
    if (inp) {
      inp.addEventListener('input', () => {
        this.busca = inp.value;
        clearTimeout(buscaTimer);
        buscaTimer = setTimeout(() => this._renderClasses(), 180);
      });
    }
    const clr = document.querySelector('[data-search-clear]');
    if (clr) {
      clr.addEventListener('click', () => {
        clearTimeout(buscaTimer);
        inp.value = '';
        this.busca = '';
        this._renderClasses();
      });
    }

    // Slider Mínimo: %CDI (0..200%) ou pp vs Ibov (-50..+50 pp) ─────────
    const minSlider = document.querySelector('[data-min-slider]');
    const minValue = document.querySelector('[data-min-value]');
    const benchSel = document.querySelector('[data-bench-select]');
    if (minSlider) {
      this._minSliderEl = minSlider;
      this._minValueEl = minValue;
      const refreshMinUI = () => {
        const v = Number(minSlider.value);
        this.minBench = v;
        if (minValue) {
          minValue.textContent = this.benchSel === 'cdi' ? `${v} %` : `${v >= 0 ? '+' : ''}${v} pp`;
        }
        this._paintRange(minSlider);
      };
      this._refreshMinUI = refreshMinUI;
      minSlider.addEventListener('input', () => {
        refreshMinUI();
        this._renderClasses();
      });
      refreshMinUI();
    }
    if (benchSel) {
      benchSel.addEventListener('change', () => {
        this.benchSel = benchSel.value;
        this._aplicarRangeBench();
        this._renderClasses();
      });
    }

    // Slider Prazo de resgate ──────────────────────────────────────────
    // Mapeamento não-linear: 0..5 = 1 em 1 dia, depois 5 em 5 até 360.
    //   slider 0  → 0   dias
    //   slider 1..5 → 1..5 dias
    //   slider 6..76 → 10, 15, 20, …, 360 dias
    const prazoSlider = document.querySelector('[data-prazo-slider]');
    const prazoValue = document.querySelector('[data-prazo-value]');
    if (prazoSlider) {
      const sliderParaDias = (v) => v <= 5 ? v : 5 + (v - 5) * 5;
      const refreshPrazoUI = () => {
        const dias = sliderParaDias(Number(prazoSlider.value));
        this.prazoMax = dias;
        if (prazoValue) prazoValue.textContent = String(dias);
        this._paintRange(prazoSlider);
      };
      prazoSlider.addEventListener('input', () => {
        refreshPrazoUI();
        this._renderClasses();
      });
      refreshPrazoUI();
    }

    // Toggle "Apenas fundos abertos" (Apple-style switch). ────────────
    const aboToggle = document.querySelector('[data-only-open]');
    if (aboToggle) {
      aboToggle.addEventListener('change', () => {
        this.apenasAbertos = aboToggle.checked;
        this._renderClasses();
      });
    }

    // Reset ──────────────────────────────────────────────────────────
    const reset = document.querySelector('[data-reset]');
    if (reset) {
      reset.addEventListener('click', () => {
        this.busca = '';
        if (inp) inp.value = '';
        this.janela = '12m';
        if (segEl) segEl.querySelectorAll('button').forEach(x =>
          x.classList.toggle('is-selected', x.dataset.value === '12m'));
        this.minBench = 0;
        this.prazoMax = 0;
        this.apenasAbertos = false;
        this.benchSel = 'cdi';
        if (minSlider)  { minSlider.value = 0;  if (minValue)  minValue.textContent  = '0 %'; this._paintRange(minSlider); }
        if (prazoSlider){ prazoSlider.value = 0; if (prazoValue) prazoValue.textContent = '0'; this._paintRange(prazoSlider); }
        if (benchSel)   { benchSel.value = 'cdi'; }
        if (aboToggle)  { aboToggle.checked = false; }
        this.sort = { key: 'pct_cdi_12m', dir: 'desc' };
        this._renderClasses();
      });
    }

    // Filtros toggle: o CSS legado ativa o body com `.is-open` no .ap-filters.
    const toggle = document.querySelector('.ap-filters-toggle');
    if (toggle) {
      const wrap = toggle.closest('.ap-filters');
      toggle.addEventListener('click', () => {
        const open = wrap.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // Selecionar linha (event delegation no host de classes).
    const host = document.querySelector('[data-classes]');
    if (host) {
      // "Carregar mais" (paginação). Vem antes da seleção; como é um <button>,
      // o handler de seleção abaixo já o ignora (return em tag button).
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('.ap-load-more');
        if (!btn) return;
        e.preventDefault();
        this._loadMoreBatch(btn);
      });
      host.addEventListener('click', (e) => {
        // Ignora clicks em links/botões internos (lâmina, VGBL/PGBL, etc.).
        let t = e.target;
        while (t && t !== host) {
          const tag = (t.tagName || '').toLowerCase();
          if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select') return;
          if (t.classList?.contains('ap-class-head')) return;
          t = t.parentNode;
        }
        const tr = e.target.closest('tr[data-cnpj]');
        if (!tr) return;
        const cnpj = tr.dataset.cnpj;
        if (this.selecionados.has(cnpj)) this.selecionados.delete(cnpj);
        else this.selecionados.add(cnpj);
        tr.classList.toggle('is-selected', this.selecionados.has(cnpj));
        this._refreshFloatingBar();
      });
    }

    // Floating bar: Limpar e Comparar.
    const bar = document.getElementById('floatingBar');
    if (bar) {
      const clearBtn = bar.querySelector('.ap-fb-clear');
      const ctaBtn = bar.querySelector('.ap-fb-cta');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        this.selecionados.clear();
        document.querySelectorAll('tr[data-cnpj].is-selected').forEach(tr => tr.classList.remove('is-selected'));
        this._refreshFloatingBar();
      });
      if (ctaBtn) ctaBtn.addEventListener('click', () => {
        if (this.selecionados.size === 0) return;
        // Salva no localStorage no formato que o private-comparacao.js espera.
        const tipo = this.kind === 'previdencia' ? 'prev' : 'fundo';
        const sel = [...this.selecionados].map(c => {
          const f = this.fundos.find(x => x.cnpj === c);
          return f ? { cnpj: c, nome: f.nome, classe: f.classe || '', tipo } : null;
        }).filter(Boolean);
        try { localStorage.setItem('cmp_pre_select', JSON.stringify(sel)); } catch {}
        window.location.href = 'comparacao.html';
      });
    }
  }

  /** Reaplica .is-selected em todas as linhas após re-render + atualiza bar. */
  _refreshSelectedRows() {
    document.querySelectorAll('tr[data-cnpj]').forEach(tr => {
      tr.classList.toggle('is-selected', this.selecionados.has(tr.dataset.cnpj));
    });
    this._refreshFloatingBar();
  }

  _refreshFloatingBar() {
    const bar = document.getElementById('floatingBar');
    if (!bar) return;
    const n = this.selecionados.size;
    const count = bar.querySelector('.ap-fb-count');
    if (count) {
      const noun = this.kind === 'previdencia'
        ? (n === 1 ? 'plano selecionado' : 'planos selecionados')
        : (n === 1 ? 'fundo selecionado' : 'fundos selecionados');
      count.textContent = `${n} ${noun}`;
    }
    bar.classList.toggle('is-active', n > 0);
  }

  /** Ajusta min/max/step do slider conforme bench selecionado. */
  _aplicarRangeBench() {
    const s = this._minSliderEl;
    if (!s) return;
    if (this.benchSel === 'cdi') {
      s.min = '0'; s.max = '200'; s.step = '5';
    } else {
      s.min = '-50'; s.max = '50'; s.step = '1';
    }
    // Reseta valor pra 0 ao trocar bench (evita filtro em pp aplicado com range %).
    s.value = '0';
    this.minBench = 0;
    if (this._refreshMinUI) this._refreshMinUI();
    // Reposiciona os tick labels.
    const ticks = s.parentElement?.querySelector('.ap-slider-ticks');
    if (ticks) {
      ticks.innerHTML = this.benchSel === 'cdi'
        ? '<span>0%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span>'
        : '<span>−50pp</span><span>−25pp</span><span>0</span><span>+25pp</span><span>+50pp</span>';
    }
  }

  /** Mostra no botão "Filtros" um resumo curto dos filtros ativos. */
  _refreshFiltersSummary(visiveis) {
    const el = document.querySelector('.ap-filters-active-count');
    if (!el) return;
    const partes = [];
    if (this.minBench !== 0) {
      if (this.benchSel === 'cdi') partes.push(`≥ ${this.minBench}% CDI`);
      else partes.push(`vs Ibov ≥ ${this.minBench >= 0 ? '+' : ''}${this.minBench}pp`);
    }
    if (this.prazoMax > 0) partes.push(`prazo ≤ ${this.prazoMax}d`);
    if (this.apenasAbertos) partes.push('apenas abertos');
    if (this.janela !== '12m') partes.push(this.janela);
    el.textContent = partes.length === 0
      ? (this.kind === 'previdencia' ? 'todos os planos' : 'todos os fundos')
      : partes.join(' · ');
  }

  /** Atualiza o preenchimento azul do <input type="range"> via gradient. */
  _paintRange(el) {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const v = Number(el.value);
    const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
    el.style.background = `linear-gradient(to right, var(--private-blue, #0071e3) 0%, var(--private-blue, #0071e3) ${pct}%, #e3e6ee ${pct}%, #e3e6ee 100%)`;
  }

  _atualizarHero() {
    document.querySelectorAll('[data-ultima-data]').forEach(el => {
      if (!this.meta?.ultima_data_cota) return;
      const [a, m, d] = this.meta.ultima_data_cota.split('-');
      el.textContent = `${d}/${m}/${a}`;
    });
  }

  async _carregar(instId) {
    const host = document.querySelector('[data-classes]');

    // Empty-state "Em breve" para previdência de bancos que não têm.
    // Detecta pelo meta.json (tem_previdencia=false). Não chama o pool —
    // evita 404 em arquivos prev_<inst>.json que podem não existir.
    if (this.kind === 'previdencia' && instId !== 'todos') {
      const inst = this.meta?.instituicoes?.find(i => i.id === instId);
      if (inst && inst.tem_previdencia === false) {
        this.fundos = [];
        host.innerHTML = this._emptyStateHTML(inst.nome);
        this._renderClassRail([]);
        document.querySelector('[data-count]').textContent = '0 planos';
        return;
      }
    }

    host.innerHTML = '<p class="dyn-loading">Carregando fundos</p>';
    try {
      const dados = instId === 'todos'
        ? (this.kind === 'previdencia' ? await pool.previdenciaTodos() : await pool.fundosTodos())
        : (this.kind === 'previdencia' ? await pool.previdencia(instId) : await pool.fundos(instId));
      this.fundos = this._prepFundos(dados);
      this._renderClasses();
    } catch (e) {
      host.innerHTML = `<p class="dyn-loading">Falha ao carregar ${instId}.</p>`;
      console.error(e);
    }
  }

  /* Empty-state com ampulheta laranja girando. Usado quando a
     instituição não tem previdência (tem_previdencia=false no meta).
     CSS em shared/private-v2-extras.css. */
  _emptyStateHTML(nomeInst) {
    return `
      <div class="inst-empty-state" role="status" aria-live="polite">
        <svg class="hourglass-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 22h14"/>
          <path d="M5 2h14"/>
          <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
          <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
        </svg>
        <p class="inst-empty-state-title">Aguarde!</p>
        <p class="inst-empty-state-body">Em breve traremos as previdências do <strong>${nomeInst}</strong>.</p>
      </div>
    `;
  }

  /**
   * Pré-normaliza os campos usados na busca/filtro UMA vez, quando os dados
   * chegam — em vez de recalcular NFD + regex de acento a cada render.
   * Também memoiza o flag de Renda Variável (`_isRV`), usado no filtro de
   * benchmark e na renderização de cada linha.
   *
   * Compartilhado por fundos/previdência (via _carregar da base) e IPB (que
   * sobrescreve _carregar mas chama este helper). Roda DEPOIS que o pool
   * retorna (inclusive após o _concatDedup do modo "Todos", cujo clone raso
   * com spread preserva estes campos).
   */
  _prepFundos(dados) {
    return (dados || []).map(f => ({
      ...f,
      _nomeNorm: _norm(f.nome),
      _cnpjNorm: _norm(f.cnpj),
      _classeNorm: _norm(f.classe || ''),
      _isRV: _isRendaVariavel(f.classe),
    }));
  }

  _renderClasses() {
    const host = document.querySelector('[data-classes]');
    const termo = _norm(this.busca);
    let filtrados = this.fundos;
    if (termo) {
      filtrados = filtrados.filter(f =>
        f._nomeNorm.includes(termo) ||
        f._cnpjNorm.includes(termo) ||
        f._classeNorm.includes(termo)
      );
    }

    // Filtro mínimo: %CDI (>= N%) ou vs Ibov (>= N pp). Aplica só se != 0.
    // Fundos de Renda Variável usam SEMPRE vs Ibov (a métrica %CDI não faz
    // sentido pra eles). O filtro só compara um fundo se o critério aplicado
    // é o critério "natural" do fundo OU se o filtro está em Ibov.
    if (this.minBench !== 0) {
      const idx = this.janela === '24m' ? 4 : 3;
      const filtroEmIbov = this.benchSel === 'ibov';
      filtrados = filtrados.filter(f => {
        const isRV = f._isRV;
        // Qual métrica usar pra esse fundo?
        const usarIbov = isRV || filtroEmIbov;
        // Mas se o user escolheu CDI e o fundo é RV, o filtro em pp não faz
        // sentido vs um threshold em % — então pulamos esse fundo (passa).
        if (!filtroEmIbov && isRV) return true;
        const key = usarIbov ? 'vs_ibov' : 'pct_cdi';
        const v = f[key]?.[idx];
        return v != null && v >= this.minBench;
      });
    }

    // Filtro prazo de resgate: SOMA cotização + crédito/pagamento, sem
    // distinguir DC/DU (o usuário pediu o prazo TOTAL até o dinheiro cair).
    if (this.prazoMax > 0) {
      filtrados = filtrados.filter(f => {
        const dias = _parsePrazoTotal(f);
        return dias != null && dias <= this.prazoMax;
      });
    }

    // Filtro "Apenas fundos abertos" (status = ABERTO).
    // Quando o status vem vazio/null (caso típico da XP), assumimos ABERTO —
    // ausência de dado não deve esconder o fundo como se estivesse fechado.
    if (this.apenasAbertos) {
      filtrados = filtrados.filter(f => {
        const s = (f.status || '').toUpperCase().trim();
        if (!s) return true;            // sem status → assume aberto
        return s === 'ABERTO';
      });
    }

    document.querySelector('[data-count]').textContent =
      `${filtrados.length.toLocaleString('pt-BR')} ${this.kind === 'previdencia' ? 'planos' : 'fundos'}`;

    // Atualiza resumo dos filtros ativos no botão "Filtros".
    this._refreshFiltersSummary(filtrados.length);

    // Agrupa por classe.
    const grupos = new Map();
    for (const f of filtrados) {
      const cls = f.classe || 'Outros';
      if (!grupos.has(cls)) grupos.set(cls, []);
      grupos.get(cls).push(f);
    }

    // Ordena cada grupo pelo sort atual.
    const cmp = this._comparator();
    for (const arr of grupos.values()) arr.sort(cmp);

    // Ordem dos grupos: posição na lista fixa (CLASSES_FUNDOS / CLASSES_PREV).
    // Classes não-mapeadas (improvável, mas defensivo) vão pro fim, ordenadas alfabeticamente.
    const lista = this.kind === 'previdencia' ? CLASSES_PREV : CLASSES_FUNDOS;
    const ordemMap = new Map(lista.map((c, i) => [c.classe, i]));
    const grupOrd = [...grupos.entries()].sort((a, b) => {
      const ia = ordemMap.has(a[0]) ? ordemMap.get(a[0]) : 999;
      const ib = ordemMap.has(b[0]) ? ordemMap.get(b[0]) : 999;
      if (ia !== ib) return ia - ib;
      return a[0].localeCompare(b[0], 'pt-BR');
    });

    if (grupOrd.length === 0) {
      host.innerHTML = '<p class="dyn-loading" style="color:#86868b;">Nenhum fundo encontrado.</p>';
      this._renderClassRail([]);
      return;
    }

    // Guarda os arrays ordenados por classe (indexados igual aos blocks) pra o
    // "Carregar mais" acessar o restante sem re-renderizar tudo.
    this._blocks = grupOrd.map(([, fundos]) => fundos);
    const blocks = grupOrd.map(([classe, fundos], idx) => this._classBlockHTML(classe, fundos, idx));
    host.innerHTML = blocks.join('');
    this._renderClassRail(grupOrd.map(([c]) => c));

    // Liga sort no header das tabelas.
    host.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (this.sort.key === key) this.sort.dir = this.sort.dir === 'desc' ? 'asc' : 'desc';
        else { this.sort.key = key; this.sort.dir = (key === 'nome' || key === 'instituicao') ? 'asc' : 'desc'; }
        this._renderClasses();
      });
    });

    // Liga toggle de classe (acordeão). Persiste o estado de recolhido em
    // `this.classesRecolhidas` pra sobreviver a re-renders (ex.: sort).
    host.querySelectorAll('.ap-class-head').forEach(h => {
      h.addEventListener('click', () => {
        const block = h.closest('.ap-class-block');
        const nome = block?.dataset?.classeNome;
        const aberto = block.classList.toggle('is-open');
        if (nome) {
          if (aberto) this.classesRecolhidas.delete(nome);
          else        this.classesRecolhidas.add(nome);
        }
      });
    });

    // Reaplica seleção visual após cada re-render.
    this._refreshSelectedRows();

    // (Re)liga a paginação: observa os botões "Carregar mais" pra auto-carregar
    // conforme o usuário rola.
    this._setupLoadMore();
  }

  /* ── Paginação (Passo 4) ───────────────────────────────────────────────
     Renderiza só as primeiras N linhas de cada classe; o resto entra sob
     demanda. Preserva agrupamento, ordenação, seleção, contador e class-rail
     (o contador usa filtrados.length, independente do que está no DOM). */

  _loadMoreHTML(idx, shown, total) {
    if (total <= shown) return '';
    const restante = total - shown;
    const prox = Math.min(this._pageSize, restante);
    const noun = this.kind === 'previdencia' ? 'planos' : 'fundos';
    return `<button type="button" class="ap-load-more" data-block-idx="${idx}" data-shown="${shown}">` +
      `Carregar mais ${prox} <span class="ap-load-more-rest">` +
      `(${restante.toLocaleString('pt-BR')} ${noun} restantes)</span></button>`;
  }

  /** Anexa o próximo lote de linhas de uma classe ao seu tbody. */
  _loadMoreBatch(button) {
    const idx = Number(button.dataset.blockIdx);
    const shown = Number(button.dataset.shown);
    const fundos = this._blocks[idx];
    if (!fundos) { this._removeLoadMore(button); return; }
    const next = fundos.slice(shown, shown + this._pageSize);
    if (!next.length) { this._removeLoadMore(button); return; }
    const tbody = button.closest('.ap-class-body')?.querySelector('tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', next.map(f => this._linhaHTML(f)).join(''));
    const novoShown = shown + next.length;
    // Reaplica seleção nas linhas recém-criadas.
    this._refreshSelectedRows();
    if (novoShown >= fundos.length) {
      this._removeLoadMore(button);
    } else {
      const restante = fundos.length - novoShown;
      const prox = Math.min(this._pageSize, restante);
      const noun = this.kind === 'previdencia' ? 'planos' : 'fundos';
      button.dataset.shown = String(novoShown);
      button.innerHTML = `Carregar mais ${prox} <span class="ap-load-more-rest">` +
        `(${restante.toLocaleString('pt-BR')} ${noun} restantes)</span>`;
    }
  }

  _removeLoadMore(button) {
    if (this._loadMoreObserver) this._loadMoreObserver.unobserve(button);
    button.remove();
  }

  _setupLoadMore() {
    const host = document.querySelector('[data-classes]');
    if (!host) return;
    if (this._loadMoreObserver) this._loadMoreObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;   // fallback: só o botão
    this._loadMoreObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) this._loadMoreBatch(e.target);
      }
    }, { root: null, rootMargin: '400px 0px' });
    host.querySelectorAll('.ap-load-more').forEach(b => this._loadMoreObserver.observe(b));
  }

  _renderClassRail(classesPresentes) {
    const el = document.getElementById('classRail');
    if (!el) return;
    const lista = this.kind === 'previdencia' ? CLASSES_PREV : CLASSES_FUNDOS;
    const presentes = new Set(classesPresentes);
    // Mantém SOMENTE as classes que tem fundos AGORA, na ORDEM da lista.
    const itens = lista.filter(c => presentes.has(c.classe));
    el.innerHTML = itens.map(c => `
      <a href="#classe-${c.id}" data-target="classe-${c.id}" title="${_esc(c.classe)}">
        ${c.icon}
        <span>${_esc(c.label_curto)}</span>
      </a>
    `).join('');
  }

  _classBlockHTML(classe, fundos, idx = 0) {
    const slug = classeSlug(classe, this.kind);
    const n = fundos.length;
    const noun = this.kind === 'previdencia' ? (n === 1 ? 'plano' : 'planos') : (n === 1 ? 'fundo' : 'fundos');
    // Preserva o estado de recolhido: se o usuário recolheu essa classe antes,
    // mantém recolhida ao re-renderizar (ex.: ao ordenar uma coluna).
    const aberto = !this.classesRecolhidas.has(classe);
    // Paginação: só as primeiras N linhas agora; o resto via "Carregar mais".
    // O contador da classe (${n}) continua mostrando o TOTAL, não o renderizado.
    const shown = Math.min(this._pageSize, n);
    const visiveis = fundos.slice(0, shown);
    return `
      <div class="ap-class-block ${aberto ? 'is-open' : ''}" id="classe-${slug}" data-classe-nome="${_esc(classe)}">
        <div class="ap-class-head">
          <div class="ap-class-title">
            <h3>${_esc(classe)}</h3>
            <span class="ap-class-count">${n} ${noun}</span>
          </div>
          <span class="ap-class-caret"></span>
        </div>
        <div class="ap-class-body">
          ${this._tabelaHTML(visiveis)}
          ${this._loadMoreHTML(idx, shown, n)}
        </div>
      </div>
    `;
  }

  _tabelaHTML(fundos) {
    const cabHTML = this._cabecalhoTabelaHTML();
    const linhasHTML = fundos.map(f => this._linhaHTML(f)).join('');
    return `
      <table class="ap-table has-captacao has-instituicao">
        ${cabHTML}
        <tbody>${linhasHTML}</tbody>
      </table>
    `;
  }

  _cabecalhoTabelaHTML() {
    const labels = this._labelsPeriodos();
    const arrow = (k) => {
      if (this.sort.key !== k) return '<span class="arrow">▼</span>';
      return `<span class="arrow ${this.sort.dir === 'asc' ? 'is-asc' : 'is-desc'}">▼</span>`;
    };
    // Cap. Mês/Ano aparecem em ambos os modos. VGBL/PGBL viraram pills
    // inline na coluna do nome do fundo (mais compacto e fiel ao original).
    return `
      <thead><tr>
        <th class="ap-th-select"></th>
        <th class="left sortable" data-sort-key="nome">Fundo ${arrow('nome')}</th>
        <th class="sortable ap-inst-th" data-sort-key="instituicao">Instituição ${arrow('instituicao')}</th>
        <th class="sortable center" data-sort-key="ultima_data">Data ${arrow('ultima_data')}</th>
        <th class="sortable" data-sort-key="ret_0">${labels[0]} ${arrow('ret_0')}</th>
        <th class="sortable" data-sort-key="ret_1">${labels[1]} ${arrow('ret_1')}</th>
        <th class="sortable" data-sort-key="ret_2">${labels[2]} ${arrow('ret_2')}</th>
        <th class="sortable" data-sort-key="ret_3">${labels[3]} ${arrow('ret_3')}</th>
        <th class="sortable" data-sort-key="ret_4">${labels[4]} ${arrow('ret_4')}</th>
        <th class="sortable ap-cap-th" data-sort-key="captacao_mes">Cap. Mês ${arrow('captacao_mes')}</th>
        <th class="sortable ap-cap-th" data-sort-key="captacao_ano">Cap. Ano ${arrow('captacao_ano')}</th>
        <th class="sortable" data-sort-key="pl">Patrimônio ${arrow('pl')}</th>
      </tr></thead>
    `;
  }

  _labelsPeriodos() {
    // Usa data do meta.json pra labels do mês corrente e anterior.
    if (!this.meta?.ultima_data_cota) {
      return ['Mês', 'Mês -1', 'Ano', '12M', '24M'];
    }
    const [y, m] = this.meta.ultima_data_cota.split('-');
    const ano2 = y.slice(2);
    const mesAtual = parseInt(m, 10);
    const mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    const anoAnt = mesAtual === 1 ? (parseInt(ano2, 10) - 1).toString().padStart(2, '0') : ano2;
    return [
      `${MESES_PT[mesAtual - 1]}/${ano2}`,
      `${MESES_PT[mesAnt - 1]}/${anoAnt}`,
      `20${ano2}`,
      '12 Meses',
      '24 Meses',
    ];
  }

  _linhaHTML(f) {
    const isPrev = this.kind === 'previdencia';
    const status = (f.status || '').toUpperCase();
    const statusClass = status === 'ABERTO' ? 'open' : (status === 'FECHADO' || status === 'ENCERRADO') ? 'closed' : status === 'INIBIDO' ? 'paused' : '';
    const cotizacao = f.cotizacao ? `Cotização ${_esc(f.cotizacao)}` : '';
    const credito = f.credito ? `Pgto ${_esc(f.credito)}` : '';
    const prazoTxt = [cotizacao, credito].filter(Boolean).join(' · ');

    // Pills extras na meta do fundo: Lâmina (link geral) + VGBL + PGBL (prev).
    const pillsMeta = [];
    if (!isPrev && f.link) {
      pillsMeta.push(`<a href="${_esc(f.link)}" target="_blank" rel="noopener" class="ap-fund-lamina"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>Lâmina</a>`);
    }
    if (f.vgbl) {
      pillsMeta.push(`<a href="${_esc(f.vgbl)}" target="_blank" rel="noopener" class="ap-fund-lamina is-vgbl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>VGBL</a>`);
    }
    if (f.pgbl) {
      pillsMeta.push(`<a href="${_esc(f.pgbl)}" target="_blank" rel="noopener" class="ap-fund-lamina is-pgbl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>PGBL</a>`);
    }

    // Retornos por período. A pill embaixo mostra %CDI ou Δpp vs Ibov:
    //  - Fundos com classe de Renda Variável (Ações, Indexados, FMP, etc.)
    //    sempre exibem Δpp vs Ibov, independente do filtro selecionado —
    //    %CDI é métrica enganosa pra RV.
    //  - Demais fundos seguem o select (benchSel).
    const cells = [];
    const periodLabels = this._labelsPeriodos();
    const isRV = f._isRV ?? _isRendaVariavel(f.classe);
    const useIbov = isRV || this.benchSel === 'ibov';
    for (let i = 0; i < 5; i++) {
      const v = f.retornos?.[i];
      const cls = v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral';
      const txt = v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
      let pillHTML = '';
      if (useIbov) {
        const vs = f.vs_ibov?.[i];
        if (vs != null) {
          const sinal = vs >= 0 ? '+' : '−';
          const clsBench = vs >= 0 ? 'pos' : 'neg';
          pillHTML = `<span class="ap-cdi-pill ${clsBench}" title="vs Ibovespa em pp">${sinal}${Math.abs(vs).toFixed(1).replace('.', ',')}pp</span>`;
        }
      } else {
        const cdi = f.pct_cdi?.[i];
        if (cdi != null) {
          pillHTML = `<span class="ap-cdi-pill" title="% CDI">${cdi.toFixed(0)}%</span>`;
        }
      }
      cells.push(`
        <td class="ap-num-cell" data-sort="${v ?? ''}" data-period="${periodLabels[i]}">
          <span class="ap-num-period">${periodLabels[i]}</span>
          <span class="ap-num ${cls}">${txt}</span>
          ${pillHTML}
        </td>
      `);
    }

    // Captação (igual em fundos e previdência).
    const capCells = `
      <td class="ap-cap-cell" data-sort="${f.captacao_mes ?? ''}">${this._capHTML(f.captacao_mes)}</td>
      <td class="ap-cap-cell" data-sort="${f.captacao_ano ?? ''}">${this._capHTML(f.captacao_ano)}</td>
    `;

    // Pills de instituição: array `instituicoes` (set quando "Todos") ou fallback
    // pro `instituicao` único.
    const instList = f.instituicoes && f.instituicoes.length ? f.instituicoes : [f.instituicao];
    const instPillsHTML = instList
      .filter(Boolean)
      .map(i => `<span class="inst-pill inst-pill-${i}">${this._instLabel(i)}</span>`)
      .join('');
    const sortKeyInst = instList.filter(Boolean).map(i => this._instLabel(i)).join(',');

    return `
      <tr data-cnpj="${_esc(f.cnpj || '')}" data-classe="${classeSlug(f.classe, this.kind)}" data-status="${_esc(status)}">
        <td class="ap-td-select">
          <span class="ap-row-select" role="checkbox" aria-label="Selecionar">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
          </span>
        </td>
        <td class="ap-fund-cell">
          <div class="ap-fund-name-row">
            <span class="ap-fund-name">${_esc(f.nome)}</span>
            ${status ? `<span class="ap-fund-status ${statusClass}">${status[0]}${status.slice(1).toLowerCase()}</span>` : ''}
          </div>
          <div class="ap-fund-cnpj">${_esc(f.cnpj)}</div>
          ${(prazoTxt || pillsMeta.length) ? `
            <div class="ap-fund-meta">
              ${prazoTxt ? `<span class="ap-fund-prazo">${prazoTxt}</span>` : ''}
              ${pillsMeta.join('')}
            </div>
          ` : ''}
        </td>
        <td class="ap-inst-cell" data-sort="${_esc(sortKeyInst)}">
          <div class="ap-inst-pills">${instPillsHTML || '<span class="inst-pill">—</span>'}</div>
        </td>
        <td class="ap-data-cell" data-sort="${(f.ultima_data || '').replace(/\D/g,'')}">${_esc(f.ultima_data || '—')}</td>
        ${cells.join('')}
        ${capCells}
        <td class="ap-muted" data-sort="${f.pl ?? ''}">${this._plHTML(f.pl)}</td>
      </tr>
    `;
  }

  _instLabel(id) {
    const m = { itau: 'Itaú', btg: 'BTG', xp: 'XP', inter: 'Inter' };
    return m[id] || (id || '').toUpperCase();
  }

  _capHTML(v) {
    if (v == null || isNaN(v)) return '<span class="ap-muted">—</span>';
    const abs = Math.abs(v);
    const sinal = v >= 0 ? 'cap-pos' : 'cap-neg';
    const sign = v >= 0 ? '+' : '−';
    let txt;
    if (abs >= 1e9) txt = `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')}bi`;
    else if (abs >= 1e6) txt = `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')}M`;
    else if (abs >= 1e3) txt = `${sign}${(abs / 1e3).toFixed(0)}K`;
    else txt = `${sign}${abs.toFixed(0)}`;
    return `<span class="${sinal}" title="R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}">${txt}</span>`;
  }

  _plHTML(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
    if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(0)} M`;
    if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
    return `R$ ${v.toFixed(0)}`;
  }

  _comparator() {
    const k = this.sort.key;
    const dir = this.sort.dir === 'desc' ? -1 : 1;
    return (a, b) => {
      let va, vb;
      if (k.startsWith('ret_')) {
        const i = +k.slice(4);
        va = a.retornos?.[i]; vb = b.retornos?.[i];
      } else {
        va = a[k]; vb = b[k];
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb, 'pt-BR') * dir;
      return (va - vb) * dir;
    };
  }

  _erro(msg) {
    const host = document.querySelector('[data-classes]');
    host.innerHTML = `<p class="dyn-loading" style="color:#B52B2B;">${_esc(msg)}</p>`;
  }
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Detecta classes de Renda Variável (e variações: Ações, Indexados, etc.). */
function _isRendaVariavel(classe) {
  const c = _norm(classe);
  return c.includes('renda variavel') ||
         c.includes('acoes') ||
         c.includes('indexad') ||
         c.includes('small cap') ||
         c.includes('long bias') ||
         c.includes('long short') ||
         c.includes('long-short') ||
         c.includes('long & short') ||
         c.includes('long and short') ||
         c.includes('bdr') ||
         c.includes('fmp') ||
         c.includes('etf');
}

/** Extrai número de dias de strings tipo "0 DU", "D+30", "30", "1 DU". */
function _parsePrazoDias(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** Prazo TOTAL de resgate = cotização + pagamento (crédito).
 *  Ignora a unidade DC/DU pra simplificar — usuário quer o prazo bruto até
 *  o dinheiro cair. Retorna null se nenhum dos dois campos for parseável. */
function _parsePrazoTotal(f) {
  const c = _parsePrazoDias(f?.cotizacao);
  const r = _parsePrazoDias(f?.credito);
  if (c == null && r == null) return null;
  return (c ?? 0) + (r ?? 0);
}

export { AppFundos };

// Boot só quando esta página for a de fundos (a previdência reusa a classe
// mas tem entry point próprio com kind='previdencia'; idem a página IPB).
if (document.body.dataset.pagina !== 'previdencia'
    && document.body.dataset.pagina !== 'ipb') {
  new AppFundos({ kind: 'fundos' }).boot();
}
