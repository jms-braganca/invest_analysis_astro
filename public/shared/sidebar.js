/* ============================================================
   sidebar.js — Toggle hamburger + estado ativo automático
   ============================================================ */
(function() {
  'use strict';

  // ── Hamburger toggle ─────────────────────────────────────
  function setupHamburger() {
    var btn = document.querySelector('.hamburger');
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.querySelector('.sidebar-backdrop');
    if (!btn || !sidebar || !backdrop) return;

    function open()  { sidebar.classList.add('open'); backdrop.classList.add('open'); }
    function close() { sidebar.classList.remove('open'); backdrop.classList.remove('open'); }

    btn.addEventListener('click', function() {
      sidebar.classList.contains('open') ? close() : open();
    });
    backdrop.addEventListener('click', close);

    sidebar.querySelectorAll('.sb-link').forEach(function(link) {
      link.addEventListener('click', function() {
        if (window.innerWidth <= 900) close();
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close();
    });
  }

  // ── Auto-marcar item ativo baseado na URL ─────────────────
  function markActive() {
    // pathname ex.: '/fundos.html', '/calculadoras/', '/calculadoras/index.html',
    //               '/calculadoras/troca-ativos.html', '/calculadoras/simular-pgbl.html'
    var pathname = window.location.pathname;
    var parts = pathname.split('/').filter(Boolean); // remove vazios
    var lastPart = parts[parts.length - 1] || 'index.html';

    // Está dentro da subpasta /calculadoras/?
    var dentroCalc = parts.indexOf('calculadoras') !== -1;

    var links = document.querySelectorAll('.sb-link[data-page]');

    // Primeira passada: existe link com data-page === arquivo atual?
    // (ex: simular-pgbl.html tem o seu próprio link na sidebar.)
    var temMatchExato = false;
    links.forEach(function(link) {
      if (link.dataset.page === lastPart) temMatchExato = true;
    });

    // Segunda passada: aplica a class "active" obedecendo a precedência:
    //   1) match exato (data-page === arquivo)
    //   2) home (index.html quando estamos na raiz)
    //   3) fallback "Calculadoras" — só quando dentro de /calculadoras/
    //      e nenhum link específico bate (ex: troca-ativos.html, limite-fgc.html etc.)
    links.forEach(function(link) {
      var page = link.dataset.page;
      var isActive = false;

      if (page === lastPart) {
        isActive = true;
      } else if (page === 'index.html' && (lastPart === '' || lastPart === '/' || pathname === '/')) {
        isActive = true;
      } else if (dentroCalc && page === 'calculadoras' && !temMatchExato) {
        isActive = true;
      }

      if (isActive) link.classList.add('active');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupHamburger();
      markActive();
    });
  } else {
    setupHamburger();
    markActive();
  }
})();
