/* ──────────────────────────────────────────────────────────────────────────
   calc-apos.js — Calculadora de Aposentadoria (perpetuidade)
   ──────────────────────────────────────────────────────────────────────────
   Modelo: o aposentado vive de uma renda mensal pagando JUROS REAIS sobre
   um patrimônio que não é consumido (perpetuidade). O patrimônio alvo é
   projetado pra preservar o poder de compra ao longo do tempo.

   Fórmulas-chave:

     1) Renda complementar       = renda_desejada - renda_INSS
     2) Patrimônio alvo (PV de
        perpetuidade)            = renda_complementar / juro_real_mensal_liq_de_IR
     3) Crescimento do patrimônio
        durante n meses          = patrim_atual * (1+i)^n  +  PMT * [((1+i)^n - 1) / i]
        Resolvendo pra PMT:
        PMT mensal               = (FV_alvo - patrim_atual*(1+i)^n) / [((1+i)^n - 1)/i]

   Como usamos juro REAL (acima da inflação), os valores em R$ são em
   "moeda de hoje". O aporte calculado é o equivalente em poder de compra
   atual — em R$ nominais futuros, ele cresceria com a inflação.
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // Parser de input: aceita "1.234,56" ou "1234.56" → 1234.56
  function parseNum(str) {
    if (str == null) return 0;
    var s = String(str).trim();
    if (!s) return 0;
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function fBRL(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    var sinal = v < 0 ? '-' : '';
    return sinal + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }
  function fBRL_int(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    var sinal = v < 0 ? '-' : '';
    return sinal + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');
  }
  function fPct(v, d) {
    if (isNaN(v) || !isFinite(v)) return '—';
    d = d || 1;
    return v.toFixed(d).replace('.', ',') + '%';
  }

  // ── CÁLCULO PRINCIPAL ──────────────────────────────────────────────
  // Dado renda mensal complementar, juro real anual líquido (%), patrim atual e n meses,
  // retorna { patrAlvo, aportePMT, totalAportado, rendimentoAcumulado }.
  function calcular(rendaCompl, juroRealAnualLiq, patrimAtual, nMeses) {
    if (rendaCompl <= 0 || juroRealAnualLiq <= 0) return null;

    // Juro real mensal líquido (composição: (1+anual)^(1/12) - 1)
    var iMes = Math.pow(1 + juroRealAnualLiq, 1/12) - 1;

    // Patrimônio alvo = renda mensal / juro mensal (PV de perpetuidade)
    var patrAlvo = rendaCompl / iMes;

    if (nMeses <= 0) {
      // Se já está aposentando, "aporte" = quanto falta no patrimônio
      return {
        patrAlvo: patrAlvo,
        aportePMT: Math.max(0, patrAlvo - patrimAtual),
        totalAportado: 0,
        rendimentoAcumulado: 0,
        falta: patrAlvo - patrimAtual,
        iMes: iMes,
      };
    }

    // FV do patrimônio atual no final do horizonte
    var fvAtual = patrimAtual * Math.pow(1 + iMes, nMeses);

    // Quanto falta cobrir com aportes
    var falta = patrAlvo - fvAtual;

    // PMT (FV de annuity inversa). Se falta <= 0, o patrim atual já basta
    var aportePMT = 0;
    if (falta > 0 && iMes > 0) {
      aportePMT = falta * iMes / (Math.pow(1 + iMes, nMeses) - 1);
    }

    var totalAportado = aportePMT * nMeses;
    var rendimentoAcumulado = patrAlvo - patrimAtual - totalAportado;

    return {
      patrAlvo: patrAlvo,
      aportePMT: aportePMT,
      totalAportado: totalAportado,
      rendimentoAcumulado: rendimentoAcumulado,
      falta: falta,
      iMes: iMes,
    };
  }

  function recalcular() {
    var idadeAtual  = parseInt($('ap-idade-atual').value, 10) || 0;
    var anos        = parseInt($('ap-anos').value, 10) || 0;
    var rendaDes    = parseNum($('ap-renda').value);
    var rendaINSS   = parseNum($('ap-inss').value);
    var juroBrutoAA = parseFloat($('ap-juro-real').value) / 100;     // 0.06
    var aliqIR      = parseFloat($('ap-aliq-ir').value) / 100;       // 0.15
    var patrimAtual = parseNum($('ap-patrimonio').value);

    // Atualiza valores selecionados (mostrados inline no <label>)
    var juroBrutoTxt = (juroBrutoAA * 100).toFixed(1).replace('.', ',');
    var elJuroShow = $('ap-juro-real-show');
    if (elJuroShow) elJuroShow.textContent = juroBrutoTxt + '% a.a.';
    var aliqTxt = (aliqIR * 100).toFixed(1).replace('.', ',').replace(',0', '');
    var elAliqShow = $('ap-aliq-ir-show');
    if (elAliqShow) elAliqShow.textContent = aliqTxt + '%';

    // Idade na aposentadoria
    if (idadeAtual > 0 && anos > 0) {
      $('ap-idade-aposent').textContent = (idadeAtual + anos) + ' anos';
    } else {
      $('ap-idade-aposent').textContent = '—';
    }

    // Juro real líquido de IR. Como o juro do slider é REAL (acima da
    // inflação), aplicamos IR sobre ele diretamente como aproximação
    // (premissa simplificadora — na prática o IR incide sobre o nominal,
    // mas a diferença é pequena pra horizontes longos).
    var juroLiqAA = juroBrutoAA * (1 - aliqIR);

    // Renda complementar (do investimento) = desejada - INSS
    var rendaCompl = Math.max(0, rendaDes - rendaINSS);

    var nMeses = anos * 12;

    var res = calcular(rendaCompl, juroLiqAA, patrimAtual, nMeses);

    if (!res || rendaCompl <= 0) {
      // Estado vazio
      $('ap-aporte-val').textContent = 'R$ 0,00';
      $('ap-aporte-sub').textContent = 'Preencha os campos acima para calcular.';
      $('ap-renda-comp').textContent = '—';
      $('ap-patr-alvo').textContent  = '—';
      $('ap-total-aport').textContent = '—';
      $('ap-total-rend').textContent  = '—';
      $('ap-cenarios-tbody').innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted2)">' +
        'Preencha os dados acima.</td></tr>';
      return;
    }

    // Bloco destaque
    if (res.falta <= 0) {
      $('ap-aporte-val').textContent = 'R$ 0,00';
      $('ap-aporte-sub').textContent =
        '🎉 Seu patrimônio atual já é suficiente! Você teria '
        + fBRL_int(patrimAtual - res.patrAlvo) + ' a mais que o necessário.';
    } else {
      $('ap-aporte-val').textContent = fBRL(res.aportePMT);
      $('ap-aporte-sub').textContent =
        'durante ' + nMeses + ' meses (' + anos + ' anos) com rendimento real líquido de '
        + fPct(juroLiqAA * 100) + ' a.a.';
    }

    // Quadro de resultado
    $('ap-renda-comp').textContent  = fBRL(rendaCompl) + '/mês';
    $('ap-patr-alvo').textContent   = fBRL_int(res.patrAlvo);
    $('ap-total-aport').textContent = fBRL_int(res.totalAportado);
    $('ap-total-rend').textContent  = fBRL_int(Math.max(0, res.rendimentoAcumulado));

    // ── Tabela MATRIZ: renda (linhas) × anos até aposentar (colunas)
    // Rendas: -20%, -10%, central, +10%, +20% da renda DESEJADA (não da
    // complementar — assim o user vê na coluna "Renda Mensal" os valores
    // que reconhece). O INSS é descontado de cada cenário.
    // Anos: anos-2, anos-1, anos, anos+1, anos+2 (mín 1).
    // Juro real mensal líquido (mesma fórmula usada em calcular())
    var iMesLiq = juroLiqAA > 0 ? Math.pow(1 + juroLiqAA, 1/12) - 1 : 0;

    var rendasMult = [0.80, 0.90, 1.00, 1.10, 1.20];
    var rendasArr = rendasMult.map(function (m) { return Math.round(rendaDes * m / 100) * 100; });
    var anoCentral = anos > 0 ? anos : 30;
    var anosArr = [-2, -1, 0, 1, 2].map(function (d) { return Math.max(1, anoCentral + d); });

    // Atualiza thead com os anos
    var theadAnos = $('ap-thead-anos');
    if (theadAnos) {
      theadAnos.innerHTML = anosArr.map(function (a, i) {
        var destaca = (i === 2);
        return '<th class="ap-anos-cell' + (destaca ? ' ap-cell-active' : '') + '">' +
                  a + (a === 1 ? ' ano' : ' anos') +
               '</th>';
      }).join('');
    }

    // Monta as linhas
    var matrizHTML = '';
    rendasArr.forEach(function (rendaLinha, iLin) {
      var rendaComplLinha = Math.max(0, rendaLinha - rendaINSS);
      // Patrimônio necessário desta linha (depende só da renda complementar
      // e do juro líquido — não muda com o prazo)
      var patrLinha = rendaComplLinha > 0 ? rendaComplLinha / iMesLiq : 0;
      var rowClass = (iLin === 2) ? ' class="ap-row-active"' : '';
      matrizHTML += '<tr' + rowClass + '>';
      matrizHTML += '<td class="ap-renda-cell">' + fBRL(rendaLinha) + '</td>';
      matrizHTML += '<td>' + (patrLinha > 0 ? fBRL_int(patrLinha) : '—') + '</td>';

      anosArr.forEach(function (an, iCol) {
        var nMes = an * 12;
        var r = calcular(rendaComplLinha, juroLiqAA, patrimAtual, nMes);
        var destacaCelula = (iLin === 2 && iCol === 2);
        var cellCls = 'ap-aporte-cell' + (destacaCelula ? ' ap-cell-active' : '');
        // data-anos é usado pelo CSS mobile como label do prazo na pílula
        var anosAttr = ' data-anos="' + an + '"';
        if (!r) {
          matrizHTML += '<td class="' + cellCls + '"' + anosAttr + '>—</td>';
          return;
        }
        var aporteTxt;
        if (r.falta <= 0) {
          aporteTxt = '<span class="ap-ok">R$ 0,00</span>';
        } else {
          aporteTxt = fBRL_int(r.aportePMT);  // mostra inteiro pra caber na célula
        }
        matrizHTML += '<td class="' + cellCls + '"' + anosAttr + '>' + aporteTxt + '</td>';
      });
      matrizHTML += '</tr>';
    });
    $('ap-cenarios-tbody').innerHTML = matrizHTML;
  }

  // ── EVENTOS ───────────────────────────────────────────────────────
  function bindNumeric(id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('change', recalcular);
    el.addEventListener('blur', function () {
      var v = parseNum(el.value);
      if (v > 0) {
        // Valores monetários ganham 2 decimais; idades/anos ficam inteiros
        var isMonetario = ['ap-renda', 'ap-inss', 'ap-patrimonio'].indexOf(id) !== -1;
        if (isMonetario) {
          el.value = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          el.value = String(Math.round(v));
        }
      }
    });
  }

  ['ap-idade-atual', 'ap-anos', 'ap-renda', 'ap-inss', 'ap-patrimonio',
   'ap-juro-real', 'ap-aliq-ir'].forEach(bindNumeric);

  var btnClear = $('ap-clear');
  if (btnClear) {
    btnClear.addEventListener('click', function () {
      ['ap-idade-atual', 'ap-anos', 'ap-renda', 'ap-inss', 'ap-patrimonio'].forEach(function (id) {
        var el = $(id); if (el) el.value = '';
      });
      $('ap-juro-real').value = '6';
      $('ap-aliq-ir').value = '15';
      recalcular();
    });
  }

  // ── PDF ───────────────────────────────────────────────────────────
  function gerarPDF() {
    var get = function (id) { var el = $(id); return el ? (el.value || '—') : '—'; };
    var getT = function (id) {
      var el = $(id); return el ? (el.textContent || '').trim() : '—';
    };
    var idadeAtual = get('ap-idade-atual');
    var anos       = get('ap-anos');
    var idadeApos  = getT('ap-idade-aposent');

    // Tabela de cenários (matriz renda × anos) — extrai do DOM já renderizado
    var tbodyEl = $('ap-cenarios-tbody');
    var theadAnosEl = $('ap-thead-anos');
    var cenariosRows = [];
    var anosHeader = ['—', '—', '—', '—', '—'];
    if (theadAnosEl) {
      var ths = theadAnosEl.querySelectorAll('th');
      anosHeader = Array.prototype.map.call(ths, function (th) { return (th.textContent || '').trim(); });
    }
    if (tbodyEl) {
      tbodyEl.querySelectorAll('tr').forEach(function (tr) {
        var tds = tr.querySelectorAll('td');
        if (tds.length === 7) {  // renda + patrim + 5 anos
          cenariosRows.push(Array.prototype.map.call(tds, function (td) {
            return (td.textContent || '').trim();
          }));
        }
      });
    }

    gerarPDFCalc({
      titulo:    'Aposentadoria — Plano de poupança',
      subtitulo: 'Modelo de perpetuidade · juro real líquido de IR',
      tituloPremissas: 'Premissas',
      premissas: [
        { lbl: 'Idade atual',                  val: idadeAtual + ' anos' },
        { lbl: 'Anos até aposentar',           val: anos + ' anos' },
        { lbl: 'Idade na aposentadoria',       val: idadeApos },
        { lbl: 'Renda mensal desejada',        val: 'R$ ' + get('ap-renda') },
        { lbl: 'Renda do INSS',                val: 'R$ ' + get('ap-inss') },
        { lbl: 'Patrimônio atual',             val: 'R$ ' + get('ap-patrimonio') },
        { lbl: 'Rendimento real',              val: getT('ap-juro-real-show') },
        { lbl: 'Alíquota IR',                  val: getT('ap-aliq-ir-show') },
      ],
      destaque: {
        label: 'Aporte mensal necessário',
        val:   getT('ap-aporte-val'),
        sub:   getT('ap-aporte-sub'),
      },
      tituloResultado: 'Resultado',
      resultado: [
        { lbl: 'Renda complementar',     val: getT('ap-renda-comp'),  col: 'blu' },
        { lbl: 'Patrimônio alvo',        val: getT('ap-patr-alvo'),   col: 'blu' },
        { lbl: 'Total aportado',         val: getT('ap-total-aport') },
        { lbl: 'Rendimento acumulado',   val: getT('ap-total-rend'),  col: 'pos' },
      ],
      tabela: {
        titulo: 'Cenários — meta de aporte mensal por renda × prazo',
        thead:  ['Renda Mensal', 'Patrim. Necessário'].concat(anosHeader),
        rows:   cenariosRows,
      },
      discIR:   '<strong>Modelo:</strong> perpetuidade — você nunca consome o principal, vive dos juros reais. ' +
                'Renda complementar = desejada − INSS. Juro real líquido de IR. Valores em R$ de hoje.',
      discWarn: true,
    });
  }
  var btnPDF = $('ap-pdf-btn');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);

  // Render inicial
  recalcular();
})();
