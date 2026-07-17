/**
 * sidebar_categorias.js — Sidebar lateral com 16 atalhos de classe.
 *
 * Cada item filtra a tabela pra mostrar só fundos daquela classe.
 * Click novamente OU em "Todas" remove o filtro.
 *
 * Uso:
 *   const sb = new SidebarCategorias(rootEl);
 *   sb.on('change', (categoriaId | null) => { ... });
 *   sb.setClassesPresentes(['Renda Fixa Simples', 'Crédito Privado', ...]);
 *   sb.setAtiva('rf-simples');
 */

const CATEGORIAS = [
  { id: 'rf-simples',         label: 'RF Simples',         icon: '◔' },
  { id: 'credito-privado',    label: 'Crédito Privado',    icon: '◍' },
  { id: 'debentures-infra',   label: 'Debêntures Infra',   icon: '◰' },
  { id: 'rf-ativa',           label: 'RF Ativa',           icon: '⊞' },
  { id: 'multimercado',       label: 'Multimercado',       icon: '⚡' },
  { id: 'renda-variavel',     label: 'Renda Variável',     icon: '↗' },
  { id: 'rv-indexados',       label: 'RV Indexados',       icon: '▤' },
  { id: 'commodities',        label: 'Commodities',        icon: '◆' },
  { id: 'cripto',             label: 'Cripto',             icon: 'Ⓑ' },
  { id: 'internacional-brl',  label: 'Internacional BRL',  icon: '◐' },
  { id: 'internacional-usd',  label: 'Internacional USD',  icon: '◑' },
  { id: 'esg',                label: 'ESG',                icon: '◌' },
  { id: 'fmp',                label: 'FMP',                icon: '◇' },
  { id: 'alocacao',           label: 'Alocação',           icon: '▦' },
  { id: 'fip-estruturado',    label: 'FIP / Estruturado',  icon: '◈' },
  { id: 'itubers',            label: 'Itubers',            icon: '♛' },
  { id: 'fidc',               label: 'FIDC',               icon: '◉' },
];

/** Mesma lógica que tabela.js — fica aqui pra a sidebar mapear classes→ids. */
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

export class SidebarCategorias {
  constructor(root) {
    this.root = root;
    this._ativa = null;
    this._listeners = [];
    this._categoriaParaClasse = new Map();   // 'rf-simples' → 'Renda Fixa Simples'
    this._presentes = new Set();             // ids de categorias com pelo menos 1 fundo
    this._construir();
  }

  _construir() {
    this.root.classList.add('sidebar-cats');
    this.root.innerHTML = `
      <ul class="sidebar-cats__list">
        ${CATEGORIAS.map(c => `
          <li>
            <button type="button"
                    class="sidebar-cats__item"
                    data-cat="${c.id}"
                    disabled
                    aria-pressed="false">
              <span class="sidebar-cats__icon" aria-hidden="true">${c.icon}</span>
              <span class="sidebar-cats__label">${c.label}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `;

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn || btn.disabled) return;
      const cat = btn.dataset.cat;
      if (this._ativa === cat) this.setAtiva(null);     // toggle off
      else this.setAtiva(cat);
    });
  }

  setClassesPresentes(classes) {
    this._categoriaParaClasse.clear();
    this._presentes = new Set();
    for (const cls of classes) {
      const id = classeToCategoria(cls);
      this._presentes.add(id);
      // Mantém apenas o primeiro nome de classe que mapeou pra essa categoria
      // (se houver duplicatas, mostraremos o primeiro).
      if (!this._categoriaParaClasse.has(id)) this._categoriaParaClasse.set(id, cls);
    }
    this._refreshDisabled();
  }

  _refreshDisabled() {
    this.root.querySelectorAll('[data-cat]').forEach(btn => {
      const presente = this._presentes.has(btn.dataset.cat);
      btn.disabled = !presente;
    });
  }

  setAtiva(catId) {
    this._ativa = catId;
    this.root.querySelectorAll('[data-cat]').forEach(btn => {
      const active = btn.dataset.cat === catId;
      btn.classList.toggle('sidebar-cats__item--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const classe = catId ? this._categoriaParaClasse.get(catId) : null;
    for (const cb of this._listeners) {
      try { cb(catId, classe); } catch {}
    }
  }

  on(event, cb) {
    if (event !== 'change') return () => {};
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(c => c !== cb); };
  }
}

export { CATEGORIAS };
