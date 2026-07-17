/**
 * tabela.js — Tabela de fundos agrupada por classe, com virtual scroll.
 *
 * Layout (estilo Apple):
 *   • Header de coluna em maiúsculas pequenas, com sort indicator
 *   • Linhas agrupadas por classe (Renda Fixa Simples (13), etc.)
 *   • Cada classe é um "acordeão" — clique no header colapsa/expande
 *   • Coluna INSTITUIÇÃO com badge colorido (XP amarelo, BTG preto, etc.)
 *   • Coluna DATA (última cota)
 *   • Períodos: MAI/26, ABR/26, 2026, 12 MESES, 24 MESES
 *   • CAP. MÊS, CAP. ANO em formato compacto (+494,0M)
 *   • PATRIMÔNIO (PL) em formato compacto (R$ 1,5 bi)
 *
 * Virtual scroll: trata headers de grupo como linhas especiais no eixo Y.
 * Mantém ~30-40 elementos no DOM mesmo com 1k+ fundos.
 */

import { pct, pctSinal, pctCDI, moedaCompacta, classeSinal, dataBR } from './format.js';

const LINHA_ALTURA_PX  = 64;
const HEADER_ALTURA_PX = 48;
const BUFFER_LINHAS    = 6;

// Mapping classe → ID de categoria (sidebar). Use lowercase + sem acentos.
function classeToCategoria(classe) {
  const c = String(classe).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (c.includes('renda fixa simples')) return 'rf-simples';
  if (c.includes('credito privado') || c.includes('crédito')) return 'credito-privado';
  if (c.includes('debentures') || c.includes('debêntures') || c.includes('infra')) return 'debentures-infra';
  if (c.includes('rf') || c.includes('renda fixa')) return 'rf-ativa';
  if (c.includes('multimercado')) return 'multimercado';
  if (c.includes('indexa')) return 'rv-indexados';
  if (c.includes('renda variavel') || c.includes('renda variável') || c.includes('acoes') || c.includes('ações')) return 'renda-variavel';
  if (c.includes('cambial') || c.includes('comm') || c.includes('dolar')) return 'commodities';
  if (c.includes('cripto')) return 'cripto';
  if (c.includes('international') || c.includes('global') || c.includes('exterior')) return 'internacional-brl';
  if (c.includes('esg') || c.includes('sustent')) return 'esg';
  if (c.includes('fmp')) return 'fmp';
  if (c.includes('aloca')) return 'alocacao';
  if (c.includes('fip') || c.includes('estruturado')) return 'fip-estruturado';
  if (c.includes('fidc')) return 'fidc';
  return 'outros';
}

const PERIODOS_LABELS_COMPACTOS = {
  'Mês':    'M-1',     // sobreposto em runtime
  'Mês -1': 'M-2',
  'Ano':    'ANO',
  '12M':    '12M',
  '24M':    '24M',
};

export class Tabela {
  constructor(root, opts = {}) {
    this.root = root;
    this.periodos = opts.periodos || ['Mês', 'Mês -1', 'Ano', '12M', '24M'];
    this.mostrarCaptacao = opts.mostrarCaptacao !== false;
    this.mostrarVgblPgbl = opts.mostrarVgblPgbl === true;
    this.mostrarInstituicao = opts.mostrarInstituicao !== false;
    this.agruparPorClasse = opts.agruparPorClasse !== false;
    this.onClickClasse = opts.onClickClasse || null;
    this.dataReferencia = opts.dataReferencia || null;   // string ISO da última cota

    this._dados = [];
    this._filtradosFlat = [];   // array unificado de {type:'header'|'row', ...}
    this._predicate = () => true;
    this._sortKey = null;
    this._sortDir = 'desc';
    this._classeOculta = new Set();    // classes colapsadas
    this._classeFiltrada = null;       // se setado, mostra só essa classe
    this._scrollEl = null;
    this._tbodyEl = null;
    this._rafPending = false;

    this._construirShell();
  }

  _labelsPeriodos() {
    // MAI/26, ABR/26, ANO/26, 12 MESES, 24 MESES baseados na data de referência.
    const labels = [];
    if (!this.dataReferencia) return this.periodos;
    const [y, m] = this.dataReferencia.split('-');
    const ano2 = y.slice(2);
    const mesAtual = parseInt(m, 10);
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    const anoAnt = mesAtual === 1 ? (parseInt(ano2, 10) - 1).toString().padStart(2, '0') : ano2;
    for (const p of this.periodos) {
      if (p === 'Mês') labels.push(`${meses[mesAtual - 1]}/${ano2}`);
      else if (p === 'Mês -1') labels.push(`${meses[mesAnt - 1]}/${anoAnt}`);
      else if (p === 'Ano') labels.push(`20${ano2}`);
      else labels.push(p === '12M' ? '12 MESES' : p === '24M' ? '24 MESES' : p);
    }
    return labels;
  }

  _construirShell() {
    const lblPer = this._labelsPeriodos();
    const cols = [
      { key: 'nome',    label: 'FUNDO',  align: 'left',  flex: 3 },
    ];
    if (this.mostrarInstituicao) {
      cols.push({ key: 'instituicao', label: 'INSTITUIÇÃO', align: 'left', width: 100 });
    }
    cols.push({ key: 'ultima_data', label: 'DATA', align: 'left', width: 90 });
    for (let i = 0; i < this.periodos.length; i++) {
      cols.push({ key: `ret_${i}`, label: lblPer[i], align: 'right', width: 96 });
    }
    if (this.mostrarCaptacao) {
      cols.push({ key: 'captacao_mes', label: 'CAP. MÊS', align: 'right', width: 86 });
      cols.push({ key: 'captacao_ano', label: 'CAP. ANO', align: 'right', width: 86 });
    }
    if (this.mostrarVgblPgbl) {
      cols.push({ key: 'vgbl', label: 'VGBL', align: 'center', width: 56 });
      cols.push({ key: 'pgbl', label: 'PGBL', align: 'center', width: 56 });
    }
    cols.push({ key: 'pl', label: 'PATRIMÔNIO', align: 'right', width: 110 });
    this._cols = cols;

    const headerCols = cols.map(c => `
      <div class="tabela__th"
           data-col="${c.key}"
           data-align="${c.align}"
           style="${c.width ? `--col-w: ${c.width}px` : `--col-flex: ${c.flex || 1}`}">
        <span class="tabela__th-label">${c.label}</span>
        <span class="tabela__sort-arrow" aria-hidden="true">▼</span>
      </div>
    `).join('');

    this.root.classList.add('tabela-wrap');
    this.root.innerHTML = `
      <div class="tabela" role="grid">
        <div class="tabela__header" role="row">${headerCols}</div>
        <div class="tabela__scroll" data-scroll>
          <div class="tabela__spacer-before" data-spacer-before></div>
          <div class="tabela__body" data-tbody role="rowgroup"></div>
          <div class="tabela__spacer-after" data-spacer-after></div>
        </div>
        <div class="tabela__empty" data-empty hidden>
          Nenhum fundo corresponde aos filtros atuais.
        </div>
      </div>
    `;

    this._scrollEl = this.root.querySelector('[data-scroll]');
    this._tbodyEl = this.root.querySelector('[data-tbody]');
    this._spacerBefore = this.root.querySelector('[data-spacer-before]');
    this._spacerAfter = this.root.querySelector('[data-spacer-after]');
    this._emptyEl = this.root.querySelector('[data-empty]');

    this._scrollEl.addEventListener('scroll', () => this._scheduleRender());
    window.addEventListener('resize', () => this._scheduleRender());

    this.root.querySelector('.tabela__header').addEventListener('click', (e) => {
      const th = e.target.closest('[data-col]');
      if (!th) return;
      this._toggleSort(th.dataset.col);
    });

    // Toggle de classe (colapsar/expandir).
    this._tbodyEl.addEventListener('click', (e) => {
      const h = e.target.closest('[data-group-toggle]');
      if (!h) return;
      const classe = h.dataset.groupToggle;
      if (this._classeOculta.has(classe)) this._classeOculta.delete(classe);
      else this._classeOculta.add(classe);
      this._recompute();
    });
  }

  setDados(fundos) {
    this._dados = fundos;
    this._recompute();
  }

  setFiltro(predicate) {
    this._predicate = predicate || (() => true);
    this._recompute();
  }

  /** Filtra só fundos de uma classe específica (chamado pela sidebar). null = mostra todos. */
  filtrarClasse(classe) {
    this._classeFiltrada = classe;
    this._recompute();
    this._scrollEl.scrollTop = 0;
  }

  /** Devolve as classes únicas dos dados (pra sidebar saber o que existe). */
  getClassesPresentes() {
    const set = new Set();
    for (const f of this._dados) set.add(f.classe || 'Outros');
    return [...set];
  }

  _toggleSort(key) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this._sortKey = key;
      this._sortDir = (key === 'nome' || key === 'classe' || key === 'instituicao') ? 'asc' : 'desc';
    }
    this._recompute();
    this._refreshSortIndicators();
  }

  _refreshSortIndicators() {
    this.root.querySelectorAll('.tabela__th').forEach(th => {
      const active = th.dataset.col === this._sortKey;
      th.classList.toggle('tabela__th--sorted', active);
      th.classList.toggle('tabela__th--asc', active && this._sortDir === 'asc');
    });
  }

  _valorParaSort(fundo, key) {
    if (key.startsWith('ret_')) return fundo.retornos?.[Number(key.slice(4))] ?? null;
    return fundo[key] ?? null;
  }

  _recompute() {
    // 1) aplica filtros (busca + classe).
    let arr = this._dados.filter(this._predicate);
    if (this._classeFiltrada) {
      arr = arr.filter(f => (f.classe || 'Outros') === this._classeFiltrada);
    }

    // 2) ordena.
    if (this._sortKey) {
      const dir = this._sortDir === 'desc' ? -1 : 1;
      arr.sort((a, b) => {
        const va = this._valorParaSort(a, this._sortKey);
        const vb = this._valorParaSort(b, this._sortKey);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') return va.localeCompare(vb, 'pt-BR') * dir;
        return (va - vb) * dir;
      });
    }

    // 3) agrupamento.
    if (this.agruparPorClasse) {
      const grupos = new Map();
      for (const f of arr) {
        const cls = f.classe || 'Outros';
        if (!grupos.has(cls)) grupos.set(cls, []);
        grupos.get(cls).push(f);
      }
      const flat = [];
      // Ordena grupos por tamanho (decrescente). Estável.
      const grupOrd = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [cls, fundos] of grupOrd) {
        flat.push({ type: 'header', classe: cls, count: fundos.length, height: HEADER_ALTURA_PX });
        if (!this._classeOculta.has(cls)) {
          for (const f of fundos) flat.push({ type: 'row', fundo: f, height: LINHA_ALTURA_PX });
        }
      }
      this._filtradosFlat = flat;
    } else {
      this._filtradosFlat = arr.map(f => ({ type: 'row', fundo: f, height: LINHA_ALTURA_PX }));
    }

    this._emptyEl.hidden = this._filtradosFlat.length > 0;
    this._scheduleRender();
  }

  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._renderVisivel();
    });
  }

  _renderVisivel() {
    const total = this._filtradosFlat.length;
    if (total === 0) {
      this._tbodyEl.innerHTML = '';
      this._spacerBefore.style.height = '0px';
      this._spacerAfter.style.height = '0px';
      return;
    }

    const scrollTop = this._scrollEl.scrollTop;
    const altura = this._scrollEl.clientHeight || 600;

    // Calcula offsets cumulativos pra heights variáveis (header vs row).
    // Pra velocidade, indexamos via prefix sum (cacheado).
    if (!this._prefixSum || this._prefixSum.length !== total + 1) {
      this._prefixSum = new Array(total + 1);
      this._prefixSum[0] = 0;
      for (let i = 0; i < total; i++) {
        this._prefixSum[i + 1] = this._prefixSum[i] + this._filtradosFlat[i].height;
      }
    }

    const totalH = this._prefixSum[total];

    // Binary search pelo índice inicial/final visível.
    const findIndex = (offset) => {
      let lo = 0, hi = total;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (this._prefixSum[m + 1] <= offset) lo = m + 1;
        else hi = m;
      }
      return lo;
    };

    let inicio = Math.max(0, findIndex(scrollTop) - BUFFER_LINHAS);
    let fim    = Math.min(total, findIndex(scrollTop + altura) + 1 + BUFFER_LINHAS);

    const before = this._prefixSum[inicio];
    const after = totalH - this._prefixSum[fim];
    this._spacerBefore.style.height = `${before}px`;
    this._spacerAfter.style.height = `${after}px`;

    const html = [];
    for (let i = inicio; i < fim; i++) {
      const item = this._filtradosFlat[i];
      if (item.type === 'header') html.push(this._headerHTML(item));
      else html.push(this._linhaHTML(item.fundo));
    }
    this._tbodyEl.innerHTML = html.join('');
  }

  _headerHTML(g) {
    const oculto = this._classeOculta.has(g.classe);
    return `
      <div class="tabela__group-header"
           data-group-toggle="${this._escape(g.classe)}"
           role="row"
           style="height: ${HEADER_ALTURA_PX}px;">
        <span class="tabela__group-title">${this._escape(g.classe)}</span>
        <span class="tabela__group-count">${g.count} ${g.count === 1 ? 'fundo' : 'fundos'}</span>
        <span class="tabela__group-arrow ${oculto ? 'tabela__group-arrow--down' : ''}">▴</span>
      </div>
    `;
  }

  _linhaHTML(f) {
    const cells = [];

    // Coluna FUNDO (com nome + cnpj + classe).
    cells.push(`
      <div class="tabela__td" data-align="left" style="--col-flex: 3;">
        <div class="tabela__nome-wrap">
          <div class="tabela__nome">
            ${f.link
              ? `<a href="${f.link}" target="_blank" rel="noopener">${this._escape(f.nome)}</a>`
              : this._escape(f.nome)}
            ${f.status ? `<span class="status-chip status-chip--${this._statusClasse(f.status)}">${f.status}</span>` : ''}
          </div>
          <div class="tabela__sub">
            <span>${f.cnpj}</span>
            <span class="tabela__sep">·</span>
            <span>${this._escape(f.classe || '')}</span>
            ${f.cotizacao ? `<span class="tabela__sep">·</span><span>Cotização ${f.cotizacao}</span>` : ''}
          </div>
        </div>
      </div>
    `);

    if (this.mostrarInstituicao) {
      const inst = f.instituicao || 'outros';
      cells.push(`
        <div class="tabela__td" data-align="left" style="--col-w: 100px;">
          <span class="inst-badge inst-badge--${inst}">${this._labelInst(inst)}</span>
        </div>
      `);
    }

    cells.push(`
      <div class="tabela__td" data-align="left" style="--col-w: 90px;">
        <span class="tabela__data-cell">${f.ultima_data || '—'}</span>
      </div>
    `);

    for (let i = 0; i < this.periodos.length; i++) {
      const ret = f.retornos?.[i];
      const cdi = f.pct_cdi?.[i];
      cells.push(`
        <div class="tabela__td" data-align="right" style="--col-w: 96px;">
          <div class="tabela__ret ${classeSinal(ret)}">${pctSinal(ret)}</div>
          ${cdi != null ? `<div class="tabela__cdi">${pctCDI(cdi)}</div>` : ''}
        </div>
      `);
    }

    if (this.mostrarCaptacao) {
      cells.push(`
        <div class="tabela__td" data-align="right" style="--col-w: 86px;">
          <span class="tabela__cap ${classeSinal(f.captacao_mes)}">${this._capCompacta(f.captacao_mes)}</span>
        </div>
      `);
      cells.push(`
        <div class="tabela__td" data-align="right" style="--col-w: 86px;">
          <span class="tabela__cap ${classeSinal(f.captacao_ano)}">${this._capCompacta(f.captacao_ano)}</span>
        </div>
      `);
    }

    if (this.mostrarVgblPgbl) {
      cells.push(`
        <div class="tabela__td" data-align="center" style="--col-w: 56px;">
          ${f.vgbl
            ? `<a href="${f.vgbl}" target="_blank" rel="noopener" class="tabela__link-icon" title="Lâmina VGBL">📄</a>`
            : '<span class="tabela__faint">—</span>'}
        </div>
      `);
      cells.push(`
        <div class="tabela__td" data-align="center" style="--col-w: 56px;">
          ${f.pgbl
            ? `<a href="${f.pgbl}" target="_blank" rel="noopener" class="tabela__link-icon" title="Lâmina PGBL">📄</a>`
            : '<span class="tabela__faint">—</span>'}
        </div>
      `);
    }

    cells.push(`
      <div class="tabela__td" data-align="right" style="--col-w: 110px;">
        <span class="tabela__pl">${this._plCompacto(f.pl)}</span>
      </div>
    `);

    return `
      <div class="tabela__tr" role="row" style="height: ${LINHA_ALTURA_PX}px;">${cells.join('')}</div>
    `;
  }

  _capCompacta(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    const sinal = v >= 0 ? '+' : '−';
    if (abs >= 1e9)  return `${sinal}${(abs / 1e9).toFixed(1).replace('.', ',')}bi`;
    if (abs >= 1e6)  return `${sinal}${(abs / 1e6).toFixed(1).replace('.', ',')}M`;
    if (abs >= 1e3)  return `${sinal}${(abs / 1e3).toFixed(0)}K`;
    return `${sinal}${abs.toFixed(0)}`;
  }

  _plCompacto(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
    if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`;
    if (v >= 1e3)  return `R$ ${(v / 1e3).toFixed(0)} mil`;
    return `R$ ${v.toFixed(0)}`;
  }

  _labelInst(id) {
    const m = { itau: 'Itaú', btg: 'BTG', xp: 'XP', inter: 'Inter' };
    return m[id] || id.toUpperCase();
  }

  _statusClasse(status) {
    const s = String(status).toUpperCase().trim();
    if (s === 'ABERTO') return 'open';
    if (s === 'FECHADO' || s === 'ENCERRADO') return 'closed';
    if (s === 'INIBIDO') return 'paused';
    return 'neutral';
  }

  _escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export { classeToCategoria };
