/* ============================================================
   calc-valorfuturo.js — Calculadora de Valor Futuro

   Quanto terei no futuro a partir de:
     • Valor que tenho hoje (PV)
     • Aporte mensal (PMT)
     • Taxa de juros (a.a. ou a.m.)
     • Quantidade de aportes / meses (n)

   FV = PV·(1+i)^n + PMT·[((1+i)^n − 1) / i]   (aporte no fim do mês)
   ============================================================ */
(function () {
  'use strict';

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
  function pct(v) {
    return (v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  var els = {};
  function $(id) { return document.getElementById(id); }

  function taxaMensal() {
    var base = parseBR(els.taxa.value) / 100;
    var modo = els.taxaModo.value; // 'aa' | 'am'
    if (modo === 'am') return base;
    return Math.pow(1 + base, 1 / 12) - 1; // converte a.a. → a.m. (juro composto)
  }

  function calcular() {
    var pv = parseBR(els.pv.value);
    var pmt = parseBR(els.pmt.value);
    var i = taxaMensal();
    var n = Math.round(parseBR(els.n.value));

    if (n <= 0) {
      els.fvVal.textContent = brl(0);
      els.fvSub.textContent = 'Informe a quantidade de meses para calcular.';
      els.aportado.textContent = '—';
      els.rendimento.textContent = '—';
      els.totalPv.textContent = '—';
      els.taxaMesShow.textContent = pct(i * 100);
      els.tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--private-muted2)">Preencha os dados acima.</td></tr>';
      return;
    }

    var fator = Math.pow(1 + i, n);
    var fvPv = pv * fator;
    var fvPmt = i === 0 ? pmt * n : pmt * (fator - 1) / i;
    var fv = fvPv + fvPmt;

    var totalAportado = pv + pmt * n;
    var rendimento = fv - totalAportado;

    els.fvVal.textContent = brl(fv);
    var anos = (n / 12);
    els.fvSub.textContent = 'Em ' + n + ' meses (' +
      anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' anos) · juro de ' +
      pct(i * 100) + ' ao mês';
    els.aportado.textContent = brl(totalAportado);
    els.rendimento.textContent = brl(rendimento);
    els.totalPv.textContent = brl(pv);
    els.taxaMesShow.textContent = pct(i * 100);

    renderTabela(pv, pmt, i, n);
  }

  function renderTabela(pv, pmt, i, n) {
    // Linhas anuais (a cada 12 meses) + última linha parcial.
    var rows = [];
    var saldo = pv;
    var aportadoAcc = pv;
    var marcos = [];
    for (var m = 12; m <= n; m += 12) marcos.push(m);
    if (marcos[marcos.length - 1] !== n) marcos.push(n);

    var prevM = 0;
    var saldoFim = pv;
    // simula mês a mês p/ precisão e marca nos marcos
    var aportadoTotal = pv;
    var marcoSet = {}; marcos.forEach(function (x) { marcoSet[x] = true; });
    for (var mm = 1; mm <= n; mm++) {
      saldoFim = saldoFim * (1 + i) + pmt;
      aportadoTotal += pmt;
      if (marcoSet[mm]) {
        var rend = saldoFim - aportadoTotal;
        rows.push([
          (mm % 12 === 0 ? 'Ano ' + (mm / 12) : 'Mês ' + mm),
          mm,
          brl(aportadoTotal),
          '<span class="pos">' + brl(rend) + '</span>',
          brl(saldoFim)
        ]);
      }
    }

    els.tbody.innerHTML = rows.map(function (r) {
      return '<tr><td class="left">' + r[0] + '</td><td>' + r[1] +
        '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td><strong>' + r[4] + '</strong></td></tr>';
    }).join('');
  }

  function gerarPDF() {
    var pv = parseBR(els.pv.value);
    var pmt = parseBR(els.pmt.value);
    var i = taxaMensal();
    var n = Math.round(parseBR(els.n.value));
    var fator = Math.pow(1 + i, n);
    var fv = pv * fator + (i === 0 ? pmt * n : pmt * (fator - 1) / i);
    var totalAportado = pv + pmt * n;
    gerarPDFCalc({
      titulo: 'Valor Futuro',
      subtitulo: 'Projeção de acumulação com aportes mensais',
      tituloPremissas: 'Dados',
      premissas: [
        { lbl: 'Valor hoje', val: brl(pv) },
        { lbl: 'Aporte mensal', val: brl(pmt) },
        { lbl: 'Taxa', val: pct(i * 100) + ' a.m.' },
        { lbl: 'Meses', val: String(n) },
        { lbl: 'Total aportado', val: brl(totalAportado) },
        { lbl: 'Rendimento', val: brl(fv - totalAportado) }
      ],
      destaque: { label: 'Valor futuro', val: brl(fv), sub: 'em ' + n + ' meses' },
      discWarn: true
    });
  }

  function init() {
    els = {
      pv: $('vf-pv'), pmt: $('vf-pmt'), taxa: $('vf-taxa'),
      taxaModo: $('vf-taxa-modo'), n: $('vf-n'),
      fvVal: $('vf-fv-val'), fvSub: $('vf-fv-sub'),
      aportado: $('vf-aportado'), rendimento: $('vf-rendimento'),
      totalPv: $('vf-total-pv'), taxaMesShow: $('vf-taxa-mes'),
      tbody: $('vf-tbody')
    };
    if (!els.pv) return;
    if (typeof instalarFormatacao === 'function') instalarFormatacao(document);
    ['pv', 'pmt', 'taxa', 'n'].forEach(function (k) {
      els[k].addEventListener('input', calcular);
    });
    els.taxaModo.addEventListener('change', calcular);
    var clear = $('vf-clear');
    if (clear) clear.addEventListener('click', function () {
      if (typeof limparCalculadora === 'function') limparCalculadora(calcular);
      else { ['pv', 'pmt', 'taxa', 'n'].forEach(function (k) { els[k].value = ''; }); calcular(); }
    });
    var pdf = $('vf-pdf-btn');
    if (pdf) pdf.addEventListener('click', gerarPDF);
    calcular();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
