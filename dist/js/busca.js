/**
 * busca.js — Filtro de texto em tempo real (debounced).
 *
 * Uso:
 *   const busca = new Busca(inputEl, { campos: ['nome', 'classe', 'cnpj'] });
 *   busca.on('change', (termo, predicate) => { ... });
 *   const filtrados = fundos.filter(busca.predicate);
 */

export class Busca {
  constructor(inputEl, opts = {}) {
    this.input = inputEl;
    this.campos = opts.campos || ['nome', 'classe', 'cnpj'];
    this.debounceMs = opts.debounceMs ?? 120;
    this._termo = '';
    this._listeners = [];
    this._timer = null;

    this.input.addEventListener('input', () => {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this._termo = this._normalizar(this.input.value);
        this._emit();
      }, this.debounceMs);
    });
  }

  predicate = (item) => {
    if (!this._termo) return true;
    for (const campo of this.campos) {
      const v = item[campo];
      if (v && this._normalizar(String(v)).includes(this._termo)) return true;
    }
    return false;
  };

  getTermo() { return this._termo; }

  on(event, callback) {
    if (event !== 'change') return () => {};
    this._listeners.push(callback);
    return () => { this._listeners = this._listeners.filter(c => c !== callback); };
  }

  _normalizar(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');  // tira acentos
  }

  _emit() {
    for (const cb of this._listeners) {
      try { cb(this._termo, this.predicate); } catch (e) { console.error('[busca]', e); }
    }
  }
}
