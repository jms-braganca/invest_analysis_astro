/* ============================================================
   sobre.js — Tradução PT/EN da página Sobre
   ─────────────────────────────────────────────────────────────
   Cada elemento traduzível tem `data-pt` e `data-en`.
   Click no botão alterna o conteúdo de TODOS os elementos.
   Escolha persiste em localStorage entre visitas.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'sobreLang';
  var DEFAULT     = 'pt';

  function aplicar(lang) {
    if (lang !== 'pt' && lang !== 'en') lang = DEFAULT;

    // Atualiza atributo lang do <html> (acessibilidade + SEO)
    document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : 'en-US');

    // Troca conteúdo de todos os elementos traduzíveis
    var attr = 'data-' + lang;
    document.querySelectorAll('[data-pt][data-en]').forEach(function (el) {
      var v = el.getAttribute(attr);
      if (v !== null) el.innerHTML = v;
    });

    // Atualiza estado dos botões (visual)
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // Persiste escolha
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function init() {
    // Lê preferência salva, ou tenta detectar do browser
    var inicial = DEFAULT;
    try {
      var salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo === 'pt' || salvo === 'en') {
        inicial = salvo;
      } else {
        // Sem preferência salva: tenta detectar browser
        var browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (browserLang.indexOf('en') === 0 && browserLang.indexOf('pt') !== 0) {
          inicial = 'en';
        }
      }
    } catch (e) {}

    // Bind dos botões
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        aplicar(btn.dataset.lang);
      });
    });

    aplicar(inicial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
