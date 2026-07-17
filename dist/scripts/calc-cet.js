/* ──────────────────────────────────────────────────────────────────────────
   calc-cet.js — Custo Efetivo Total
   ──────────────────────────────────────────────────────────────────────────
   Dado um financiamento (valor liberado, número de parcelas, valor de cada
   parcela), encontra a taxa de juros mensal embutida.

   Modelo: PV = PMT × [1 - (1+i)^-n] / i  (fórmula de PV de annuity)
   Resolve `i` numericamente via bisseção (sem fórmula fechada).
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function parseNum(s) {
    if (s == null) return 0;
    s = String(s).trim();
    if (!s) return 0;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fBRL(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function fPct(v, dec) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v * 100).toFixed(dec == null ? 2 : dec).replace('.', ',') + '%';
  }

  // ── BISSEÇÃO: encontra i tal que PMT × [1 - (1+i)^-n] / i = PV ───────
  // f(i) = PMT × annuity_factor(i, n) - PV
  // f(0+) ≈ PMT × n - PV   (limite quando i→0)
  // f(grande) → 0 - PV     (annuity_factor tende a 0 quando i grande)
  // f é monotonicamente DECRESCENTE em i, então tem 1 raiz se f(0)·f(big) < 0.
  function calcularTaxaCET(pv, pmt, n) {
    if (pv <= 0 || pmt <= 0 || n <= 0) return null;
    // Se total pago ≤ valor liberado → sem juros (ou subsídio, fora do escopo)
    if (pmt * n <= pv + 1e-6) return 0;

    function fatorAnuidade(i, n) {
      if (Math.abs(i) < 1e-12) return n;   // limite
      return (1 - Math.pow(1 + i, -n)) / i;
    }
    function f(i) { return pmt * fatorAnuidade(i, n) - pv; }

    // f(0) > 0 (porque pmt*n > pv), f(hi) < 0 quando hi for grande
    var lo = 0, hi = 1.0;     // hi inicial = 100% ao mês
    while (f(hi) > 0 && hi < 1e6) hi *= 2;
    if (f(hi) > 0) return null;  // não converge — caso extremo

    for (var iter = 0; iter < 200; iter++) {
      var mid = (lo + hi) / 2;
      var fm = f(mid);
      if (Math.abs(fm) < 1e-12 || (hi - lo) < 1e-14) return mid;
      if (fm > 0) lo = mid;
      else        hi = mid;
    }
    return (lo + hi) / 2;
  }

  function recalcular() {
    var pv  = parseNum($('cet-pv').value);
    var n   = parseInt($('cet-n').value, 10) || 0;
    var pmt = parseNum($('cet-pmt').value);

    if (pv <= 0 || n <= 0 || pmt <= 0) {
      $('cet-anual-val').textContent = '— a.a.';
      $('cet-anual-sub').textContent = 'Preencha os campos acima para calcular.';
      ['cet-mensal-val','cet-total-val','cet-juros-val','cet-pct-val'].forEach(function(id){
        $(id).textContent = '—';
      });
      return;
    }

    var i_mes = calcularTaxaCET(pv, pmt, n);
    if (i_mes === null) {
      $('cet-anual-val').textContent = 'Não converge';
      $('cet-anual-sub').textContent = 'Confira os valores — talvez a parcela esteja inviável.';
      return;
    }

    var i_aa    = Math.pow(1 + i_mes, 12) - 1;
    var total   = pmt * n;
    var juros   = total - pv;
    var pct     = juros / pv;

    $('cet-anual-val').textContent = fPct(i_aa, 2) + ' a.a.';
    if (i_mes === 0) {
      $('cet-anual-sub').textContent = 'Sem juros — total pago igual ao valor liberado.';
    } else {
      $('cet-anual-sub').textContent =
        n + ' parcelas de ' + fBRL(pmt) + ' sobre ' + fBRL(pv) + ' liberados.';
    }

    $('cet-mensal-val').textContent = fPct(i_mes, 3) + ' a.m.';
    $('cet-total-val').textContent  = fBRL(total);
    $('cet-juros-val').textContent  = fBRL(juros);
    $('cet-pct-val').textContent    = fPct(pct, 1) + ' do valor';
  }

  // ── EVENTOS ────────────────────────────────────────────────────────
  function bind(id, isMonetario) {
    var el = $(id); if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('blur', function () {
      var v = parseNum(el.value);
      if (v > 0) {
        el.value = isMonetario
          ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(Math.round(v));
      }
    });
  }
  bind('cet-pv',  true);
  bind('cet-n',   false);
  bind('cet-pmt', true);

  var btnClear = $('cet-clear');
  if (btnClear) btnClear.addEventListener('click', function () {
    ['cet-pv','cet-n','cet-pmt'].forEach(function (id) { $(id).value = ''; });
    recalcular();
  });

  // ── PDF ────────────────────────────────────────────────────────────
  function gerarPDF() {
    var get  = function (id) { return $(id).value || '—'; };
    var getT = function (id) { return ($(id).textContent || '').trim(); };

    gerarPDFCalc({
      titulo:    'CET — Custo Efetivo Total',
      subtitulo: 'Bisseção sobre PV = PMT × [1-(1+i)^-n] / i',
      tituloPremissas: 'Dados do financiamento',
      premissas: [
        { lbl: 'Valor financiado',  val: 'R$ ' + get('cet-pv') },
        { lbl: 'Parcelas',          val: get('cet-n') + ' meses' },
        { lbl: 'Valor da parcela',  val: 'R$ ' + get('cet-pmt') },
      ],
      destaque: {
        label: 'CET — Custo Efetivo Total',
        val:   getT('cet-anual-val'),
        sub:   getT('cet-anual-sub'),
      },
      tituloResultado: 'Detalhamento',
      resultado: [
        { lbl: 'CET mensal',     val: getT('cet-mensal-val'), col: 'blu' },
        { lbl: 'Total pago',     val: getT('cet-total-val') },
        { lbl: 'Juros pagos',    val: getT('cet-juros-val'), col: 'neg' },
        { lbl: '% sobre o valor',val: getT('cet-pct-val'),   col: 'neg' },
      ],
      discIR:   '<strong>Como usar:</strong> compare o CET anual com o rendimento líquido ' +
                'de uma aplicação. Se o CET for menor que o que sua aplicação rende, vale ' +
                'a pena tomar o crédito e manter o capital investido.',
      discWarn: true,
    });
  }
  var btnPDF = $('cet-pdf-btn');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);

  recalcular();
})();
