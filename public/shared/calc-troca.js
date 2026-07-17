/* calc-troca.js — Calculadora de Troca de Ativos */
(function () {
  'use strict';

  function calcTroca() {
    var cdi  = pBR(document.getElementById('t-cdi').value)/100 || 0;
    var ipca = pBR(document.getElementById('t-ipca').value)/100 || 0;
    var paIdx  = document.getElementById('t-pa-idx').value;
    var paTaxa = pBR(document.getElementById('t-pa-taxa').value)/100 || 0;
    var paVenc = document.getElementById('t-pa-venc').value;
    var paVBC  = pBR(document.getElementById('t-pa-vbc').value) || 0;
    var paVLV  = pBR(document.getElementById('t-pa-vlv').value) || 0;
    var anIdx  = document.getElementById('t-an-idx').value;
    var anTaxa = pBR(document.getElementById('t-an-taxa').value)/100 || 0;
    var anVenc = document.getElementById('t-an-venc').value;

    document.getElementById('t-base-reinv').textContent = fBRL(paVLV);
    if (!paVenc || !anVenc) return;

    var today = new Date(); today.setHours(0,0,0,0);
    var dPa = new Date(paVenc + 'T12:00:00');
    var dAn = new Date(anVenc + 'T12:00:00');
    var duA = networkdays(today, dPa);
    var duN = networkdays(today, dAn);

    document.getElementById('t-du-atual').textContent = duA + ' dias úteis';

    var tdPa = tdFn(taFn(paIdx, paTaxa, cdi, ipca));
    var valPa = fvFn(paVBC, tdPa, duA);
    var tdAn = tdFn(taFn(anIdx, anTaxa, cdi, ipca));
    var valAnD = fvFn(paVLV, tdAn, duA);
    var valAnV = fvFn(paVLV, tdAn, duN);
    var ganho = valAnD - valPa;
    var agio  = paVLV - paVBC;

    var rEq = rateFn(duA/252, paVLV, valPa);
    var beIdx = anIdx === 'CDI+'  ? (1 + rEq)/(1 + cdi)  - 1
              : anIdx === '%CDI'  ? rEq/cdi
              : anIdx === 'IPCA+' ? (1 + rEq)/(1 + ipca) - 1
              : rEq;
    var dBE = workday(today, nperFn(tdAn, paVLV, valPa));

    sv('t-r-pa',    fBRL(valPa),  'cc-mc-val blu');
    sv('t-r-an-d',  fBRL(valAnD), 'cc-mc-val blu');

    var el = document.getElementById('t-r-ganho');
    el.textContent = fBRL(ganho);
    el.className = 'cc-mc-val' + (ganho > 0 ? ' grn' : ganho < 0 ? ' red' : '');
    el = document.getElementById('t-r-agio');
    el.textContent = fBRL(agio);
    el.className = 'cc-mc-val' + (agio > 0 ? ' grn' : agio < 0 ? ' red' : '');

    sv('t-r-be-data', fDate(dBE),  'cc-mc-val sm');
    sv('t-r-be-taxa', fPct(beIdx), 'cc-mc-val sm');
    sv('t-r-an-v',    fBRL(valAnV),'cc-mc-val blu');

    var bm = { 'CDI+':'t-be-cdi', '%CDI':'t-be-pct', 'IPCA+':'t-be-ipca', 'Pré':'t-be-pre' };
    ['t-be-cdi','t-be-pct','t-be-ipca','t-be-pre'].forEach(function (id) {
      document.getElementById(id).className = 'cc-be-val';
    });
    document.getElementById('t-be-cdi').textContent  = fPct((1 + rEq)/(1 + cdi)  - 1);
    document.getElementById('t-be-pct').textContent  = fPct(rEq / cdi);
    document.getElementById('t-be-ipca').textContent = fPct((1 + rEq)/(1 + ipca) - 1);
    document.getElementById('t-be-pre').textContent  = fPct(rEq);
    if (bm[anIdx]) document.getElementById(bm[anIdx]).className = 'cc-be-val hl';
  }

  // Bind inputs
  document.querySelectorAll('input, select').forEach(function (el) {
    el.addEventListener('input', calcTroca);
    el.addEventListener('change', calcTroca);
  });

  // Botão Limpar
  var clearBtn = document.querySelector('.calc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function () { limparCalculadora(calcTroca); });

  /* ── PDF ──────────────────────────────────────────────── */
  function gerarPDF() {
    var get = function (id) { var el = document.getElementById(id); return el ? (el.value || '—') : '—'; };
    var getT = function (id) {
      var el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : '—';
    };
    var fmtData = function (iso) {
      if (!iso) return '—';
      return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
    };
    var ticker_pa = get('t-pa-ticker');  if (ticker_pa === '—' || !ticker_pa.trim()) ticker_pa = 'Papel atual';
    var ticker_an = get('t-an-ticker');  if (ticker_an === '—' || !ticker_an.trim()) ticker_an = 'Ativo novo';

    gerarPDFCalc({
      titulo:    'Troca de Ativos — ' + ticker_pa + ' → ' + ticker_an,
      subtitulo: 'CDI: ' + get('t-cdi') + '% · IPCA: ' + get('t-ipca') + '%',
      tituloPremissas: 'Papel atual × Ativo novo',
      premissas: [
        { lbl: ticker_pa + ' — Indexador',     val: get('t-pa-idx') + ' ' + (get('t-pa-taxa') !== '—' ? get('t-pa-taxa') + '%' : '') },
        { lbl: ticker_pa + ' — Vencimento',    val: fmtData(get('t-pa-venc')) },
        { lbl: ticker_pa + ' — Emissor',       val: get('t-pa-emissor') },
        { lbl: ticker_pa + ' — Vlr. curva',    val: 'R$ ' + get('t-pa-vbc') },
        { lbl: ticker_pa + ' — Vlr. venda líq.', val: 'R$ ' + get('t-pa-vlv') },
        { lbl: 'Ágio/deságio na saída',        val: getT('t-r-agio') },
        { lbl: ticker_an + ' — Indexador',     val: get('t-an-idx') + ' ' + (get('t-an-taxa') !== '—' ? get('t-an-taxa') + '%' : '') },
        { lbl: ticker_an + ' — Vencimento',    val: fmtData(get('t-an-venc')) },
        { lbl: ticker_an + ' — Emissor',       val: get('t-an-emissor') },
      ],
      tituloResultado: 'Resumo da operação',
      resultado: [
        { lbl: 'Valor do papel atual no vencimento',  val: getT('t-r-pa'),    col: 'blu' },
        { lbl: 'Valor do novo na mesma data',         val: getT('t-r-an-d'),  col: 'blu' },
        { lbl: 'Valor do novo no próprio vencimento', val: getT('t-r-an-v'),  col: 'blu' },
        { lbl: 'Ganho comparativo',                   val: getT('t-r-ganho') },
        { lbl: 'Data de break-even',                  val: getT('t-r-be-data') },
        { lbl: 'Taxa de break-even',                  val: getT('t-r-be-taxa') },
      ],
      tabela: {
        titulo: 'Break-even por indexador (taxa mínima do novo ativo p/ igualar o atual)',
        thead:  ['Indexador', 'Taxa break-even'],
        rows: [
          ['CDI+',   getT('t-be-cdi')],
          ['% CDI',  getT('t-be-pct')],
          ['IPCA+',  getT('t-be-ipca')],
          ['Pré',    getT('t-be-pre')],
        ],
      },
      discWarn: true,
    });
  }
  var pdfBtn = document.getElementById('t-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDF);

  instalarFormatacao();
  calcTroca();
})();
