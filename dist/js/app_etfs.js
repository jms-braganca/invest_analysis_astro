/**
 * app_etfs.js — Página ETFs Offshore.
 *
 * Inspirado em app_fundos.js, mas:
 *  • Sem instituição (ETF compra-se em qualquer corretora americana).
 *  • Duas divisões: Classe de Ativos (switcher do topo) e Tema (acordeão).
 *  • Colunas: Ticker · Nome do ETF · Mês · Mês-1 · Ano · 12M · 24M · Market Cap.
 *  • Dados: data/etfs.json (gerado por Scripts/etfs/build_etfs.py via yfinance).
 *
 * Markup reaproveita as classes de shared/private-fundos.css.
 */

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Ordem e ícones por Classe de Ativos (= abas da planilha).
const _icone = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra}<path d="${paths}"/></svg>`;

const CLASSES = [
  { id: 'equity',          nome: 'Equity',          label: 'Ações',          icon: _icone('M3 17l6-6 4 4 8-8M14 7h7v7') },
  { id: 'bond',            nome: 'Bond',            label: 'Renda Fixa',     icon: _icone('M3 7h18M3 12h18M3 17h12') },
  { id: 'multi-asset',     nome: 'Multi-Asset',     label: 'Multiativos',    icon: _icone('M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5') },
  { id: 'commodity',       nome: 'Commodity',       label: 'Commodities',    icon: _icone('M12 2l10 10-10 10L2 12z') },
  { id: 'currency',        nome: 'Currency',        label: 'Câmbio/Cripto',  icon: _icone('M8 6h6a4 4 0 010 8H8M8 14h7a4 4 0 010 8H8M10 6V3M10 22v-3M14 6V3M14 22v-3') },
  { id: 'real-estate',     nome: 'Real Estate',     label: 'Imobiliário',    icon: _icone('M3 12l9-9 9 9M5 10v10h14V10') },
  { id: 'alternatives',    nome: 'Alternatives',    label: 'Alternativos',   icon: _icone('M4.5 16.5L9 21l3-3-1.5-3L4.5 16.5zM14 4l6 6-9 9-6-6L14 4z') },
  { id: 'preferred-stock', nome: 'Preferred Stock', label: 'Preferenciais',  icon: _icone('M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z') },
  { id: 'volatility',      nome: 'Volatility',      label: 'Volatilidade',   icon: _icone('M3 12h4l3 7 4-14 3 7h4') },
];

function classeId(nome) {
  const e = CLASSES.find(c => c.nome === nome);
  return e ? e.id : 'outros';
}
function classeLabel(nome) {
  const e = CLASSES.find(c => c.nome === nome);
  return e ? e.label : nome;
}
function temaSlug(classe, tema) {
  return (classeId(classe) + '-' + String(tema || 'outros'))
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

class AppEtfs {
  constructor() {
    this.classeAtual = 'todos';
    this.busca = '';
    this.sort = { key: 'market_cap', dir: 'desc' };
    this.etfs = [];
    this.meta = null;
    this.classesRecolhidas = new Set();   // modo classe: temas recolhidos pelo usuário
    this.classesAbertas = new Set();       // modo "Todos": temas abertos pelo usuário
    this._autoOpened = false;              // garante 1º tema aberto no 1º render (modo "Todos")
    this._grupoMap = {};
    // Paginação (Passo 4): dentro de um tema aberto, renderiza só N linhas por
    // vez ("Carregar mais" + IntersectionObserver). Complementa o render
    // preguiçoso por bloco que já existe.
    this._pageSize = 50;
    this._loadMoreObserver = null;
  }

  async boot() {
    this._bindUI();
    const host = document.querySelector('[data-classes]');
    try {
      const base = location.pathname.includes('/calculadoras/') ? '../data/' : './data/';
      const resp = await fetch(base + 'etfs.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      this.meta = data;
      // Pré-normaliza os campos de busca UMA vez (em vez de NFD + regex de
      // acento a cada tecla, sobre todos os ETFs).
      this.etfs = (data.etfs || []).map(e => ({
        ...e,
        _tickerNorm: _norm(e.ticker),
        _nomeNorm: _norm(e.nome),
        _temaNorm: _norm(e.tema),
        _classeNorm: _norm(e.classe),
      }));
    } catch (e) {
      host.innerHTML = `<p class="dyn-loading" style="color:#B52B2B;">Falha ao carregar etfs.json: ${_esc(e.message)}</p>`;
      return;
    }
    this._renderSwitcher();
    this._atualizarHero();
    this._render();
  }

  _bindUI() {
    const inp = document.querySelector('[data-search]');
    let buscaTimer = null;
    if (inp) inp.addEventListener('input', () => {
      this.busca = inp.value;
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => this._render(), 180);
    });
    const clr = document.querySelector('[data-search-clear]');
    if (clr) clr.addEventListener('click', () => { clearTimeout(buscaTimer); inp.value = ''; this.busca = ''; this._render(); });

    const reset = document.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => {
      this.busca = ''; if (inp) inp.value = '';
      this.classeAtual = 'todos';
      this.classesRecolhidas.clear();
      this.classesAbertas.clear();
      document.querySelectorAll('.inst-btn').forEach(x =>
        x.classList.toggle('is-active', x.dataset.classe === 'todos'));
      this.sort = { key: 'market_cap', dir: 'desc' };
      this._render();
    });

    const host = document.querySelector('[data-classes]');
    if (host) {
      host.addEventListener('click', (e) => {
        const lm = e.target.closest('.ap-load-more');
        if (lm) { e.preventDefault(); this._loadMoreBatch(lm); return; }
        if (e.target.closest('a, button')) return;
      });
    }
  }

  _renderSwitcher() {
    const wrap = document.querySelector('[data-switcher]');
    if (!wrap) return;
    const presentes = new Set(this.etfs.map(e => e.classe));
    const btns = [`<button type="button" class="inst-btn inst-btn-todos is-active" data-classe="todos"><span class="inst-fallback">Todos</span></button>`];
    for (const c of CLASSES) {
      if (!presentes.has(c.nome)) continue;
      btns.push(`<button type="button" class="inst-btn" data-classe="${c.id}"><span class="inst-fallback">${_esc(c.label)}</span></button>`);
    }
    wrap.innerHTML = btns.join('');
    wrap.querySelectorAll('.inst-btn[data-classe]').forEach(b => {
      b.addEventListener('click', () => {
        const c = b.dataset.classe;
        if (c === this.classeAtual) return;
        wrap.querySelectorAll('.inst-btn').forEach(x => x.classList.toggle('is-active', x === b));
        this.classeAtual = c;
        this.classesRecolhidas.clear();
        this.classesAbertas.clear();
        this._render();
      });
    });
  }

  _atualizarHero() {
    document.querySelectorAll('[data-ultima-data]').forEach(el => {
      el.textContent = this.meta?.ultima_data_cota || '—';
    });
    const n = document.querySelector('[data-total-etfs]');
    if (n) n.textContent = (this.meta?.n_etfs || this.etfs.length).toLocaleString('pt-BR');
  }

  _labelsPeriodos() {
    const d = this.meta?.ultima_data_cota; // dd/mm/yyyy
    if (!d || !/\d{2}\/\d{2}\/\d{4}/.test(d)) return ['Mês', 'Mês -1', 'Ano', '12M', '24M'];
    const [, m, y] = d.split('/');
    const ano2 = y.slice(2);
    const mAtual = parseInt(m, 10);
    const mAnt = mAtual === 1 ? 12 : mAtual - 1;
    const anoAnt = mAtual === 1 ? (parseInt(ano2, 10) - 1).toString().padStart(2, '0') : ano2;
    return [`${MESES_PT[mAtual - 1]}/${ano2}`, `${MESES_PT[mAnt - 1]}/${anoAnt}`, `20${ano2}`, '12 Meses', '24 Meses'];
  }

  _render() {
    const host = document.querySelector('[data-classes]');
    const termo = _norm(this.busca);
    let arr = this.etfs;
    if (this.classeAtual !== 'todos') {
      arr = arr.filter(e => classeId(e.classe) === this.classeAtual);
    }
    if (termo) {
      arr = arr.filter(e =>
        e._tickerNorm.includes(termo) ||
        e._nomeNorm.includes(termo) ||
        e._temaNorm.includes(termo) ||
        e._classeNorm.includes(termo));
    }

    document.querySelector('[data-count]').textContent =
      `${arr.length.toLocaleString('pt-BR')} ETFs`;

    // Agrupa por Tema (mantendo a Classe para ordenação e badge).
    const grupos = new Map(); // key tema|classe → {classe, tema, itens[]}
    for (const e of arr) {
      const key = e.classe + '||' + e.tema;
      if (!grupos.has(key)) grupos.set(key, { classe: e.classe, tema: e.tema, itens: [] });
      grupos.get(key).itens.push(e);
    }

    const cmp = this._comparator();
    for (const g of grupos.values()) g.itens.sort(cmp);

    const ordemClasse = new Map(CLASSES.map((c, i) => [c.nome, i]));
    const grupOrd = [...grupos.values()].sort((a, b) => {
      const ia = ordemClasse.has(a.classe) ? ordemClasse.get(a.classe) : 99;
      const ib = ordemClasse.has(b.classe) ? ordemClasse.get(b.classe) : 99;
      if (ia !== ib) return ia - ib;
      if (a.classe !== b.classe) return a.classe.localeCompare(b.classe);
      // tema: maior AUM agregado primeiro
      const sa = a.itens.reduce((s, x) => s + (x.market_cap || 0), 0);
      const sb = b.itens.reduce((s, x) => s + (x.market_cap || 0), 0);
      return sb - sa;
    });

    if (grupOrd.length === 0) {
      host.innerHTML = '<p class="dyn-loading" style="color:#86868b;">Nenhum ETF encontrado.</p>';
      this._renderRail([]);
      return;
    }

    // No modo "Todos", abre o 1º tema no primeiro render — senão a página
    // carrega com TODOS os acordeões recolhidos e parece vazia (nenhum ETF).
    if (!this._defaultOpen() && !this._autoOpened && grupOrd.length) {
      this.classesAbertas.add(grupOrd[0].classe + '||' + grupOrd[0].tema);
      this._autoOpened = true;
    }

    // Guarda os itens por grupo para montar a tabela só quando o bloco abrir
    // (renderização preguiçosa → sem lag mesmo com milhares de ETFs em "Todos").
    this._grupoMap = {};
    for (const g of grupOrd) this._grupoMap[g.classe + '||' + g.tema] = g.itens;

    host.innerHTML = grupOrd.map(g => this._blockHTML(g)).join('');

    // Rail: no modo "Todos" lista as CLASSES; numa classe específica, os TEMAS.
    let railItens;
    if (this._defaultOpen()) {
      // classe específica → temas, na ordem renderizada.
      // Classes com MUITOS temas (ex.: Ações, 51) deixam a barra lateral
      // poluída — então enxugamos a RAIL para só os temas com >= 50 ETFs.
      // O conteúdo (accordion) continua mostrando TODOS os temas.
      let temas = grupOrd;
      if (temas.length > 18) {
        const grandes = temas.filter(g => g.itens.length >= 50);
        temas = grandes.length
          ? grandes
          : temas.slice().sort((a, b) => b.itens.length - a.itens.length).slice(0, 18);
      }
      railItens = temas.map(g => {
        const c = CLASSES.find(x => x.nome === g.classe);
        return { href: '#tema-' + temaSlug(g.classe, g.tema), label: g.tema, title: g.tema,
                 icon: c ? c.icon : _icone('M5 12h.01M12 12h.01M19 12h.01') };
      });
    } else {
      // "Todos" → classes (1ª ocorrência), linkando ao 1º tema da classe
      const vis = new Set();
      railItens = [];
      for (const g of grupOrd) {
        if (vis.has(g.classe)) continue;
        vis.add(g.classe);
        const c = CLASSES.find(x => x.nome === g.classe);
        railItens.push({ href: '#tema-' + temaSlug(g.classe, g.tema),
                         label: c ? c.label : g.classe, title: g.classe,
                         icon: c ? c.icon : _icone('M5 12h.01M12 12h.01M19 12h.01') });
      }
    }
    this._renderRail(railItens);

    this._bindSort(host);
    this._setupLoadMore();

    host.querySelectorAll('.ap-class-head').forEach(h => {
      h.addEventListener('click', () => {
        const block = h.closest('.ap-class-block');
        const key = block?.dataset?.grupo;
        const aberto = block.classList.toggle('is-open');
        // Lazy: monta a tabela na primeira vez que abre.
        const body = block.querySelector('.ap-class-body');
        if (aberto && body && !body.querySelector('table') && key && this._grupoMap[key]) {
          body.innerHTML = this._tabelaHTML(this._grupoMap[key], key);
          this._bindSort(body);
          this._setupLoadMore();
        }
        // Persiste o estado conforme o modo (default aberto p/ classe; recolhido p/ "Todos").
        if (key) {
          if (this._defaultOpen()) {
            if (aberto) this.classesRecolhidas.delete(key); else this.classesRecolhidas.add(key);
          } else {
            if (aberto) this.classesAbertas.add(key); else this.classesAbertas.delete(key);
          }
        }
      });
    });
  }

  _defaultOpen() { return this.classeAtual !== 'todos'; }

  _bindSort(scope) {
    scope.querySelectorAll('.sortable').forEach(th => {
      if (th._sortBound) return;
      th._sortBound = true;
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (this.sort.key === key) this.sort.dir = this.sort.dir === 'desc' ? 'asc' : 'desc';
        else { this.sort.key = key; this.sort.dir = (key === 'nome' || key === 'ticker') ? 'asc' : 'desc'; }
        this._render();
      });
    });
  }

  _renderRail(itens) {
    const el = document.getElementById('classRail');
    if (!el) return;
    el.innerHTML = (itens || []).map(it =>
      `<a href="${it.href}" title="${_esc(it.title)}">${it.icon}<span>${_esc(it.label)}</span></a>`
    ).join('');
  }

  _blockHTML(g) {
    const key = g.classe + '||' + g.tema;
    const slug = temaSlug(g.classe, g.tema);
    const n = g.itens.length;
    const aberto = this._defaultOpen() ? !this.classesRecolhidas.has(key) : this.classesAbertas.has(key);
    return `
      <div class="ap-class-block ${aberto ? 'is-open' : ''}" id="tema-${slug}" data-grupo="${_esc(key)}" data-tema-slug="${slug}">
        <div class="ap-class-head">
          <div class="ap-class-title">
            <h3>${_esc(g.tema)}</h3>
            <span class="ap-class-count">${classeLabel(g.classe)} · ${n} ETF${n === 1 ? '' : 's'}</span>
          </div>
          <span class="ap-class-caret"></span>
        </div>
        <div class="ap-class-body">${aberto ? this._tabelaHTML(g.itens, key) : ''}</div>
      </div>`;
  }

  _tabelaHTML(itens, key = '') {
    // Paginação: só as primeiras N linhas; o resto via "Carregar mais".
    const shown = Math.min(this._pageSize, itens.length);
    const linhas = itens.slice(0, shown).map(e => this._linhaHTML(e)).join('');
    return `<table class="etf-table">${this._cabecalhoHTML()}<tbody>${linhas}</tbody></table>` +
      this._loadMoreHTML(key, shown, itens.length);
  }

  _loadMoreHTML(key, shown, total) {
    if (total <= shown) return '';
    const restante = total - shown;
    const prox = Math.min(this._pageSize, restante);
    return `<button type="button" class="ap-load-more" data-grupo="${_esc(key)}" data-shown="${shown}">` +
      `Carregar mais ${prox} <span class="ap-load-more-rest">` +
      `(${restante.toLocaleString('pt-BR')} ETFs restantes)</span></button>`;
  }

  /** Anexa o próximo lote de linhas de um tema ao seu tbody. */
  _loadMoreBatch(button) {
    const key = button.dataset.grupo;
    const shown = Number(button.dataset.shown);
    const itens = this._grupoMap[key];
    if (!itens) { this._removeLoadMore(button); return; }
    const next = itens.slice(shown, shown + this._pageSize);
    if (!next.length) { this._removeLoadMore(button); return; }
    const tbody = button.closest('.ap-class-body')?.querySelector('tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', next.map(e => this._linhaHTML(e)).join(''));
    const novoShown = shown + next.length;
    if (novoShown >= itens.length) {
      this._removeLoadMore(button);
    } else {
      const restante = itens.length - novoShown;
      const prox = Math.min(this._pageSize, restante);
      button.dataset.shown = String(novoShown);
      button.innerHTML = `Carregar mais ${prox} <span class="ap-load-more-rest">` +
        `(${restante.toLocaleString('pt-BR')} ETFs restantes)</span>`;
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
    if (!('IntersectionObserver' in window)) return;
    this._loadMoreObserver = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this._loadMoreBatch(e.target);
    }, { root: null, rootMargin: '400px 0px' });
    host.querySelectorAll('.ap-load-more').forEach(b => this._loadMoreObserver.observe(b));
  }

  _cabecalhoHTML() {
    const L = this._labelsPeriodos();
    const arrow = (k) => this.sort.key !== k ? '<span class="arrow">▼</span>'
      : `<span class="arrow ${this.sort.dir === 'asc' ? 'is-asc' : 'is-desc'}">▼</span>`;
    return `
      <thead><tr>
        <th class="left sortable" data-sort-key="ticker">Ticker ${arrow('ticker')}</th>
        <th class="left sortable" data-sort-key="nome">Nome do ETF ${arrow('nome')}</th>
        <th class="sortable" data-sort-key="ret_0">${L[0]} ${arrow('ret_0')}</th>
        <th class="sortable" data-sort-key="ret_1">${L[1]} ${arrow('ret_1')}</th>
        <th class="sortable" data-sort-key="ret_2">${L[2]} ${arrow('ret_2')}</th>
        <th class="sortable" data-sort-key="ret_3">${L[3]} ${arrow('ret_3')}</th>
        <th class="sortable" data-sort-key="ret_4">${L[4]} ${arrow('ret_4')}</th>
        <th class="sortable" data-sort-key="market_cap">Market Cap ${arrow('market_cap')}</th>
      </tr></thead>`;
  }

  _linhaHTML(e) {
    const L = this._labelsPeriodos();
    const cells = [];
    for (let i = 0; i < 5; i++) {
      const v = e.retornos?.[i];
      const cls = v == null ? '' : v > 0 ? 'et-pos' : v < 0 ? 'et-neg' : '';
      const txt = v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
      cells.push(`<td class="et-cell" data-label="${L[i]}" data-sort="${v ?? ''}"><span class="et-period">${L[i]}</span><span class="et-val ${cls}">${txt}</span></td>`);
    }
    return `
      <tr data-ticker="${_esc(e.ticker)}">
        <td class="et-ticker">${_esc(e.ticker)}</td>
        <td class="et-name">${_esc(e.nome)}</td>
        ${cells.join('')}
        <td class="et-mkt" data-label="Market Cap" data-sort="${e.market_cap ?? ''}">${this._mktHTML(e.market_cap)}</td>
      </tr>`;
  }

  _mktHTML(v) {
    if (v == null || isNaN(v)) return '<span class="et-muted">—</span>';
    let txt;
    if (v >= 1e12) txt = `US$ ${(v / 1e12).toFixed(2).replace('.', ',')} tri`;
    else if (v >= 1e9) txt = `US$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
    else if (v >= 1e6) txt = `US$ ${(v / 1e6).toFixed(0)} mi`;
    else txt = `US$ ${v.toFixed(0)}`;
    return `<span title="US$ ${v.toLocaleString('pt-BR')}">${txt}</span>`;
  }

  _comparator() {
    const k = this.sort.key;
    const dir = this.sort.dir === 'desc' ? -1 : 1;
    return (a, b) => {
      let va, vb;
      if (k.startsWith('ret_')) { const i = +k.slice(4); va = a.retornos?.[i]; vb = b.retornos?.[i]; }
      else { va = a[k]; vb = b[k]; }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb, 'pt-BR') * dir;
      return (va - vb) * dir;
    };
  }
}

new AppEtfs().boot();
