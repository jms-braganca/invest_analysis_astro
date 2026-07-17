/* ============================================================
   polish.js — Onda 4: refinamentos de UX
   Auto-instala em qualquer página que carregar este arquivo.
   Idempotente: pode ser chamado múltiplas vezes sem efeitos
   colaterais (ex: se uma página recarregar conteúdo dinâmico).
   ============================================================ */
(function () {
  'use strict';

  // ── 1) SCROLL TO TOP ───────────────────────────────────────
  function instalarScrollToTop() {
    if (document.querySelector('.scroll-top')) return; // já instalado
    var btn = document.createElement('button');
    btn.className = 'scroll-top';
    btn.setAttribute('aria-label', 'Voltar ao topo');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="19" x2="12" y2="5"/>' +
      '<polyline points="5 12 12 5 19 12"/>' +
      '</svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          var y = window.scrollY || window.pageYOffset || 0;
          btn.classList.toggle('visible', y > 400);
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── 2) ATALHO "/" PARA FOCAR A BUSCA ───────────────────────
  function instalarAtalhoBusca() {
    // Encontra o primeiro input de busca presente na página
    var input = document.querySelector('.fundo-search');
    if (!input) return;

    // Adiciona o hint visual "/" ao lado do input (se ainda não tiver)
    if (!input.parentElement.querySelector('.kbd-hint')) {
      var hint = document.createElement('span');
      hint.className = 'kbd-hint';
      hint.textContent = '/';
      hint.title = 'Atalho: pressione / para focar';
      input.parentElement.appendChild(hint);
    }

    // Listener global do atalho
    if (window.__polishAtalhoInstalado) return;
    window.__polishAtalhoInstalado = true;

    document.addEventListener('keydown', function (e) {
      // Só aciona se NÃO estiver digitando em outro input
      var tag = (e.target.tagName || '').toUpperCase();
      var ehInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                    e.target.isContentEditable;
      if (e.key === '/' && !ehInput) {
        var alvo = document.querySelector('.fundo-search');
        if (alvo) {
          e.preventDefault();
          alvo.focus();
          alvo.select();
        }
      }
      // Esc dentro do search limpa e desfoca
      if (e.key === 'Escape' && tag === 'INPUT' &&
          e.target.classList.contains('fundo-search')) {
        if (e.target.value) {
          e.target.value = '';
          // Dispara evento input pra triggar a função filtrar()
          e.target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          e.target.blur();
        }
      }
    });
  }

  // ── 3) EMPTY STATE QUANDO BUSCA NÃO ENCONTRA NADA ─────────
  function instalarEmptyState() {
    // Funciona em qualquer página com .classe-bloco (fundos, prev)
    var blocos = document.querySelectorAll('.classe-bloco');
    if (!blocos.length) return;

    // Cria o elemento de empty-state (uma vez)
    var main = document.querySelector('main.main') || document.querySelector('main');
    if (!main) return;

    var card = main.querySelector('.panel-card') || main;
    var emptyEl = card.querySelector('.empty-state');
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.style.display = 'none';
      emptyEl.innerHTML =
        '<div class="empty-state-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="11" cy="11" r="8"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
        '<line x1="8" y1="11" x2="14" y2="11"/>' +
        '</svg></div>' +
        '<div class="empty-state-title">Nenhum fundo encontrado</div>' +
        '<div class="empty-state-msg">Tente termos mais curtos ou parte do CNPJ. ' +
        'Pressione <strong>Esc</strong> para limpar a busca.</div>';
      // Inserir antes do footer (se houver) ou no final
      var footer = card.querySelector('.footer');
      if (footer) {
        card.insertBefore(emptyEl, footer);
      } else {
        card.appendChild(emptyEl);
      }
    }

    // Observa o input de busca
    var input = document.querySelector('.fundo-search');
    if (!input) return;

    function checarVazio() {
      // Conta blocos visíveis (a função filtrar() já adiciona .hidden)
      var todosOcultos = true;
      blocos.forEach(function (b) {
        if (!b.classList.contains('hidden')) todosOcultos = false;
      });
      var temBusca = input.value.trim().length > 0;
      emptyEl.style.display = (todosOcultos && temBusca) ? 'block' : 'none';
    }

    // Escuta com pequeno delay pra dar tempo da função filtrar() rodar
    input.addEventListener('input', function () {
      setTimeout(checarVazio, 30);
    });
  }

  // ── 4) SIDEBAR — pequenas garantias defensivas ─────────────
  // O sidebar.js da Onda 1 já cuida do toggle, backdrop click e Esc.
  // Esta função existe só pra cenários onde sidebar.js não tenha carregado
  // ou alguma página customizada use uma sidebar diferente.
  function reforcarSidebar() {
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.querySelector('.sidebar-backdrop');
    if (!sidebar || !backdrop) return;

    // Se o backdrop não tiver listener de click (sinal de que sidebar.js
    // não rodou), instala um fallback mínimo.
    if (!backdrop.dataset.polishFallback) {
      backdrop.dataset.polishFallback = '1';
      // Em vez de testar via heurística, sempre garantimos que clicar
      // no backdrop fecha — ação idempotente.
      backdrop.addEventListener('click', function () {
        sidebar.classList.remove('open');
        backdrop.classList.remove('open');
      });
    }
  }

  // ── INIT ────────────────────────────────────────────────────
  function init() {
    instalarScrollToTop();
    instalarAtalhoBusca();
    instalarEmptyState();
    reforcarSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
