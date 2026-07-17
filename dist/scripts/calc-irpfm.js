/* ============================================================
   calc-irpfm.js (inline) — Calculadora IRPFm 2026
   Lei 15.270/2025 · ano-calendário 2026 · DAA 2027
   ============================================================ */
(function () {
  'use strict';

  /* ── Constantes legais ──────────────────────────────────── */
  var IRPFM_PISO  = 600000;
  var IRPFM_TETO  = 1200000;
  var IRPFM_ALIQ  = 0.10;
  var DEP_VALUE   = 2275.08;
  var EDU_LIMITE  = 3561.50;
  var SIMP_LIMITE = 17640;
  var IRRF_DIV_TRIGGER = 50000;
  var IRRF_DIV_RATE    = 0.10;

  /* Empresas (Dividendos Mensais) */
  var EMPRESAS_N = 8;
  var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  /* ── Helpers ──────────────────────────────────────────────── */
  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  function nBR(s) {
    if (s == null) return 0;
    if (typeof s === 'number') return s;
    s = String(s).trim();
    if (!s) return 0;
    var n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function fBR(v, d) {
    d = d == null ? 2 : d;
    if (isNaN(v) || !isFinite(v)) return '0,00';
    return Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }
  function fBRL(v) {
    if (isNaN(v) || !isFinite(v)) return 'R$ 0,00';
    return (v < 0 ? '-' : '') + 'R$ ' + fBR(v, 2);
  }
  function fPct(v, d) {
    d = d == null ? 2 : d;
    if (isNaN(v) || !isFinite(v)) return '0,00%';
    return (v * 100).toFixed(d).replace('.', ',') + '%';
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  /* ── Pré-formatar input com valor default ────────────────── */
  function presetInput(el) {
    var def = el.getAttribute('data-default');
    if (def == null) return;
    var n = parseFloat(def);
    if (isNaN(n) || n === 0) {
      el.value = '';
      return;
    }
    var mode = el.getAttribute('inputmode');
    if (mode === 'numeric') {
      el.value = String(Math.round(n));
    } else {
      el.value = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  /* ── 1) Construir tabela de Dividendos Mensais ────────────── */
  function buildDividendosTable() {
    var tbody = document.getElementById('div-tbody');
    var html = '';
    for (var i = 1; i <= EMPRESAS_N; i++) {
      html += '<tr data-empresa="' + i + '">';
      html += '<td><input type="text" class="div-emp" id="div-nome-' + i + '" placeholder="Empresa ' + i + '"></td>';
      for (var m = 0; m < 12; m++) {
        html += '<td><input type="text" inputmode="decimal" id="div-' + i + '-' + m + '" data-empidx="' + i + '" data-mes="' + m + '" placeholder="0,00"></td>';
      }
      html += '<td class="is-calc" id="div-' + i + '-total">R$ 0,00</td>';
      html += '<td class="is-calc is-irrf" id="div-' + i + '-irrf">R$ 0,00</td>';
      html += '</tr>';
    }
    /* Linha de total mensal */
    html += '<tr class="is-total" id="div-total-row">';
    html += '<td>Total mensal</td>';
    for (var m2 = 0; m2 < 12; m2++) {
      html += '<td class="is-calc" id="div-tot-' + m2 + '">R$ 0,00</td>';
    }
    html += '<td class="is-calc" id="div-tot-anual">R$ 0,00</td>';
    html += '<td class="is-calc is-irrf" id="div-tot-irrf">R$ 0,00</td>';
    html += '</tr>';
    tbody.innerHTML = html;

    /* nome empresa default */
    for (var k = 1; k <= EMPRESAS_N; k++) {
      var nome = document.getElementById('div-nome-' + k);
      if (nome) nome.value = 'Empresa ' + k;
    }
  }

  /* ── 1.b) Mostrar somente as N primeiras linhas de empresas ── */
  function applyEmpresasCount() {
    var sel = document.getElementById('div-qtd');
    var n   = sel ? parseInt(sel.value, 10) : 0;
    if (isNaN(n)) n = 0;

    var wrap  = document.getElementById('div-tbl-wrap');
    var kpis  = document.getElementById('div-kpi-strip');
    var empty = document.getElementById('div-empresas-empty');

    /* Esconde tudo quando "Nenhuma" */
    if (n <= 0) {
      wrap.classList.add('is-hidden');
      kpis.classList.add('is-hidden');
      empty.classList.add('is-on');
      /* Zera valores das empresas escondidas (para não afetar cálculo) */
      for (var i = 1; i <= EMPRESAS_N; i++) {
        for (var m = 0; m < 12; m++) {
          var inp = document.getElementById('div-' + i + '-' + m);
          if (inp) inp.value = '';
        }
      }
      return;
    }
    wrap.classList.remove('is-hidden');
    kpis.classList.remove('is-hidden');
    empty.classList.remove('is-on');

    /* Mostra apenas as primeiras N empresas; zera valores das demais. */
    for (var k = 1; k <= EMPRESAS_N; k++) {
      var tr = document.querySelector('tr[data-empresa="' + k + '"]');
      if (!tr) continue;
      if (k <= n) {
        tr.style.display = '';
      } else {
        tr.style.display = 'none';
        for (var m2 = 0; m2 < 12; m2++) {
          var inp2 = document.getElementById('div-' + k + '-' + m2);
          if (inp2) inp2.value = '';
        }
      }
    }
  }

  /* ── 2) Calcular Dividendos Mensais ──────────────────────── */
  function calcDividendos() {
    var totalAnualGlobal = 0, totalIRRFGlobal = 0, countTrigger = 0;
    var totalPorMes = new Array(12).fill(0);

    for (var i = 1; i <= EMPRESAS_N; i++) {
      var sumRow = 0, irrfRow = 0;
      for (var m = 0; m < 12; m++) {
        var inp = document.getElementById('div-' + i + '-' + m);
        var v = nBR(inp.value);
        sumRow += v;
        totalPorMes[m] += v;
        if (v > IRRF_DIV_TRIGGER) {
          irrfRow += v * IRRF_DIV_RATE;
          countTrigger++;
        }
      }
      setText('div-' + i + '-total', fBRL(sumRow));
      setText('div-' + i + '-irrf',  fBRL(irrfRow));
      totalAnualGlobal += sumRow;
      totalIRRFGlobal  += irrfRow;
    }
    for (var m3 = 0; m3 < 12; m3++) {
      setText('div-tot-' + m3, fBRL(totalPorMes[m3]));
    }
    setText('div-tot-anual', fBRL(totalAnualGlobal));
    setText('div-tot-irrf',  fBRL(totalIRRFGlobal));

    /* KPIs */
    setText('div-k-count', String(countTrigger));
    setText('div-k-total', fBRL(totalAnualGlobal));
    setText('div-k-irrf',  fBRL(totalIRRFGlobal));
    var aliq = totalAnualGlobal > 0 ? totalIRRFGlobal / totalAnualGlobal : 0;
    setText('div-k-aliq', fPct(aliq, 2));

    /* Summary chip */
    setText('div-sum-anual', fBRL(totalAnualGlobal));

    return {
      totalAnual: totalAnualGlobal,
      totalIRRF:  totalIRRFGlobal,
      countTrigger: countTrigger,
      aliqEfetiva: aliq
    };
  }

  /* ── 3) Calcular Rendimentos ─────────────────────────────── */
  function calcRendimentos(div) {
    /* Categorias base IRPFm */
    var cats = ['salario','alugueis','jcp','cdb','fundos','bolsa','divbolsa','exterior','outros'];
    var baseSum = 0, irSum = 0;
    cats.forEach(function (k) {
      var v  = nBR(document.getElementById('rend-' + k + '-v').value);
      var ir = nBR(document.getElementById('rend-' + k + '-ir').value);
      baseSum += v;
      irSum   += ir;
    });
    /* Lucros PJ vêm de Dividendos */
    baseSum += div.totalAnual;
    irSum   += div.totalIRRF;
    setText('rend-divpj-v',  fBRL(div.totalAnual));
    setText('rend-divpj-ir', fBRL(div.totalIRRF));

    setText('rend-subtotal-base', fBRL(baseSum));
    setText('rend-subtotal-ir',   fBRL(irSum));

    /* Isentos */
    var isens = ['lci','lca','cri','cra','lig','lcd','debinc','fii','fiagro','fiinfra','poup','cda','indeniz','div2025'];
    var isenSum = 0;
    isens.forEach(function (k) {
      isenSum += nBR(document.getElementById('rend-' + k + '-v').value);
    });
    setText('rend-subtotal-isen', fBRL(isenSum));

    var rendaTotal = baseSum + isenSum;
    setText('rend-total-anual', fBRL(rendaTotal));
    setText('rend-total-ir',    fBRL(irSum));
    setText('rend-sum-base',    fBRL(baseSum));

    return {
      salario:  nBR(document.getElementById('rend-salario-v').value),
      alugueis: nBR(document.getElementById('rend-alugueis-v').value),
      exterior: nBR(document.getElementById('rend-exterior-v').value),
      outros:   nBR(document.getElementById('rend-outros-v').value),
      baseSum:  baseSum,
      irSum:    irSum,
      isenSum:  isenSum,
      rendaTotal: rendaTotal
    };
  }

  /* ── 4) Calcular Deduções IRPF ─────────────────────────────── */
  function calcDeducoes(rend) {
    var saude   = nBR(document.getElementById('ded-saude-v').value);
    var edut    = nBR(document.getElementById('ded-edut-v').value);
    var edud    = nBR(document.getElementById('ded-edud-v').value);
    var deps    = Math.max(0, Math.round(nBR(document.getElementById('ded-deps-v').value)));
    var pensao  = nBR(document.getElementById('ded-pensao-v').value);
    var inss    = nBR(document.getElementById('ded-inss-v').value);
    var pgbl    = nBR(document.getElementById('ded-pgbl-v').value);
    var doa     = nBR(document.getElementById('ded-doa-v').value);

    var saudeA  = saude;
    var edutA   = Math.min(edut, EDU_LIMITE);
    var edudA   = Math.min(edud, EDU_LIMITE * deps);
    var depVal  = deps * DEP_VALUE;
    var depValA = depVal;
    var pensaoA = pensao;
    var inssA   = inss;
    var pgblA   = Math.min(pgbl, rend.baseSum * 0.12);
    var doaA    = doa;

    setText('ded-saude-a',  fBRL(saudeA));
    setText('ded-edut-a',   fBRL(edutA));
    setText('ded-edud-a',   fBRL(edudA));
    setText('ded-depval-v', fBRL(depVal));
    setText('ded-depval-a', fBRL(depValA));
    setText('ded-pensao-a', fBRL(pensaoA));
    setText('ded-inss-a',   fBRL(inssA));
    setText('ded-pgbl-a',   fBRL(pgblA));
    setText('ded-doa-a',    fBRL(doaA));

    var totalCompleta = saudeA + edutA + edudA + depValA + pensaoA + inssA + pgblA + doaA;
    setText('ded-total-completa', fBRL(totalCompleta));

    /* Simplificada */
    var simpBase  = rend.baseSum;
    var simpAceito = Math.min(simpBase * 0.20, SIMP_LIMITE);
    setText('ded-simp-base',   fBRL(simpBase));
    setText('ded-simp-aceito', fBRL(simpAceito));

    /* Melhor opção */
    var melhor = totalCompleta > simpAceito ? 'Completa' : 'Simplificada';
    var melhorVal = Math.max(totalCompleta, simpAceito);
    setText('ded-melhor-tipo', melhor);
    setText('ded-total-aplicado', fBRL(melhorVal));
    setText('ded-melhor', melhor);

    return {
      totalCompleta: totalCompleta,
      simpAceito: simpAceito,
      aplicado: melhorVal,
      melhor: melhor
    };
  }

  /* ── 5) Simulador IRPF Tradicional ─────────────────────────── */
  function calcSimulador(rend, ded) {
    setText('sim-salario',  fBRL(rend.salario));
    setText('sim-alugueis', fBRL(rend.alugueis));
    setText('sim-exterior', fBRL(rend.exterior));
    setText('sim-outros',   fBRL(rend.outros));

    var totalRend = rend.salario + rend.alugueis + rend.exterior + rend.outros;
    setText('sim-total-rend', fBRL(totalRend));
    setText('sim-deducoes',   fBRL(ded.aplicado));

    var baseCalc = Math.max(0, totalRend - ded.aplicado);
    setText('sim-base-calc', fBRL(baseCalc));

    /* Tabela progressiva 2026 */
    var faixas = [
      { ate: 28467.20, aliq: 0,     parc: 0,       n: 1 },
      { ate: 33919.80, aliq: 0.075, parc: 2135.04, n: 2 },
      { ate: 45012.60, aliq: 0.15,  parc: 4679.98, n: 3 },
      { ate: 55976.16, aliq: 0.225, parc: 8056.43, n: 4 },
      { ate: Infinity, aliq: 0.275, parc: 10855.24,n: 5 }
    ];
    var faixaSel = faixas[0];
    for (var i = 0; i < faixas.length; i++) {
      if (baseCalc <= faixas[i].ate) { faixaSel = faixas[i]; break; }
    }
    /* Destaque visual na tabela */
    $$('#sim-tab-prog tr[data-faixa]').forEach(function (tr) {
      tr.classList.toggle('is-active', parseInt(tr.getAttribute('data-faixa'), 10) === faixaSel.n);
    });

    var aliq    = faixaSel.aliq;
    var parcela = faixaSel.parc;
    var irBruto = Math.max(0, baseCalc * aliq - parcela);

    /* Redutor anual Lei 15.270/2025 */
    var redutor;
    if (baseCalc <= 60000) {
      redutor = irBruto;
    } else if (baseCalc < 88200) {
      redutor = Math.max(0, 8429.73 - 0.095575 * baseCalc);
    } else {
      redutor = 0;
    }
    var irFinal = Math.max(0, irBruto - redutor);

    setText('sim-aliq',       fPct(aliq, 2));
    setText('sim-parcela',    fBRL(parcela));
    setText('sim-irpf-bruto', fBRL(irBruto));
    setText('sim-redutor',    fBRL(redutor));
    setText('sim-irpf-final', fBRL(irFinal));

    var aliqBase  = baseCalc  > 0 ? irFinal / baseCalc  : 0;
    var aliqBruto = totalRend > 0 ? irFinal / totalRend : 0;
    setText('sim-aliq-base',  fPct(aliqBase, 2));
    setText('sim-aliq-bruto', fPct(aliqBruto, 2));

    setText('sim-sum-irpf', fBRL(irFinal));

    return { irFinal: irFinal, baseCalc: baseCalc, totalRend: totalRend };
  }

  /* ── 6) Redutor PJ ─────────────────────────────────────────── */
  function calcRedutorPJ() {
    var tipo  = document.getElementById('rpj-tipo').value;
    var irpj  = nBR(document.getElementById('rpj-irpj').value);
    var lucro = nBR(document.getElementById('rpj-lucro').value);

    var limite = 0.34;
    if (tipo === 'Seguradora') limite = 0.40;
    else if (tipo === 'InstFinanceira') limite = 0.45;

    var efetiva = lucro > 0 ? irpj / lucro : 0;

    setText('rpj-limite',  fPct(limite, 2));
    setText('rpj-efetiva', fPct(efetiva, 2));
    setText('rpj-sum',     fPct(efetiva, 2));

    return { tipo: tipo, limite: limite, efetiva: efetiva };
  }

  /* ── 7) Cálculo IRPFm final ───────────────────────────────── */
  function calcIRPFM(div, rend, sim, rpj) {
    var base = rend.baseSum;
    setText('ir-base',       fBRL(base));
    setText('ir-rendatotal', fBRL(rend.rendaTotal));

    /* Alíquota efetiva IRPFm */
    var aliqIRPFM;
    if (base <= IRPFM_PISO)      aliqIRPFM = 0;
    else if (base >= IRPFM_TETO) aliqIRPFM = IRPFM_ALIQ;
    else aliqIRPFM = ((base - IRPFM_PISO) / (IRPFM_TETO - IRPFM_PISO)) * IRPFM_ALIQ;

    setText('ir-aliq', fPct(aliqIRPFM, 4));
    var irpfmBruto = base * aliqIRPFM;
    setText('ir-bruto', fBRL(irpfmBruto));

    /* Deduções §3º */
    var dedIRPF  = sim.irFinal;
    var dedIRRF  = rend.irSum - div.totalIRRF;
    var dedPJ    = 0;
    /* Redutor PJ aplicado: se (efetiva + aliqIRPFM) > limite, há crédito proporcional na parcela do IRPFm */
    if (rpj.efetiva > 0 && (rpj.efetiva + aliqIRPFM) > rpj.limite) {
      var excedente = (rpj.efetiva + aliqIRPFM) - rpj.limite;
      dedPJ = Math.min(irpfmBruto, excedente * base);
    }

    setText('ir-ded-irpf',   fBRL(dedIRPF));
    setText('ir-ded-irrf',   fBRL(dedIRRF));
    setText('ir-ded-pj',     fBRL(dedPJ));

    var pos3 = irpfmBruto - dedIRPF - dedIRRF - dedPJ;
    setText('ir-pos3', fBRL(pos3));

    var pos4 = Math.max(0, pos3);
    setText('ir-pos4', fBRL(pos4));

    /* §5º — IRRF dividendos */
    setText('ir-ded-divirrf', fBRL(div.totalIRRF));
    var pos5 = pos4 - div.totalIRRF;
    setText('ir-pos5', fBRL(pos5));

    var aPagar     = Math.max(0,  pos5);
    var aRestituir = Math.max(0, -pos5);
    setText('ir-pagar-val',     fBRL(aPagar));
    setText('ir-restituir-val', fBRL(aRestituir));

    /* Mostrar/esconder cards conforme resultado */
    var cardPagar     = document.getElementById('ir-card-pagar');
    var cardRestituir = document.getElementById('ir-card-restituir');
    cardPagar.style.display     = aPagar     > 0.005 ? 'block' : (aRestituir > 0.005 ? 'none' : 'block');
    cardRestituir.style.display = aRestituir > 0.005 ? 'block' : (aPagar     > 0.005 ? 'none' : 'block');

    /* Diagnóstico */
    var faixaTxt;
    if (base < IRPFM_PISO) {
      faixaTxt = 'Isento (renda abaixo de R$ 600 mil)';
    } else if (base < IRPFM_TETO) {
      faixaTxt = 'Faixa progressiva (0% a 10%)';
    } else {
      faixaTxt = 'Faixa fixa (10% sobre toda a base)';
    }
    setText('ir-diag-faixa', faixaTxt);

    var statusTxt;
    if (pos3 <= 0) {
      statusTxt = 'IRPF tradicional já cobre o IRPFm (nada a pagar)';
    } else if (pos5 > 0) {
      statusTxt = 'Complementação devida no ajuste anual';
    } else if (pos5 < 0) {
      statusTxt = 'Restituição esperada do IRRF de dividendos';
    } else {
      statusTxt = 'Em equilíbrio (saldo zero)';
    }
    setText('ir-diag-status', statusTxt);

    var carga = base > 0 ? (sim.irFinal + rend.irSum) / base : 0;
    setText('ir-diag-carga', fPct(carga, 2));

    /* Summary chip */
    var sumChip;
    if (aPagar > 0.005)            sumChip = 'A pagar ' + fBRL(aPagar);
    else if (aRestituir > 0.005)   sumChip = 'Restituir ' + fBRL(aRestituir);
    else                           sumChip = 'Sem saldo';
    setText('irpfm-sum', sumChip);

    return {
      base: base, aliq: aliqIRPFM, bruto: irpfmBruto,
      dedIRPF: dedIRPF, dedIRRF: dedIRRF, dedPJ: dedPJ,
      pos3: pos3, pos4: pos4, pos5: pos5,
      aPagar: aPagar, aRestituir: aRestituir,
      faixa: faixaTxt, status: statusTxt, carga: carga
    };
  }

  /* ── Recalcular tudo (orquestrador) ──────────────────────── */
  var __lastResult = null;
  function recalcAll() {
    applyEmpresasCount();
    var div  = calcDividendos();
    var rend = calcRendimentos(div);
    var ded  = calcDeducoes(rend);
    var sim  = calcSimulador(rend, ded);
    var rpj  = calcRedutorPJ();
    var ir   = calcIRPFM(div, rend, sim, rpj);
    __lastResult = { div: div, rend: rend, ded: ded, sim: sim, rpj: rpj, ir: ir };
  }

  /* ── Setup collapsibles ──────────────────────────────────── */
  function setupCollapsibles() {
    $$('.ac-section.is-collapsible').forEach(function (sec) {
      var btn = sec.querySelector('.ac-section-toggle');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var collapsed = sec.getAttribute('data-collapsed') === 'true';
        sec.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
        btn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });
    });
  }

  /* ── Setup limpar tudo ──────────────────────────────────── */
  function setupClear() {
    var btn = document.getElementById('irpfm-clear');
    btn.addEventListener('click', function () {
      /* Zera todos os inputs (sem repor defaults) */
      $$('input[type="text"]').forEach(function (el) { el.value = ''; });
      $$('select').forEach(function (sel) {
        sel.selectedIndex = 0;
      });
      /* Re-define apenas os nomes das empresas */
      for (var k = 1; k <= EMPRESAS_N; k++) {
        var nome = document.getElementById('div-nome-' + k);
        if (nome) nome.value = 'Empresa ' + k;
      }
      recalcAll();
    });
  }

  /* ── Setup PDF ──────────────────────────────────────────── */
  function setupPDF() {
    var btn = document.getElementById('irpfm-pdf-btn');
    btn.addEventListener('click', function () {
      if (!__lastResult) recalcAll();
      var r = __lastResult;

      var premissas = [
        { lbl: 'Base IRPFm',          val: fBRL(r.ir.base) },
        { lbl: 'Renda total',         val: fBRL(r.rend.rendaTotal) },
        { lbl: 'Alíquota IRPFm',      val: fPct(r.ir.aliq, 4) },
        { lbl: 'IRPF tradicional',    val: fBRL(r.sim.irFinal) },
        { lbl: 'IRRF dividendos',     val: fBRL(r.div.totalIRRF) },
        { lbl: 'IRRF outros',         val: fBRL(r.rend.irSum - r.div.totalIRRF) }
      ];

      var destaque;
      if (r.ir.aPagar > 0.005) {
        destaque = {
          label: 'IRPFm a Complementar',
          val: fBRL(r.ir.aPagar),
          sub: 'A recolher no ajuste anual (§6º)'
        };
      } else if (r.ir.aRestituir > 0.005) {
        destaque = {
          label: 'Restituição do IRRF de Dividendos',
          val: fBRL(r.ir.aRestituir),
          sub: 'Limitada ao IRRF dos 10% retido'
        };
      } else {
        destaque = {
          label: 'IRPFm Devido',
          val: 'R$ 0,00',
          sub: 'IRPF tradicional já cobre o mínimo'
        };
      }

      var tabela = {
        titulo: 'Detalhamento da apuração',
        thead: ['Etapa', 'Valor'],
        rows: [
          ['IRPFm apurado (bruto)',              fBRL(r.ir.bruto)],
          ['(−) IRPF tradicional devido',        fBRL(r.ir.dedIRPF)],
          ['(−) IRRF outros (não dividendos)',   fBRL(r.ir.dedIRRF)],
          ['(−) Redutor PJ',                     fBRL(r.ir.dedPJ)],
          ['IRPFm após §3º',                     fBRL(r.ir.pos3)],
          ['IRPFm após §4º (piso zero)',         fBRL(r.ir.pos4)],
          ['(−) IRRF dividendos 10%',            fBRL(r.div.totalIRRF)],
          ['IRPFm após §5º',                     fBRL(r.ir.pos5)]
        ]
      };

      var resultado = [
        { lbl: 'Situação na faixa',     val: r.ir.faixa,                 col: 'blu' },
        { lbl: 'Status do IRPFm',       val: r.ir.status,                col: r.ir.aPagar > 0 ? 'neg' : (r.ir.aRestituir > 0 ? 'pos' : '') },
        { lbl: 'Carga efetiva',         val: fPct(r.ir.carga, 2),        col: '' },
        { lbl: 'IRPF tradicional',      val: fBRL(r.sim.irFinal),        col: '' },
        { lbl: 'Modelo de dedução',     val: r.ded.melhor,               col: 'blu' },
        { lbl: 'Total deduções',        val: fBRL(r.ded.aplicado),       col: '' }
      ];

      gerarPDFCalc({
        titulo: 'IRPFm 2026 — Imposto de Renda Mínimo',
        subtitulo: 'Lei 15.270/2025 · DAA 2027',
        tituloPremissas: 'Parâmetros',
        premissas: premissas,
        destaque: destaque,
        tituloResultado: 'Diagnóstico',
        resultado: resultado,
        tabela: tabela,
        discIR: 'O IRPFm é mecanismo de imposto mínimo (Art. 16-B da Lei 15.270/2025). Esta simulação considera os parâmetros vigentes em 2026 e <b>não substitui</b> a Declaração de Ajuste Anual (DAA) que deverá ser entregue em 2027.',
        discWarn: true
      });
    });
  }

  /* ── Setup listeners de input ───────────────────────────── */
  function setupListeners() {
    /* Recalcula sempre que qualquer input muda */
    $$('input[type="text"]').forEach(function (el) {
      el.addEventListener('input', recalcAll);
      el.addEventListener('change', recalcAll);
    });
    $$('select').forEach(function (sel) {
      sel.addEventListener('change', recalcAll);
    });
  }

  /* ── Init ──────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    buildDividendosTable();
    /* Pré-formatar os defaults */
    $$('input[type="text"][data-default]').forEach(presetInput);
    /* Habilitar formatação live PT-BR para todos os inputs decimais */
    if (typeof instalarFormatacao === 'function') {
      instalarFormatacao(document);
    }
    setupCollapsibles();
    setupClear();
    setupPDF();
    setupListeners();
    recalcAll();
  });
})();
