/**
 * switcher.js — Switcher de instituições (Apple style: pílulas grandes com logo).
 *
 * Layout: pílulas brancas com logo grande no centro. Ativo ganha border colorida
 * (laranja pra Todos, sutil escuro pras outras).
 *
 * Uso:
 *   const sw = new Switcher(container, { defaultId: 'todos', kind: 'fundos' });
 *   sw.on('change', (instId) => { ... });
 *   sw.render(meta.instituicoes);
 */

export class Switcher {
  constructor(container, opts = {}) {
    this.container = container;
    this.defaultId = opts.defaultId || 'todos';
    this.incluirTodos = opts.incluirTodos !== false;
    this.kind = opts.kind || 'fundos';
    this._listeners = [];
    this._current = this.defaultId;
    this._instituicoes = [];
  }

  render(instituicoes) {
    this._instituicoes = instituicoes;
    const filtradas = instituicoes.filter(i => {
      if (i.oculto) return false;   // não renderiza instituições ocultas
      if (this.kind === 'previdencia') return i.tem_previdencia;
      if (this.kind === 'cotas') return i.tem_cotas;
      return i.tem_fundos;
    });

    const html = [];
    if (this.incluirTodos && filtradas.length > 1) {
      html.push(this._botaoHTML('todos', 'Todos', null));
    }
    for (const inst of filtradas) {
      html.push(this._botaoHTML(inst.id, inst.nome, inst.logo, inst.id));
    }

    this.container.classList.add('switcher');
    this.container.setAttribute('role', 'tablist');
    this.container.innerHTML = html.join('');

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-inst]');
      if (!btn) return;
      this.setCurrent(btn.dataset.inst);
    });

    // Se o defaultId não está disponível pro kind, fallback pro primeiro.
    const idsDisponiveis = ['todos', ...filtradas.map(i => i.id)];
    if (!idsDisponiveis.includes(this._current)) {
      this._current = filtradas[0]?.id || 'todos';
    }
    this._refreshActive();
  }

  _botaoHTML(id, label, logo, instKey = null) {
    const isTodos = id === 'todos';
    const logoHTML = logo
      ? `<img src="${logo}" alt="" class="switcher__logo" loading="lazy" />`
      : `<span class="switcher__logo switcher__logo--todos">Todos</span>`;
    return `
      <button type="button"
              class="switcher__btn ${isTodos ? 'switcher__btn--todos' : ''}"
              role="tab"
              data-inst="${id}"
              data-key="${instKey || id}"
              aria-selected="false">
        ${logoHTML}
        <span class="switcher__label sr-only">${label}</span>
      </button>
    `;
  }

  setCurrent(instId, silent = false) {
    if (instId === this._current) return;
    this._current = instId;
    this._refreshActive();
    if (!silent) this._emit(instId);
  }

  getCurrent() { return this._current; }

  _refreshActive() {
    this.container.querySelectorAll('[data-inst]').forEach(b => {
      const active = b.dataset.inst === this._current;
      b.classList.toggle('switcher__btn--active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  on(event, callback) {
    if (event !== 'change') return () => {};
    this._listeners.push(callback);
    return () => { this._listeners = this._listeners.filter(c => c !== callback); };
  }

  _emit(instId) {
    for (const cb of this._listeners) {
      try { cb(instId); } catch (e) { console.error('[switcher]', e); }
    }
  }
}
