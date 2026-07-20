/* ============================================================
   atb_kpis.js — Preenche os KPIs da topbar (CDI e Ibov: Mês / Ano / 12m)
   com os valores JÁ CALCULADOS pelo pipeline em data/meta.json
   (cdi_acumulado, ibov_acumulado) e o mês pela ultima_data_cota.

   Sem dados hardcoded: qualquer página com um bloco .atb-kpis é
   atualizada sozinha a cada deploy. No-op se o bloco não existir.

   Estrutura esperada (placeholders "—" no HTML):
     .atb-kpis
       [data-kpi="cdi"]  → [data-month], [data-kpi-val="mes|ano|12m"]
       [data-kpi="ibov"] → idem
   ============================================================ */
(function () {
  'use strict';

  var wrap = document.querySelector('.atb-kpis');
  if (!wrap) return;

  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
               'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var base = location.pathname.indexOf('/calculadoras/') > -1 ? '../data/' : './data/';

  function fmtPct(v, signed) {
    if (v == null || isNaN(v)) return '—';
    var s = Math.abs(v).toFixed(2).replace('.', ',') + '%';
    if (!signed) return s;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
  }

  function paintGroup(kpi, acc, mesLabel, signed) {
    var g = wrap.querySelector('[data-kpi="' + kpi + '"]');
    if (!g || !acc) return;
    var map = { mes: acc['Mês'], ano: acc['Ano'], '12m': acc['12M'] };
    g.querySelectorAll('[data-kpi-val]').forEach(function (el) {
      var v = map[el.getAttribute('data-kpi-val')];
      el.textContent = fmtPct(v, signed);
      el.classList.remove('pos', 'neg');
      // CDI não recebe cor (sempre positivo, como no design original);
      // Ibov colore conforme o sinal.
      if (signed && v != null && !isNaN(v)) {
        el.classList.add(v > 0 ? 'pos' : v < 0 ? 'neg' : '');
      }
    });
    if (mesLabel) {
      var ml = g.querySelector('[data-month]');
      if (ml) ml.textContent = mesLabel;
    }
  }

  fetch(base + 'meta.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      var mes = null;
      if (m && m.ultima_data_cota) {
        var mm = parseInt(String(m.ultima_data_cota).slice(5, 7), 10);
        if (mm >= 1 && mm <= 12) mes = MESES[mm - 1];
      }
      paintGroup('cdi', m && m.cdi_acumulado, mes, false);
      paintGroup('ibov', m && m.ibov_acumulado, mes, true);
    })
    .catch(function () { /* offline/sem meta: mantém os "—" */ });
})();
