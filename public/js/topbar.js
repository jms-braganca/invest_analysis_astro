/**
 * topbar.js — Render do topbar com nav + submenu + widget IBOV.
 *
 * Renderiza tudo num <header> que tá no início do <body>.
 * Os dados de IBOV vêm do meta.json (ibov_acumulado).
 *
 * Uso:
 *   import { renderTopbar } from './topbar.js';
 *   renderTopbar({ pagina: 'fundos' });   // marca o link ativo
 *   // (puxa o meta.json sozinho via pool.meta() pra preencher IBOV)
 */

import { pool } from './data_pool.js';
import { pctSinal, classeSinal } from './format.js';

const NAV_PRINCIPAL = [
  { id: 'inicio',         label: 'Início',                 href: '/' },
  { id: 'investimentos',  label: 'Investimentos',          href: '/pages/fundos.html' },
  { id: 'calculadoras',   label: 'Calculadoras',           href: '/pages/calculadoras.html' },
  { id: 'planejamento',   label: 'Planejamento Financeiro', href: '/pages/planejamento.html' },
  { id: 'portfolio',      label: 'Portfolio',              href: '/pages/portfolio.html' },
];

const SUBMENU = [
  { id: 'fundos',      label: 'Fundos',      href: 'fundos.html' },
  { id: 'previdencia', label: 'Previdência', href: 'previdencia.html' },
  { id: 'comparacao',  label: 'Comparador',  href: 'comparacao.html' },
  { id: 'correlacao',  label: 'Correlação',  href: 'correlacao.html' },
];

// Quais páginas do submenu são da área "investimentos".
const PAGINAS_INVESTIMENTOS = new Set(SUBMENU.map(s => s.id));

export async function renderTopbar({ pagina = 'inicio', mostrarSubmenu = true } = {}) {
  let host = document.querySelector('[data-topbar]');
  if (!host) {
    host = document.createElement('header');
    host.setAttribute('data-topbar', '');
    document.body.insertBefore(host, document.body.firstChild);
  }

  const isInvestimentos = PAGINAS_INVESTIMENTOS.has(pagina);
  // Marca "Investimentos" como ativo se a página atual é uma das do submenu.
  const navAtivo = isInvestimentos ? 'investimentos' : pagina;

  const baseRelativa = window.location.pathname.includes('/pages/') ? '../' : '';

  const navHTML = NAV_PRINCIPAL.map(item => {
    const href = item.href.startsWith('/') ? baseRelativa + item.href.slice(1) : item.href;
    return `<a href="${href}" class="${navAtivo === item.id ? 'active' : ''}">${item.label}</a>`;
  }).join('');

  const submenuHTML = isInvestimentos && mostrarSubmenu ? `
    <nav class="submenu" aria-label="Investimentos">
      <div class="submenu__row">
        <div class="submenu__nav">
          ${SUBMENU.map(s => `
            <a href="${s.href}" class="${pagina === s.id ? 'active' : ''}">${s.label}</a>
          `).join('')}
        </div>
        <div data-ibov></div>
      </div>
    </nav>
  ` : '';

  host.innerHTML = `
    <nav class="topbar" aria-label="Navegação principal">
      <div class="topbar__row">
        <a href="${baseRelativa || ''}index.html" class="topbar__brand">J. Braganca</a>
        <div class="topbar__nav">${navHTML}</div>
        <div class="topbar__right">
          <a href="${baseRelativa}pages/sobre.html" class="btn btn--dark">Sobre ›</a>
        </div>
      </div>
    </nav>
    ${submenuHTML}
  `;

  if (isInvestimentos && mostrarSubmenu) {
    await _renderIbov(host.querySelector('[data-ibov]'));
  }
}

async function _renderIbov(el) {
  if (!el) return;
  let meta;
  try {
    meta = await pool.meta();
  } catch {
    return;
  }
  const ibov = meta.ibov_acumulado;
  if (!ibov) {
    el.innerHTML = '';
    return;
  }
  // Pegamos 3 períodos canônicos pro widget: Mês, Ano, 12M.
  const cells = [
    ['Mês',  ibov['Mês']],
    ['Ano',  ibov['Ano']],
    ['12M',  ibov['12M']],
  ].filter(([, v]) => v != null);

  el.innerHTML = `
    <div class="ibov" role="group" aria-label="Performance Ibovespa">
      <span class="ibov__label">IBOV</span>
      ${cells.map(([lbl, v]) => `
        <span class="ibov__cell">
          <span class="ibov__cell-label">${lbl}</span>
          <span class="ibov__cell-val ${classeSinal(v)}">${pctSinal(v)}</span>
        </span>
      `).join('')}
    </div>
  `;
}

/**
 * Renderiza um footer simples com © + atualizado em + nome da página.
 */
export async function renderFooter({ pagina = '' } = {}) {
  let host = document.querySelector('[data-footer]');
  if (!host) {
    host = document.createElement('footer');
    host.setAttribute('data-footer', '');
    host.className = 'footer';
    document.body.appendChild(host);
  } else {
    host.className = 'footer';
  }

  let ultimaCota = '';
  try {
    const meta = await pool.meta();
    if (meta.ultima_data_cota) {
      const [a, m, d] = meta.ultima_data_cota.split('-');
      ultimaCota = `${d}/${m}/${a}`;
    }
  } catch {}

  const ano = new Date().getFullYear();
  const partes = [`© ${ano} J. Braganca`];
  if (pagina) partes.push(pagina);
  if (ultimaCota) partes.push(`Atualizado em ${ultimaCota}`);

  host.innerHTML = `
    <div class="footer__inner">
      ${partes.map(p => `<span>${p}</span>`).join('<span class="footer__sep">·</span>')}
    </div>
  `;
}
