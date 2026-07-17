/* ============================================================
   calc-sucessao.js — Simulação de Custos na Sucessão (Previdência)

   Compara dois cenários de transmissão do patrimônio:
     • SEM previdência → inventário: ITCMD (variável) + Advogado (10%)
       + Outros custos (2%).
     • COM previdência → não entra em inventário (sem ITCMD/advogado/
       outros), mas paga IOF de 5% sobre o aporte acima de R$ 600.000.

   IOF calculado "por dentro" (gross-up): aporte líquido + IOF = patrimônio.
     aporte = (patrimônio + 600.000 × 5%) / 1,05
     IOF    = patrimônio − aporte
   ============================================================ */
(function () {
  'use strict';

  var IOF_RATE = 0.05;       // 5% sobre o excedente
  var IOF_FAIXA = 600000;    // isenção até R$ 600 mil
  var ADV_RATE = 0.10;       // advogado 10%
  var OUT_RATE = 0.02;       // outros custos 2%

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
  function $(id) { return document.getElementById(id); }

  var els = {};

  /* IOF por dentro (gross-up). Retorna {alocado, iof}. */
  function calcIOF(patr) {
    if (patr <= IOF_FAIXA) return { alocado: patr, iof: 0 };
    var alocado = (patr + IOF_FAIXA * IOF_RATE) / (1 + IOF_RATE);
    return { alocado: alocado, iof: patr - alocado };
  }

  function zera() {
    [['sp-a-patr','sp-b-patr'],['sp-a-iof','sp-b-iof'],['sp-a-aloc','sp-b-aloc'],
     ['sp-a-itcmd','sp-b-itcmd'],['sp-a-adv','sp-b-adv'],['sp-a-out','sp-b-out'],
     ['sp-a-inv','sp-b-inv'],['sp-a-pct','sp-b-pct'],['sp-a-receb','sp-b-receb'],
     ['sp-a-econ','sp-b-econ'],['sp-a-econpct','sp-b-econpct']
    ].forEach(function (par) { par.forEach(function (id) { els[id] && (els[id].textContent = '—'); }); });
    els.econVal.textContent = brl(0);
    els.econSub.textContent = 'Informe o patrimônio para comparar os dois cenários de sucessão.';
    els.econWrap.classList.remove('is-pos', 'is-neg');
  }

  function calcular() {
    var patr = parseBR(els.patr.value);
    var itcmd = parseInt(els.itcmd.value, 10) / 100;
    els.itcmdShow.textContent = (itcmd * 100).toLocaleString('pt-BR') + '%';

    if (patr <= 0) { zera(); return; }

    /* ── Cenário SEM previdência (inventário) ── */
    var itcmdVal = itcmd * patr;
    var adv = ADV_RATE * patr;
    var out = OUT_RATE * patr;
    var totInv = itcmdVal + adv + out;
    var pctInv = totInv / patr;
    var recebSem = patr - totInv;

    /* ── Cenário COM previdência ── */
    var r = calcIOF(patr);
    var recebCom = r.alocado;

    var economia = recebCom - recebSem;
    var pctEcon = recebSem !== 0 ? economia / recebSem : 0;

    /* ── Tabela ── */
    els['sp-a-patr'].textContent = brl(patr);
    els['sp-b-patr'].textContent = brl(patr);

    els['sp-a-iof'].textContent = brl(0);
    els['sp-b-iof'].textContent = brl(r.iof);

    els['sp-a-aloc'].textContent = '—';
    els['sp-b-aloc'].textContent = brl(r.alocado);

    els['sp-a-itcmd'].textContent = brl(itcmdVal);
    els['sp-b-itcmd'].textContent = brl(0);

    els['sp-a-adv'].textContent = brl(adv);
    els['sp-b-adv'].textContent = brl(0);

    els['sp-a-out'].textContent = brl(out);
    els['sp-b-out'].textContent = brl(0);

    els['sp-a-inv'].textContent = brl(totInv);
    els['sp-b-inv'].textContent = brl(0);

    els['sp-a-pct'].textContent = pct(pctInv * 100);
    els['sp-b-pct'].textContent = pct(0);

    els['sp-a-receb'].textContent = brl(recebSem);
    els['sp-b-receb'].textContent = brl(recebCom);

    els['sp-a-econ'].textContent = brl(0);
    els['sp-b-econ'].innerHTML = '<span class="' + (economia >= 0 ? 'pos' : 'neg') + '">' + brl(economia) + '</span>';

    els['sp-a-econpct'].textContent = pct(0);
    els['sp-b-econpct'].innerHTML = '<span class="' + (economia >= 0 ? 'pos' : 'neg') + '">' + pct(pctEcon * 100) + '</span>';

    /* ── Destaque ── */
    els.econVal.textContent = brl(economia);
    els.econSub.textContent = (economia >= 0 ? 'Equivale a ' : 'Custo adicional de ') +
      pct(Math.abs(pctEcon) * 100) + ' sobre o valor recebido por inventário' +
      (r.iof > 0 ? ' · IOF de ' + brl(r.iof) + ' no aporte' : '') + '.';
    els.econWrap.classList.toggle('is-pos', economia >= 0);
    els.econWrap.classList.toggle('is-neg', economia < 0);
  }

  function gerarPDF() {
    var patr = parseBR(els.patr.value);
    var itcmd = parseInt(els.itcmd.value, 10) / 100;
    var itcmdVal = itcmd * patr;
    var adv = ADV_RATE * patr, out = OUT_RATE * patr;
    var totInv = itcmdVal + adv + out;
    var recebSem = patr - totInv;
    var r = calcIOF(patr);
    var recebCom = r.alocado;
    var economia = recebCom - recebSem;
    var pctEcon = recebSem !== 0 ? economia / recebSem : 0;

    gerarPDFCalc({
      titulo: 'Sucessão na Previdência',
      subtitulo: 'Custos na sucessão: inventário vs. previdência',
      tituloPremissas: 'Premissas',
      premissas: [
        { lbl: 'Patrimônio total', val: brl(patr) },
        { lbl: 'Alíquota de ITCMD', val: (itcmd * 100).toLocaleString('pt-BR') + '%' },
        { lbl: 'Advogado', val: '10%' },
        { lbl: 'Outros custos', val: '2%' },
        { lbl: 'IOF (acima de R$ 600 mil)', val: '5%' },
        { lbl: 'IOF pago no aporte', val: brl(r.iof) }
      ],
      destaque: { label: 'Economia com previdência', val: brl(economia), sub: pct(pctEcon * 100) + ' sobre o recebido por inventário' },
      tabela: {
        titulo: 'Comparativo',
        thead: ['Descrição', 'Sem previdência', 'Com previdência'],
        rows: [
          ['Patrimônio total', brl(patr), brl(patr)],
          ['IOF pago no aporte (5%)', brl(0), brl(r.iof)],
          ['Valor alocado em previdência', '—', brl(r.alocado)],
          ['Valor de ITCMD', brl(itcmdVal), brl(0)],
          ['Advogado (10%)', brl(adv), brl(0)],
          ['Outros custos (2%)', brl(out), brl(0)],
          ['Total de inventário', brl(totInv), brl(0)],
          ['% do inventário', pct((patr ? totInv / patr : 0) * 100), pct(0)],
          ['Valor a ser recebido', brl(recebSem), brl(recebCom)],
          ['Valor da economia', brl(0), brl(economia)],
          ['% de economia', pct(0), pct(pctEcon * 100)]
        ]
      },
      discWarn: true
    });
  }

  function init() {
    els = {
      patr: $('sp-patrimonio'), itcmd: $('sp-itcmd'), itcmdShow: $('sp-itcmd-show'),
      econWrap: $('sp-econ-wrap'), econVal: $('sp-econ-val'), econSub: $('sp-econ-sub')
    };
    if (!els.patr) return;
    ['sp-a-patr','sp-b-patr','sp-a-iof','sp-b-iof','sp-a-aloc','sp-b-aloc',
     'sp-a-itcmd','sp-b-itcmd','sp-a-adv','sp-b-adv','sp-a-out','sp-b-out',
     'sp-a-inv','sp-b-inv','sp-a-pct','sp-b-pct','sp-a-receb','sp-b-receb',
     'sp-a-econ','sp-b-econ','sp-a-econpct','sp-b-econpct'
    ].forEach(function (id) { els[id] = $(id); });

    if (typeof instalarFormatacao === 'function') instalarFormatacao(document);
    els.patr.addEventListener('input', calcular);
    els.itcmd.addEventListener('input', calcular);

    var clear = $('sp-clear');
    if (clear) clear.addEventListener('click', function () {
      els.patr.value = '';
      els.itcmd.value = '5';
      calcular();
    });
    var pdf = $('sp-pdf-btn');
    if (pdf) pdf.addEventListener('click', gerarPDF);

    calcular();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
