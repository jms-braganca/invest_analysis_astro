/**
 * app_comparacao.js — Comparador (Apple-style).
 *
 * Layout: hero + switcher de instituições + card branco com
 *   [seletor de fundos à esquerda]  [chart Chart.js à direita]
 * Tabs YTD/12m/24m/Tudo + toggle CDI/Ibovespa abaixo do chart.
 * Tabela resumo de retornos + patrimônio abaixo.
 */

import { pool } from './data_pool.js';
import { renderTopbar, renderFooter } from './topbar.js';
import { Switcher } from './switcher.js';
import { SeletorFundos } from './seletor_fundos.js';
import {
  recortarJanela, normalizarBase100,
  retornoAcum, volAnualizada, maxDrawdown,
} from './series.js';
import { dataBR, pctSinal, classeSinal } from './format.js';

const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
const MAX_FUNDOS = 10;

// Paleta — fundos coloridos legíveis em branco. CDI = preto pontilhado,
// Ibov = cinza pontilhado.
const CORES_FUNDOS = [
  '#0066cc', '#ff8800', '#9b59b6', '#1a8530',
  '#d83434', '#0a8aa8', '#b8860b', '#ec407a',
  '#5b6478', '#3949ab',
];
const COR_CDI  = '#1d1d1f';
const COR_IBOV = '#86868b';

let _ChartJS = null;
async function carregarChartJS() {
  if (_ChartJS) return _ChartJS;
  if (window.Chart) { _ChartJS = window.Chart; return _ChartJS; }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHART_CDN;
    s.async = true;
    s.onload = () => { _ChartJS = window.Chart; resolve(_ChartJS); };
    s.onerror = () => reject(new Error('Falha ao carregar Chart.js'));
    document.head.appendChild(s);
  });
}

class AppComparacao {
  constructor() {
    this.meta = null;
    this.instAtual = 'todos';
    this.janela = '12m';
    this.benchmarks = new Set(['cdi']);   // 'cdi', 'ibov'
    this.fundosSel = [];
    this.fundosInst = [];
    this.cotasInst = null;
    this.chart = null;
  }

  async boot() {
    await renderTopbar({ pagina: 'comparacao' });
    try {
      this.meta = await pool.meta();
    } catch (e) {
      this._mostrarErro('Não foi possível carregar meta.json.');
      return;
    }

    this._lerHash();
    this._renderSwitcher();
    this._renderTabs();
    this._renderBenchmarkToggle();
    await this._carregarInst(this.instAtual);
    await renderFooter({ pagina: 'Comparar fundos' });
  }

  _lerHash() {
    const p = new URLSearchParams(window.location.hash.slice(1));
    if (p.get('inst'))   this.instAtual = p.get('inst');
    if (p.get('janela')) this.janela = p.get('janela');
    if (p.get('fundos')) this.fundosSel = p.get('fundos').split(',').filter(Boolean);
    if (p.get('bench')) {
      this.benchmarks = new Set(p.get('bench').split(',').filter(Boolean));
    }
  }

  _escreverHash() {
    const p = new URLSearchParams();
    p.set('inst', this.instAtual);
    p.set('janela', this.janela);
    if (this.fundosSel.length) p.set('fundos', this.fundosSel.join(','));
    if (this.benchmarks.size) p.set('bench', [...this.benchmarks].join(','));
    const novo = '#' + p.toString();
    if (window.location.hash !== novo) window.history.replaceState(null, '', novo);
  }

  _renderSwitcher() {
    const el = document.querySelector('[data-switcher]');
    const sw = new Switcher(el, { defaultId: this.instAtual, kind: 'cotas' });
    sw.render(this.meta.instituicoes);
    sw.on('change', async (id) => {
      this.instAtual = id;
      this.fundosSel = [];
      this._escreverHash();
      await this._carregarInst(id);
    });
  }

  _renderTabs() {
    const el = document.querySelector('[data-janelas]');
    const opts = [['ytd', 'YTD'], ['12m', '12m'], ['24m', '24m'], ['max', 'Tudo']];
    el.classList.add('pills');
    el.innerHTML = opts.map(([k, lbl]) => `
      <button type="button" class="pills__btn ${k === this.janela ? 'pills__btn--active' : ''}"
              data-janela="${k}">${lbl}</button>
    `).join('');
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-janela]');
      if (!b) return;
      const j = b.dataset.janela;
      if (j === this.janela) return;
      this.janela = j;
      el.querySelectorAll('[data-janela]').forEach(x =>
        x.classList.toggle('pills__btn--active', x.dataset.janela === j));
      this._escreverHash();
      const recarregou = await this._talvezReloadCotas();
      if (!recarregou) {
        this._renderChart();
        this._renderTabelaResumo();
      }
    });
  }

  _renderBenchmarkToggle() {
    const el = document.querySelector('[data-benchmarks]');
    const opts = [['cdi', 'CDI'], ['ibov', 'Ibovespa']];
    el.classList.add('toggle-group');
    el.innerHTML = opts.map(([k, lbl]) => `
      <button type="button" class="toggle-group__btn ${this.benchmarks.has(k) ? 'toggle-group__btn--on' : ''}"
              data-bench="${k}">
        <span class="toggle-group__dot" style="background: ${k === 'cdi' ? COR_CDI : COR_IBOV}"></span>
        ${lbl}
      </button>
    `).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bench]');
      if (!b) return;
      const k = b.dataset.bench;
      if (this.benchmarks.has(k)) this.benchmarks.delete(k);
      else this.benchmarks.add(k);
      b.classList.toggle('toggle-group__btn--on');
      this._escreverHash();
      this._renderChart();
    });
  }

  _janelaArquivo() {
    // Escolhe a menor janela de arquivo que cobre a janela atual da UI.
    const j = this.janela;
    if (j === '1m' || j === '3m' || j === 'ytd') return '3m';
    if (j === '6m' || j === '12m') return '12m';
    return 'max';   // 24m, 'max'
  }

  async _carregarInst(instId) {
    this._setLoading(true);
    try {
      const janelaArq = this._janelaArquivo();
      const isAll = instId === 'todos';
      const [fundos, cotas] = await Promise.all([
        isAll ? pool.fundosTodos() : pool.fundos(instId),
        isAll ? pool.cotasTodos(janelaArq)  : pool.cotas(instId, janelaArq),
      ]);
      this.fundosInst = fundos
        .filter(f => cotas.cotas[f.serie_id || f.cnpj])
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      this.cotasInst = cotas;
      this._janelaArquivoCarregada = janelaArq;
      this._renderSeletor();
      this._renderChart();
      this._renderTabelaResumo();
    } catch (e) {
      console.error('[comparacao]', e);
      this._mostrarErro(`Falha ao carregar ${instId.toUpperCase()}.`);
    } finally {
      this._setLoading(false);
    }
  }

  async _talvezReloadCotas() {
    // Se o usuário pediu uma janela maior que a baixada, faz upgrade.
    const necessaria = this._janelaArquivo();
    const ordem = ['3m', '12m', 'max'];
    if (ordem.indexOf(necessaria) > ordem.indexOf(this._janelaArquivoCarregada || 'max')) {
      await this._carregarInst(this.instAtual);
      return true;
    }
    return false;
  }

  _renderSeletor() {
    const host = document.querySelector('[data-seletor]');
    if (!this._seletor) {
      this._seletor = new SeletorFundos(host, {
        fundos: this.fundosInst,
        max: MAX_FUNDOS,
        placeholder: 'Buscar fundo pelo nome ou CNPJ',
      });
      this._seletor.on('change', (sel) => {
        this.fundosSel = sel.map(f => f.serie_id || f.cnpj);
        this._escreverHash();
        this._renderChart();
        this._renderTabelaResumo();
      });
    } else {
      this._seletor.setFundos(this.fundosInst);
    }
    this._seletor.setSelecionados(this.fundosSel);
    document.querySelector('[data-contador]').textContent =
      `${this.fundosSel.length} / ${MAX_FUNDOS}`;
  }

  async _renderChart() {
    const elChartWrap = document.querySelector('[data-chart-wrap]');
    const elChart = document.querySelector('[data-chart]');
    const elVazio = document.querySelector('[data-vazio]');

    const sel = this.fundosSel
      .map(c => this.fundosInst.find(f => (f.serie_id || f.cnpj) === c))
      .filter(Boolean);

    if (sel.length === 0) {
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      elChartWrap.hidden = true;
      elVazio.hidden = false;
      document.querySelector('[data-contador]').textContent = `0 / ${MAX_FUNDOS}`;
      return;
    }
    elVazio.hidden = true;
    elChartWrap.hidden = false;
    document.querySelector('[data-contador]').textContent =
      `${sel.length} / ${MAX_FUNDOS}`;

    const cnpjsSel = sel.map(f => f.serie_id || f.cnpj);
    const cotasFiltradas = {};
    for (const c of cnpjsSel) cotasFiltradas[c] = this.cotasInst.cotas[c];
    const recortado = recortarJanela(
      { datas: this.cotasInst.datas, cotas: cotasFiltradas },
      this.janela === 'ytd' ? this._ytdJanela() : this.janela,
    );

    const seriesNorm = {};
    for (const c of cnpjsSel) seriesNorm[c] = this._toPct(normalizarBase100(recortado.cotas[c]));

    const Chart = await carregarChartJS();
    if (this.chart) this.chart.destroy();

    const datasets = sel.map((f, i) => ({
      label: this._abreviar(f.nome, 30),
      data: seriesNorm[f.serie_id || f.cnpj],
      borderColor: CORES_FUNDOS[i % CORES_FUNDOS.length],
      backgroundColor: CORES_FUNDOS[i % CORES_FUNDOS.length] + '20',
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true,
      tension: 0.05,
    }));

    // Benchmarks: CDI/Ibov simulados a partir dos retornos macro acumulados.
    // Como não temos cotas diárias de CDI/Ibov no JSON, plotamos como linhas
    // de referência usando o acumulado proporcional ao número de dias.
    const nDias = recortado.datas.length;
    if (this.benchmarks.has('cdi')) {
      datasets.push(this._datasetBench('CDI', this._serieBench(recortado, 'cdi'), COR_CDI));
    }
    if (this.benchmarks.has('ibov')) {
      datasets.push(this._datasetBench('Ibovespa', this._serieBench(recortado, 'ibov'), COR_IBOV));
    }

    const ctx = elChart.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels: recortado.datas, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 8, boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 12, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
              color: '#1d1d1f',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(29, 29, 31, 0.95)',
            padding: 12,
            titleFont: { size: 11, weight: '600' },
            bodyFont: { size: 13 },
            cornerRadius: 8,
            callbacks: {
              title: (items) => dataBR(items[0].label),
              label: (item) => {
                const v = item.parsed.y;
                if (v == null) return null;
                return `${item.dataset.label}: ${pctSinal(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8,
              color: '#86868b',
              font: { size: 10 },
              callback: function(val) {
                const lbl = this.getLabelForValue(val);
                if (typeof lbl === 'string' && lbl.length === 10) {
                  const mAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                  return mAbrev[parseInt(lbl.slice(5,7),10)-1] + '/' + lbl.slice(2, 4);
                }
                return lbl;
              },
            },
            grid: { display: false, drawBorder: false },
            border: { display: false },
          },
          y: {
            ticks: {
              color: '#86868b',
              font: { size: 10 },
              callback: (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%',
            },
            grid: { color: 'rgba(0,0,0,0.04)' },
            border: { display: false },
          },
        },
      },
    });
  }

  _serieBench(recortado, qual) {
    // Calcula vetor acumulado de retorno diário a partir do retorno acumulado
    // do período (interpolando linearmente em escala log).
    const n = recortado.datas.length;
    if (n < 2) return [];
    const meta = this.meta || {};
    const acumPorPer = (qual === 'cdi' ? meta.cdi_acumulado : meta.ibov_acumulado) || {};

    // Estima retorno do período: usamos o acum da janela atual ou aproxima.
    let alvo = 0;
    const j = this.janela;
    const map = { '1m': 'Mês', '12m': '12M', '24m': '24M', 'max': '24M', 'ytd': 'Ano' };
    if (acumPorPer[map[j]] != null) alvo = acumPorPer[map[j]];
    // Caso contrário, projeta linearmente: alvo proporcional a (n / 252) anualizando 12M.
    else if (acumPorPer['12M'] != null) alvo = acumPorPer['12M'] * (n / 252);

    const fatorTotal = 1 + alvo / 100;
    const fatorDia = Math.pow(fatorTotal, 1 / (n - 1));
    const serie = new Array(n);
    let v = 0;
    serie[0] = 0;
    let cum = 1;
    for (let i = 1; i < n; i++) {
      cum *= fatorDia;
      serie[i] = (cum - 1) * 100;
    }
    return serie;
  }

  _datasetBench(label, data, cor) {
    return {
      label,
      data,
      borderColor: cor,
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      spanGaps: true,
      tension: 0.05,
    };
  }

  _toPct(serieBase100) {
    return serieBase100.map(v => v == null ? null : v - 100);
  }

  _ytdJanela() {
    // Calcula meses entre janeiro deste ano e a última cota disponível.
    const ult = this.cotasInst?.datas?.at(-1);
    if (!ult) return '12m';
    const m = parseInt(ult.split('-')[1], 10);
    return `${m}m`;
  }

  _renderTabelaResumo() {
    const el = document.querySelector('[data-tabela-resumo]');
    if (!el) return;

    const sel = this.fundosSel
      .map(c => this.fundosInst.find(f => (f.serie_id || f.cnpj) === c))
      .filter(Boolean);

    if (sel.length === 0) {
      el.innerHTML = '';
      return;
    }

    const cnpjsSel = sel.map(f => f.serie_id || f.cnpj);
    const cotasFiltradas = {};
    for (const c of cnpjsSel) cotasFiltradas[c] = this.cotasInst.cotas[c];
    const recortado = recortarJanela(
      { datas: this.cotasInst.datas, cotas: cotasFiltradas },
      this.janela === 'ytd' ? this._ytdJanela() : this.janela,
    );

    const linhas = sel.map((f, i) => {
      const s = recortado.cotas[f.serie_id || f.cnpj];
      const ret = retornoAcum(s);
      const vol = volAnualizada(s);
      const dd = maxDrawdown(s);
      const pl = f.pl;
      return `
        <tr>
          <td class="resumo__nome">
            <span class="resumo__dot" style="background: ${CORES_FUNDOS[i % CORES_FUNDOS.length]}"></span>
            <div>
              <div class="resumo__nome-text">${this._escape(this._abreviar(f.nome, 48))}</div>
              <div class="resumo__nome-sub">${f.cnpj} · ${this._escape(f.classe || '')}</div>
            </div>
          </td>
          <td class="resumo__num ${classeSinal(ret)}">${pctSinal(ret)}</td>
          <td class="resumo__num">${vol != null ? vol.toFixed(1) + '%' : '—'}</td>
          <td class="resumo__num neg">${dd != null ? dd.toFixed(1) + '%' : '—'}</td>
          <td class="resumo__num">${this._plCompacto(pl)}</td>
        </tr>
      `;
    }).join('');

    el.innerHTML = `
      <table class="resumo">
        <thead>
          <tr>
            <th class="resumo__th-fundo">FUNDO</th>
            <th>RETORNO</th>
            <th>VOL. a.a.</th>
            <th>MAX DD</th>
            <th>PATRIMÔNIO</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    `;
  }

  _plCompacto(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
    if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`;
    if (v >= 1e3)  return `R$ ${(v / 1e3).toFixed(0)} mil`;
    return `R$ ${v.toFixed(0)}`;
  }

  _setLoading(on) {
    const el = document.querySelector('[data-loading]');
    if (el) el.hidden = !on;
  }

  _mostrarErro(msg) {
    const el = document.querySelector('[data-erro]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  _abreviar(s, max) {
    if (!s) return '';
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }

  _escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

new AppComparacao().boot();
