/**
 * app_correlacao.js — Matriz de correlação (Apple-style).
 *
 * Layout: hero + switcher + grid [seletor à esquerda | heatmap à direita]
 * Janela 1m/3m/12m/24m/Tudo + info embaixo.
 */

import { pool } from './data_pool.js';
import { renderTopbar, renderFooter } from './topbar.js';
import { Switcher } from './switcher.js';
import { SeletorFundos } from './seletor_fundos.js';
import { Heatmap } from './heatmap.js';
import { recortarJanela, matrizCorrelacao } from './series.js';

const MAX_FUNDOS = 15;

class AppCorrelacao {
  constructor() {
    this.meta = null;
    this.instAtual = 'todos';
    this.janela = '12m';
    this.fundosSel = [];
    this.fundosInst = [];
    this.cotasInst = null;
    this.heatmap = null;
  }

  async boot() {
    await renderTopbar({ pagina: 'correlacao' });
    try {
      this.meta = await pool.meta();
    } catch (e) {
      this._mostrarErro('Não foi possível carregar meta.json.');
      return;
    }
    this._lerHash();
    this._renderSwitcher();
    this._renderTabs();
    this.heatmap = new Heatmap(document.querySelector('[data-heatmap]'));
    await this._carregarInst(this.instAtual);
    await renderFooter({ pagina: 'Correlação' });
  }

  _lerHash() {
    const p = new URLSearchParams(window.location.hash.slice(1));
    if (p.get('inst'))   this.instAtual = p.get('inst');
    if (p.get('janela')) this.janela = p.get('janela');
    if (p.get('fundos')) this.fundosSel = p.get('fundos').split(',').filter(Boolean);
  }

  _escreverHash() {
    const p = new URLSearchParams();
    p.set('inst', this.instAtual);
    p.set('janela', this.janela);
    if (this.fundosSel.length) p.set('fundos', this.fundosSel.join(','));
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
    const opts = [['1m', '1m'], ['3m', '3m'], ['12m', '12m'], ['24m', '24m'], ['max', 'Tudo']];
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
      if (!recarregou) this._renderHeatmap();
    });
  }

  _janelaArquivo() {
    const j = this.janela;
    if (j === '1m' || j === '3m') return '3m';
    if (j === '6m' || j === '12m') return '12m';
    return 'max';
  }

  async _talvezReloadCotas() {
    const necessaria = this._janelaArquivo();
    const ordem = ['3m', '12m', 'max'];
    if (ordem.indexOf(necessaria) > ordem.indexOf(this._janelaArquivoCarregada || 'max')) {
      await this._carregarInst(this.instAtual);
      return true;
    }
    return false;
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
      this._janelaArquivoCarregada = janelaArq;
      this.fundosInst = fundos
        .filter(f => cotas.cotas[f.serie_id || f.cnpj])
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      this.cotasInst = cotas;
      this._renderSeletor();
      this._renderHeatmap();
    } catch (e) {
      console.error('[correlacao]', e);
      this._mostrarErro(`Falha ao carregar ${instId.toUpperCase()}.`);
    } finally {
      this._setLoading(false);
    }
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
        this._renderHeatmap();
      });
    } else {
      this._seletor.setFundos(this.fundosInst);
    }
    this._seletor.setSelecionados(this.fundosSel);
    document.querySelector('[data-contador]').textContent =
      `${this.fundosSel.length} / ${MAX_FUNDOS}`;
  }

  _renderHeatmap() {
    const elWrap = document.querySelector('[data-heatmap-wrap]');
    const elVazio = document.querySelector('[data-vazio]');
    const elInfo = document.querySelector('[data-info]');
    const elBadge = document.querySelector('[data-fundos-count]');

    const sel = this.fundosSel
      .map(c => this.fundosInst.find(f => (f.serie_id || f.cnpj) === c))
      .filter(Boolean);

    if (sel.length < 2) {
      elWrap.hidden = true;
      elVazio.hidden = false;
      elInfo.textContent = '';
      elBadge.textContent = `${sel.length} de 15`;
      document.querySelector('[data-contador]').textContent = `${sel.length} / ${MAX_FUNDOS}`;
      return;
    }
    elWrap.hidden = false;
    elVazio.hidden = true;
    document.querySelector('[data-contador]').textContent = `${sel.length} / ${MAX_FUNDOS}`;

    const cnpjs = sel.map(f => f.serie_id || f.cnpj);
    const cotasFiltradas = {};
    for (const c of cnpjs) cotasFiltradas[c] = this.cotasInst.cotas[c];
    const recortado = recortarJanela(
      { datas: this.cotasInst.datas, cotas: cotasFiltradas },
      this.janela,
    );

    const seriesMap = new Map(cnpjs.map(c => [c, recortado.cotas[c]]));
    const { cnpjs: csOrd, matriz } = matrizCorrelacao(seriesMap);

    const rotulos = csOrd.map(c => {
      const f = sel.find(x => (x.serie_id || x.cnpj) === c);
      return this._abreviar(f?.nome || c, 22);
    });
    const rotulosCompletos = csOrd.map(c => sel.find(x => (x.serie_id || x.cnpj) === c)?.nome || c);
    this.heatmap.render({ rotulos, matriz, rotulosCompletos });

    elBadge.textContent = `${sel.length} fundos selecionados`;
    const primeira = recortado.datas[0];
    const ultima = recortado.datas.at(-1);
    elInfo.textContent = `janela ${this.janela === 'max' ? 'Tudo' : this.janela} · ${recortado.datas.length} dias úteis (${this._dataBR(primeira)} → ${this._dataBR(ultima)})`;
  }

  _dataBR(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
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
}

new AppCorrelacao().boot();
