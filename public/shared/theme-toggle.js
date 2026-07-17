/**
 * theme-toggle.js — Gerencia preferência de tema (light/dark) do site.
 *
 * Comportamento:
 *  • Default = 'dark' (escolha do produto). Pra evitar flash de light→dark
 *    na primeira carga, cada HTML tem um <script> inline logo após
 *    <body> que aplica a classe SYNC. Este script aqui (carregado no fim
 *    do body) só cuida do BOTÃO e do toggle interativo.
 *  • Preferência persiste em localStorage['site-theme'] = 'light' | 'dark'.
 *  • Aplica `body.theme-dark` quando dark.
 *  • Injeta um botão sol/lua na topbar (.atb-main, antes do .atb-cta).
 *  • Página IPB (body.theme-dark-ipb) ignora o toggle — fica sempre dark.
 *    Mas mostra o ícone (decorativo, com tooltip).
 *
 * O CSS do botão e dos overrides vive em shared/theme-dark.css.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'site-theme';
  const VALID = new Set(['light', 'dark']);

  function readPref() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (VALID.has(v)) return v;
    } catch (_) {}
    return 'dark';    // default explícito (não detecta prefers-color-scheme)
  }

  function savePref(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {}
  }

  // IPB tem theme-dark-ipb hardcoded e ignora preferência do user.
  function isIpb() {
    return document.body.classList.contains('theme-dark-ipb');
  }

  function applyTheme(theme) {
    if (isIpb()) {
      // IPB sempre dark, sem opção. Garante a classe e sai.
      document.body.classList.add('theme-dark');
      return;
    }
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }

  // ── Botão sol/lua ─────────────────────────────────────────
  const ICON_SUN = `
    <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>`;
  const ICON_MOON = `
    <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;

  function createButton() {
    const btn = document.createElement('button');
    btn.className = 'atb-theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Alternar tema claro/escuro');
    btn.setAttribute('title', isIpb()
      ? 'Esta página é exibida sempre em tema escuro.'
      : 'Alternar entre tema claro e escuro');
    btn.innerHTML = ICON_SUN + ICON_MOON;
    btn.addEventListener('click', () => {
      if (isIpb()) return;
      const atual = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const novo = atual === 'dark' ? 'light' : 'dark';
      applyTheme(novo);
      savePref(novo);
    });
    return btn;
  }

  function injectButton() {
    const main = document.querySelector('.atb-main');
    if (!main) return;   // página sem topbar — pula
    // Evita duplicar (em caso de re-execução).
    if (main.querySelector('.atb-theme-toggle')) return;
    const btn = createButton();
    // Tenta: 1º filho da .atb-nav (= colado no extremo esquerdo).
    // Fallback: 1º filho da .atb-main (caso a nav não exista).
    const nav = main.querySelector('.atb-nav');
    if (nav) {
      nav.insertBefore(btn, nav.firstChild);
    } else {
      main.insertBefore(btn, main.firstChild);
    }
  }

  // ── Aplicação ────────────────────────────────────────────
  function init() {
    applyTheme(readPref());
    injectButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
