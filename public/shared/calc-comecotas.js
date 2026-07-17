/* ============================================================
   calc-comecotas.js — Come-cotas: fundo tradicional × previdência

   Compara um fundo aberto tributável (que sofre come-cotas semestral)
   com a previdência (PGBL/VGBL — sem come-cotas, IR só no resgate).

   Modelo (mensal; come-cotas a cada 6 meses):
     • COM come-cotas: a cada semestre, IR (15% longo / 20% curto prazo)
       incide sobre o ganho do período, reduzindo o saldo (cotas).
       No resgate, IR complementar sobre o ganho residual.
     • SEM come-cotas (fundo): cresce bruto; IR só no resgate, na mesma
       alíquota — isola o efeito do come-cotas.
     • Previdência: cresce bruto, sem come-cotas; IR no resgate pela
       regressiva. Paga IOF de 5% sobre a parcela do APORTE INICIAL
       acima de R$ 600 mil (cálculo "por dentro": alocado + IOF = aporte),
       então entra no gráfico/tabela já com o IOF descontado. O fundo
       não paga IOF. O ponto em que a previdência ultrapassa o fundo
       mostra em quanto tempo o IOF se paga.
   ============================================================ */
(function () {
  'use strict';

  var IOF_RATE = 0.05;       // 5% sobre o excedente
  var IOF_FAIXA = 600000;    // isenção até R$ 600 mil

  function parseBR(v) {
    if (v == null) return 0;
    var s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function brl(v) {
    if (!isFinite(v)) v = 0;
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function $(id) { return document.getElementById(id); }
  var els = {};

  /* IOF por dentro (gross-up). Retorna {alocado, iof}. */
  function calcIOF(pv) {
    if (pv <= IOF_FAIXA) return { alocado: pv, iof: 0 };
    var alocado = (pv + IOF_FAIXA * IOF_RATE) / (1 + IOF_RATE);
    return { alocado: alocado, iof: pv - alocado };
  }

  /* Formata número de meses em "X anos e Y meses". */
  function fmtPrazo(meses) {
    if (meses == null) return null;
    var a = Math.floor(meses / 12), m = meses % 12;
    var pa = a + (a === 1 ? ' ano' : ' anos');
    var pm = m + (m === 1 ? ' mês' : ' meses');
    if (a === 0) return pm;
    if (m === 0) return pa;
    return pa + ' e ' + pm;
  }

  var _last = { iof: 0, paybackMes: null, paybackTxt: null }; // p/ PDF

  function simular() {
    var pv = parseBR(els.pv.value);
    var pmt = parseBR(els.pmt.value);
    var aBruta = parseBR(els.rent.value) / 100;          // % a.a. bruta
    var anos = Math.round(parseBR(els.anos.value));
    var rCC = parseFloat(els.tipoFundo.value);            // come-cotas: 0.15 ou 0.20
    var rPrev = parseFloat(els.aliqPrev.value);           // regressiva final previdência

    var i = Math.pow(1 + aBruta, 1 / 12) - 1;
    var N = anos * 12;

    if (N <= 0 || (pv <= 0 && pmt <= 0)) {
      resetOut();
      return;
    }

    // ── IOF sobre o aporte inicial (só previdência) ──
    var iofInfo = calcIOF(pv);
    var iof = iofInfo.iof;
    var pvPrev = iofInfo.alocado;   // previdência entra já com o IOF descontado

    // ── COM come-cotas (fundo tradicional) ──
    var saldoCC = pv, basis = pv, aportado = pv, ccPago = 0;
    // ── SEM come-cotas (fundo hipotético) — bruto, aporte cheio ──
    var saldoSem = pv;
    // ── Previdência — bruto, sem come-cotas, começa no valor com IOF ──
    var saldoPrev = pvPrev, aportadoPrev = pvPrev;

    var serie = []; // anual: {ano, saldoCC, saldoPrev, ccAcum}
    var mLabels = ['0'], mCC = [pv], mPrev = [pvPrev];
    var paybackMes = null;

    for (var m = 1; m <= N; m++) {
      saldoCC = saldoCC * (1 + i) + pmt;
      basis += pmt;
      aportado += pmt;
      saldoSem = saldoSem * (1 + i) + pmt;
      saldoPrev = saldoPrev * (1 + i) + pmt;
      aportadoPrev += pmt;

      if (m % 6 === 0) {
        var ganho = saldoCC - basis;
        if (ganho > 0) {
          var imp = ganho * rCC;
          saldoCC -= imp;
          ccPago += imp;
          basis = saldoCC;
        }
      }

      if (paybackMes == null && iof > 0 && saldoPrev >= saldoCC) paybackMes = m;

      mLabels.push((m % 12 === 0) ? ('A' + (m / 12)) : '');
      mCC.push(saldoCC); mPrev.push(saldoPrev);

      if (m % 12 === 0 || m === N) {
        serie.push({ ano: Math.ceil(m / 12), saldoCC: saldoCC, saldoPrev: saldoPrev, ccAcum: ccPago });
      }
    }
    var paybackTxt = fmtPrazo(paybackMes);

    // ── Resgate final (líquido) ──
    var ganhoResidCC = Math.max(saldoCC - basis, 0);
    var liqCC = saldoCC - ganhoResidCC * rCC;             // fundo tradicional (líquido)

    var ganhoSem = Math.max(saldoSem - aportado, 0);
    var liqSem = saldoSem - ganhoSem * rCC;               // fundo SEM come-cotas (líquido)

    var ganhoPrev = Math.max(saldoPrev - aportadoPrev, 0);
    var liqPrev = saldoPrev - ganhoPrev * rPrev;          // previdência (líquido, já com IOF)

    var custoCC = liqSem - liqCC;
    var vantPrev = liqPrev - liqCC;

    // ── Saída ──
    els.liqCC.textContent = brl(liqCC);
    els.liqSem.textContent = brl(liqSem);
    els.liqPrev.textContent = brl(liqPrev);
    els.aportado.textContent = brl(aportado);
    els.ccPago.textContent = brl(ccPago);
    els.custoCC.textContent = brl(custoCC);
    els.vantPrev.textContent = brl(vantPrev);

    els.destVal.textContent = brl(vantPrev);
    var pctVant = liqCC > 0 ? (vantPrev / liqCC * 100) : 0;
    var baseSub;
    if (vantPrev >= 0) {
      baseSub = 'A previdência entrega ' +
        pctVant.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
        '% a mais que o fundo tradicional, ao final de ' + anos + ' anos';
    } else {
      baseSub = 'Ao final de ' + anos + ' anos a previdência fica ' +
        Math.abs(pctVant).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
        '% atrás';
    }
    if (iof > 0) {
      baseSub += ' · IOF de ' + brl(iof) + ' no aporte' +
        (paybackTxt ? ' se paga em ' + paybackTxt + '.' : ' não se paga em ' + anos + ' anos.');
    } else {
      baseSub += '.';
    }
    els.destSub.textContent = baseSub;

    renderChart(mLabels, mCC, mPrev, iof > 0, paybackMes);

    // tabela ano a ano (fundo com come-cotas × previdência com IOF)
    var pbAno = (paybackMes != null) ? Math.ceil(paybackMes / 12) : null;
    els.tbody.innerHTML = serie.map(function (r) {
      var diff = r.saldoPrev - r.saldoCC;
      var hit = (pbAno != null && r.ano === pbAno);
      return '<tr' + (hit ? ' style="background:rgba(10,125,46,0.08);font-weight:600"' : '') + '>' +
        '<td class="left">Ano ' + r.ano + (hit ? ' ✓' : '') + '</td>' +
        '<td>' + brl(r.saldoCC) + '</td>' +
        '<td>' + brl(r.saldoPrev) + '</td>' +
        '<td><span class="' + (diff >= 0 ? 'pos' : 'neg') + '">' + brl(diff) + '</span></td>' +
        '<td>' + brl(r.ccAcum) + '</td></tr>';
    }).join('');

    _last = { iof: iof, paybackMes: paybackMes, paybackTxt: paybackTxt };
  }

  // marcador vertical pontilhado no mês de payback
  var paybackMarker = {
    id: 'paybackMarker',
    afterDraw: function (chart) {
      var mes = chart.options.plugins && chart.options.plugins.annotationLine;
      if (mes == null) return;
      var x = chart.scales.x.getPixelForValue(mes);
      var top = chart.chartArea.top, bot = chart.chartArea.bottom;
      var ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = document.body.classList.contains('theme-dark') ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)';
      ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      ctx.restore();
    }
  };

  var _chart = null;
  function renderChart(labels, serieCC, seriePrev, comIOF, paybackMes) {
    var cv = document.getElementById('cmc-chart');
    if (!cv || typeof Chart === 'undefined') return;
    var dark = document.body.classList.contains('theme-dark');
    var grid = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    var tx = dark ? '#aeaeb2' : '#6e6e73';
    var colPrev = dark ? '#30d158' : '#0a7d2e';
    var colCC = dark ? '#ff9f0a' : '#b8590e';
    var ds = [
      { label: 'Previdência' + (comIOF ? ' (com IOF)' : ' (sem come-cotas)'), data: seriePrev, borderColor: colPrev,
        backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.12 },
      { label: 'Fundo (com come-cotas)', data: serieCC, borderColor: colCC,
        backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0 }
    ];
    if (_chart) { _chart.destroy(); _chart = null; }
    var opts = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end',
          labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle',
            color: dark ? '#f5f5f7' : '#1d1d1f', font: { size: 12 } } },
        tooltip: { callbacks: { label: function (c) {
          return c.dataset.label + ': ' + brl(c.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tx, font: { size: 10 },
          autoSkip: false, callback: function (v) { var l = this.getLabelForValue(v); return l ? l.replace('A', 'Ano ') : ''; } } },
        y: { grid: { color: grid }, border: { display: false },
          ticks: { color: tx, font: { size: 10 }, callback: function (v) {
            if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + 'M';
            if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'k';
            return 'R$ ' + v; } } }
      }
    };
    if (comIOF && paybackMes != null) opts.plugins.annotationLine = paybackMes;
    _chart = new Chart(cv.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: ds },
      options: opts,
      plugins: [paybackMarker]
    });
  }

  function resetOut() {
    if (_chart) { _chart.destroy(); _chart = null; }
    ['liqCC', 'liqSem', 'liqPrev', 'aportado', 'ccPago', 'custoCC', 'vantPrev'].forEach(function (k) {
      els[k].textContent = '—';
    });
    els.destVal.textContent = 'R$ 0,00';
    els.destSub.textContent = 'Preencha os campos acima para comparar.';
    els.tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--private-muted2)">Preencha os dados acima.</td></tr>';
    _last = { iof: 0, paybackMes: null, paybackTxt: null };
  }

  function gerarPDF() {
    var anos = Math.round(parseBR(els.anos.value));
    var premissas = [
      { lbl: 'Aporte inicial', val: brl(parseBR(els.pv.value)) },
      { lbl: 'Aporte mensal', val: brl(parseBR(els.pmt.value)) },
      { lbl: 'Rentabilidade', val: els.rent.value + '% a.a.' },
      { lbl: 'Prazo', val: anos + ' anos' },
      { lbl: 'Come-cotas', val: (parseFloat(els.tipoFundo.value) * 100) + '%' },
      { lbl: 'IR previdência', val: (parseFloat(els.aliqPrev.value) * 100) + '%' }
    ];
    var resultado = [
      { lbl: 'Fundo (com come-cotas)', val: els.liqCC.textContent, col: 'neg' },
      { lbl: 'Fundo sem come-cotas', val: els.liqSem.textContent },
      { lbl: 'Previdência', val: els.liqPrev.textContent, col: 'pos' },
      { lbl: 'Total aportado', val: els.aportado.textContent },
      { lbl: 'Come-cotas pago', val: els.ccPago.textContent, col: 'neg' },
      { lbl: 'Custo do come-cotas', val: els.custoCC.textContent, col: 'neg' }
    ];
    var destSub = 'vs. fundo tradicional';
    if (_last.iof > 0) {
      premissas.push({ lbl: 'IOF pago (aporte inicial)', val: brl(_last.iof) });
      resultado.push({ lbl: 'IOF pago (aporte inicial)', val: brl(_last.iof), col: 'neg' });
      resultado.push({ lbl: 'Payback do IOF', val: _last.paybackTxt || ('> ' + anos + ' anos'), col: 'blu' });
      destSub = _last.paybackTxt ? 'IOF se paga em ' + _last.paybackTxt : 'IOF não se paga em ' + anos + ' anos';
    }
    gerarPDFCalc({
      titulo: 'Come-cotas: Fundo × Previdência',
      subtitulo: 'Efeito da antecipação semestral de IR' + (_last.iof > 0 ? ' · IOF no aporte' : ''),
      tituloPremissas: 'Premissas',
      premissas: premissas,
      destaque: { label: 'Vantagem da previdência', val: els.vantPrev.textContent, sub: destSub },
      tituloResultado: 'Líquido no resgate',
      resultado: resultado,
      tabela: {
        titulo: 'Evolução do saldo',
        thead: ['Período', 'Saldo com come-cotas', 'Saldo previdência (com IOF)', 'Diferença', 'Come-cotas acum.'],
        rows: Array.prototype.map.call(els.tbody.querySelectorAll('tr'), function (tr) {
          return Array.prototype.map.call(tr.querySelectorAll('td'), function (td) { return td.textContent; });
        })
      },
      discWarn: true
    });
  }

  function init() {
    els = {
      pv: $('cmc-pv'), pmt: $('cmc-pmt'), rent: $('cmc-rent'),
      anos: $('cmc-anos'), tipoFundo: $('cmc-tipo'), aliqPrev: $('cmc-aliq-prev'),
      liqCC: $('cmc-liq-cc'), liqSem: $('cmc-liq-sem'), liqPrev: $('cmc-liq-prev'),
      aportado: $('cmc-aportado'), ccPago: $('cmc-cc-pago'),
      custoCC: $('cmc-custo'), vantPrev: $('cmc-vant'),
      destVal: $('cmc-dest-val'), destSub: $('cmc-dest-sub'),
      tbody: $('cmc-tbody'),
      rentShow: $('cmc-rent-show')
    };
    if (!els.pv) return;
    if (typeof instalarFormatacao === 'function') instalarFormatacao(document);
    ['pv', 'pmt', 'rent', 'anos'].forEach(function (k) {
      els[k].addEventListener('input', simular);
    });
    [els.tipoFundo, els.aliqPrev].forEach(function (s) { s.addEventListener('change', simular); });
    var clear = $('cmc-clear');
    if (clear) clear.addEventListener('click', function () {
      if (typeof limparCalculadora === 'function') limparCalculadora(simular); else simular();
    });
    var pdf = $('cmc-pdf-btn');
    if (pdf) pdf.addEventListener('click', gerarPDF);
    simular();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
