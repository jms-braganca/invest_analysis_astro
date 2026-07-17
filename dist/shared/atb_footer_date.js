/* ============================================================
   atb_footer_date.js — Preenche a data do rodapé ("Atualizado em")
   com a DATA DO DEPLOY (meta.gerado_em = quando o pipeline rodou e
   commitou), NÃO com a data da cota (ultima_data_cota).

   Alvo: qualquer elemento com [data-build-date] (tipicamente um
   <span data-build-date> dentro do .private-footer).
   ============================================================ */
(function () {
  'use strict';
  function ymdToBR(s) {
    if (!s) return null;
    var d = String(s).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  }
  var alvos = document.querySelectorAll('[data-build-date]');
  if (!alvos.length) return;
  var base = location.pathname.indexOf('/calculadoras/') > -1 ? '../data/' : './data/';
  fetch(base + 'meta.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      var br = ymdToBR(m && m.gerado_em);
      if (!br) return;
      alvos.forEach(function (el) { el.textContent = br; });
    })
    .catch(function () { /* offline/sem meta: mantém o placeholder */ });
})();
