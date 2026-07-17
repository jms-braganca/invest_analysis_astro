/* ──────────────────────────────────────────────────────────────────────────
   calc-avista.js — À Vista vs Parcelado
   ──────────────────────────────────────────────────────────────────────────
   Compara duas estratégias considerando que a pessoa pode manter o dinheiro
   rendendo numa aplicação:

   • Cenário A — paga à vista: tira o preço com desconto da conta, sobra
     (preço_sem − preço_com_desconto) investido por N meses.
   • Cenário B — parcela sem desconto: mantém o dinheiro investido e paga
     parcela_mensal = preço_sem / N todo mês.

   Decisão: se taxa_embutida_parcelamento < rendimento → parcelar é melhor.

   Taxa embutida é o `i` que satisfaz:
     preço_com_desconto = (preço_sem / N) × [1-(1+i)^-N]/i

   (resolve via bisseção, mesma função do CET).
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function parseNum(s) {
    if (s == null) return 0;
    s = String(s).trim();
    if (!s) return 0;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fBRL(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function fPct(v, dec) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return (v * 100).toFixed(dec == null ? 2 : dec).replace('.', ',') + '%';
  }

  // Bisseção (mesma lógica do calc-cet.js — duplicada aqui pra ser standalone)
  function calcularTaxa(pv, pmt, n) {
    if (pv <= 0 || pmt <= 0 || n <= 0) return null;
    if (pmt * n <= pv + 1e-6) return 0;
    function fa(i, n) { return Math.abs(i) < 1e-12 ? n : (1 - Math.pow(1 + i, -n)) / i; }
    function f(i) { return pmt * fa(i, n) - pv; }
    var lo = 0, hi = 1.0;
    while (f(hi) > 0 && hi < 1e6) hi *= 2;
    if (f(hi) > 0) return null;
    for (var k = 0; k < 200; k++) {
      var mid = (lo + hi) / 2;
      var fm = f(mid);
      if (Math.abs(fm) < 1e-12 || (hi - lo) < 1e-14) return mid;
      if (fm > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function recalcular() {
    var pCheio = parseNum($('av-cheio').value);
    var pDesc  = parseNum($('av-desc').value);
    var n      = parseInt($('av-n').value, 10) || 0;
    var taxa_aa = parseNum($('av-taxa').value) / 100;

    function resetar() {
      $('av-decisao-val').textContent = '—';
      $('av-decisao-sub').textContent = 'Preencha os 4 campos acima para comparar.';
      ['av-juro-pm-val','av-juro-aa-val','av-rend-pm-val','av-rend-aa-val',
       'av-a-saida','av-a-saldo','av-b-saida','av-b-saldo','av-dif'].forEach(function(id){
        $(id).textContent = '—';
      });
    }
    if (pCheio <= 0 || pDesc <= 0 || n <= 0 || taxa_aa < 0) { resetar(); return; }
    if (pDesc >= pCheio)  { resetar(); $('av-decisao-sub').textContent = 'Preço à vista deve ser menor que o sem desconto.'; return; }

    // Parcela do plano sem desconto
    var pmt = pCheio / n;

    // Taxa embutida no parcelamento (preço à vista vira PV; parcela é PMT)
    var i_par_pm = calcularTaxa(pDesc, pmt, n);
    if (i_par_pm === null) { resetar(); return; }
    var i_par_aa = Math.pow(1 + i_par_pm, 12) - 1;

    // Rendimento da aplicação em mensal
    var i_rend_pm = Math.pow(1 + taxa_aa, 1/12) - 1;

    // ── Simulação de saldo: assume PV inicial = pCheio na conta da pessoa
    var PV = pCheio;

    // Cenário A: paga à vista com desconto, sobra investida
    var saldoA = (PV - pDesc) * Math.pow(1 + i_rend_pm, n);

    // Cenário B: parcelado — saldo evolui mês a mês
    // saldo_final_B = PV × (1+i)^n - PMT × [(1+i)^n - 1]/i
    var fatorFV = Math.pow(1 + i_rend_pm, n);
    var saldoB;
    if (Math.abs(i_rend_pm) < 1e-12) {
      saldoB = PV - pmt * n;  // sem rendimento, saldo só decai
    } else {
      saldoB = PV * fatorFV - pmt * (fatorFV - 1) / i_rend_pm;
    }

    var diff = saldoB - saldoA;

    // ── Decisão
    var melhorParcelar = (i_par_pm < i_rend_pm);
    if (melhorParcelar) {
      $('av-decisao-val').textContent = 'Parcele em ' + n + '×';
      $('av-decisao-val').style.color = '#fff';
      $('av-wrap').style.background = 'var(--pos)';
      $('av-decisao-sub').textContent =
        'A taxa embutida no parcelamento (' + fPct(i_par_aa) + ' a.a.) é menor que seu rendimento ' +
        '(' + fPct(taxa_aa) + ' a.a.). Diferença ao fim de ' + n + ' meses: ' + fBRL(diff) + '.';
    } else {
      $('av-decisao-val').textContent = 'Pague à vista';
      $('av-decisao-val').style.color = '#fff';
      $('av-wrap').style.background = 'var(--navy)';
      $('av-decisao-sub').textContent =
        'A taxa embutida no parcelamento (' + fPct(i_par_aa) + ' a.a.) é maior que seu rendimento ' +
        '(' + fPct(taxa_aa) + ' a.a.). Diferença ao fim de ' + n + ' meses: ' + fBRL(-diff) + '.';
    }

    // ── KPIs
    $('av-juro-pm-val').textContent = fPct(i_par_pm, 3);
    $('av-juro-aa-val').textContent = fPct(i_par_aa, 2);
    $('av-rend-pm-val').textContent = fPct(i_rend_pm, 3);
    $('av-rend-aa-val').textContent = fPct(taxa_aa, 2);

    // ── Tabela de cenários
    $('av-a-saida').textContent = fBRL(pDesc);
    $('av-a-saldo').textContent = fBRL(saldoA);
    $('av-b-saida').textContent = fBRL(0) + ' (paga mensal)';
    $('av-b-saldo').textContent = fBRL(saldoB);
    $('av-dif').textContent     = (diff >= 0 ? '+' : '') + fBRL(diff);
    $('av-dif').style.color     = diff >= 0 ? 'var(--pos)' : 'var(--neg)';
  }

  function bind(id, isMon) {
    var el = $(id); if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('blur', function () {
      var v = parseNum(el.value);
      if (v > 0) {
        el.value = isMon
          ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : (id === 'av-n' ? String(Math.round(v)) : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    });
  }
  bind('av-cheio', true);
  bind('av-desc',  true);
  bind('av-n',     false);
  bind('av-taxa',  false);

  var btnClear = $('av-clear');
  if (btnClear) btnClear.addEventListener('click', function () {
    ['av-cheio','av-desc','av-n','av-taxa'].forEach(function (id) { $(id).value = ''; });
    // Reset cor do destaque
    $('av-wrap').style.background = '';
    $('av-decisao-val').style.color = '';
    recalcular();
  });

  // PDF
  function gerarPDF() {
    var get  = function (id) { return $(id).value || '—'; };
    var getT = function (id) { return ($(id).textContent || '').trim(); };

    gerarPDFCalc({
      titulo:    'À Vista vs Parcelado',
      subtitulo: 'Comparação considerando custo de oportunidade',
      tituloPremissas: 'Dados da compra',
      premissas: [
        { lbl: 'Preço sem desconto',       val: 'R$ ' + get('av-cheio') },
        { lbl: 'Preço à vista (desconto)', val: 'R$ ' + get('av-desc')  },
        { lbl: 'Parcelas',                 val: get('av-n') + ' meses' },
        { lbl: 'Rendimento (a.a.)',        val: get('av-taxa') + '%'   },
      ],
      destaque: {
        label: 'Veredito',
        val:   getT('av-decisao-val'),
        sub:   getT('av-decisao-sub'),
      },
      tituloResultado: 'Taxas comparadas',
      resultado: [
        { lbl: 'Taxa embutida (a.m.)', val: getT('av-juro-pm-val'), col: 'neg' },
        { lbl: 'Taxa embutida (a.a.)', val: getT('av-juro-aa-val'), col: 'neg' },
        { lbl: 'Rendimento (a.m.)',    val: getT('av-rend-pm-val'), col: 'pos' },
        { lbl: 'Rendimento (a.a.)',    val: getT('av-rend-aa-val'), col: 'pos' },
      ],
      tabela: {
        titulo: 'Saldo final em cada cenário',
        thead:  ['Cenário', 'Saída inicial', 'Saldo na conta'],
        rows: [
          ['À vista (com desconto)',                    getT('av-a-saida'), getT('av-a-saldo')],
          ['Parcelado (sem desconto, paga mensalmente)', getT('av-b-saida'), getT('av-b-saldo')],
          ['Diferença (parcelado − à vista)',           '—',                getT('av-dif')],
        ],
      },
      discIR:   '<strong>Como interpretar:</strong> se a taxa embutida for menor que o ' +
                'rendimento líquido, vale parcelar. Premissa: você teria o valor cheio investido ' +
                'e o usaria pra pagar parcelas ou pagar à vista.',
      discWarn: true,
    });
  }
  var btnPDF = $('av-pdf-btn');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);

  recalcular();
})();
