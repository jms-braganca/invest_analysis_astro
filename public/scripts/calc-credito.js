/* calc-credito.js — Crédito vs Investimentos (com cronograma e PDF) */
(function () {
  'use strict';

  // Formata número sem prefixo "R$" (usado no cronograma — a unidade
  // aparece uma única vez no cabeçalho da seção pra economizar largura).
  function fBR_n(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function calcCredito() {
    var valor    = pBR(document.getElementById('cr-valor').value);
    var taxaMes  = pBR(document.getElementById('cr-taxa').value)/100;
    var prazo    = Math.max(1, Math.round(pBR(document.getElementById('cr-prazo').value) || 0));
    var iofRS    = pBR(document.getElementById('cr-iof').value);
    var tabela   = document.getElementById('cr-tabela').value;
    var carencia = Math.max(0, Math.round(pBR(document.getElementById('cr-carencia').value) || 0));
    var rentAA   = pBR(document.getElementById('cr-rentab').value)/100;
    var usaRend  = document.getElementById('cr-usarend').value === 'Sim';

    if (!isFinite(valor) || !isFinite(taxaMes) || !isFinite(iofRS) || !isFinite(rentAA) ||
        valor <= 0 || taxaMes < 0 || iofRS < 0) {
      sv('cr-iofpct', '—'); sv('cr-saldoini', '—');
      sv('cr-prazototal', '—'); sv('cr-parcela', '—');
      sv('cr-r-juros', '—'); sv('cr-r-iof', '—');
      sv('cr-r-rend', '—'); sv('cr-r-ganho', '—');
      document.getElementById('cr-tbody').innerHTML = '';
      document.getElementById('cr-disc').style.display = 'none';
      return;
    }

    var iofPct   = iofRS / valor;
    var saldoIni = valor + iofRS;
    var rentMes  = Math.pow(1 + rentAA, 1/12) - 1;
    var totalMeses = prazo + carencia;

    var saldoPosCar = saldoIni * Math.pow(1 + taxaMes, carencia);
    var pmtPrice = taxaMes > 0
      ? saldoPosCar * (taxaMes * Math.pow(1 + taxaMes, prazo)) / (Math.pow(1 + taxaMes, prazo) - 1)
      : saldoPosCar / prazo;
    var amortSAC = saldoPosCar / prazo;

    var rows = [];
    var saldoDev = saldoIni;
    var valInv = valor;
    var difAcc = 0, rendAcc = 0, jurosPagos = 0, rendTotal = 0;

    for (var m = 1; m <= totalMeses; m++) {
      var juros = saldoDev * taxaMes;
      var amort, parcela, saldoFim;
      if (m <= carencia) {
        amort = 0; parcela = 0;
        saldoFim = saldoDev + juros;
      } else {
        if (tabela === 'Price') {
          parcela = pmtPrice;
          amort = parcela - juros;
        } else {
          amort = amortSAC;
          parcela = juros + amort;
        }
        saldoFim = saldoDev - amort;
      }

      var rend = valInv * rentMes;
      var pgto = usaRend ? -parcela : 0;
      var valFim = valInv + rend + pgto;
      var difMes = rend - juros;
      difAcc += difMes;
      rendAcc += rend;
      if (m > carencia) jurosPagos += juros;
      rendTotal += rend;

      rows.push({
        mes: m, saldoDev: saldoDev, juros: juros, amort: amort, parcela: parcela,
        saldoFim: saldoFim, valIni: valInv, rend: rend, pgto: pgto, valFim: valFim,
        difMes: difMes, difAcc: difAcc, rendAcc: rendAcc
      });
      saldoDev = saldoFim;
      valInv = valFim;
    }

    var ganho = rendTotal - iofRS - jurosPagos;

    sv('cr-iofpct',     fPct(iofPct, 4));
    sv('cr-saldoini',   fBRL(saldoIni));
    sv('cr-prazototal', totalMeses + ' meses (' + prazo + ' + ' + carencia + ' carência)');
    sv('cr-parcela', tabela === 'SAC'
       ? fBRL(rows[carencia] ? rows[carencia].parcela : 0) + ' (1ª)'
       : fBRL(pmtPrice));

    sc('cr-r-juros', fBRL(jurosPagos));
    sc('cr-r-iof',   fBRL(iofRS));
    sc('cr-r-rend',  fBRL(rendTotal));

    var ganhoEl = document.getElementById('cr-r-ganho');
    ganhoEl.textContent = fBRL(ganho);
    ganhoEl.className = 'cc-mc-val ' + (ganho >= 0 ? 'grn' : 'red');

    var disc = document.getElementById('cr-disc');
    if (ganho >= 0) {
      disc.className = 'cc-disc ok';
      disc.textContent = 'Vale a pena tomar o crédito! Mantendo os investimentos rendendo, o ganho líquido é de ' +
                          fBRL(ganho) + ' ao final de ' + totalMeses + ' meses.';
    } else {
      disc.className = 'cc-disc ko';
      disc.textContent = 'Não compensa: o custo do crédito (juros + IOF = ' + fBRL(jurosPagos + iofRS) +
                          ') supera o rendimento dos investimentos (' + fBRL(rendTotal) +
                          '). Diferença líquida: ' + fBRL(Math.abs(ganho)) + '.';
    }
    disc.style.display = '';

    var html = '';
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var difCol    = r.difMes >= 0 ? 'var(--pos)' : 'var(--neg)';
      var difAccCol = r.difAcc >= 0 ? 'var(--pos)' : 'var(--neg)';
      var tagCar = r.mes <= carencia
        ? ' <span style="font-size:9px;color:var(--muted);font-weight:400">(carência)</span>'
        : '';
      html +=
        '<tr>' +
        '<td style="text-align:center;font-weight:600">' + r.mes + tagCar + '</td>' +
        '<td>' + fBR_n(r.saldoDev) + '</td>' +
        '<td style="color:var(--neg)">' + fBR_n(r.juros) + '</td>' +
        '<td>' + fBR_n(r.amort) + '</td>' +
        '<td style="font-weight:600">' + fBR_n(r.parcela) + '</td>' +
        '<td>' + fBR_n(r.saldoFim) + '</td>' +
        '<td>' + fBR_n(r.valIni) + '</td>' +
        '<td style="color:var(--pos)">' + fBR_n(r.rend) + '</td>' +
        '<td>' + fBR_n(r.pgto) + '</td>' +
        '<td>' + fBR_n(r.valFim) + '</td>' +
        '<td style="color:' + difCol + '">' + fBR_n(r.difMes) + '</td>' +
        '<td style="color:' + difAccCol + ';font-weight:600">' + fBR_n(r.difAcc) + '</td>' +
        '<td style="color:var(--pos);font-weight:600">' + fBR_n(r.rendAcc) + '</td>' +
        '</tr>';
    }
    document.getElementById('cr-tbody').innerHTML = html;
  }

  /* ── PDF do cronograma ─── */
  function gerarPDFCredito() {
    var w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para gerar o PDF.'); return; }
    var hoje = new Date().toLocaleDateString('pt-BR');
    var get = function (id) { return document.getElementById(id).value; };
    var getT = function (id) { return document.getElementById(id).textContent; };

    var carenciaSel = document.getElementById('cr-carencia');
    var carencia = carenciaSel.options[carenciaSel.selectedIndex].text;
    var ganhoCls = document.getElementById('cr-r-ganho').className.indexOf('grn') >= 0 ? 'pos' : 'neg';
    var discCls  = document.getElementById('cr-disc').className.indexOf(' ok') >= 0 ? 'ok' : 'ko';

    // Remove a 6ª coluna ("Saldo Dev. F.") de cada <tr> só pro PDF — economiza
    // largura horizontal pra não cortar a última coluna ("Rend. Acum.").
    var tbodyTemp = document.createElement('tbody');
    tbodyTemp.innerHTML = document.getElementById('cr-tbody').innerHTML;
    tbodyTemp.querySelectorAll('tr').forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds[5]) tds[5].remove();   // índice 5 = 6ª coluna
    });
    var tbody = tbodyTemp.innerHTML;

    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>Simulação Crédito vs Investimentos - ' + hoje + '</title>' +
      '<style>' +
      // Forçar landscape A4 (297×210 mm). Repetimos a regra de várias formas
      // pra contornar inconsistências entre navegadores e settings do user
      // no diálogo de impressão (alguns Chromes ignoram "landscape" se o
      // setting padrão do dialog for "Retrato"; aí cai no fallback "size:
      // 297mm 210mm" que define dimensões físicas explícitas).
      '@page{size:A4 landscape;size:297mm 210mm;margin:8mm 10mm}' +
      '@media print{@page{size:A4 landscape;size:297mm 210mm;margin:8mm 10mm}html,body{width:297mm}}' +
      'html,body{margin:0;padding:0}' +
      'body{font-family:"Helvetica","Arial",sans-serif;color:#111;font-size:10px;padding:0}' +
      // Instrução visível enquanto o user vê na tela (não é impressa)
      '.print-tip{background:#FFF8E1;border:1px solid #F59E0B;border-left:6px solid #F59E0B;border-radius:4px;padding:10px 14px;margin:10px 12px 14px;font-size:12px;color:#78350F;line-height:1.45;display:flex;align-items:flex-start;gap:10px}' +
      '.print-tip strong{color:#92400E;font-weight:700}' +
      '.print-tip svg{flex-shrink:0;margin-top:2px}' +
      '@media print{.print-tip{display:none !important}}' +
      'h1{font-size:18px;color:#002060;margin:0 0 4px;font-weight:600}' +
      'h2{font-size:12px;color:#002060;margin:12px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #002060;padding-bottom:3px}' +
      '.sub{font-size:10px;color:#666;margin-bottom:10px}' +
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}' +
      '.box{background:#f5f5f7;border-radius:3px;padding:6px 9px}' +
      '.box-lbl{font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}' +
      '.box-val{font-size:11px;font-weight:600;color:#111}' +
      '.box-val.pos{color:#0a6640}.box-val.neg{color:#b91c1c}.box-val.blu{color:#002060}' +
      '.disc{padding:8px 12px;border-radius:3px;font-size:10px;margin:8px 0;border-left:3px solid}' +
      '.disc.ok{background:#e8f5ec;border-color:#0a6640;color:#0a6640}' +
      '.disc.ko{background:#fbe9e9;border-color:#b91c1c;color:#b91c1c}' +
      '.warn-big{display:flex;align-items:flex-start;gap:14px;background:#FFF8E1;border:2px solid #F59E0B;border-left:8px solid #F59E0B;border-radius:6px;padding:14px 16px;margin:10px 0 14px}' +
      '.warn-big svg{flex-shrink:0;margin-top:2px}' +
      '.warn-big .warn-title{font-size:13px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}' +
      '.warn-big .warn-body{font-size:10.5px;line-height:1.5;color:#78350F;font-weight:500}' +
      'table{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:4px;table-layout:fixed}' +
      'thead th{background:#002060;color:#fff;padding:6px 5px;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;text-align:right;line-height:1.25;word-wrap:break-word}' +
      'thead th:first-child{text-align:center}' +
      'tbody td{padding:5px 5px;border-bottom:1px solid #e5e5e7;text-align:right;font-variant-numeric:tabular-nums;word-wrap:break-word}' +
      'tbody td:first-child{text-align:center;font-weight:600}' +
      'tbody tr:nth-child(even){background:#fafafb}' +
      // Larguras: 1ª col (mês) = 3.5%, restantes 11 cols dividem 96.5% → 8.77% cada
      'col.c-mes{width:3.5%}col.c-num{width:8.77%}' +
      '.foot{margin-top:14px;font-size:8px;color:#999;text-align:center}' +
      '@media print{button{display:none}}' +
      'button{position:fixed;top:10px;right:10px;padding:8px 16px;background:#002060;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600}' +
      '</style></head><body>' +
      '<button onclick="window.print()">Imprimir / Salvar PDF</button>' +
      '<div class="print-tip">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>' +
        '<div>' +
          '<strong>Dica:</strong> ao abrir o diálogo de impressão, selecione orientação <strong>Paisagem</strong> ' +
          'e margens <strong>Padrão</strong> (ou Mínimas) para o cronograma caber em uma página.' +
        '</div>' +
      '</div>' +
      '<h1>Simulação: Crédito vs Investimentos</h1>' +
      '<div class="sub">Gerado em ' + hoje + '</div>' +
      '<div class="warn-big">' +
        '<svg width="42" height="42" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M24 4 L46 42 L2 42 Z" fill="#F59E0B" stroke="#92400E" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<rect x="22" y="17" width="4" height="14" fill="#1F1F1F" rx="1"/>' +
          '<circle cx="24" cy="36" r="2.4" fill="#1F1F1F"/>' +
        '</svg>' +
        '<div>' +
          '<div class="warn-title">Atenção — Mera simulação</div>' +
          '<div class="warn-body">Esta projeção tem fins exclusivamente <b>ilustrativos</b>. Os valores apresentados <b>não constituem promessa de rentabilidade</b>, garantia de retorno ou recomendação de investimento.</div>' +
        '</div>' +
      '</div>' +
      '<h2>Premissas</h2>' +
      '<div class="grid">' +
        '<div class="box"><div class="box-lbl">Valor do crédito</div><div class="box-val">R$ ' + get('cr-valor') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Taxa</div><div class="box-val">' + get('cr-taxa') + ' % a.m.</div></div>' +
        '<div class="box"><div class="box-lbl">Prazo (amortização)</div><div class="box-val">' + get('cr-prazo') + ' meses</div></div>' +
        '<div class="box"><div class="box-lbl">Carência</div><div class="box-val">' + carencia + '</div></div>' +
        '<div class="box"><div class="box-lbl">Tabela</div><div class="box-val">' + get('cr-tabela') + '</div></div>' +
        '<div class="box"><div class="box-lbl">IOF (R$)</div><div class="box-val">R$ ' + get('cr-iof') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Rentabilidade investim.</div><div class="box-val">' + get('cr-rentab') + ' % a.a.</div></div>' +
        '<div class="box"><div class="box-lbl">Pagar parcela com rend.?</div><div class="box-val">' + get('cr-usarend') + '</div></div>' +
      '</div>' +
      '<h2>Derivados</h2>' +
      '<div class="grid">' +
        '<div class="box"><div class="box-lbl">IOF efetivo</div><div class="box-val">' + getT('cr-iofpct') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Saldo devedor inicial</div><div class="box-val blu">' + getT('cr-saldoini') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Prazo total</div><div class="box-val">' + getT('cr-prazototal') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Parcela</div><div class="box-val">' + getT('cr-parcela') + '</div></div>' +
      '</div>' +
      '<h2>Resultado</h2>' +
      '<div class="grid">' +
        '<div class="box"><div class="box-lbl">Juros pagos</div><div class="box-val neg">' + getT('cr-r-juros') + '</div></div>' +
        '<div class="box"><div class="box-lbl">IOF</div><div class="box-val neg">' + getT('cr-r-iof') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Rendimento dos investimentos</div><div class="box-val pos">' + getT('cr-r-rend') + '</div></div>' +
        '<div class="box"><div class="box-lbl">Ganho com o crédito</div><div class="box-val ' + ganhoCls + '">' + getT('cr-r-ganho') + '</div></div>' +
      '</div>' +
      '<div class="disc ' + discCls + '">' + getT('cr-disc') + '</div>' +
      '<h2>Cronograma mês a mês <span style="font-size:9px;font-weight:500;color:#666;text-transform:none;letter-spacing:0;margin-left:4px">(valores em R$)</span></h2>' +
      // 12 colunas (sem "Saldo Dev. F."): 1 c-mes + 11 c-num
      '<table><colgroup><col class="c-mes">' +
      '<col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num">' +
      '<col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num">' +
      '<col class="c-num"><col class="c-num"><col class="c-num">' +
      '</colgroup>' +
      '<thead><tr>' +
        '<th>Mês</th><th>Saldo Devedor</th><th>Juros (A)</th><th>Amortização</th><th>Parcela</th>' +
        '<th>Valor Inicial</th><th>Rendimento (B)</th><th>Pagamento</th>' +
        '<th>Valor Final</th><th>Dif. Mensal (B−A)</th><th>Dif. Acumulada</th><th>Rend. Acum.</th>' +
      '</tr></thead><tbody>' + tbody + '</tbody></table>' +
      '<div class="foot">Simulação gerada pela calculadora Crédito vs Investimentos.</div>' +
      '</body></html>';

    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
  }

  // Bind inputs
  document.querySelectorAll('input, select').forEach(function (el) {
    el.addEventListener('input', calcCredito);
    el.addEventListener('change', calcCredito);
  });

  // Botões
  var clearBtn = document.querySelector('.calc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function () { limparCalculadora(calcCredito); });
  var pdfBtn = document.getElementById('cr-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDFCredito);

  instalarFormatacao();
  calcCredito();
})();
