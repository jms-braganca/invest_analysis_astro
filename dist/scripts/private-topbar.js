/* ============================================================
   private-topbar.js — Comportamento da top bar Private theme

   Regras:
   - Ao rolar mais de SHRINK_AT (em px), adiciona .is-scrolled na .private-topbar
     → faixa principal encolhe e ganha glass mais opaco.
   - Ao passar do hero (ou de SUB_AT px), adiciona .show-sub
     → sub-barra com seções + KPIs aparece (slide-down de altura).
   - Mobile: toggle do menu hamburger.
   - Active link automático com base em data-page = nome do arquivo
     OU em scroll-spy nas .atb-sub-section[href^="#"].
   ============================================================ */
(function () {
  'use strict';

  var SHRINK_AT = 12;   // px — assim que rola um pouquinho a barra encolhe
  var bar, mainBar, hero, sub;

  function init() {
    bar = document.querySelector('.private-topbar');
    if (!bar) return;
    mainBar = bar.querySelector('.atb-main');
    sub     = bar.querySelector('.atb-sub');
    hero    = document.querySelector('[data-private-hero]') ||
              document.querySelector('.private-hero');

    injectRestritoMenu();   // tem que rodar ANTES de setupMegaMenu
    setupScroll();
    setupHamburger();
    setupMegaMenu();
    markActiveLink();
    setupSectionScrollspy();
    setupCurrentMonthLabels();
    setupKpiRotator();
  }

  /* ---------- mega menu "Restrito" injetado em todas as páginas ----
     Páginas protegidas por senha (gate via shared/crypto_ipb.js).
     Inserir aqui em vez de em cada HTML evita ter que atualizar
     17+ arquivos manualmente. */
  function injectRestritoMenu() {
    var nav = bar.querySelector('.atb-nav');
    var stage = bar.querySelector('.atb-mega-stage');
    if (!nav || !stage) return;
    // Já existe? (pra páginas que já incluem hardcoded — não duplicar)
    if (bar.querySelector('.atb-link-mega[data-mega="restrito"]')) return;

    // Determina prefixo relativo (calculadoras/X.html precisa de "../")
    var isInCalcDir = /\/calculadoras\//.test(location.pathname);
    var R = isInCalcDir ? '../' : '';

    // 1. Cria o nav-item com botão + mobile sub
    var item = document.createElement('div');
    item.className = 'atb-nav-item';
    item.innerHTML =
      '<button type="button" class="atb-link-mega" data-mega="restrito"' +
      '        data-pages="fundosipb.html calculadoras/apple-care.html apple-care.html"' +
      '        aria-haspopup="true" aria-expanded="false">Restrito</button>' +
      '<div class="atb-mobile-sub">' +
      '  <a href="' + R + 'fundosipb.html"                class="atb-mobile-sub-link">Private Bank</a>' +
      '  <a href="' + R + 'calculadoras/apple-care.html"  class="atb-mobile-sub-link">AC</a>' +
      '</div>';

    // Insere antes do link "Portfolio" se existir, senão no fim
    var portfolioLink = nav.querySelector('a[data-page="portfolio.html"]');
    if (portfolioLink) {
      nav.insertBefore(item, portfolioLink);
    } else {
      // Se não tem Portfolio, insere antes do link mobile "Sobre" ou no fim
      var mobileSobre = nav.querySelector('.atb-link-mobile-only');
      if (mobileSobre) nav.insertBefore(item, mobileSobre);
      else nav.appendChild(item);
    }

    // 2. Cria o painel mega correspondente
    var mega = document.createElement('div');
    mega.className = 'atb-mega';
    mega.setAttribute('data-mega-for', 'restrito');
    mega.innerHTML =
      '<div class="atb-mega-inner single-col"><div class="atb-mega-col">' +
      '  <p class="atb-mega-eyebrow">Restrito</p>' +
      '  <a href="' + R + 'fundosipb.html"               class="atb-mega-link">Private Bank</a>' +
      '  <a href="' + R + 'calculadoras/apple-care.html" class="atb-mega-link">AC</a>' +
      '</div></div>';
    stage.appendChild(mega);
  }

  function isDesktop() { return window.innerWidth > 833; }

  /* ---------- scroll: shrink + show-sub ------------------- */
  function setupScroll() {
    var ticking = false;
    var heroBottom = computeHeroBottom();

    function onScroll() {
      var y = window.scrollY || window.pageYOffset || 0;

      // 1) shrink na faixa principal
      if (y > SHRINK_AT) bar.classList.add('is-scrolled');
      else                bar.classList.remove('is-scrolled');

      // 2) sub-barra aparece quando passa do hero
      //    Em páginas sem hero (dashboards), mostramos sempre
      //    se a sub-barra existir.
      if (sub) {
        if (!hero) {
          bar.classList.add('show-sub');
        } else if (y > heroBottom - 40) {
          bar.classList.add('show-sub');
        } else {
          bar.classList.remove('show-sub');
        }
      }

      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(onScroll);
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', function () {
      heroBottom = computeHeroBottom();
      onScroll();
    });

    // chamada inicial
    onScroll();
  }

  function computeHeroBottom() {
    if (!hero) return 0;
    var rect = hero.getBoundingClientRect();
    return rect.top + window.scrollY + rect.height;
  }

  /* ---------- hamburger mobile --------------------------- */
  function setupHamburger() {
    var btn = bar.querySelector('.atb-hamburger');
    var nav = bar.querySelector('.atb-nav');
    if (!btn || !nav) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      nav.classList.toggle('is-open');
    });

    // links DIRETOS (não os mega) fecham o drawer ao clicar
    nav.querySelectorAll('.atb-nav > .atb-link, .atb-mobile-sub-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (!isDesktop()) nav.classList.remove('is-open');
      });
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target) && !btn.contains(e.target)) {
        nav.classList.remove('is-open');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') nav.classList.remove('is-open');
    });
  }

  /* ---------- mega menu (desktop hover + mobile accordion) ---- */
  function setupMegaMenu() {
    var triggers = bar.querySelectorAll('.atb-link-mega');
    if (!triggers.length) return;

    var stage = bar.querySelector('.atb-mega-stage');
    var panels = stage ? stage.querySelectorAll('.atb-mega') : [];
    var openPanel = null;
    var openTrigger = null;
    var closeTimer = null;

    function panelFor(name) {
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].getAttribute('data-mega-for') === name) return panels[i];
      }
      return null;
    }

    function openMega(name) {
      if (!isDesktop()) return;
      clearTimeout(closeTimer);
      var p = panelFor(name);
      if (!p) return;
      // fechar outro se houver
      if (openPanel && openPanel !== p) {
        openPanel.style.height = '0px';
        openPanel.classList.remove('is-open');
      }

      // Alinhar mega ao trigger (apple.com style): mede a posição do botão
      // e seta --atb-mega-x na stage pro CSS deslocar o .atb-mega-inner.
      var trig = bar.querySelector('.atb-link-mega[data-mega="' + name + '"]');
      if (trig && stage) {
        var trigRect = trig.getBoundingClientRect();
        var stageRect = stage.getBoundingClientRect();
        var offsetX = trigRect.left - stageRect.left;
        stage.style.setProperty('--atb-mega-x', offsetX + 'px');
      }

      var inner = p.querySelector('.atb-mega-inner');
      // medir altura real
      p.style.height = 'auto';
      var h = inner.getBoundingClientRect().height;
      p.style.height = '0px';
      // forçar reflow para a transição funcionar
      // eslint-disable-next-line no-unused-expressions
      p.offsetHeight;
      p.style.height = h + 'px';
      p.classList.add('is-open');

      // marcar trigger ativo
      triggers.forEach(function (t) { t.classList.remove('is-open'); });
      if (trig) {
        trig.classList.add('is-open');
        trig.setAttribute('aria-expanded', 'true');
        openTrigger = trig;
      }
      openPanel = p;
    }

    function closeMega(immediate) {
      var doClose = function () {
        if (openPanel) {
          openPanel.style.height = '0px';
          openPanel.classList.remove('is-open');
        }
        triggers.forEach(function (t) {
          t.classList.remove('is-open');
          t.setAttribute('aria-expanded', 'false');
        });
        openPanel = null; openTrigger = null;
      };
      if (immediate) doClose();
      else closeTimer = setTimeout(doClose, 110);
    }

    function cancelClose() { clearTimeout(closeTimer); }

    triggers.forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        if (isDesktop()) openMega(btn.dataset.mega);
      });
      btn.addEventListener('mouseleave', function (e) {
        if (!isDesktop()) return;
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.atb-mega')) return;
        closeMega(false);
      });
      btn.addEventListener('focus', function () {
        if (isDesktop()) openMega(btn.dataset.mega);
      });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (isDesktop()) {
          // alterna no clique também
          if (openTrigger === btn) closeMega(true);
          else openMega(btn.dataset.mega);
        } else {
          // mobile = accordion
          var sub = btn.parentElement.querySelector('.atb-mobile-sub');
          var expanded = btn.classList.toggle('is-expanded');
          if (sub) sub.classList.toggle('is-expanded', expanded);
          // fecha os outros pra não acumular
          triggers.forEach(function (t) {
            if (t !== btn) {
              t.classList.remove('is-expanded');
              var s = t.parentElement.querySelector('.atb-mobile-sub');
              if (s) s.classList.remove('is-expanded');
            }
          });
        }
      });
    });

    // hover dentro do painel mantém aberto
    panels.forEach(function (p) {
      p.addEventListener('mouseenter', cancelClose);
      p.addEventListener('mouseleave', function () { closeMega(false); });
      // clicou em link dentro do painel → fecha imediato
      p.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { closeMega(true); });
      });
    });

    // click fora fecha
    document.addEventListener('click', function (e) {
      if (!stage) return;
      if (stage.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.atb-link-mega')) return;
      closeMega(true);
    });

    // escape fecha
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMega(true);
    });

    // ao redimensionar, garantir consistência
    window.addEventListener('resize', function () {
      if (!isDesktop()) {
        // sair do estado desktop: fechar mega aberto
        closeMega(true);
      } else {
        // saiu do mobile: limpar accordions
        triggers.forEach(function (t) {
          t.classList.remove('is-expanded');
          var s = t.parentElement.querySelector('.atb-mobile-sub');
          if (s) s.classList.remove('is-expanded');
        });
      }
    });
  }

  /* ---------- active link p/ páginas multi-html ---------- */
  function markActiveLink() {
    var path = window.location.pathname.split('/').pop() || 'index.html';

    // links simples (data-page = arquivo único)
    bar.querySelectorAll('.atb-link[data-page]').forEach(function (l) {
      var p = l.getAttribute('data-page');
      if (!p) return;
      if (path === p ||
          (p === 'index.html' && (path === '' || path === '/'))) {
        l.classList.add('is-active');
      }
    });

    // mega-triggers (data-pages = lista separada por espaço)
    bar.querySelectorAll('.atb-link-mega[data-pages]').forEach(function (t) {
      var pages = (t.getAttribute('data-pages') || '').split(/\s+/).filter(Boolean);
      if (pages.indexOf(path) !== -1) t.classList.add('is-active');
    });
  }

  /* ---------- scroll-spy nas sections (#anchors) --------- */
  function setupSectionScrollspy() {
    var subLinks = bar.querySelectorAll('.atb-sub-section[href^="#"]');
    if (!subLinks.length) return;

    var sections = [];
    subLinks.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) sections.push({ link: a, el: el });
    });
    if (!sections.length) return;

    function update() {
      var y = window.scrollY + 120;
      var current = sections[0];
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].el.offsetTop <= y) current = sections[i];
      }
      sections.forEach(function (s) { s.link.classList.remove('is-active'); });
      current.link.classList.add('is-active');
    }

    window.addEventListener('scroll', function () {
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();

    // smooth scroll
    subLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href').slice(1);
        var el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        var top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }

  /* ---------- mês corrente dinâmico ---------------------- */
  function setupCurrentMonthLabels() {
    var months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    var m = months[new Date().getMonth()];
    document.querySelectorAll('[data-month]').forEach(function (el) {
      el.textContent = m;
    });
  }

  /* ---------- KPI rotator (CDI ↔ IBOV) ------------------- */
  function setupKpiRotator() {
    var container = bar.querySelector('.atb-kpis');
    if (!container) return;
    var groups = Array.prototype.slice.call(
      container.querySelectorAll('.atb-kpi-group')
    );
    if (groups.length < 2) return;

    var INTERVAL = 5000;        // ms entre trocas
    var TRANSITION_MS = 600;    // mesma duração da .atb-kpi-group transition
    var idx = 0;
    var timer = null;
    var paused = false;

    function reset() {
      groups.forEach(function (g, i) {
        g.classList.toggle('is-active', i === 0);
        g.classList.remove('is-leaving');
      });
      idx = 0;
    }

    function tick() {
      if (paused) return;
      var current = groups[idx];
      idx = (idx + 1) % groups.length;
      var next = groups[idx];

      current.classList.remove('is-active');
      current.classList.add('is-leaving');
      next.classList.remove('is-leaving');
      next.classList.add('is-active');

      // depois da transição, "snap" do antigo de volta pra baixo (sem animar)
      setTimeout(function () {
        current.style.transition = 'none';
        current.classList.remove('is-leaving');
        // força reflow pra evitar piscada
        // eslint-disable-next-line no-unused-expressions
        current.offsetHeight;
        current.style.transition = '';
      }, TRANSITION_MS);
    }

    function start() {
      stop();
      timer = setInterval(tick, INTERVAL);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    reset();

    // pausa no hover (deixa ler) e quando aba não tá visível
    container.addEventListener('mouseenter', function () { paused = true; });
    container.addEventListener('mouseleave', function () { paused = false; });
    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
    });

    // respeita prefers-reduced-motion
    var rm = window.matchMedia &&
             window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rm && rm.matches) return; // mantém só o primeiro grupo

    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
