/* ============================================================
   landing.js — Comportamento da topbar (só na landing)
   ============================================================ */
(function () {
  'use strict';

  function setupHamburger() {
    var btn = document.querySelector('.tb-hamburger');
    var nav = document.querySelector('.tb-nav');
    if (!btn || !nav) return;

    btn.addEventListener('click', function () {
      nav.classList.toggle('open');
    });

    // Fecha ao clicar num link (UX mobile natural)
    nav.querySelectorAll('.tb-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 700) nav.classList.remove('open');
      });
    });

    // Fecha no Esc
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') nav.classList.remove('open');
    });
  }

  function markActive() {
    // Na landing, o item "Início" é o ativo
    var links = document.querySelectorAll('.tb-link[data-page]');
    links.forEach(function (link) {
      if (link.dataset.page === 'index.html') {
        link.classList.add('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setupHamburger();
      markActive();
    });
  } else {
    setupHamburger();
    markActive();
  }
})();
