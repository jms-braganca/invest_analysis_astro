/* calc-fgc.js — Calculadora de Limite FGC (R$ 250.000) */
(function () {
  'use strict';

  function calcFGC() {
    var cdi  = pBR(document.getElementById('f-cdi').value)/100 || 0;
    var ipca = pBR(document.getElementById('f-ipca').value)/100 || 0;
    var idx  = document.getElementById('f-idx').value;
    var taxa = pBR(document.getElementById('f-taxa').value)/100 || 0;
    var venc = document.getElementById('f-venc').value;
    if (!venc) return;

    var today = new Date(); today.setHours(0,0,0,0);
    var dV = new Date(venc + 'T12:00:00');
    var du = networkdays(today, dV);
    var ta = taFn(idx, taxa, cdi, ipca);
    var td = tdFn(ta);
    var pv = 250000 / Math.pow(1 + td, du);
    var rend = 250000 - pv;

    document.getElementById('f-hoje').textContent = fBRL(pv);
    document.getElementById('f-du').textContent   = du + ' dias úteis';
    document.getElementById('f-ta').textContent   = fPct(ta);
    document.getElementById('f-td').textContent   = fPct(td, 6);
    document.getElementById('f-rend').textContent = fBRL(rend);
    document.getElementById('f-sub').textContent  =
      'Para atingir R$ 250.000,00 em ' + dV.toLocaleDateString('pt-BR') +
      ' com ' + idx + ' ' + fPct(taxa);
  }

  document.querySelectorAll('input, select').forEach(function (el) {
    el.addEventListener('input', calcFGC);
    el.addEventListener('change', calcFGC);
  });

  var clearBtn = document.querySelector('.calc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function () { limparCalculadora(calcFGC); });

  /* ── PDF ──────────────────────────────────────────────── */
  function gerarPDF() {
    var get = function (id) { return document.getElementById(id).value || '—'; };
    var getT = function (id) {
      var el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : '—';
    };
    var venc = document.getElementById('f-venc').value;
    var vencFmt = venc ? new Date(venc + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    gerarPDFCalc({
      titulo:    'Limite FGC',
      subtitulo: 'Investimento alvo: R$ 250.000 no vencimento',
      tituloPremissas: 'Premissas',
      premissas: [
        { lbl: 'CDI estimado a.a.',  val: (get('f-cdi') || '0') + '%' },
        { lbl: 'IPCA estimado a.a.', val: (get('f-ipca') || '0') + '%' },
        { lbl: 'Indexador',          val: get('f-idx') },
        { lbl: 'Taxa contratada',    val: (get('f-taxa') || '0') + '%' },
        { lbl: 'Vencimento',         val: vencFmt },
        { lbl: 'Limite FGC',         val: 'R$ 250.000,00' },
      ],
      destaque: {
        label: 'Invista hoje no máximo',
        val:   getT('f-hoje'),
        sub:   getT('f-sub'),
      },
      tituloResultado: 'Métricas do investimento',
      resultado: [
        { lbl: 'Dias úteis',          val: getT('f-du') },
        { lbl: 'Taxa anual equiv.',   val: getT('f-ta'), col: 'pos' },
        { lbl: 'Rendimento projetado',val: getT('f-rend'), col: 'pos' },
        { lbl: 'Taxa diária útil',    val: getT('f-td') },
      ],
      discIR:   '<strong>Importante:</strong> o FGC garante até <b>R$ 250.000 por CPF/instituição financeira</b>, com teto global de R$ 1 milhão a cada 4 anos.',
      discWarn: true,
    });
  }
  var pdfBtn = document.getElementById('fgc-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDF);

  instalarFormatacao();
  calcFGC();
})();
