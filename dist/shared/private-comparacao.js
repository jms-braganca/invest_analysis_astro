/* ============================================================
   private-comparacao.js — Lógica da página de comparação
   ============================================================
   Espera window.DADOS = {
     fundos:     { '<cnpj>': {nome, classe, tipo, datas:[...], cotas:[...]} },
     benchmarks: { cdi:{datas,cotas}, ibov:{datas,cotas} },
     meta:       { date_max, ... }
   }
   ============================================================ */
(function () {
  'use strict';

  var MAX_SELECT = 10;
  var COLORS = [
    '#007AFF', '#FF9500', '#AF52DE', '#34C759', '#FF2D55',
    '#5AC8FA', '#FFCC00', '#FF3B30', '#5856D6', '#00C7BE',
  ];
  var COLOR_CDI  = '#8E8E93';
  var COLOR_IBOV = '#1C1C1E';

  // estado
  var selecionados = [];   // [{cnpj, nome, classe, tipo, color}]
  var aba       = 'fundo'; // 'fundo' | 'prev'
  var query     = '';
  var benchCdi  = true;
  var benchIbov = false;   // só CDI ligado por default
  var window_   = '12m';   // ytd | 12m | 24m | all — default 12m (Passo 6: boot leve; 24m/Tudo baixam max sob demanda)
  var chart;

  function ready(fn) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.DADOS || !window.DADOS.fundos) {
      console.error('window.DADOS ausente — comparacao não pode renderizar.');
      return;
    }

    // 1) pre-select via localStorage (vem dos botões em fundos.html / previdencia.html)
    try {
      var raw = localStorage.getItem('cmp_pre_select');
      if (raw) {
        var pre = JSON.parse(raw) || [];
        pre.slice(0, MAX_SELECT).forEach(function (item) {
          if (item && item.cnpj && DADOS.fundos[item.cnpj] && !isSelected(item.cnpj)) {
            addSel(item.cnpj);
          }
        });
        localStorage.removeItem('cmp_pre_select');
      }
    } catch (e) { /* localStorage indisponível */ }

    setupTabs();
    setupSearch();
    setupBenchmarks();
    setupWindow();
    setupReset();
    renderAll();
  });

  /* -------- abas Fundos / Prev ------------------ */
  function setupTabs() {
    var tabs = document.querySelectorAll('.cor-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('is-selected'); });
        t.classList.add('is-selected');
        aba = t.dataset.tipo || 'fundo';
        renderResultList();
      });
    });
  }

  /* -------- helpers de seleção ------------------ */
  function isSelected(cnpj) {
    return selecionados.some(function (s) { return s.cnpj === cnpj; });
  }
  function addSel(cnpj) {
    if (selecionados.length >= MAX_SELECT) return false;
    var f = DADOS.fundos[cnpj];
    if (!f) return false;
    var color = COLORS[selecionados.length % COLORS.length];
    selecionados.push({ cnpj: cnpj, nome: f.nome, classe: f.classe, tipo: f.tipo, color: color });
    return true;
  }
  function removeSel(cnpj) {
    selecionados = selecionados.filter(function (s) { return s.cnpj !== cnpj; });
    // recolora os restantes na ordem
    selecionados.forEach(function (s, i) { s.color = COLORS[i % COLORS.length]; });
  }

  /* -------- search (filtra a lista da aba ativa) ------ */
  function setupSearch() {
    var input = document.getElementById('cmpSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      query = (input.value || '').trim().toLowerCase();
      renderResultList();
    });
  }

  /* Renderiza a lista clicável de fundos da aba ativa.
     - Item já selecionado fica com check azul (clica de novo pra remover)
     - Item desabilitado quando já tem MAX_SELECT na seleção */
  function renderResultList() {
    var ul = document.getElementById('cmpResults');
    if (!ul) return;
    ul.innerHTML = '';
    var max = 200;
    var n = 0;
    Object.keys(DADOS.fundos).forEach(function (cnpj) {
      if (n >= max) return;
      var f = DADOS.fundos[cnpj];
      if (f.tipo !== aba) return;
      if (query) {
        var hay = (f.nome + ' ' + cnpj).toLowerCase();
        if (hay.indexOf(query) === -1) return;
      }
      var sel = isSelected(cnpj);
      var disabled = !sel && selecionados.length >= MAX_SELECT;
      var row = document.createElement('div');
      row.className = 'cor-fund-item' + (sel ? ' is-selected' : '') + (disabled ? ' is-disabled' : '');
      row.innerHTML =
        '<span class="check"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg></span>' +
        '<div class="info">' +
          '<span class="nome">' + escHtml(f.nome) + '</span>' +
          '<span class="meta">' + escHtml(f.classe) + '</span>' +
        '</div>';
      if (!disabled) {
        row.addEventListener('click', function () {
          if (sel) removeSel(cnpj);
          else      addSel(cnpj);
          renderAll();
        });
      }
      ul.appendChild(row);
      n++;
    });
    if (n === 0) {
      ul.innerHTML = '<div class="cor-empty-chips">' +
        (query ? 'Nenhum fundo encontrado.' : 'Nenhum fundo nesta aba.') + '</div>';
    }
  }

  /* -------- benchmarks toggles ------------------ */
  function setupBenchmarks() {
    var inCdi  = document.getElementById('benchCdi');
    var inIbov = document.getElementById('benchIbov');
    if (inCdi)  inCdi.addEventListener('change', function () {
      benchCdi  = inCdi.checked;  renderChart(); renderMonthlyReturns();
    });
    if (inIbov) inIbov.addEventListener('change', function () {
      benchIbov = inIbov.checked; renderChart(); renderMonthlyReturns();
    });
  }

  /* -------- janela ------------------------------ */
  function setupWindow() {
    var seg = document.getElementById('cmpWindow');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', async function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('is-selected'); });
        b.classList.add('is-selected');
        window_ = b.dataset.window || '12m';
        // Passo 6: 24m/Tudo podem exigir baixar o histórico completo sob demanda.
        if (window.__cmpEnsureCotas) await window.__cmpEnsureCotas(window_);
        renderChart();
      });
    });
  }

  /* -------- reset ------------------------------- */
  function setupReset() {
    var btn = document.getElementById('cmpReset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      selecionados = [];
      renderAll();
    });
  }

  /* -------- renderização ------------------------ */
  function renderAll() {
    renderChips();
    renderResultList();
    renderChart();
    renderCorrelation();
    renderTable();
    renderMonthlyReturns();
  }

  /* -------- retorno mês a mês (últimos 12 meses) -----------
     Calcula a variação mensal de cada fundo e benchmark selecionado
     a partir das cotas diárias (cota de fim de mês / fim do mês anterior). */
  var MESES_MR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  function lastCotaPorMes(src) {
    // { 'YYYY-MM': cota_no_ultimo_dia_do_mes } a partir da série diária.
    var map = {};
    if (!src || !src.datas || !src.cotas) return map;
    for (var i = 0; i < src.datas.length; i++) {
      var c = src.cotas[i];
      if (c == null || isNaN(c) || c <= 0) continue;
      map[src.datas[i].slice(0, 7)] = c;   // ascendente → último vence
    }
    return map;
  }
  function prevMesKey(ym) {
    var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    return y + '-' + (m < 10 ? '0' + m : '' + m);
  }
  function labelMes(ym) {
    var m = parseInt(ym.slice(5, 7), 10);
    return MESES_MR[m - 1] + '/' + ym.slice(2, 4);
  }
  function fmtPctMR(v) {
    if (v == null || isNaN(v)) return '<span class="ap-muted">—</span>';
    var sign = v >= 0 ? '+' : '';
    var cl = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    return '<span class="' + cl + '">' + sign + (v * 100).toFixed(2).replace('.', ',') + '%</span>';
  }

  function renderMonthlyReturns() {
    var wrap = document.getElementById('cmpMonthlyWrap');
    var head = document.getElementById('cmpMonthlyHead');
    var body = document.getElementById('cmpMonthlyBody');
    if (!wrap || !head || !body) return;

    if (!selecionados.length) { wrap.style.display = 'none'; return; }

    // mês de referência = mês da última data disponível.
    var dateMax = (DADOS.meta && DADOS.meta.date_max) || '';
    if (!dateMax) {
      // fallback: maior data entre os fundos selecionados
      selecionados.forEach(function (s) {
        var f = DADOS.fundos[s.cnpj];
        if (f && f.datas && f.datas.length) {
          var last = f.datas[f.datas.length - 1];
          if (last > dateMax) dateMax = last;
        }
      });
    }
    if (!dateMax) { wrap.style.display = 'none'; return; }

    // 12 meses terminando no mês de dateMax (mais antigo → mais recente).
    var meses = [];
    var ym = dateMax.slice(0, 7);
    for (var k = 0; k < 12; k++) { meses.unshift(ym); ym = prevMesKey(ym); }

    // cabeçalho
    var thead = '<th>Ativo</th>';
    meses.forEach(function (m) { thead += '<th>' + labelMes(m) + '</th>'; });
    head.innerHTML = thead;

    // linhas: fundos selecionados + benchmarks ligados
    var linhas = [];
    selecionados.forEach(function (s) {
      var f = DADOS.fundos[s.cnpj];
      if (!f) return;
      linhas.push(montaLinhaMR(s.nome, s.color, lastCotaPorMes(f), meses, false));
    });
    if (benchCdi && DADOS.benchmarks && DADOS.benchmarks.cdi)
      linhas.push(montaLinhaMR('CDI', COLOR_CDI, lastCotaPorMes(DADOS.benchmarks.cdi), meses, true));
    if (benchIbov && DADOS.benchmarks && DADOS.benchmarks.ibov)
      linhas.push(montaLinhaMR('Ibovespa', COLOR_IBOV, lastCotaPorMes(DADOS.benchmarks.ibov), meses, true));

    body.innerHTML = linhas.join('');
    wrap.style.display = '';
  }

  function montaLinhaMR(nome, cor, mapMes, meses, isBench) {
    var cells = meses.map(function (m) {
      var cur = mapMes[m];
      var prev = mapMes[prevMesKey(m)];
      var ret = (cur != null && prev != null && prev > 0) ? (cur / prev - 1) : null;
      return '<td>' + fmtPctMR(ret) + '</td>';
    }).join('');
    return '<tr' + (isBench ? ' class="is-bench"' : '') + '>' +
      '<td title="' + escHtml(nome) + '"><span class="cmp-mr-dot" style="background:' + cor + '"></span>' +
      escHtml(nome) + '</td>' + cells + '</tr>';
  }

  function renderChips() {
    var wrap = document.getElementById('cmpChips');
    var count = document.getElementById('cmpCount');
    if (count) count.textContent = selecionados.length + ' / ' + MAX_SELECT;
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!selecionados.length) {
      var empty = document.createElement('div');
      empty.className = 'cmp-empty';
      empty.textContent = 'Nenhum fundo selecionado. Use a busca abaixo.';
      wrap.appendChild(empty);
      return;
    }
    selecionados.forEach(function (s) {
      var chip = document.createElement('div');
      chip.className = 'cmp-chip';
      chip.innerHTML =
        '<span class="cmp-chip-dot" style="background:' + s.color + '"></span>' +
        '<span class="cmp-chip-name" title="' + escHtml(s.nome) + '">' + escHtml(s.nome) + '</span>' +
        '<button class="cmp-chip-x" aria-label="Remover">×</button>';
      chip.querySelector('.cmp-chip-x').addEventListener('click', function () {
        removeSel(s.cnpj);
        renderAll();
      });
      wrap.appendChild(chip);
    });
  }

  /* Constrói um dataset Chart.js para uma série, normalizando a partir
     de startDate. Retorna null se não houver cota válida em startDate. */
  function buildSeries(src, color, label, isBenchmark, startDate) {
    if (!src || !src.datas || !src.cotas) return null;

    var startIdx = -1;
    for (var i = 0; i < src.datas.length; i++) {
      if (src.datas[i] >= startDate) { startIdx = i; break; }
    }
    if (startIdx < 0) return null;
    var c0 = src.cotas[startIdx];
    if (!c0) return null;

    var pts = [];
    for (var j = startIdx; j < src.datas.length; j++) {
      var c = src.cotas[j];
      if (c == null) continue;
      pts.push({ x: src.datas[j], y: (c / c0 - 1) * 100 });
    }
    return {
      label: label,
      data: pts,
      borderColor: color,
      backgroundColor: color + '14',
      borderWidth: isBenchmark ? 1.4 : 2,
      borderDash: isBenchmark ? [6, 4] : [],
      pointRadius: 0,
      pointHitRadius: 6,
      tension: 0.18,
      fill: false,
    };
  }

  /* Calcula a data inicial da janela considerando o INÍCIO COMUM das
     séries (max das datas[0]) e o fim global (min das datas finais). */
  function computeWindowStart(commonStart, commonEnd, w) {
    if (w === 'all') return commonStart;
    var end = new Date(commonEnd);
    var start;
    if (w === 'ytd') {
      start = new Date(end.getFullYear(), 0, 1);
    } else if (w === '24m') {
      start = new Date(end.getFullYear() - 2, end.getMonth(), end.getDate());
    } else { // 12m default
      start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    }
    var startStr = start.toISOString().slice(0, 10);
    // não pode ir antes do início comum a todas as séries
    return startStr > commonStart ? startStr : commonStart;
  }

  /* -------- Chart.js ---------------------------- */
  function renderChart() {
    var canvas = document.getElementById('cmpChart');
    var emptyEl = document.getElementById('cmpEmpty');
    if (!canvas) return;

    // 1) Coleta TODAS as séries que vão ao gráfico (fundos + benchmarks)
    var raw = [];
    selecionados.forEach(function (s) {
      var src = DADOS.fundos[s.cnpj];
      if (src && src.datas && src.cotas)
        raw.push({ src: src, color: s.color, label: s.nome, isBenchmark: false });
    });
    if (benchCdi  && DADOS.benchmarks && DADOS.benchmarks.cdi)
      raw.push({ src: DADOS.benchmarks.cdi, color: COLOR_CDI, label: 'CDI', isBenchmark: true });
    if (benchIbov && DADOS.benchmarks && DADOS.benchmarks.ibov)
      raw.push({ src: DADOS.benchmarks.ibov, color: COLOR_IBOV, label: 'Ibovespa', isBenchmark: true });

    if (!raw.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      canvas.style.display = 'none';
      if (chart) { chart.destroy(); chart = null; }
      return;
    }

    // 2) Calcula início COMUM (max das datas[0]) e fim COMUM (min das datas[-1])
    var commonStart = '0000-00-00';
    var commonEnd   = '9999-99-99';
    raw.forEach(function (r) {
      var first = r.src.datas[0];
      var last  = r.src.datas[r.src.datas.length - 1];
      if (first > commonStart) commonStart = first;
      if (last  < commonEnd)   commonEnd   = last;
    });

    // 3) Aplica a janela a partir do commonStart/commonEnd
    var startDate = computeWindowStart(commonStart, commonEnd, window_);

    // 4) Constrói os datasets com startDate global (todos começam juntos)
    var datasets = [];
    raw.forEach(function (r) {
      var d = buildSeries(r.src, r.color, r.label, r.isBenchmark, startDate);
      if (d) datasets.push(d);
    });

    var hasData = datasets.length > 0 && datasets.some(function (s) { return s.data && s.data.length; });
    if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'block';
    canvas.style.display = hasData ? '' : 'none';
    if (!hasData) { if (chart) { chart.destroy(); chart = null; } return; }

    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 280 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 8, boxHeight: 8, usePointStyle: true,
              pointStyle: 'circle',
              font: { family: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', size: 11 },
              color: '#1D1D1F',
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(28,28,30,0.92)',
            padding: 12, cornerRadius: 10,
            titleColor: '#fff', bodyColor: '#fff',
            titleFont: { size: 11, weight: '500' },
            bodyFont: { size: 12 },
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed.y;
                var sign = v >= 0 ? '+' : '';
                return ctx.dataset.label + ': ' + sign + v.toFixed(2).replace('.', ',') + '%';
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: pickTimeUnit(window_), tooltipFormat: 'dd/MM/yyyy', displayFormats: {
              day: 'dd/MM', month: 'MMM/yy', year: 'yyyy' } },
            grid: { display: false },
            ticks: { color: '#86868B', font: { size: 10 } },
            border: { color: 'rgba(0,0,0,0.08)' },
          },
          y: {
            ticks: {
              color: '#86868B',
              font: { size: 10 },
              callback: function (v) {
                var sign = v > 0 ? '+' : '';
                return sign + v.toFixed(0) + '%';
              },
            },
            grid: { color: 'rgba(0,0,0,0.05)', borderDash: [3, 3] },
            border: { display: false },
          },
        },
      },
    });
  }

  function pickTimeUnit(w) {
    if (w === 'ytd') return 'month';
    if (w === '24m' || w === 'all') return 'month';
    return 'month';
  }

  /* -------- matriz de correlação ---------------- */
  /* Calcula a data inicial da janela baseada SOMENTE no fim comum
     (mínimo dos últimos dias) e no tamanho da janela — sem clipe pelo
     commonStart de outras séries. Importante: usar commonStart aqui
     contamina toda a matriz quando algum fundo selecionado é novo
     (ex.: A1 D30 com 6 meses força todo o resto a usar só 6 meses). */
  function windowStartFromEnd(commonEnd, w) {
    if (w === 'all') return '0000-00-00';
    var end = new Date(commonEnd);
    var start;
    if (w === 'ytd')      start = new Date(end.getFullYear(),     0,               1);
    else if (w === '24m') start = new Date(end.getFullYear() - 2, end.getMonth(),  end.getDate());
    else /* 12m */        start = new Date(end.getFullYear() - 1, end.getMonth(),  end.getDate());
    return start.toISOString().slice(0, 10);
  }

  /* Mínimo de DIAS ÚTEIS de overlap por par pra correlação ser
     "confiável" (~60% dos dias úteis da janela; 1 mês ≈ 21 du).
     Abaixo do limiar a célula vira "weak" (opacidade reduzida + tooltip). */
  function minPtsForWindow(w) {
    if (w === '24m') return 300;   // ~504 du * 0.6
    if (w === 'ytd') return 30;    // YTD pode ser curto
    if (w === 'all') return 100;
    return 150;                    // 12m default: ~252 du * 0.6
  }

  /* Retornos DIÁRIOS — (cota_t / cota_{t-1}) - 1 — dentro da janela
     atual (>= startDate). Retorna {YYYY-MM-DD: ret}.
     Metodologia "MaisRetorno": variação % diária do preço, não a cota
     acumulada. Muito mais observações → correlação estatisticamente
     mais robusta e sensível ao padrão de movimento.
     A "cota anterior" do primeiro retorno DENTRO da janela pode vir
     de antes do startDate (correto: queremos o retorno do 1º dia da
     janela em relação ao último dia antes dela). */
  function computeDailyReturns(src, startDate) {
    if (!src || !src.datas || !src.cotas) return {};
    var rets = {};
    var prevC = null;
    for (var i = 0; i < src.datas.length; i++) {
      var d = src.datas[i];
      var c = src.cotas[i];
      if (c == null || isNaN(c) || c <= 0) { prevC = null; continue; }
      if (d >= startDate && prevC != null && prevC > 0) {
        rets[d] = c / prevC - 1;
      }
      prevC = c;
    }
    return rets;
  }

  function pearson(x, y) {
    var n = x.length;
    if (n < 3 || n !== y.length) return null;
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      sx += x[i]; sy += y[i];
      sxx += x[i] * x[i]; syy += y[i] * y[i];
      sxy += x[i] * y[i];
    }
    var num = n * sxy - sx * sy;
    var den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!isFinite(den) || den === 0) return null;
    return num / den;
  }

  function corrColor(r) {
    var isDark = document.body.classList.contains('theme-dark');
    if (r == null) return isDark ? '#1c1c1e' : '#FAFAFA';
    var a = Math.min(1, Math.abs(r));
    var alpha = (0.18 + 0.7 * a).toFixed(3);
    // Dark: verde (positivo) / laranja IPB (negativo).
    // Light: azul (positivo) / vermelho (negativo) — mantém legado.
    if (isDark) {
      if (r >= 0) return 'rgba(48,209,88,' + alpha + ')';
      return 'rgba(255,55,95,' + alpha + ')';
    }
    if (r >= 0) return 'rgba(0,113,227,' + alpha + ')';
    return 'rgba(255,59,48,' + alpha + ')';
  }
  function corrTextColor(r) {
    var isDark = document.body.classList.contains('theme-dark');
    if (r == null) return '#86868B';
    if (isDark) return Math.abs(r) > 0.55 ? '#0a0a0a' : '#f5f5f7';
    return Math.abs(r) > 0.55 ? '#fff' : '#1D1D1F';
  }
  function fmtCorr(r) {
    if (r == null) return '—';
    return (r >= 0 ? '+' : '') + r.toFixed(2).replace('.', ',');
  }

  function renderCorrelation() {
    var wrap = document.getElementById('cmpCorrWrap');
    var grid = document.getElementById('cmpCorrGrid');
    if (!wrap || !grid) return;
    var n = selecionados.length;

    if (n < 2) { wrap.style.display = 'none'; return; }

    // 1) startDate: SOMENTE do fim comum (não clipe pelo commonStart de
    //    nenhum fundo individual — assim um fundo novo na seleção não
    //    encolhe a janela do resto). Cada fundo pega o que tem dentro
    //    dessa janela; pares com pouca overlap viram "weak" abaixo.
    var commonEnd = '9999-99-99';
    selecionados.forEach(function (s) {
      var src = DADOS.fundos[s.cnpj];
      if (!src) return;
      var last = src.datas[src.datas.length - 1];
      if (last < commonEnd) commonEnd = last;
    });
    var startDate = windowStartFromEnd(commonEnd, window_);
    var minPts = minPtsForWindow(window_);

    // 2) retornos DIÁRIOS por fundo (cada um na janela inteira)
    var daily = selecionados.map(function (s) {
      return computeDailyReturns(DADOS.fundos[s.cnpj], startDate);
    });

    // 3) matriz NxN + matriz de contagem de overlap por par (nObs em dias)
    var matrix = [];
    var nObs = [];
    for (var i = 0; i < n; i++) {
      matrix[i] = []; nObs[i] = [];
      for (var j = 0; j < n; j++) {
        if (i === j) { matrix[i][j] = 1; nObs[i][j] = null; continue; }
        if (i > j)   { matrix[i][j] = matrix[j][i]; nObs[i][j] = nObs[j][i]; continue; }
        // pairwise complete: interseção de dias do par (i, j)
        var x = [], y = [];
        var keys = Object.keys(daily[i]);
        keys.forEach(function (d) {
          if (daily[j][d] != null) {
            x.push(daily[i][d]); y.push(daily[j][d]);
          }
        });
        nObs[i][j]   = x.length;
        matrix[i][j] = pearson(x, y);
      }
    }

    // 4) renderiza grid CSS
    var labelCol = '180px';
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = labelCol + ' repeat(' + n + ', minmax(0, 1fr))';

    // header row: corner + col labels
    var corner = document.createElement('div');
    corner.className = 'cmp-corr-corner';
    grid.appendChild(corner);
    selecionados.forEach(function (s) {
      var lab = document.createElement('div');
      lab.className = 'cmp-corr-col-label';
      lab.title = s.nome;
      lab.innerHTML = '<span class="cmp-color-dot" style="background:' + s.color + ';margin-right:4px"></span>' +
                      truncate(s.nome, 18);
      grid.appendChild(lab);
    });
    // data rows
    for (var i2 = 0; i2 < n; i2++) {
      var sRow = selecionados[i2];
      var rowLab = document.createElement('div');
      rowLab.className = 'cmp-corr-row-label';
      rowLab.title = sRow.nome;
      rowLab.innerHTML = '<span class="cmp-color-dot" style="background:' + sRow.color + '"></span>' +
                         '<span style="overflow:hidden;text-overflow:ellipsis">' + escHtml(truncate(sRow.nome, 24)) + '</span>';
      grid.appendChild(rowLab);
      for (var j2 = 0; j2 < n; j2++) {
        var cell = document.createElement('div');
        var r    = matrix[i2][j2];
        var nOv  = nObs[i2][j2];
        if (i2 === j2) {
          cell.className = 'cmp-corr-cell diag';
          cell.textContent = '1,00';
        } else if (r == null) {
          cell.className = 'cmp-corr-cell empty';
          cell.textContent = '—';
          cell.title = 'Histórico em comum insuficiente'
                     + (nOv != null ? ' (n=' + nOv + ')' : '');
        } else {
          // overlap < minPts → valor "fraco": exibe normalmente mas com
          // opacidade reduzida e tooltip avisando que a amostra é pequena.
          var weak = (nOv != null && nOv < minPts);
          cell.className = 'cmp-corr-cell' + (weak ? ' is-weak' : '');
          cell.style.background = corrColor(r);
          cell.style.color = corrTextColor(r);
          if (weak) cell.style.opacity = '0.55';
          cell.textContent = fmtCorr(r);
          cell.title = sRow.nome + ' × ' + selecionados[j2].nome + ': '
                     + fmtCorr(r)
                     + '  (n=' + nOv + (weak ? ', amostra pequena' : '') + ')';
        }
        grid.appendChild(cell);
      }
    }
    wrap.style.display = '';
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* -------- tabela de retornos ------------------ */
  function renderTable() {
    var tbody = document.getElementById('cmpTableBody');
    var wrapper = document.getElementById('cmpTableWrap');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!selecionados.length) {
      if (wrapper) wrapper.style.display = 'none';
      return;
    }
    if (wrapper) wrapper.style.display = '';

    selecionados.forEach(function (s) {
      var f = DADOS.fundos[s.cnpj];
      if (!f || !f.retornos) return;
      var ret = f.retornos;
      var isEq = ret.is_equity;
      var benchKeyPrefix = isEq ? 'vsibov_' : 'pctcdi_';
      var benchSuffix = isEq ? 'pp' : '%';

      function pill(pct) {
        if (pct == null || isNaN(pct)) return '';
        var cls = 'ap-cdi-pill';
        if (isEq) {
          if (pct > 0) cls += ' high'; else if (pct < 0) cls += ' low';
          var sign = pct > 0 ? '+' : '';
          return '<span class="' + cls + '">' + sign + pct.toFixed(1).replace('.', ',') + 'pp</span>';
        }
        if (pct >= 100) cls += ' high';
        return '<span class="' + cls + '">' + Math.round(pct) + '%</span>';
      }
      // Labels dinâmicos por período (Mai/26, Abr/26, 2026, 12 meses, 24 meses)
      // emitidos como <span class="ap-num-period"> pra serem cabeçalho
      // do pill no card mobile (escondido em desktop via CSS).
      var L = (DADOS && DADOS.labels) || {};
      function periodSpan(key) {
        var lbl = L[key];
        return lbl ? '<span class="ap-num-period">' + escHtml(lbl) + '</span>' : '';
      }
      function numCell(v, key) {
        if (v == null || isNaN(v)) {
          return '<td class="ap-num-cell">' + periodSpan(key) + '<span class="ap-num">—</span></td>';
        }
        var sign = v >= 0 ? '+' : '';
        var cl = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
        var benchVal = ret[benchKeyPrefix + key];
        return '<td class="ap-num-cell" data-sort="' + v.toFixed(4) + '">' +
               periodSpan(key) +
               '<span class="ap-num ' + cl + '">' + sign + v.toFixed(2).replace('.', ',') + '%</span>' +
               pill(benchVal) +
               '</td>';
      }

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="ap-fund-cell">' +
          '<div class="ap-fund-name-row">' +
            '<span class="cmp-color-dot" style="background:' + s.color + '"></span>' +
            '<span class="ap-fund-name">' + escHtml(f.nome) + '</span>' +
          '</div>' +
          '<div class="ap-fund-cnpj">' + escHtml(s.cnpj) + '</div>' +
          '<div class="ap-fund-meta"><span class="ap-fund-prazo">' + escHtml(f.classe) + '</span></div>' +
        '</td>' +
        numCell(ret.ret_mes,  'mes') +
        numCell(ret.ret_pmes, 'pmes') +
        numCell(ret.ret_ytd,  'ytd') +
        numCell(ret.ret_12m,  '12m') +
        numCell(ret.ret_24m,  '24m') +
        '<td class="ap-muted">' + (f.pl_fmt || '—') + '</td>';
      tbody.appendChild(tr);
    });
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
