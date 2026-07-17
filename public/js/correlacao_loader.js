/**
 * correlacao_loader.js — Implementação V2 da página de correlação.
 *
 * Reusa o markup do shell original (cor-sidebar, cor-tabs, cor-fund-list,
 * cor-heatmap-wrap) mas a lógica é nova: calcula correlação on-demand
 * pra fundos selecionados, sem matriz NxN pré-computada.
 */

import { pool } from './data_pool.js';
import { recortarJanela, matrizCorrelacao } from './series.js';

const MAX_SEL = 15;
const NORM = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Paleta espelhada do comparador (private-comparacao.js) pra dar coerência
// visual entre chips de correlação e do comparador.
const COLORS = [
  '#007AFF', '#FF9500', '#AF52DE', '#34C759', '#FF2D55',
  '#5AC8FA', '#FFCC00', '#FF3B30', '#5856D6', '#00C7BE',
  '#A2845E', '#48484A', '#FF6482', '#30D158', '#BF5AF2',
];

class CorrApp {
  constructor() {
    this.inst = this._instDaURL();
    this.aba = 'fundo';   // 'fundo' | 'prev'
    // Default 12m (Passo 6): carrega só a janela de 12 meses no boot (~5× mais
    // leve que 'max'). 24m/Tudo baixam o histórico completo sob demanda.
    this.janela = '12m';
    this.query = '';
    this.sel = [];        // [{cnpj, nome, classe, tipo}]
    this.fundos = [];     // catálogo da instituição (filtrado por cota presente)
    this.prevs = [];
    this.cotas = null;
    this._rawFundos = [];       // catálogo bruto (antes do filtro por cota)
    this._rawPrevs = [];
    this._janelaCarregada = null;   // '12m' ou 'max' — o que está em this.cotas
  }

  _instDaURL() {
    const h = (location.hash || '').replace('#', '');
    const m = h.match(/inst=([a-z]+)/);
    return m ? m[1] : 'todos';
  }

  async boot() {
    this._bindUI();
    this._marcarInstAtiva();
    try {
      const meta = await pool.meta();
      this._setDataFooter(meta);
    } catch {}

    document.getElementById('corFundList').innerHTML = '<p class="dyn-loading">Carregando fundos</p>';

    try {
      const inst = this.inst;
      const [fundos, prevs, cotas] = await Promise.all([
        inst === 'todos' ? pool.fundosTodos() : pool.fundos(inst),
        inst === 'todos' ? pool.previdenciaTodos().catch(() => []) : pool.previdencia(inst).catch(() => []),
        inst === 'todos' ? pool.cotasTodos('12m') : pool.cotas(inst, '12m'),
      ]);
      this._rawFundos = fundos;
      this._rawPrevs = prevs;
      this.cotas = cotas;
      this._janelaCarregada = '12m';
      this._rebuildCatalog();
      this._renderList();
      this._renderHeatmap();
    } catch (e) {
      console.error('[corr]', e);
      document.getElementById('corFundList').innerHTML = '<p class="dyn-loading" style="color:#B52B2B;">Falha ao carregar.</p>';
    }
  }

  _setDataFooter(meta) {
    if (!meta?.ultima_data_cota) return;
    const [a, m, d] = meta.ultima_data_cota.split('-');
    document.querySelectorAll('[data-ultima-data]').forEach(el => el.textContent = `${d}/${m}/${a}`);
  }

  _marcarInstAtiva() {
    document.querySelectorAll('.inst-btn[data-inst]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.inst === this.inst);
    });
  }

  _bindUI() {
    // Tabs Fundos/Prev
    document.querySelectorAll('.cor-tab').forEach(t => {
      t.addEventListener('click', () => {
        const tipo = t.dataset.tipo;
        if (tipo === this.aba) return;
        this.aba = tipo;
        document.querySelectorAll('.cor-tab').forEach(x => x.classList.toggle('is-selected', x.dataset.tipo === tipo));
        this._renderList();
      });
    });
    // Busca
    document.getElementById('corSearch').addEventListener('input', (e) => {
      this.query = e.target.value;
      this._renderList();
    });
    // Janela. 24m/Tudo podem exigir baixar o histórico completo (max) sob
    // demanda — só na primeira vez; depois fica em cache no pool.
    document.querySelectorAll('#corWindow button').forEach(b => {
      b.addEventListener('click', async () => {
        const w = b.dataset.window;
        if (w === this.janela) return;
        this.janela = w;
        document.querySelectorAll('#corWindow button').forEach(x => x.classList.toggle('is-selected', x.dataset.window === w));
        const precisaBaixar = this._dataFileFor(w) === 'max' && this._janelaCarregada !== 'max';
        if (precisaBaixar) {
          const sum = document.getElementById('corSummary');
          if (sum) sum.textContent = 'Carregando histórico completo…';
        }
        await this._ensureCotas(w);
        this._renderList();      // catálogo pode ter crescido (fundos antigos)
        this._renderHeatmap();
      });
    });
    // Reset
    document.getElementById('corReset').addEventListener('click', () => {
      this.sel = [];
      this._renderChips();
      this._renderList();
      this._renderHeatmap();
    });
  }

  /** Qual arquivo de cotas cobre a janela da UI: 12m só precisa do _12m;
   *  24m e Tudo precisam do histórico completo (max). */
  _dataFileFor(janela) {
    return (janela === '24m' || janela === 'all' || janela === 'max') ? 'max' : '12m';
  }

  /** Garante que this.cotas cobre a janela pedida, baixando max sob demanda.
   *  Uma vez em max, cobre tudo (não volta pra 12m → catálogo não encolhe). */
  async _ensureCotas(janela) {
    const file = this._dataFileFor(janela);
    if (this._janelaCarregada === 'max') return;           // max cobre tudo
    if (file === '12m') return;                            // 12m já carregado no boot
    // Precisa do max.
    const blob = this.inst === 'todos'
      ? await pool.cotasTodos('max')
      : await pool.cotas(this.inst, 'max');
    this.cotas = blob;
    this._janelaCarregada = 'max';
    this._rebuildCatalog();
  }

  /** (Re)monta os catálogos filtrando o bruto pelos fundos com cota presente
   *  na janela atualmente carregada. */
  _rebuildCatalog() {
    const has = (f) => this.cotas.cotas[f.serie_id || f.cnpj];
    this.fundos = this._rawFundos.filter(has).map(f => ({ ...f, tipo: 'fundo' }));
    this.prevs  = this._rawPrevs.filter(has).map(f => ({ ...f, tipo: 'prev' }));
  }

  _catalogoAtual() { return this.aba === 'fundo' ? this.fundos : this.prevs; }

  _renderList() {
    const list = document.getElementById('corFundList');
    const arr = this._catalogoAtual();
    const termo = NORM(this.query);
    const filtrados = !termo ? arr : arr.filter(f =>
      NORM(f.nome).includes(termo) ||
      NORM(f.cnpj).includes(termo) ||
      NORM(f.classe || '').includes(termo)
    );
    const slice = filtrados.slice(0, 80);
    if (slice.length === 0) {
      list.innerHTML = '<p class="dyn-loading" style="color:#86868b;">Nenhum fundo.</p>';
      return;
    }
    const selCnpjs = new Set(this.sel.map(f => f.serie_id || f.cnpj));
    const podeAdd = this.sel.length < MAX_SEL;
    list.innerHTML = slice.map(f => {
      const isSel = selCnpjs.has(f.serie_id || f.cnpj);
      const disabled = !isSel && !podeAdd;
      const cls = 'cor-fund-item' + (isSel ? ' is-selected' : '') + (disabled ? ' is-disabled' : '');
      return `
        <div class="${cls}" data-cnpj="${this._esc(f.serie_id || f.cnpj)}">
          <span class="check"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg></span>
          <div class="info">
            <span class="nome">${this._esc(f.nome)}</span>
            <span class="meta">${this._esc(f.classe || '—')}</span>
          </div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-cnpj]').forEach(b => {
      if (b.classList.contains('is-disabled')) return;
      b.addEventListener('click', () => {
        const cnpj = b.dataset.cnpj;
        const idx = this.sel.findIndex(f => (f.serie_id || f.cnpj) === cnpj);
        if (idx >= 0) {
          this.sel.splice(idx, 1);
        } else {
          if (this.sel.length >= MAX_SEL) return;
          const f = this._catalogoAtual().find(x => (x.serie_id || x.cnpj) === cnpj);
          if (f) this.sel.push({ ...f });
        }
        this._recolor();
        this._renderChips();
        this._renderList();
        this._renderHeatmap();
      });
    });
  }

  /* Atribui cor a cada selecionado na ordem (mesma paleta do comparador).
     Re-roda em adição/remoção pra que os primeiros sempre tenham as cores
     iniciais (azul, laranja, púrpura…). */
  _recolor() {
    this.sel.forEach((s, i) => { s.color = COLORS[i % COLORS.length]; });
  }

  _renderChips() {
    const wrap = document.getElementById('corChips');
    const cnt = document.getElementById('corCount');
    cnt.textContent = String(this.sel.length);
    if (this.sel.length === 0) { wrap.innerHTML = ''; return; }
    // Usa markup .cmp-chip (mesmo do comparador) pra ter bolinha colorida
    // e visual coerente. O CSS já está disponível porque correlacao.html
    // carrega shared/private-comparacao.css.
    wrap.innerHTML = this.sel.map(f => `
      <div class="cmp-chip" data-cnpj="${this._esc(f.serie_id || f.cnpj)}">
        <span class="cmp-chip-dot" style="background:${f.color}"></span>
        <span class="cmp-chip-name" title="${this._esc(f.nome)}">${this._esc(f.nome)}</span>
        <button type="button" class="cmp-chip-x" aria-label="Remover">×</button>
      </div>
    `).join('');
    wrap.querySelectorAll('.cmp-chip-x').forEach(x => {
      x.addEventListener('click', (e) => {
        const cnpj = e.target.closest('[data-cnpj]').dataset.cnpj;
        this.sel = this.sel.filter(f => (f.serie_id || f.cnpj) !== cnpj);
        this._recolor();
        this._renderChips();
        this._renderList();
        this._renderHeatmap();
      });
    });
  }

  _renderHeatmap() {
    const sum = document.getElementById('corSummary');
    const wrap = document.getElementById('corHeatmap');
    if (this.sel.length < 2) {
      sum.textContent = 'Selecione 2 ou mais fundos pra ver a matriz.';
      wrap.innerHTML = '';
      return;
    }

    const cnpjs = this.sel.map(f => f.serie_id || f.cnpj);
    const cotasFilt = {};
    for (const c of cnpjs) cotasFilt[c] = this.cotas.cotas[c];
    const recortado = recortarJanela({ datas: this.cotas.datas, cotas: cotasFilt }, this._janelaMeses());

    const seriesMap = new Map(cnpjs.map(c => [c, recortado.cotas[c]]));
    const { cnpjs: csOrd, matriz } = matrizCorrelacao(seriesMap);

    sum.textContent = `${this.sel.length} fundos · janela ${this.janela === 'all' ? 'Tudo' : this.janela} · ${recortado.datas.length} dias úteis`;
    this._desenharHeatmapGrid(wrap, csOrd, matriz);
  }

  _janelaMeses() {
    if (this.janela === '12m') return '12m';
    if (this.janela === '24m') return '24m';
    return 'max';
  }

  /* Renderiza a matriz com grid CSS (markup .cmp-corr-*) — mesmo visual do
     comparador: labels horizontais, bolinha colorida nas linhas, células
     arredondadas com cor proporcional ao |r|, células claras pra valores
     baixos, escuras pra altos. Substituiu o SVG antigo que tinha labels
     rotacionados e cara pesada. */
  _desenharHeatmapGrid(wrap, cnpjs, matriz) {
    const n = cnpjs.length;
    const fundOf = (c) => this.sel.find(x => (x.serie_id || x.cnpj) === c);
    // Paleta detecta tema: light usa azul/vermelho, dark usa verde/laranja
    // (mais legível em fundo escuro e combina com o resto do dark theme IPB).
    const isDark = document.body.classList.contains('theme-dark');
    const corrColor = (r) => {
      if (r == null) return isDark ? 'rgba(255,255,255,0.04)' : '#FAFAFA';
      const a = Math.min(1, Math.abs(r));
      const alpha = (0.18 + 0.7 * a).toFixed(3);
      if (isDark) {
        // verde = correlação positiva; magenta = negativa
        if (r >= 0) return `rgba(48,209,88,${alpha})`;
        return `rgba(255,55,95,${alpha})`;
      }
      if (r >= 0) return `rgba(0,113,227,${alpha})`;
      return `rgba(255,59,48,${alpha})`;
    };
    const corrTextColor = (r) => {
      if (r == null) return isDark ? '#86868B' : '#86868B';
      if (isDark) return Math.abs(r) > 0.55 ? '#0a0a0a' : '#f5f5f7';
      return Math.abs(r) > 0.55 ? '#fff' : '#1D1D1F';
    };
    const fmtCorr = (r) => {
      if (r == null) return '—';
      return (r >= 0 ? '+' : '') + r.toFixed(2).replace('.', ',');
    };
    const dot = (color) =>
      `<span class="cmp-color-dot" style="background:${color};width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;margin-right:4px;"></span>`;

    // Largura da coluna de labels: depende da quantidade de fundos
    const labelCol = n > 8 ? '150px' : '180px';

    const parts = [];
    parts.push(`<div class="cmp-corr-grid" style="grid-template-columns:${labelCol} repeat(${n}, minmax(0, 1fr));">`);
    // Header: corner + col labels
    parts.push('<div class="cmp-corr-corner"></div>');
    for (let j = 0; j < n; j++) {
      const f = fundOf(cnpjs[j]);
      const nome = f?.nome || cnpjs[j];
      parts.push(
        `<div class="cmp-corr-col-label" title="${this._esc(nome)}">` +
        dot(f?.color || '#999') +
        this._esc(this._abrev(nome, 16)) +
        '</div>'
      );
    }
    // Linhas
    for (let i = 0; i < n; i++) {
      const fr = fundOf(cnpjs[i]);
      const nomeR = fr?.nome || cnpjs[i];
      parts.push(
        `<div class="cmp-corr-row-label" title="${this._esc(nomeR)}">` +
        dot(fr?.color || '#999') +
        `<span style="overflow:hidden;text-overflow:ellipsis;">${this._esc(this._abrev(nomeR, 24))}</span>` +
        '</div>'
      );
      for (let j = 0; j < n; j++) {
        const v = matriz[i][j];
        if (i === j) {
          parts.push('<div class="cmp-corr-cell diag">1,00</div>');
        } else if (v == null) {
          parts.push('<div class="cmp-corr-cell empty" title="Histórico insuficiente">—</div>');
        } else {
          const bg = corrColor(v);
          const tc = corrTextColor(v);
          const titulo = `${this._esc(nomeR)} × ${this._esc(fundOf(cnpjs[j])?.nome || cnpjs[j])}: ${fmtCorr(v)}`;
          parts.push(
            `<div class="cmp-corr-cell" style="background:${bg};color:${tc};" title="${titulo}">${fmtCorr(v)}</div>`
          );
        }
      }
    }
    parts.push('</div>');
    wrap.innerHTML = parts.join('');
  }

  _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  _abrev(s, max) { return !s ? '' : (s.length <= max ? s : s.slice(0, max - 1) + '…'); }
}

const __corrApp = new CorrApp();
__corrApp.boot();

// Quando o usuário clica em outro banco, o href muda só a hash (#inst=xxx)
// e a página não re-renderiza sozinha. Forçamos reload se a instituição
// mudou (mudanças só de fundos/janela na mesma página são ignoradas).
window.addEventListener('hashchange', () => {
  const novo = (() => {
    const h = (location.hash || '').replace('#', '');
    const m = h.match(/inst=([a-z]+)/);
    return m ? m[1] : 'todos';
  })();
  if (novo !== __corrApp.inst) location.reload();
});
