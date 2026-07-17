/* calc-rent.js — Calculadora de Rentabilidade (curva e marcação a mercado) */
(function () {
  'use strict';

  function calcRent() {
    var dtA = document.getElementById('r3-dt-aplic').value;
    var dtC = document.getElementById('r3-dt-cotac').value;
    if (!dtA || !dtC) return;

    var isento = document.getElementById('r3-isento').checked;
    var aplic = pBR(document.getElementById('r3-v-aplic').value) || 0;
    var vBrC  = pBR(document.getElementById('r3-v-curva').value) || 0;
    var vBrV  = pBR(document.getElementById('r3-v-venda').value) || 0;

    var dA = new Date(dtA + 'T12:00:00');
    var dC = new Date(dtC + 'T12:00:00');
    var dc = Math.round((dC - dA) / (1000*60*60*24));
    var du = networkdays(dA, dC);
    var aliq  = aliqIR(dc);
    var cdiP  = acumCDI(dtA, dtC);
    var ipcaP = acumIPCA(dtA, dtC);

    document.getElementById('r3-dc').textContent = dc + ' dias';
    document.getElementById('r3-du').textContent = du + ' dias';
    document.getElementById('r3-ir').textContent = isento ? 'Isento' : fPct(aliq);
    document.getElementById('r3-cdi-p').textContent  = (typeof cdiMap === 'undefined' || cdiMap.size === 0)  ? 'sem dados' : fPct(cdiP);
    document.getElementById('r3-ipca-p').textContent = (typeof ipcaMap === 'undefined' || ipcaMap.size === 0) ? 'sem dados' : fPct(ipcaP);

    function bloco(vBr, pfx) {
      var vLq = vliqFn(aplic, vBr, aliq, isento);
      var rtb = vBr/aplic - 1;
      var rtl = vLq/aplic - 1;
      var rab = Math.pow(1 + rtb, 252/du) - 1;
      var ral = Math.pow(1 + rtl, 252/du) - 1;
      var pcb = cdiP !== 0 ? rtb/cdiP : NaN;
      var pcl = cdiP !== 0 ? rtl/cdiP : NaN;
      var ipb = ipcaP !== 0 ? Math.pow((1 + rtb)/(1 + ipcaP), 252/du) - 1 : NaN;
      var ipl = ipcaP !== 0 ? Math.pow((1 + rtl)/(1 + ipcaP), 252/du) - 1 : NaN;
      sc(pfx + '-vbr', fBRL(vBr));
      sc(pfx + '-vlq', fBRL(vLq));
      var setC = function (id, v) {
        var el = document.getElementById(id); if (!el) return;
        el.textContent = fPct(v);
        el.style.color = v < 0 ? 'var(--neg)' : pfx === 'r3-c' ? 'var(--navy2)' : 'var(--info)';
      };
      setC(pfx + '-rtbr', rtb); setC(pfx + '-rtlq', rtl);
      setC(pfx + '-rabr', rab); setC(pfx + '-ralq', ral);
      sc(pfx + '-cdibr', fPct(pcb, 1));
      sc(pfx + '-cdilq', fPct(pcl, 1));
      sc(pfx + '-ipcabr', fPct(ipb) + ' a.a.');
      sc(pfx + '-ipcalq', fPct(ipl) + ' a.a.');
      return { vLq: vLq };
    }

    var rc = bloco(vBrC, 'r3-c');
    var rv = bloco(vBrV, 'r3-v');

    var dIR = document.getElementById('r3-disc-ir');
    dIR.style.display = 'block';
    dIR.textContent = isento
      ? 'Ativo isento de IR! Os valores bruto e líquido são idênticos.'
      : 'Atenção! Alíquota de IR: ' + fPct(aliq) + ' (' + dc + ' dias corridos)';

    var dRes = document.getElementById('r3-disc-res');
    dRes.style.display = 'block';
    if (rv.vLq >= aplic) {
      dRes.className = 'cc-disc ok';
      dRes.textContent = 'Você está saindo positivo, com valor superior ao aplicado!';
    } else {
      dRes.className = 'cc-disc ko';
      dRes.textContent = 'Você está saindo negativo, com valor inferior ao aplicado.';
    }

    var dAg = document.getElementById('r3-disc-ag');
    dAg.style.display = 'block';
    var diff = rv.vLq - rc.vLq;
    if (diff >= 0) {
      dAg.className = 'cc-disc agio';
      dAg.textContent = 'Ágio de ' + fBRL(diff) + ' pela saída antecipada!';
    } else {
      dAg.className = 'cc-disc des';
      dAg.textContent = 'Deságio de ' + fBRL(Math.abs(diff)) + ', recebendo menos do que o valor teórico.';
    }

    var upd = document.getElementById('r3-upd');
    document.getElementById('r3-data-tag').textContent =
      'CDI e IPCA: BACEN/SGS • Atualizado em ' + (upd ? upd.textContent : '');
  }

  document.querySelectorAll('input, select').forEach(function (el) {
    el.addEventListener('input', calcRent);
    el.addEventListener('change', calcRent);
  });

  var clearBtn = document.querySelector('.calc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function () { limparCalculadora(calcRent); });

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
    var ativo = get('r3-ativo');
    if (ativo === '—' || !ativo.trim()) ativo = 'Ativo (sem nome)';
    var isento = document.getElementById('r3-isento');
    var isentoTxt = (isento && isento.checked) ? 'Sim' : 'Não';

    var tabelaRows = [
      ['Curva — Valor atual',         getT('r3-c-vbr'),    getT('r3-c-vlq')],
      ['Curva — Rentab. total',       getT('r3-c-rtbr'),   getT('r3-c-rtlq')],
      ['Curva — Rentab. anual',       getT('r3-c-rabr'),   getT('r3-c-ralq')],
      ['Curva — % CDI',               getT('r3-c-cdibr'),  getT('r3-c-cdilq')],
      ['Curva — IPCA+',               getT('r3-c-ipcabr'), getT('r3-c-ipcalq')],
      ['Venda — Valor atual',         getT('r3-v-vbr'),    getT('r3-v-vlq')],
      ['Venda — Rentab. total',       getT('r3-v-rtbr'),   getT('r3-v-rtlq')],
      ['Venda — Rentab. anual',       getT('r3-v-rabr'),   getT('r3-v-ralq')],
      ['Venda — % CDI',               getT('r3-v-cdibr'),  getT('r3-v-cdilq')],
      ['Venda — IPCA+',               getT('r3-v-ipcabr'), getT('r3-v-ipcalq')],
    ];

    gerarPDFCalc({
      titulo:    'Rentabilidade — ' + ativo,
      subtitulo: 'CDI/IPCA: BACEN/SGS',
      tituloPremissas: 'Premissas',
      premissas: [
        { lbl: 'Ativo',                val: ativo },
        { lbl: 'Isento de IR',         val: isentoTxt },
        { lbl: 'Data aplicação',       val: fmtData(get('r3-dt-aplic')) },
        { lbl: 'Data vencimento',      val: fmtData(get('r3-dt-venc')) },
        { lbl: 'Data cotação',         val: fmtData(get('r3-dt-cotac')) },
        { lbl: 'Valor aplicado',       val: 'R$ ' + get('r3-v-aplic') },
        { lbl: 'Valor curva',          val: 'R$ ' + get('r3-v-curva') },
        { lbl: 'Valor venda',          val: 'R$ ' + get('r3-v-venda') },
      ],
      tituloResultado: 'Indicadores do período',
      resultado: [
        { lbl: 'Dias corridos',  val: getT('r3-dc') },
        { lbl: 'Dias úteis',     val: getT('r3-du') },
        { lbl: 'Alíquota IR',    val: getT('r3-ir') },
        { lbl: 'CDI no período', val: getT('r3-cdi-p'), col: 'pos' },
        { lbl: 'IPCA no período',val: getT('r3-ipca-p'), col: 'pos' },
      ],
      tabela: {
        titulo: 'Curva (valor teórico) × Venda (marcação a mercado)',
        thead:  ['Métrica', 'Bruto', 'Líquido'],
        rows:   tabelaRows,
      },
      discWarn: true,
    });
  }
  var pdfBtn = document.getElementById('r3-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDF);

  instalarFormatacao();
  calcRent();
})();
