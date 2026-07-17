/**
 * seletor_fundos.js — Seletor de fundos (estilo da screenshot original).
 *
 * Layout vertical:
 *   [chips selecionados, com X]
 *   ─────────────────────────
 *   ADICIONAR FUNDO
 *   [tab Fundos 555 | Previdência]    ← se houver kind
 *   [busca input]
 *   [lista vertical com radios]
 *
 * Emite 'change' com array de objetos selecionados.
 */

const NORM = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

// Paleta pros dots dos chips, sincronizada com app_comparacao.
const DOTS = [
  '#0066cc', '#ff8800', '#9b59b6', '#1a8530',
  '#d83434', '#0a8aa8', '#b8860b', '#ec407a',
  '#5b6478', '#3949ab',
];

export class SeletorFundos {
  constructor(root, opts = {}) {
    this.root = root;
    this.fundos = opts.fundos || [];
    this.max = opts.max ?? 8;
    this.placeholder = opts.placeholder || 'Buscar fundo pelo nome ou CNPJ';
    this._selecionadosCnpjs = [];   // mantém ordem de adição (pra cores)
    this._listeners = [];
    this._termo = '';
    this._porCnpj = new Map(this.fundos.map(f => [f.serie_id || f.cnpj, f]));
    this._construir();
  }

  setFundos(fundos) {
    this.fundos = fundos;
    this._porCnpj = new Map(fundos.map(f => [f.serie_id || f.cnpj, f]));
    this._selecionadosCnpjs = this._selecionadosCnpjs.filter(c => this._porCnpj.has(c));
    this._renderTudo();
  }

  setSelecionados(cnpjs) {
    this._selecionadosCnpjs = (cnpjs || []).filter(c => this._porCnpj.has(c));
    this._renderTudo();
    this._emit();
  }

  getSelecionados() {
    return this._selecionadosCnpjs.map(c => this._porCnpj.get(c)).filter(Boolean);
  }

  on(event, cb) {
    if (event !== 'change') return () => {};
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(c => c !== cb); };
  }

  _construir() {
    this.root.classList.add('seletor');
    this.root.innerHTML = `
      <div class="seletor__chips" data-chips></div>

      <div data-divider class="seletor__divider" hidden></div>

      <div class="seletor__section-label">Adicionar fundo</div>

      <div class="seletor__search">
        <span class="seletor__search-icon" aria-hidden="true">⌕</span>
        <input type="search"
               placeholder="${this._escape(this.placeholder)}"
               aria-label="Buscar fundo"
               data-input>
      </div>

      <div class="seletor__list" data-list></div>
    `;
    this._chipsEl = this.root.querySelector('[data-chips]');
    this._dividerEl = this.root.querySelector('[data-divider]');
    this._inputEl = this.root.querySelector('[data-input]');
    this._listEl = this.root.querySelector('[data-list]');

    this._inputEl.addEventListener('input', () => {
      this._termo = NORM(this._inputEl.value).trim();
      this._renderList();
    });

    this._chipsEl.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (!x) return;
      this._remover(x.dataset.remove);
    });

    this._listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle]');
      if (!btn) return;
      const cnpj = btn.dataset.toggle;
      if (this._selecionadosCnpjs.includes(cnpj)) this._remover(cnpj);
      else this._adicionar(cnpj);
    });

    this._renderTudo();
  }

  _renderTudo() {
    this._renderChips();
    this._renderList();
  }

  _renderChips() {
    const sel = this.getSelecionados();
    if (sel.length === 0) {
      this._chipsEl.innerHTML = '';
      this._chipsEl.hidden = true;
      this._dividerEl.hidden = true;
    } else {
      this._chipsEl.hidden = false;
      this._dividerEl.hidden = false;
      this._chipsEl.innerHTML = sel.map((f, i) => `
        <div class="seletor__chip">
          <span class="seletor__chip-dot" style="background: ${DOTS[i % DOTS.length]}"></span>
          <span class="seletor__chip-label">${this._escape(this._abreviar(f.nome, 32))}</span>
          <button type="button" class="seletor__chip-x" data-remove="${f.serie_id || f.cnpj}" aria-label="Remover ${this._escape(f.nome)}">×</button>
        </div>
      `).join('');
    }
  }

  _renderList() {
    const termo = this._termo;
    let matches = this.fundos;
    if (termo) {
      matches = matches.filter(f =>
        NORM(f.nome).includes(termo) ||
        NORM(f.cnpj).includes(termo) ||
        NORM(f.classe || '').includes(termo)
      );
    }

    if (matches.length === 0) {
      this._listEl.innerHTML = `<div class="seletor__list-empty">Nenhum fundo encontrado.</div>`;
      return;
    }

    const podeAdicionar = this._selecionadosCnpjs.length < this.max;
    const slice = matches.slice(0, 80);   // limita DOM

    this._listEl.innerHTML = slice.map(f => {
      const selecionado = this._selecionadosCnpjs.includes(f.serie_id || f.cnpj);
      const disabled = !selecionado && !podeAdicionar;
      return `
        <button type="button"
                class="seletor__list-item ${selecionado ? 'seletor__list-item--selecionado' : ''}"
                data-toggle="${f.serie_id || f.cnpj}"
                ${disabled ? 'disabled' : ''}>
          <span class="seletor__radio" aria-hidden="true"></span>
          <div class="seletor__item-info">
            <div class="seletor__item-nome">${this._highlight(f.nome, termo)}</div>
            <div class="seletor__item-meta">${this._escape(f.classe || '—')}</div>
          </div>
        </button>
      `;
    }).join('');
  }

  _adicionar(cnpj) {
    if (this._selecionadosCnpjs.includes(cnpj)) return;
    if (this._selecionadosCnpjs.length >= this.max) return;
    if (!this._porCnpj.has(cnpj)) return;
    this._selecionadosCnpjs.push(cnpj);
    this._renderChips();
    this._renderList();
    this._emit();
  }

  _remover(cnpj) {
    const i = this._selecionadosCnpjs.indexOf(cnpj);
    if (i < 0) return;
    this._selecionadosCnpjs.splice(i, 1);
    this._renderChips();
    this._renderList();
    this._emit();
  }

  _emit() {
    const sel = this.getSelecionados();
    for (const cb of this._listeners) {
      try { cb(sel); } catch (e) { console.error('[seletor]', e); }
    }
  }

  _highlight(texto, termo) {
    if (!termo) return this._escape(texto);
    const norm = NORM(texto);
    const idx = norm.indexOf(termo);
    if (idx < 0) return this._escape(texto);
    return `${this._escape(texto.slice(0, idx))}<mark>${this._escape(texto.slice(idx, idx + termo.length))}</mark>${this._escape(texto.slice(idx + termo.length))}`;
  }

  _abreviar(s, max) {
    if (!s) return '';
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }

  _escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
