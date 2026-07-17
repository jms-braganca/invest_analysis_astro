/* ============================================================
   private-correlacao.js — Página dedicada de correlação
   ============================================================
   Espera window.DADOS_CORR = {
     items: [{id, nome, classe, tipo}, ...],   // fundos + 'cdi' + 'ibov'
     corr12m: [[...]],
     corr24m: [[...]],
     classes: {...}, meta: {...}
   }

   Fluxo: usuário escolhe manualmente os fundos (abas Fundos / Prev) +
   ativa benchmarks. Heatmap renderiza só com a seleção.
   ============================================================ */
(function () {
  'use strict';

  if (!window.DADOS_CORR || !window.DADOS_CORR.items) {
    console.error('window.DADOS_CORR ausente.');
    return;
  }
  var DC = window.DADOS_CORR;

  // estado
  var aba          = 'fundo';            // 'fundo' | 'prev'
  var selecionados = new Set();          // ids (cnpjs) selecionados
  var query        = '';
  var janela       = 'all';   // default 'all' (bate com referência MaisRetorno)
  var benchCdi     = false;
  var benchIbov    = false;
  var tooltipEl;

  // mapa rápido id → índice na matriz
  var idx = {};
  DC.items.forEach(function (it, i) { idx[it.id] = i; });

  function ready(fn) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    setupTooltip();
    setupTabs();
    setupSearch();
    setupWindow();
    setupBenchmarks();
    setupReset();
    renderList();
    renderChips();
    renderHeatmap();
  });

  /* -------- abas Fundos/Prev -------------------- */
  function setupTabs() {
    var tabs = document.querySelectorAll('.cor-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('is-selected'); });
        t.classList.add('is-selected');
        aba = t.dataset.tipo || 'fundo';
        renderList();
      });
    });
  }

  /* -------- search ------------------------------ */
  function setupSearch() {
    var input = document.getElementById('corSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      query = input.value.trim().toLowerCase();
      renderList();
    });
  }

  /* -------- janela ------------------------------ */
  function setupWindow() {
    var seg = document.getElementById('corWindow');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('is-selected'); });
        b.classList.add('is-selected');
        janela = b.dataset.window || '12m';
        renderHeatmap();
      });
    });
  }

  /* -------- toggles benchmark ------------------- */
  function setupBenchmarks() {
    var inCdi  = document.getElementById('corBenchCdi');
    var inIbov = document.getElementById('corBenchIbov');
    if (inCdi)  inCdi.addEventListener('change',  function () { benchCdi  = inCdi.checked;  renderHeatmap(); });
    if (inIbov) inIbov.addEventListener('change', function () { benchIbov = inIbov.checked; renderHeatmap(); });
  }

  /* -------- reset ------------------------------- */
  function setupReset() {
    var btn = document.getElementById('corReset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      selecionados.clear();
      renderList(); renderChips(); renderHeatmap();
    });
  }

  /* -------- lista de fundos da aba -------------- */
  function renderList() {
    var ul = document.getElementById('corFundList');
    if (!ul) return;
    ul.innerHTML = '';

    var max = 200;
    var n = 0;
    DC.items.forEach(function (it) {
      if (n >= max) return;
      if (it.tipo !== aba) return;
      if (query) {
        var hay = (it.nome + ' ' + it.id).toLowerCase();
        if (hay.indexOf(query) === -1) return;
      }
      var row = document.createElement('div');
      var sel = selecionados.has(it.id);
      row.className = 'cor-fund-item' + (sel ? ' is-selected' : '');
      row.innerHTML =
        '<span class="check"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg></span>' +
        '<div class="info">' +
          '<span class="nome">' + escHtml(it.nome) + '</span>' +
          '<span class="meta">' + escHtml(it.classe) + '</span>' +
        '</div>';
      row.addEventListener('click', function () {
        if (selecionados.has(it.id)) selecionados.delete(it.id);
        else                          selecionados.add(it.id);
        renderList(); renderChips(); renderHeatmap();
      });
      ul.appendChild(row);
      n++;
    });

    if (n === 0) {
      var empty = document.createElement('div');
      empty.className = 'cor-empty-chips';
      empty.textContent = query ? 'Nenhum fundo encontrado.' : 'Nenhum fundo nesta aba.';
      ul.appendChild(empty);
    }
  }

  /* -------- chips dos selecionados -------------- */
  function renderChips() {
    var wrap = document.getElementById('corChips');
    var count = document.getElementById('corCount');
    if (count) count.textContent = String(selecionados.size);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (selecionados.size === 0) {
      var empty = document.createElement('div');
      empty.className = 'cor-empty-chips';
      empty.textContent = 'Nenhum fundo selecionado. Use a busca abaixo.';
      wrap.appendChild(empty);
      return;
    }
    Array.from(selecionados).forEach(function (id) {
      var it = DC.items[idx[id]];
      if (!it) return;
      var chip = document.createElement('div');
      chip.className = 'cmp-chip';
      chip.innerHTML =
        '<span class="cmp-chip-dot" style="background:rgba(0,113,227,0.6)"></span>' +
        '<span class="cmp-chip-name" title="' + escHtml(it.nome) + '">' + escHtml(it.nome) + '</span>' +
        '<button class="cmp-chip-x" aria-label="Remover">×</button>';
      chip.querySelector('.cmp-chip-x').addEventListener('click', function () {
        selecionados.delete(id);
        renderList(); renderChips(); renderHeatmap();
      });
      wrap.appendChild(chip);
    });
  }

  /* -------- heatmap (DOM grid no estilo da matriz do Comparador) -- */
  function renderHeatmap() {
    var wrap = document.getElementById('corHeatmap');
    var summary = document.getElementById('corSummary');
    if (!wrap) return;

    // Lista de itens visíveis: selecionados + benchmarks ativos
    var visible = [];
    selecionados.forEach(function (id) {
      var i = idx[id];
      if (i != null) visible.push(i);
    });
    if (benchCdi  && idx['cdi']  != null) visible.push(idx['cdi']);
    if (benchIbov && idx['ibov'] != null) visible.push(idx['ibov']);
    var n = visible.length;

    if (summary) {
      var nFund  = visible.filter(function (i) { return DC.items[i].tipo !== 'benchmark'; }).length;
      var nBench = n - nFund;
      var janelaLbl = (janela === 'all' ? 'Tudo' : (janela === '24m' ? '24 meses' : '12 meses'));
      summary.innerHTML =
        '<span><strong>' + nFund + '</strong> fundo' + (nFund !== 1 ? 's' : '') + ' selecionado' + (nFund !== 1 ? 's' : '') + '</span>' +
        (nBench ? '<span>+ <strong>' + nBench + '</strong> benchmark' + (nBench>1?'s':'') + '</span>' : '') +
        '<span>janela <strong>' + janelaLbl + '</strong></span>';
    }

    if (n < 2) {
      wrap.innerHTML = '<div class="cor-empty"><p class="empty-title">Selecione ao menos 2 itens.</p>' +
                       '<p>Escolha fundos na lista à esquerda ou ative os benchmarks.</p></div>';
      return;
    }

    // Janela → matriz + n_obs + limiar de "amostra confortável" em DIAS ÚTEIS
    // (~60% da janela; 1 mês ≈ 21 du). Compat: payloads antigos sem corrAll
    // caem em fallback pra 24m / 12m.
    var corr, nobs, minPts;
    if (janela === 'all') {
      corr   = DC.corrAll || DC.corr24m || DC.corr12m;
      nobs   = DC.nobsAll || DC.nobs24m || DC.nobs12m || null;
      minPts = 600;
    } else if (janela === '24m') {
      corr   = DC.corr24m;
      nobs   = DC.nobs24m || null;
      minPts = 300;
    } else {
      corr   = DC.corr12m;
      nobs   = DC.nobs12m || null;
      minPts = 150;
    }

    // Tamanhos adaptativos do grid (largura do label, largura mín das células,
    // altura). Espelha o visual .cmp-corr-grid (pílulas) da página Comparar.
    var labelColW = n <= 6 ? 200 : (n <= 12 ? 180 : 160);
    var minCellW  = n <= 6 ?  70 : (n <= 12 ?  56 : (n <= 20 ? 44 : 36));
    var cellH     = n <= 8 ?  44 : (n <= 14 ?  38 : (n <= 22 ? 32 : 26));
    var truncCols = n <= 8 ? 20 : (n <= 14 ? 14 : 10);

    var html = '<div class="cor-matrix-grid" style="' +
      'display:grid;' +
      'grid-template-columns:' + labelColW + 'px repeat(' + n + ', minmax(' + minCellW + 'px, 1fr));' +
      'gap:4px;font-variant-numeric:tabular-nums;font-size:12px;align-items:stretch;">';

    // Header row: corner vazio + col labels (texto horizontal — não rotaciono mais)
    html += '<div></div>';
    visible.forEach(function (idC) {
      var it = DC.items[idC];
      var isBench = it.tipo === 'benchmark';
      html += '<div class="cor-col-label' + (isBench ? ' is-bench' : '') + '" title="' + escHtml(it.nome) + '" style="' +
        'font-size:11px;color:' + (isBench ? '#6e6e73' : '#86868b') + ';' +
        'font-weight:' + (isBench ? '600' : '500') + ';' +
        'display:flex;align-items:flex-end;justify-content:center;text-align:center;' +
        'padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25;">' +
        escHtml(truncate(it.nome, truncCols)) + '</div>';
    });

    // Data rows
    visible.forEach(function (idR) {
      var rowIt = DC.items[idR];
      var isBenchR = rowIt.tipo === 'benchmark';
      html += '<div class="cor-row-label' + (isBenchR ? ' is-bench' : '') + '" title="' + escHtml(rowIt.nome) + '" style="' +
        'font-size:12px;color:#1d1d1f;font-weight:' + (isBenchR ? '600' : '500') + ';' +
        'display:flex;align-items:center;padding-right:10px;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        escHtml(truncate(rowIt.nome, 32)) + '</div>';

      visible.forEach(function (idC) {
        if (idR === idC) {
          html += '<div class="cor-cell diag" style="' +
            'display:flex;align-items:center;justify-content:center;border-radius:10px;' +
            'min-height:' + cellH + 'px;font-weight:500;background:#F5F5F7;color:#86868b;">1,00</div>';
          return;
        }
        var r = (corr[idR] && corr[idR][idC] != null) ? corr[idR][idC] : null;
        var nOv = (nobs && nobs[idR] && nobs[idR][idC] != null) ? nobs[idR][idC] : null;
        if (r == null) {
          html += '<div class="cor-cell empty" title="Histórico em comum insuficiente' +
            (nOv != null ? ' (n=' + nOv + ')' : '') + '" style="' +
            'display:flex;align-items:center;justify-content:center;border-radius:10px;' +
            'min-height:' + cellH + 'px;font-size:11px;background:#FAFAFA;color:#a1a1a6;">—</div>';
          return;
        }
        var weak = (nOv != null && nOv < minPts);
        var bg = corrColor(r);
        var fg = (Math.abs(r) > 0.55) ? '#fff' : '#1d1d1f';
        var disp = (r >= 0 ? '+' : '') + r.toFixed(2).replace('.', ',');
        var styleParts = [
          'display:flex','align-items:center','justify-content:center',
          'border-radius:10px','min-height:' + cellH + 'px','font-weight:500',
          'letter-spacing:-0.005em','cursor:default','transition:transform .15s',
          'background:' + bg, 'color:' + fg,
        ];
        if (weak) styleParts.push('opacity:0.55');
        html += '<div class="cor-cell' + (weak ? ' is-weak' : '') + '"' +
                ' data-i="' + idR + '" data-j="' + idC +
                '" data-v="' + disp +
                '" data-n="' + (nOv == null ? '' : nOv) +
                '" data-weak="' + (weak ? '1' : '0') +
                '" style="' + styleParts.join(';') + ';">' + disp + '</div>';
      });
    });

    html += '</div>';
    wrap.innerHTML = html;

    // Hover handlers — DOM events em .cor-cell com data-i (exclui diag/empty)
    var cells = wrap.querySelectorAll('.cor-cell[data-i]');
    cells.forEach(function (c) {
      c.addEventListener('mouseenter', onCellHover);
      c.addEventListener('mousemove',  onMouseMove);
      c.addEventListener('mouseleave', onMouseOut);
    });
  }

  /* -------- tooltip ----------------------------- */
  function setupTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'cor-tooltip';
    document.body.appendChild(tooltipEl);
  }
  function onCellHover(e) {
    // currentTarget = a div .cor-cell que recebeu o listener.
    var t = e.currentTarget;
    if (!t || !t.dataset || t.dataset.i == null) return;
    var i = +t.dataset.i, j = +t.dataset.j;
    var a = (DC.items[i] || {}).nome || '';
    var b = (DC.items[j] || {}).nome || '';
    var nStr  = t.dataset.n;
    var weak  = t.dataset.weak === '1';
    showTooltip(e.clientX, e.clientY, a, b, t.dataset.v, nStr, weak);
  }
  function onMouseMove(e) {
    if (tooltipEl && tooltipEl.classList.contains('is-visible')) {
      tooltipEl.style.left = e.clientX + 'px';
      tooltipEl.style.top  = e.clientY + 'px';
    }
  }
  function onMouseOut() {
    if (tooltipEl) tooltipEl.classList.remove('is-visible');
  }
  function showTooltip(x, y, a, b, v, nStr, weak) {
    if (!tooltipEl) return;
    var nLine = '';
    if (nStr) {
      // reaproveita o estilo da .tt-pair (texto pequeno, cinza claro)
      nLine = '<div class="tt-pair" style="margin-top:4px;margin-bottom:0">n = '
            + escHtml(nStr) + (weak ? ' · amostra pequena' : '') + '</div>';
    }
    tooltipEl.innerHTML = '<div class="tt-pair">' + escHtml(a) + ' × ' + escHtml(b) +
                          '</div><div class="tt-value">' + escHtml(v) + '</div>' + nLine;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top  = y + 'px';
    tooltipEl.classList.add('is-visible');
  }

  /* -------- helpers ----------------------------- */
  function corrColor(r) {
    var isDark = document.body.classList.contains('theme-dark');
    if (r == null || isNaN(r)) return isDark ? '#1c1c1e' : '#FAFAFA';
    var a = Math.min(1, Math.abs(r));
    var alpha = (0.18 + 0.7 * a).toFixed(3);
    // Dark: verde (positivo) / laranja IPB (negativo).
    if (isDark) {
      if (r >= 0) return 'rgba(48,209,88,' + alpha + ')';
      return 'rgba(255,55,95,' + alpha + ')';
    }
    if (r >= 0) return 'rgba(0,113,227,' + alpha + ')';
    return 'rgba(255,59,48,' + alpha + ')';
  }
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
