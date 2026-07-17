/* ──────────────────────────────────────────────────────────────────────────
   calc-pgbl.js — Simulador de IRPF 2026 com benefício PGBL
   ──────────────────────────────────────────────────────────────────────────
   Espelho da metodologia da planilha Simulador_IRPF_2026.xlsx.

   Parâmetros legais: Lei 15.270/2025 (IRPF 2026) e Portaria 12/2024 (INSS).

   Comparação entre 3 modos de tributação na Declaração de Ajuste Anual:
     • Simplificado:      desconto único de 20% da renda, limitado a R$ 17.640
     • Completo s/ PGBL:  deduz INSS + dependentes + saúde + educação
     • Completo c/ PGBL:  idem + aporte PGBL no limite de 12% da renda bruta

   IR Retido = estimativa de IRRF sobre o salário usando a alíquota da renda
   anual TOTAL — é uma simplificação (segue exatamente a planilha de origem).
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── PARÂMETROS LEGAIS ────────────────────────────────────────────────────
  // Tabela progressiva ANUAL (Declaração de Ajuste). Faixas em "Até" + aliq + parcela_deduzir.
  var TAB_ANUAL = [
    { ate: 29145.60,    aliq: 0.000, deduz: 0.00 },
    { ate: 33919.80,    aliq: 0.075, deduz: 2185.92 },
    { ate: 45012.60,    aliq: 0.150, deduz: 4729.91 },
    { ate: 55976.16,    aliq: 0.225, deduz: 8105.85 },
    { ate: Infinity,    aliq: 0.275, deduz: 10904.66 },
  ];

  // Tabela INSS MENSAL — aliq + parcela_deduzir (calculada como em planilha).
  // Limite mensal: 8.475,55. Acima disso, contribuição mensal fixa = 988,09.
  var TAB_INSS = [
    { ate: 1621.00,  aliq: 0.075, deduz: 0.00 },
    { ate: 2902.84,  aliq: 0.090, deduz: 24.32 },
    { ate: 4354.27,  aliq: 0.120, deduz: 111.40 },
    { ate: 8475.55,  aliq: 0.140, deduz: 198.49 },
  ];
  var INSS_TETO_MENSAL = 988.09;
  var INSS_TETO_LIMITE = 8475.55;

  // Limites de dedução (anual)
  var DED_DEPENDENTE        = 2275.08;   // por dependente, anual
  var DED_EDUCACAO_LIMITE   = 3561.50;   // por pessoa (próprio + cada dependente), anual
  var SIMPLIFICADO_TETO     = 17640.00;  // teto absoluto da dedução simplificada (20% da renda)

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function fmtBRL(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var sinal = v < 0 ? '-' : '';
    var abs = Math.abs(v);
    return sinal + 'R$ ' + abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(v, decimals) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var d = decimals === undefined ? 2 : decimals;
    return (v * 100).toFixed(d).replace('.', ',') + '%';
  }

  // Parse: aceita "1.234,56" ou "1234.56" ou "1234,56" → 1234.56
  function parseNum(str) {
    if (str == null) return 0;
    var s = String(str).trim();
    if (!s) return 0;
    // Se tem vírgula, considera vírgula como decimal e ponto como milhar
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Lookup de faixa progressiva: retorna a primeira faixa cujo "ate" >= valor
  function lookupFaixa(valor, tabela) {
    for (var i = 0; i < tabela.length; i++) {
      if (valor <= tabela[i].ate) return tabela[i];
    }
    return tabela[tabela.length - 1];
  }

  // ── CÁLCULOS ─────────────────────────────────────────────────────────────

  // INSS anual — segue planilha: aplica tabela INSS sobre renda_bruta/12,
  // limitando ao teto. (Simplificação: na prática INSS é só sobre salário.)
  function calcINSS(rendaBruta) {
    var rendaMensal = rendaBruta / 12;
    if (rendaMensal > INSS_TETO_LIMITE) {
      return INSS_TETO_MENSAL * 12;
    }
    var faixa = lookupFaixa(rendaMensal, TAB_INSS);
    var inssMensal = (faixa.aliq * rendaMensal) - faixa.deduz;
    if (inssMensal < 0) inssMensal = 0;
    return inssMensal * 12;
  }

  // IR de uma base de cálculo, usando tabela anual: (base × alíq) − parcela
  function calcIR(base) {
    var faixa = lookupFaixa(base, TAB_ANUAL);
    var ir = (base * faixa.aliq) - faixa.deduz;
    return { ir: Math.max(0, ir), aliq: faixa.aliq, deduz: faixa.deduz };
  }

  // IR Retido (estimativa) — segue exatamente a fórmula da planilha:
  //   alíquota_da_renda_total × salário_anual − parcela_deduzir(daquela alíq)
  function calcIRRetido(salarioAnual, rendaBruta) {
    var faixa = lookupFaixa(rendaBruta, TAB_ANUAL);
    var ir = (salarioAnual * faixa.aliq) - faixa.deduz;
    return Math.max(0, ir);
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function set(id, v) { var el = $(id); if (el) el.textContent = v; }

  function recalcular() {
    var salario  = parseNum($('pg-salario').value);
    var alug     = parseNum($('pg-alugueis').value);
    var outras   = parseNum($('pg-outras').value);
    var eduProp  = parseNum($('pg-edu-prop').value);
    var sauProp  = parseNum($('pg-saude-prop').value);
    var nDep     = parseInt($('pg-dependentes').value, 10) || 0;
    var eduDep   = parseNum($('pg-edu-dep').value);
    var sauDep   = parseNum($('pg-saude-dep').value);

    // Mostra/esconde campos de dependentes
    $('pg-dep-fields').style.display = nDep > 0 ? '' : 'none';

    var rendaBruta = salario + alug + outras;

    // ── Aporte máximo PGBL = 12% renda bruta ───────────────────────────
    var aporteMax = rendaBruta * 0.12;
    set('pg-aporte-val', fmtBRL(aporteMax));
    if (rendaBruta > 0) {
      $('pg-aporte-sub').textContent =
        'limite de 12% sobre ' + fmtBRL(rendaBruta) + ' de renda bruta tributável anual.';
    } else {
      $('pg-aporte-sub').textContent =
        'preencha sua renda anual para ver quanto pode aportar.';
    }

    // Se ainda não preencheu nada, esconde tabela
    if (rendaBruta <= 0) {
      $('pg-tabela-wrap').style.opacity = '0.4';
      $('pg-economia').style.display = 'none';
      ['rb','inss','dep','sau','edu','pgbl','ded','bc','aliq','ird','irr','saldo','eff'].forEach(function (k) {
        ['h','i','j'].forEach(function (col) { set('pg-' + col + '-' + k, '—'); });
      });
      return;
    }
    $('pg-tabela-wrap').style.opacity = '1';

    // ── INSS ─────────────────────────────────────────────────────────
    var inss = calcINSS(rendaBruta);

    // ── Dependentes (anual) ──────────────────────────────────────────
    var dedDep = nDep * DED_DEPENDENTE;

    // ── Saúde (sem limite) ───────────────────────────────────────────
    var dedSaude = sauProp + sauDep;

    // ── Educação (com limite POR PESSOA: titular + cada dependente) ──
    // Próprio: min(eduProp, limite). Dependentes: min(eduDep, limite × nDep)
    var dedEduProp = Math.min(eduProp, DED_EDUCACAO_LIMITE);
    var dedEduDep  = Math.min(eduDep, DED_EDUCACAO_LIMITE * nDep);
    var dedEducacao = dedEduProp + dedEduDep;

    // ── PGBL (no completo c/ PGBL = aporte máximo) ───────────────────
    var pgblMax = aporteMax;

    // ── COLUNA H: SIMPLIFICADO ───────────────────────────────────────
    // Dedução: min(20% renda, 17.640)
    var dedSimplif = Math.min(rendaBruta * 0.20, SIMPLIFICADO_TETO);
    var bcH = rendaBruta - dedSimplif;
    var ifaixaH = calcIR(bcH);

    // ── COLUNA I: COMPLETO S/ PGBL ───────────────────────────────────
    var dedCompletoSemPGBL = inss + dedDep + dedSaude + dedEducacao;
    var bcI = rendaBruta - dedCompletoSemPGBL;
    var ifaixaI = calcIR(bcI);

    // ── COLUNA J: COMPLETO C/ PGBL ───────────────────────────────────
    var dedCompletoComPGBL = inss + dedDep + dedSaude + dedEducacao + pgblMax;
    var bcJ = rendaBruta - dedCompletoComPGBL;
    var ifaixaJ = calcIR(bcJ);

    // ── IR RETIDO (mesmo nas 3 colunas — depende só do salário e renda total) ──
    var irRet = calcIRRetido(salario, rendaBruta);

    // ── PREENCHE TABELA ──────────────────────────────────────────────
    set('pg-h-rb', fmtBRL(rendaBruta));
    set('pg-i-rb', fmtBRL(rendaBruta));
    set('pg-j-rb', fmtBRL(rendaBruta));

    // INSS, Dep, Sau, Edu, PGBL — só se aplicam ao Completo (s/ e c/ PGBL)
    set('pg-h-inss', '—');
    set('pg-i-inss', fmtBRL(inss));
    set('pg-j-inss', fmtBRL(inss));

    set('pg-h-dep', '—');
    set('pg-i-dep', fmtBRL(dedDep));
    set('pg-j-dep', fmtBRL(dedDep));

    set('pg-h-sau', '—');
    set('pg-i-sau', fmtBRL(dedSaude));
    set('pg-j-sau', fmtBRL(dedSaude));

    set('pg-h-edu', '—');
    set('pg-i-edu', fmtBRL(dedEducacao));
    set('pg-j-edu', fmtBRL(dedEducacao));

    set('pg-h-pgbl', '—');
    set('pg-i-pgbl', '—');
    set('pg-j-pgbl', fmtBRL(pgblMax));

    // Total de Deduções
    set('pg-h-ded', fmtBRL(dedSimplif));
    set('pg-i-ded', fmtBRL(dedCompletoSemPGBL));
    set('pg-j-ded', fmtBRL(dedCompletoComPGBL));

    // Base de Cálculo
    set('pg-h-bc', fmtBRL(bcH));
    set('pg-i-bc', fmtBRL(bcI));
    set('pg-j-bc', fmtBRL(bcJ));

    // Alíquota
    set('pg-h-aliq', fmtPct(ifaixaH.aliq, 1));
    set('pg-i-aliq', fmtPct(ifaixaI.aliq, 1));
    set('pg-j-aliq', fmtPct(ifaixaJ.aliq, 1));

    // IR Devido
    set('pg-h-ird', fmtBRL(ifaixaH.ir));
    set('pg-i-ird', fmtBRL(ifaixaI.ir));
    set('pg-j-ird', fmtBRL(ifaixaJ.ir));

    // IR Retido (igual nas 3)
    set('pg-h-irr', fmtBRL(irRet));
    set('pg-i-irr', fmtBRL(irRet));
    set('pg-j-irr', fmtBRL(irRet));

    // Saldo (positivo = restituição; negativo = pagar)
    var saldoH = irRet - ifaixaH.ir;
    var saldoI = irRet - ifaixaI.ir;
    var saldoJ = irRet - ifaixaJ.ir;
    function fmtSaldo(v) {
      if (isNaN(v)) return '—';
      if (v >= 0)   return '<span class="pg-restituir">' + fmtBRL(v) + ' a restituir</span>';
      return         '<span class="pg-pagar">' + fmtBRL(Math.abs(v)) + ' a pagar</span>';
    }
    $('pg-h-saldo').innerHTML = fmtSaldo(saldoH);
    $('pg-i-saldo').innerHTML = fmtSaldo(saldoI);
    $('pg-j-saldo').innerHTML = fmtSaldo(saldoJ);

    // Alíquota efetiva
    set('pg-h-eff', fmtPct(ifaixaH.ir / rendaBruta));
    set('pg-i-eff', fmtPct(ifaixaI.ir / rendaBruta));
    set('pg-j-eff', fmtPct(ifaixaJ.ir / rendaBruta));

    // ── DESTAQUE: economia com PGBL ─────────────────────────────────
    var melhor = Math.min(ifaixaH.ir, ifaixaI.ir, ifaixaJ.ir);
    var economia = ifaixaI.ir - ifaixaJ.ir;  // s/PGBL menos c/PGBL
    if (economia > 0.01 && pgblMax > 0) {
      $('pg-economia').style.display = 'block';
      $('pg-econ-titulo').textContent =
        'Aportando ' + fmtBRL(pgblMax) + ' em PGBL você economiza ' + fmtBRL(economia) + ' em IR.';
      var detalheParts = [
        'Alíquota efetiva cai de ' + fmtPct(ifaixaI.ir / rendaBruta) + ' para ' + fmtPct(ifaixaJ.ir / rendaBruta) + '.',
      ];
      // Aviso se o melhor regime for o simplificado (PGBL não compensa)
      if (ifaixaH.ir < ifaixaJ.ir) {
        detalheParts.push(
          '⚠️ Atenção: para o seu perfil, a declaração SIMPLIFICADA paga ' +
          fmtBRL(ifaixaJ.ir - ifaixaH.ir) + ' menos de IR — o PGBL só compensa se você optar pela completa.'
        );
      }
      $('pg-econ-detalhe').textContent = detalheParts.join(' ');
    } else {
      $('pg-economia').style.display = 'none';
    }
  }

  // ── PDF ──────────────────────────────────────────────────────────────
  // Abre uma nova janela com HTML formatado pra impressão e dispara
  // window.print(). O usuário escolhe "Salvar como PDF" no diálogo.
  function gerarPDF() {
    var w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para gerar o PDF.'); return; }

    var hoje = new Date().toLocaleDateString('pt-BR');
    var get = function (id) { return document.getElementById(id).value || ''; };
    var getT = function (id) {
      var el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : '—';
    };
    var getH = function (id) {
      var el = document.getElementById(id);
      return el ? (el.innerHTML || '').trim() : '—';
    };

    // Dependentes — texto descritivo
    var depSel = document.getElementById('pg-dependentes');
    var nDep = parseInt(depSel.value, 10) || 0;
    var depTxt = nDep === 0 ? 'Não tem' : (nDep + ' dependente' + (nDep > 1 ? 's' : ''));

    // Bloco de economia (se existir e estiver visível)
    var econEl = document.getElementById('pg-economia');
    var econHTML = '';
    if (econEl && econEl.style.display !== 'none') {
      econHTML =
        '<div class="econ"><strong>' + getT('pg-econ-titulo') + '</strong>' +
        '<div class="econ-det">' + getT('pg-econ-detalhe') + '</div></div>';
    }

    // Linha de dependentes só aparece se houver dependentes
    var depRows = nDep > 0
      ? '<div class="box"><div class="box-lbl">Educação dependentes</div><div class="box-val">R$ ' + (get('pg-edu-dep') || '0,00') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Saúde dependentes</div><div class="box-val">R$ ' + (get('pg-saude-dep') || '0,00') + '</div></div>'
      : '';

    // PDF compacto — projetado pra caber em 1 página A4 retrato.
    // - margens menores, fontes reduzidas, paddings compactos
    // - aviso "Atenção" virou pílula compacta no rodapé do cabeçalho
    // - cabeçalho merged: título + premissas em duas colunas (renda à
    //   esquerda, despesas à direita) → economiza ~80% de espaço
    var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
'<title>Simulação PGBL — IRPF 2026 - ' + hoje + '</title>' +
'<style>' +
'@page{size:A4 portrait;margin:7mm 9mm}' +
'*{box-sizing:border-box}' +
'body{font-family:"Helvetica","Arial",sans-serif;color:#111;font-size:9px;margin:0;padding:0;line-height:1.35}' +
'h1{font-size:14px;color:#002060;margin:0;font-weight:700}' +
'.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #002060;padding-bottom:4px;margin-bottom:8px}' +
'.hdr-sub{font-size:8.5px;color:#666;text-align:right}' +
'h2{font-size:9px;color:#002060;margin:8px 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:.5px solid #d0d4dc;padding-bottom:2px}' +
'.aporte{background:#002060;color:#fff;border-radius:4px;padding:8px 14px;margin:6px 0;text-align:center;display:flex;align-items:center;justify-content:space-between;gap:14px}' +
'.aporte-lbl{font-size:8px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.7);font-weight:600}' +
'.aporte-val{font-size:18px;font-weight:700;letter-spacing:-.2px}' +
'.aporte-sub{font-size:8px;color:rgba(255,255,255,.65);text-align:right;flex:1}' +
'.dual-col{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}' +
'.col-block h3{font-size:8.5px;color:#002060;margin:0 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}' +
'.box-row{display:grid;grid-template-columns:1.2fr .8fr;gap:6px;padding:3px 8px;background:#f5f5f7;border-radius:2px;margin-bottom:2px;font-size:9px;align-items:baseline}' +
'.box-row .lbl{color:#555;font-weight:500;font-size:8.5px}' +
'.box-row .val{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}' +
'table{width:100%;border-collapse:collapse;font-size:8.5px;margin-top:2px;table-layout:fixed}' +
'thead th{background:#002060;color:#fff;padding:4px 5px;font-size:7.5px;font-weight:600;text-transform:uppercase;letter-spacing:.2px;text-align:right;line-height:1.15}' +
'thead th:first-child{text-align:left;width:36%}' +
'thead th.col-pgbl{background:#0a6640}' +
'tbody td{padding:3px 5px;border-bottom:.5px solid #e5e5e7;text-align:right;font-variant-numeric:tabular-nums;line-height:1.25}' +
'tbody td:first-child{text-align:left;font-weight:500;color:#333;font-size:8.5px}' +
'tbody td.col-pgbl{background:rgba(10,102,64,.06)}' +
'tbody tr.row-total td{background:#eef0f5;font-weight:700;border-top:.8px solid #aab}' +
'tbody tr.row-total td.col-pgbl{background:rgba(10,102,64,.14);font-weight:700}' +
'tbody tr.row-saldo td{background:#eef0f5;font-weight:700;font-size:9px}' +
'tbody tr.row-saldo td.col-pgbl{background:rgba(10,102,64,.14)}' +
'.pos{color:#0a6640;font-weight:700}.neg{color:#b91c1c;font-weight:700}' +
'.disc{padding:5px 9px;border-radius:2px;font-size:8px;margin:5px 0 2px;border-left:2px solid;line-height:1.35}' +
'.disc.ir{background:#FFF8E6;border-color:#7A5C00;color:#7A5C00}' +
'.econ{background:#e8f5ec;border:1px solid #0a6640;border-left:3px solid #0a6640;border-radius:3px;padding:6px 10px;margin:6px 0 4px}' +
'.econ strong{color:#0a6640;font-size:9.5px;display:block}' +
'.econ-det{font-size:8px;color:#0a6640;margin-top:2px;font-weight:500;line-height:1.4}' +
'.foot{margin-top:6px;font-size:7px;color:#999;text-align:center;line-height:1.4}' +
'@media print{button{display:none}}' +
'button{position:fixed;top:10px;right:10px;padding:8px 16px;background:#002060;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600}' +
'</style></head><body>' +
'<button onclick="window.print()">Imprimir / Salvar PDF</button>' +

'<div class="hdr">' +
  '<h1>Simulação PGBL — IRPF 2026</h1>' +
  '<div class="hdr-sub">' + hoje + ' · Lei 15.270/2025 · Portaria INSS 12/2024</div>' +
'</div>' +

'<div class="aporte">' +
  '<div><div class="aporte-lbl">Você pode aportar em PGBL</div></div>' +
  '<div class="aporte-val">' + getT('pg-aporte-val') + '</div>' +
  '<div class="aporte-sub">' + getT('pg-aporte-sub') + '</div>' +
'</div>' +

'<div class="dual-col">' +
  '<div class="col-block">' +
    '<h3>Renda Anual Tributável</h3>' +
    '<div class="box-row"><span class="lbl">Salário bruto</span><span class="val">R$ ' + (get('pg-salario') || '0,00') + '</span></div>' +
    '<div class="box-row"><span class="lbl">Aluguéis</span><span class="val">R$ ' + (get('pg-alugueis') || '0,00') + '</span></div>' +
    '<div class="box-row"><span class="lbl">Outras rendas tributáveis</span><span class="val">R$ ' + (get('pg-outras') || '0,00') + '</span></div>' +
  '</div>' +
  '<div class="col-block">' +
    '<h3>Despesas Dedutíveis</h3>' +
    '<div class="box-row"><span class="lbl">Educação (própria)</span><span class="val">R$ ' + (get('pg-edu-prop') || '0,00') + '</span></div>' +
    '<div class="box-row"><span class="lbl">Saúde (própria)</span><span class="val">R$ ' + (get('pg-saude-prop') || '0,00') + '</span></div>' +
    '<div class="box-row"><span class="lbl">Dependentes</span><span class="val">' + depTxt + '</span></div>' +
    (nDep > 0
      ? '<div class="box-row"><span class="lbl">Educação dependentes</span><span class="val">R$ ' + (get('pg-edu-dep') || '0,00') + '</span></div>' +
        '<div class="box-row"><span class="lbl">Saúde dependentes</span><span class="val">R$ ' + (get('pg-saude-dep') || '0,00') + '</span></div>'
      : '') +
  '</div>' +
'</div>' +

'<h2>Comparativo — Simplificado × Completo</h2>' +
'<table>' +
  '<thead><tr>' +
    '<th>Descrição</th>' +
    '<th>Simplificado</th>' +
    '<th>Completo s/ PGBL</th>' +
    '<th class="col-pgbl">Completo c/ PGBL</th>' +
  '</tr></thead><tbody>' +
  '<tr><td>Renda Bruta</td>             <td>'+getT('pg-h-rb')+'</td><td>'+getT('pg-i-rb')+'</td><td class="col-pgbl">'+getT('pg-j-rb')+'</td></tr>' +
  '<tr><td>(–) INSS</td>                <td>'+getT('pg-h-inss')+'</td><td>'+getT('pg-i-inss')+'</td><td class="col-pgbl">'+getT('pg-j-inss')+'</td></tr>' +
  '<tr><td>(–) Dependentes</td>         <td>'+getT('pg-h-dep')+'</td><td>'+getT('pg-i-dep')+'</td><td class="col-pgbl">'+getT('pg-j-dep')+'</td></tr>' +
  '<tr><td>(–) Despesas c/ Saúde</td>   <td>'+getT('pg-h-sau')+'</td><td>'+getT('pg-i-sau')+'</td><td class="col-pgbl">'+getT('pg-j-sau')+'</td></tr>' +
  '<tr><td>(–) Despesas c/ Educação</td><td>'+getT('pg-h-edu')+'</td><td>'+getT('pg-i-edu')+'</td><td class="col-pgbl">'+getT('pg-j-edu')+'</td></tr>' +
  '<tr><td>(–) PGBL (12%)</td>          <td>'+getT('pg-h-pgbl')+'</td><td>'+getT('pg-i-pgbl')+'</td><td class="col-pgbl">'+getT('pg-j-pgbl')+'</td></tr>' +
  '<tr class="row-total"><td>= Total de Deduções</td><td>'+getT('pg-h-ded')+'</td><td>'+getT('pg-i-ded')+'</td><td class="col-pgbl">'+getT('pg-j-ded')+'</td></tr>' +
  '<tr><td>Base de Cálculo</td>         <td>'+getT('pg-h-bc')+'</td><td>'+getT('pg-i-bc')+'</td><td class="col-pgbl">'+getT('pg-j-bc')+'</td></tr>' +
  '<tr><td>Alíquota</td>                <td>'+getT('pg-h-aliq')+'</td><td>'+getT('pg-i-aliq')+'</td><td class="col-pgbl">'+getT('pg-j-aliq')+'</td></tr>' +
  '<tr class="row-total"><td>IR Devido</td><td>'+getT('pg-h-ird')+'</td><td>'+getT('pg-i-ird')+'</td><td class="col-pgbl">'+getT('pg-j-ird')+'</td></tr>' +
  '<tr><td>IR Retido <sup>*</sup></td>  <td>'+getT('pg-h-irr')+'</td><td>'+getT('pg-i-irr')+'</td><td class="col-pgbl">'+getT('pg-j-irr')+'</td></tr>' +
  '<tr class="row-saldo"><td>Restituir / Pagar</td><td>'+getH('pg-h-saldo')+'</td><td>'+getH('pg-i-saldo')+'</td><td class="col-pgbl">'+getH('pg-j-saldo')+'</td></tr>' +
  '<tr><td>Alíquota Efetiva</td>        <td>'+getT('pg-h-eff')+'</td><td>'+getT('pg-i-eff')+'</td><td class="col-pgbl">'+getT('pg-j-eff')+'</td></tr>' +
  '</tbody>' +
'</table>' +

econHTML +

'<div class="disc ir"><strong>*</strong> O IR Retido considera a alíquota da renda bruta total aplicada apenas sobre o salário, podendo variar de acordo com a fonte pagadora. <b>Mera simulação ilustrativa</b> — não constitui aconselhamento fiscal. Confira sua situação com um contador habilitado.</div>' +

'<div class="foot">Simulador PGBL · IRPF 2026 (Lei 15.270/2025) · Gerado em ' + hoje + '</div>' +
'</body></html>';

    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
  }

  // ── EVENTOS ──────────────────────────────────────────────────────────
  // bindNumeric: para <input> com valores monetários — recalcula a cada
  // tecla e reformata em pt-BR no blur.
  function bindNumeric(id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('change', recalcular);
    el.addEventListener('blur', function () {
      var v = parseNum(el.value);
      if (v > 0) el.value = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      else if (v === 0 && el.value.trim() === '0') el.value = '';
    });
  }

  // bindSelect: para <select> — apenas recalcula no change. NÃO mexe no
  // value no blur, senão o select perde a opção selecionada (ex.: "2"
  // vira "2,00" e nenhuma <option> bate).
  function bindSelect(id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', recalcular);
  }

  ['pg-salario','pg-alugueis','pg-outras','pg-edu-prop','pg-saude-prop',
   'pg-edu-dep','pg-saude-dep'].forEach(bindNumeric);

  bindSelect('pg-dependentes');

  var btnClear = $('pg-clear');
  if (btnClear) {
    btnClear.addEventListener('click', function () {
      ['pg-salario','pg-alugueis','pg-outras','pg-edu-prop','pg-saude-prop',
       'pg-edu-dep','pg-saude-dep'].forEach(function (id) {
        var el = $(id);
        if (el) el.value = '';
      });
      $('pg-dependentes').value = '0';
      recalcular();
    });
  }

  var btnPDF = $('pg-pdf-btn');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);

  // Render inicial
  recalcular();

})();
