/**
 * app_placeholder.js — Páginas "em construção" (Calculadoras, Planejamento,
 * Portfolio, Sobre). Hero + texto explicativo + link de volta.
 *
 * Cada page-template-placeholder.html define data-pagina, data-kicker,
 * data-titulo, data-titulo-cinza, data-descricao.
 */

import { renderTopbar, renderFooter } from './topbar.js';

async function boot() {
  const pagina = document.body.dataset.pagina || 'sobre';
  await renderTopbar({ pagina, mostrarSubmenu: false });
  await renderFooter({ pagina: document.title.split(' · ')[0] || '' });
}

boot();
