/* ==========================================================================
   utils.js — Helpers compartilhados pelas calculadoras
   Depende de: window.CDI_DATA, window.IPCA_DATA, window.FERIADOS
   ========================================================================== */
(function () {
  'use strict';

  // Datasets (com fallback para arrays vazios se não carregados)
  var CDI_DATA  = window.CDI_DATA  || [];
  var IPCA_DATA = window.IPCA_DATA || [];
  var FERIADOS  = window.FERIADOS  || [];

  // Mapas O(1) para lookups
  window.cdiMap  = new Map(CDI_DATA.map(function (x) { return [x[0], x[1]]; }));
  window.ipcaMap = new Map(IPCA_DATA.map(function (x) { return [x[0], x[1]]; }));

  // ── FERIADOS / DIAS ÚTEIS ─────────────────────────────────────
  var hSet = new Set();
  FERIADOS.forEach(function (s) {
    if (typeof s !== 'string') return;
    // Aceita "DD/MM/YYYY" ou "YYYY-MM-DD"
    if (s.indexOf('/') !== -1) {
      var p = s.split('/');
      if (p.length === 3) hSet.add(p[2] + '-' + p[1] + '-' + p[0]);
    } else {
      hSet.add(s);
    }
  });

  window.isHol = function (d) {
    return hSet.has(d.toISOString().slice(0, 10));
  };
  window.isWE = function (d) {
    var w = d.getDay();
    return w === 0 || w === 6;
  };
  window.networkdays = function (a, b) {
    if (!a || !b || a > b) return 0;
    var c = 0, d = new Date(a);
    while (d <= b) {
      if (!window.isWE(d) && !window.isHol(d)) c++;
      d.setDate(d.getDate() + 1);
    }
    return c;
  };
  window.workday = function (from, n) {
    var d = new Date(from), c = 0;
    var s = n >= 0 ? 1 : -1, a = Math.abs(Math.round(n));
    while (c < a) {
      d.setDate(d.getDate() + s);
      if (!window.isWE(d) && !window.isHol(d)) c++;
    }
    return d;
  };

  // ── PARSERS / FORMATTERS ──────────────────────────────────────
  window.pBR = function (s) {
    return parseFloat(String(s).replace(/[.]/g, '').replace(',', '.'));
  };
  window.fBRL = function (v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };
  window.fPct = function (v, d) {
    d = d || 2;
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v * 100).toFixed(d).replace('.', ',') + '%';
  };

  // ── COMPATIBILIDADE COM CÓDIGO LEGADO ─────────────────────────
  // Algumas funções legadas referenciam CDI_DATA_RAW e IPCA_DATA_RAW
  if (typeof window.CDI_DATA_RAW === 'undefined')  window.CDI_DATA_RAW  = CDI_DATA;
  if (typeof window.IPCA_DATA_RAW === 'undefined') window.IPCA_DATA_RAW = IPCA_DATA;
})();
