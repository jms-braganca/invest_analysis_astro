/* ==========================================================================
   dashboard.js — JS compartilhado entre páginas internas
   - Sorting de tabelas (≥768px)
   - Toggle de seção Destaques
   - Toggle de cada bloco de classe
   - Scroll para classe via chips de atalho
   - Filtro de busca por nome/CNPJ
   ========================================================================== */
(function () {
  'use strict';

  // ── DESTAQUES TOGGLE ──────────────────────────────────────────
  window.toggleDestaques = function (btn) {
    var body = btn.parentElement.querySelector('.dest-body');
    if (!body) return;
    var icon = btn.querySelector('.dest-toggle-icon');
    var collapsed = body.classList.toggle('collapsed');
    if (icon) icon.textContent = collapsed ? '▼' : '▲';
  };

  // ── CLASSE-BLOCO TOGGLE ───────────────────────────────────────
  window.toggleClasseBloco = function (header, ev) {
    if (ev) ev.stopPropagation();
    var bloco = header.closest('.classe-bloco');
    if (!bloco) return;
    var body = bloco.querySelector('.classe-body');
    if (!body) return;
    var icon = header.querySelector('.classe-toggle-icon');
    var collapsed = body.classList.toggle('collapsed');
    if (icon) icon.textContent = collapsed ? '▶' : '▼';
  };

  // ── SCROLL PARA CLASSE (via chips de atalho) ──────────────────
  window.scrollToClasse = function (id, ev) {
    if (ev) ev.preventDefault();
    var el = document.getElementById(id);
    if (!el) return;
    // Se estiver colapsado, expandir antes de rolar
    var body = el.querySelector('.classe-body');
    if (body && body.classList.contains('collapsed')) {
      var header = el.querySelector('.classe-header');
      if (header) window.toggleClasseBloco(header);
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── SORTING DE TABELAS ────────────────────────────────────────
  // IMPORTANTE: o colIdx do <th> é resolvido DINAMICAMENTE no click,
  // não capturado em closure. O compare-select.js injeta uma coluna
  // <th class="cmp-check-cell"> no início da tabela DEPOIS que este
  // script roda — o que deslocaria todos os índices em +1 se a gente
  // tivesse capturado colIdx no momento da inicialização. Resolvendo
  // dinamicamente, o sort fica correto independente do que foi injetado.
  function initSorting(table) {
    var headers = table.querySelectorAll('thead tr.col-header th');
    headers.forEach(function (th, idx) {
      // Pula as 2 primeiras colunas (Fundo e Data Cota — não são sortáveis).
      if (idx < 2) return;
      th.classList.add('sortable');
      th.addEventListener('click', function () {
        // Recalcula índice REAL no DOM atual (compensa colunas injetadas)
        var realIdx = Array.prototype.indexOf.call(th.parentElement.children, th);
        var asc = !th.classList.contains('sort-desc');
        headers.forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
        th.classList.add(asc ? 'sort-desc' : 'sort-asc');
        sortTable(table, realIdx, asc);
      });
    });
  }
  function sortTable(table, colIdx, asc) {
    var tbody = table.querySelector('tbody');
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function (a, b) {
      var aVal = getCellVal(a, colIdx);
      var bVal = getCellVal(b, colIdx);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return asc ? bVal - aVal : aVal - bVal;
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
  }
  function getCellVal(row, colIdx) {
    var cell = row.cells[colIdx];
    if (!cell) return null;
    var sortAttr = cell.getAttribute('data-sort');
    if (sortAttr !== null && sortAttr !== '') {
      var nAttr = parseFloat(sortAttr);
      return isNaN(nAttr) ? null : nAttr;
    }
    var txt = cell.innerText.trim();
    if (txt === '—' || txt === '-' || txt === '') return null;
    txt = txt.replace(/[+%a-zA-Z ]/g, '').replace(',', '.');
    var n = parseFloat(txt);
    return isNaN(n) ? null : n;
  }

  // ── SEARCH (corrigido pra arquitetura multi-página) ──────────
  // No DOM novo, cada página é standalone — não há mais panel-id.
  // A função busca dentro do <main class="main"> (que sempre existe).

  // Guarda o estado de cada classe-body antes da busca, pra restaurar quando limpa
  var _classeStateSnapshot = null;

  function setClasseExpanded(bloco, expanded) {
    var body = bloco.querySelector('.classe-body');
    if (!body) return;
    var icon = bloco.querySelector('.classe-toggle-icon');
    if (expanded) {
      body.classList.remove('collapsed');
      if (icon) icon.textContent = '▼';
    } else {
      body.classList.add('collapsed');
      if (icon) icon.textContent = '▶';
    }
  }

  window.filtrar = function (input, panelId) {
    var panel = null;
    var inp = null;

    if (typeof input === 'string') {
      // Chamada legada: filtrar('fundos') ou filtrar('prev')
      var aba = input;
      var inputId = 'search' + (aba === 'fundos' ? 'Fundos' : 'Prev');
      inp = document.getElementById(inputId);
    } else {
      // Chamada moderna: filtrar(this, 'mainFundos')
      inp = input;
    }

    if (!inp) return;

    // Procura container: tenta panelId antigo, senão pega o <main> da página
    panel = (panelId && document.getElementById(panelId))
         || document.querySelector('main.main')
         || document.querySelector('main')
         || document.querySelector('.panel-card');

    if (!panel) return;

    // Localiza o contador de resultados (na search-bar da própria página)
    var cnt = inp.parentElement && inp.parentElement.parentElement
              ? inp.parentElement.parentElement.querySelector('.search-count')
              : document.querySelector('.search-count');

    var q = (inp.value || '').trim().toLowerCase();
    var total = 0;

    // Snapshot do estado atual ao iniciar uma busca (só na primeira keystroke)
    if (q && _classeStateSnapshot === null) {
      _classeStateSnapshot = {};
      panel.querySelectorAll('.classe-bloco').forEach(function (bloco) {
        var body = bloco.querySelector('.classe-body');
        if (body && bloco.id) {
          _classeStateSnapshot[bloco.id] = body.classList.contains('collapsed');
        }
      });
    }

    panel.querySelectorAll('.classe-bloco').forEach(function (bloco) {
      var visible = 0;

      // Mobile cards
      bloco.querySelectorAll('.fund-card').forEach(function (card) {
        var show = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      // Desktop tables
      bloco.querySelectorAll('tbody tr').forEach(function (row) {
        // Pega o texto da primeira célula (fundo-col que tem nome+cnpj)
        var fundoCol = row.querySelector('td.fundo-col') || row.cells[0];
        var txt = fundoCol ? fundoCol.textContent : row.textContent;
        var show = !q || txt.toLowerCase().indexOf(q) !== -1;
        row.style.display = show ? '' : 'none';
        // Conta só se mobile cards já não contou (evitar contagem dupla)
        if (show && bloco.querySelectorAll('.fund-card').length === 0) {
          visible++;
        }
      });

      // Se tiver tanto mobile quanto desktop, conta o maior
      if (bloco.querySelectorAll('.fund-card').length > 0) {
        var visibleDesktop = bloco.querySelectorAll('tbody tr:not([style*="display: none"])').length;
        visible = Math.max(visible, visibleDesktop);
      }

      bloco.classList.toggle('hidden', visible === 0 && !!q);

      // Auto-expand/collapse durante a busca
      if (q) {
        // Expandir se tem matches; recolher (ou esconder) se não tem
        setClasseExpanded(bloco, visible > 0);
      } else if (_classeStateSnapshot && bloco.id in _classeStateSnapshot) {
        // Busca foi limpa: restaura estado anterior
        setClasseExpanded(bloco, !_classeStateSnapshot[bloco.id]);
      }

      total += visible;
    });

    // Quando a busca é limpa por completo, descarta snapshot
    if (!q) {
      _classeStateSnapshot = null;
    }

    // Atualiza contadores nos chips de atalho (classe-nav)
    document.querySelectorAll('.classe-nav-chip').forEach(function (chip) {
      var targetId = chip.getAttribute('data-target');
      if (!targetId) return;
      var bloco = document.getElementById(targetId);
      if (!bloco) return;
      // Esconder chip se a classe inteira não tem resultados
      chip.style.display = bloco.classList.contains('hidden') ? 'none' : '';
    });

    if (cnt) {
      cnt.textContent = q
        ? (total + ' fundo' + (total !== 1 ? 's' : '') + ' encontrado' + (total !== 1 ? 's' : ''))
        : '';
    }
  };

  // ── INIT ──────────────────────────────────────────────────────
  function init() {
    document.querySelectorAll('table').forEach(initSorting);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
