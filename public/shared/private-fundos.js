/* ============================================================
   private-fundos.js — interações da página de fundos (Private theme)
   - Cards de classe (multi-select)
   - Segmented control (Janela 12m / 24m)
   - Sliders Private (fill azul + valor dinâmico)
   - Dropdown benchmark (% CDI / % Ibov)
   - Search bar (filtra linhas + esconde blocos sem matches)
   - Ordenação clicando no header
   - Accordion das classes
   - Painel de filtros colapsável (com resumo dos ativos)
   - Headers dinâmicos (mês corrente, mês anterior, ano)
   - Row select (checkbox circular) + Floating bar de comparação
   ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    setupDynamicColumnHeaders();
    setupChoiceCards();
    setupSegmented();
    setupSliders();
    setupBenchmarkDropdown();
    setupSearch();
    setupSort();
    setupAccordions();
    setupFiltersCollapse();
    setupRowSelect();
    setupReset();
    updateFilterSummary();
  });

  /* ---------- Headers dinâmicos (mes corrente, anterior, ano) -- */
  var MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function setupDynamicColumnHeaders() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var yy = String(yyyy).slice(-2);
    var curM = MONTHS_PT[d.getMonth()];
    var prev = new Date(d);
    prev.setMonth(prev.getMonth() - 1);
    var prevM = MONTHS_PT[prev.getMonth()];
    var prevYy = String(prev.getFullYear()).slice(-2);

    document.querySelectorAll('[data-col="curmonth"]').forEach(function (el) {
      el.textContent = curM + '/' + yy;
    });
    document.querySelectorAll('[data-col="prevmonth"]').forEach(function (el) {
      el.textContent = prevM + '/' + prevYy;
    });
    document.querySelectorAll('[data-col="year"]').forEach(function (el) {
      el.textContent = String(yyyy);
    });
  }

  /* ---------- choice cards (multi-select) ---------------- */
  function setupChoiceCards() {
    document.querySelectorAll('.ap-choice').forEach(function (card) {
      card.addEventListener('click', function () {
        card.classList.toggle('is-selected');
        updateFilterSummary();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          card.classList.toggle('is-selected');
          updateFilterSummary();
        }
      });
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'checkbox');
    });
  }

  /* ---------- segmented control -------------------------- */
  function setupSegmented() {
    document.querySelectorAll('.ap-segmented').forEach(function (group) {
      var btns = group.querySelectorAll('button');
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.classList.remove('is-selected'); });
          b.classList.add('is-selected');
          updateFilterSummary();
          applyAllFilters();
        });
      });
    });
  }

  /* ---------- sliders com fill azul ---------------------- */
  function setupSliders() {
    document.querySelectorAll('.ap-slider').forEach(function (s) {
      var input = s.querySelector('input[type=range]');
      var valEl = s.querySelector('.ap-slider-value');
      if (!input) return;

      function fmt(n) {
        // se o slider tiver formatter customizado (set por applyBenchmarkMode), usa ele
        if (typeof input._fmt === 'function') return input._fmt(n);
        var u = (valEl && valEl.dataset.unit) || '';
        return Number(n).toLocaleString('pt-BR') + (u ? ' ' + u : '');
      }
      function pct() {
        var min = +input.min, max = +input.max, v = +input.value;
        if (max === min) return 0;
        return ((v - min) / (max - min)) * 100;
      }
      function paint() {
        var p = pct();
        input.style.background =
          'linear-gradient(to right, var(--private-blue) 0%, var(--private-blue) ' +
          p + '%, var(--private-divider) ' + p +
          '%, var(--private-divider) 100%)';
        if (valEl) valEl.textContent = fmt(input.value);
        updateFilterSummary();
        scheduleFilter();
      }
      input.addEventListener('input', paint);
      paint();
    });
  }

  /* throttle via rAF — evita lag ao arrastar slider em 800+ linhas */
  var _filterRaf = null;
  function scheduleFilter() {
    if (_filterRaf) cancelAnimationFrame(_filterRaf);
    _filterRaf = requestAnimationFrame(function () {
      _filterRaf = null;
      try { applyAllFilters(); }
      catch (e) { console.error('applyAllFilters falhou:', e); }
    });
  }

  /* ---------- benchmark (% CDI ↔ Ibov) ------------------- */
  /* Cada modo redefine min/max/step/default + ticks + label + formatter
     do slider de retorno. */
  var BENCHMARK_MODES = {
    cdi: {
      label: 'Mínimo',
      min: 0, max: 200, step: 5, default: 0,   /* 0 = sem mínimo */
      fmt: function (v) {
        return Number(v).toLocaleString('pt-BR') + ' %';
      },
      ticks: ['0%', '50%', '100%', '150%', '200%']
    },
    ibov: {
      label: 'Acima do',
      min: 0, max: 10, step: 0.5, default: 0,
      fmt: function (v) {
        var n = Number(v).toLocaleString('pt-BR', {
          minimumFractionDigits: 0, maximumFractionDigits: 1
        });
        return '+' + n + ' %';
      },
      ticks: ['Ibov', '+2,5%', '+5%', '+7,5%', '+10%']
    }
  };

  function applyBenchmarkMode(mode, opts) {
    opts = opts || {};
    var cfg = BENCHMARK_MODES[mode];
    if (!cfg) return;
    var sel = document.getElementById('benchmarkSelect');
    if (!sel) return;
    var slider = sel.closest('.ap-slider');
    var input  = slider.querySelector('input[type=range]');
    var ticks  = slider.querySelector('.ap-slider-ticks');
    var label  = slider.querySelector('.ap-slider-label');

    if (label) label.textContent = cfg.label;

    input.min = cfg.min;
    input.max = cfg.max;
    input.step = cfg.step;
    input._fmt = cfg.fmt;
    // Mantém value/data-default vindos do HTML na 1ª chamada.
    // Em troca de modo (dropdown), reseta para 0 (sem filtro nesse modo).
    if (!opts.keepValue) {
      input.value = 0;
      input.dataset.default = '0';
    }

    if (ticks) {
      ticks.innerHTML = '';
      cfg.ticks.forEach(function (t) {
        var span = document.createElement('span');
        span.textContent = t;
        ticks.appendChild(span);
      });
    }

    // re-paint via input event
    input.dispatchEvent(new Event('input'));
  }

  function setupBenchmarkDropdown() {
    var sel = document.getElementById('benchmarkSelect');
    if (!sel) return;
    sel.addEventListener('change', function () {
      applyBenchmarkMode(sel.value);     // troca de modo: zera valor
      applyAllFilters();
    });
    // estado inicial: preserva o value que veio do HTML (ex.: CDI=100)
    applyBenchmarkMode(sel.value, { keepValue: true });
  }

  /* ---------- search ------------------------------------- */
  function setupSearch() {
    var s = document.querySelector('.ap-search');
    if (!s) return;
    var input = s.querySelector('input');
    var clear = s.querySelector('.ap-search-clear');
    if (!input) return;

    input.addEventListener('input', function () {
      s.classList.toggle('has-value', !!input.value.trim());
      applyAllFilters();
    });
    if (clear) clear.addEventListener('click', function () {
      input.value = '';
      s.classList.remove('has-value');
      applyAllFilters();
      input.focus();
    });
    applyAllFilters();
  }

  /* ---------- aplicação real dos filtros ----------------- */
  /* Combina: search + classe (cards) + janela + benchmark slider + prazo.
     Quando QUALQUER filtro (não search) está ativo, esconde linhas !== ABERTO. */
  function applyAllFilters() {
    var search = document.querySelector('.ap-search input');
    var bench  = document.getElementById('benchmarkSelect');
    var sliders = document.querySelectorAll('.ap-slider input[type=range]');
    var seg    = document.querySelector('.ap-segmented .is-selected');

    var query = (search ? (search.value || '') : '').trim().toLowerCase();
    var benchMode = bench ? bench.value : 'cdi';
    var minBench  = sliders[0] ? +sliders[0].value : 0;
    var maxPrazo  = sliders[1] ? +sliders[1].value : 360;
    var window_   = seg ? (seg.dataset.value || '12m') : '12m';

    // Filtro de benchmark: ativo quando > 0 (em ambos os modos)
    var benchActive = !!sliders[0] && minBench > 0;
    // Filtro de prazo: ativo quando > 0 (0 = sem teto, mostra todos)
    var prazoActive = !!sliders[1] && maxPrazo > 0;
    // Algum filtro avançado (não-search) ativo?
    var advActive = benchActive || prazoActive;

    document.querySelectorAll('.ap-table tbody tr, .ap-table-pro tbody tr').forEach(function (tr) {
      var visible = true;

      // 1) search (sempre, se houver query)
      if (visible && query) {
        var txt = tr.textContent.toLowerCase();
        if (txt.indexOf(query) === -1) visible = false;
      }

      // 2) status: filtro avançado ativo → só ABERTO
      if (visible && advActive) {
        var status = String(tr.dataset.status || '').toUpperCase();
        if (status !== 'ABERTO') visible = false;
      }

      // 3) benchmark
      if (visible && benchActive) {
        var attrName;
        if (benchMode === 'cdi') {
          attrName = window_ === '24m' ? 'pctCdi24m' : 'pctCdi12m';
        } else {
          attrName = window_ === '24m' ? 'vsIbov24m' : 'vsIbov12m';
        }
        var raw = tr.dataset[attrName];
        var v = (raw === '' || raw == null) ? NaN : parseFloat(raw);
        if (isNaN(v) || v < minBench) visible = false;
      }

      // 4) prazo de resgate (em dias)
      if (visible && prazoActive) {
        var p = parseFloat(tr.dataset.prazoD);
        if (!isNaN(p) && p > maxPrazo) visible = false;
      }

      tr.style.display = visible ? '' : 'none';
    });

    // esconde blocos sem nenhuma linha visível
    document.querySelectorAll('.ap-class-block').forEach(function (block) {
      var any = false;
      block.querySelectorAll('tbody tr').forEach(function (tr) {
        if (tr.style.display !== 'none') any = true;
      });
      block.style.display = any ? '' : 'none';
    });

    updateSearchCount();
    updateFilterSummary();
  }

  function updateSearchCount() {
    var count = document.querySelector('.ap-search-count');
    if (!count) return;
    var rows = document.querySelectorAll('.ap-table tbody tr, .ap-table-pro tbody tr');
    var total = rows.length;
    var visible = 0;
    rows.forEach(function (tr) { if (tr.style.display !== 'none') visible++; });
    count.textContent = (visible === total) ? (total + ' fundos')
                                            : (visible + ' de ' + total + ' fundos');
  }

  /* ---------- sort tabela -------------------------------- */
  function setupSort() {
    document.querySelectorAll('.ap-table').forEach(function (tbl) {
      var ths = tbl.querySelectorAll('thead th.sortable');
      ths.forEach(function (th) {
        th.addEventListener('click', function () {
          var asc = !th.classList.contains('is-asc');
          ths.forEach(function (x) {
            x.classList.remove('is-active', 'is-asc', 'is-desc');
          });
          th.classList.add('is-active', asc ? 'is-asc' : 'is-desc');

          var tbody = tbl.querySelector('tbody');
          var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
          var colIndex = Array.prototype.indexOf.call(th.parentNode.children, th);

          rows.sort(function (a, b) {
            var av = parseSortValue(a.children[colIndex]);
            var bv = parseSortValue(b.children[colIndex]);
            return asc ? av - bv : bv - av;
          });
          rows.forEach(function (r) { tbody.appendChild(r); });
        });
      });
    });
  }
  function parseSortValue(td) {
    if (!td) return 0;
    var raw = (td.dataset.sort != null)
      ? td.dataset.sort
      : (td.textContent || '');
    var n = parseFloat(String(raw).replace(/[^\d,.\-]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  /* ---------- accordion ---------------------------------- */
  function setupAccordions() {
    document.querySelectorAll('.ap-class-block .ap-class-head').forEach(function (h) {
      h.addEventListener('click', function () {
        h.parentElement.classList.toggle('is-open');
      });
    });
  }

  /* ---------- painel de filtros colapsável -------------- */
  function setupFiltersCollapse() {
    var panel = document.querySelector('.ap-filters');
    if (!panel) return;
    var btn = panel.querySelector('.ap-filters-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- resumo dos filtros ativos ----------------- */
  function updateFilterSummary() {
    var el = document.querySelector('.ap-filters-active-count');
    if (!el) return;

    var labels = [];

    var seg = document.querySelector('.ap-segmented .is-selected');
    if (seg) labels.push(seg.textContent.trim());

    var bench = document.getElementById('benchmarkSelect');
    var sliders = document.querySelectorAll('.ap-slider input[type=range]');
    if (bench && sliders[0]) {
      var v = +sliders[0].value;
      if (v > 0) {  // só mostra se filtro ativo
        if (bench.value === 'cdi') {
          labels.push('≥ ' + v + '% CDI');
        } else {
          var n = Number(v).toLocaleString('pt-BR', {
            minimumFractionDigits: 0, maximumFractionDigits: 1
          });
          labels.push('Ibov + ' + n + '%');
        }
      }
    }
    if (sliders[1]) {
      var v2 = +sliders[1].value;
      if (v2 > 0) labels.push('≤ ' + v2 + 'd resgate');
    }

    el.textContent = labels.length ? labels.join(' · ') : 'todos os fundos';
  }

  /* ---------- row select + floating bar ------------------ */
  function setupRowSelect() {
    var bar = document.getElementById('floatingBar');
    var count = bar ? bar.querySelector('.ap-fb-count') : null;
    var clearBtn = bar ? bar.querySelector('.ap-fb-clear') : null;
    var ctaBtn = bar ? bar.querySelector('.ap-fb-cta') : null;

    function updateBar() {
      var selected = document.querySelectorAll('.ap-table tbody tr.is-selected');
      var n = selected.length;
      if (count) {
        count.textContent = n + ' ' +
          (n === 1 ? 'fundo selecionado' : 'fundos selecionados');
      }
      if (bar) bar.classList.toggle('is-active', n > 0);
    }

    document.querySelectorAll('.ap-table tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        // ignora clicks em links/botões internos
        var t = e.target;
        while (t && t !== tr) {
          var tag = (t.tagName || '').toLowerCase();
          if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select') return;
          t = t.parentNode;
        }
        tr.classList.toggle('is-selected');
        updateBar();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        document.querySelectorAll('.ap-table tbody tr.is-selected').forEach(function (tr) {
          tr.classList.remove('is-selected');
        });
        updateBar();
      });
    }

    if (ctaBtn) {
      ctaBtn.addEventListener('click', function () {
        // mesmo formato do compare-select.js legado pra manter compatibilidade
        var sel = [];
        var tipo = (window.location.pathname.indexOf('previdencia') >= 0) ? 'prev' : 'fundo';
        document.querySelectorAll('.ap-table tbody tr.is-selected').forEach(function (tr) {
          var nameEl = tr.querySelector('.ap-fund-name');
          sel.push({
            cnpj:   tr.dataset.cnpj   || '',
            nome:   nameEl ? nameEl.textContent.trim() : '',
            classe: tr.dataset.classe || '',
            tipo:   tipo,
          });
        });
        if (!sel.length) return;
        try { localStorage.setItem('cmp_pre_select', JSON.stringify(sel)); }
        catch (e) { /* localStorage indisponível — segue mesmo assim */ }
        window.location.href = 'comparacao.html';
      });
    }

    updateBar();
  }

  /* ---------- reset -------------------------------------- */
  function setupReset() {
    var btn = document.querySelector('.ap-reset');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      document.querySelectorAll('.ap-choice.is-selected').forEach(function (c) {
        c.classList.remove('is-selected');
      });
      document.querySelectorAll('.ap-segmented').forEach(function (g) {
        var btns = g.querySelectorAll('button');
        btns.forEach(function (b) { b.classList.remove('is-selected'); });
        if (btns.length) btns[0].classList.add('is-selected');
      });
      // benchmark dropdown volta pro 1º (CDI) e zera o slider
      var bench = document.getElementById('benchmarkSelect');
      var benchInput = bench ? bench.closest('.ap-slider').querySelector('input[type=range]') : null;
      if (bench) {
        bench.value = bench.options[0].value;
        applyBenchmarkMode(bench.value);  // já zera (keepValue=false default)
      }
      // demais sliders zeram (sem filtro)
      document.querySelectorAll('.ap-slider input[type=range]').forEach(function (i) {
        if (benchInput && i === benchInput) return;
        i.value = 0;
        i.dispatchEvent(new Event('input'));
      });
      var s = document.querySelector('.ap-search input');
      if (s) {
        s.value = '';
        var sr = document.querySelector('.ap-search');
        if (sr) sr.classList.remove('has-value');
      }
      updateFilterSummary();
      applyAllFilters();
    });
  }
})();
