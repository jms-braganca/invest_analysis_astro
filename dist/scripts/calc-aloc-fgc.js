/* calc-aloc-fgc.js — Alocação FGC: tabela de sugestão multi-ativos
   Mesma base do Limite FGC: dias úteis ANBIMA, taFn/tdFn (calc-common.js)
   e IR conforme tabela regressiva (aliqIR). */
(function () {
  'use strict';

  var MAX_ATIVOS = 12;
  var PAPEIS = ['CDB', 'RDB', 'LC', 'LF', 'LCI', 'LCA', 'LCD', 'LIG'];
  var ISENTOS = { LCI: 1, LCA: 1, LCD: 1, LIG: 1 };          // IR pessoa física
  var FGC_COBERTOS = { CDB: 1, RDB: 1, LC: 1, LCI: 1, LCA: 1, LCD: 1 }; // LF e LIG fora do FGC
  var LIMITE_FGC = 250000;

  var wrap = document.getElementById('al-ativos');

  /* ── Geração dos cards de ativos ─────────────────────────── */
  function cardHTML(i) {
    var opts = PAPEIS.map(function (p) {
      return '<option value="' + p + '"' + (p === 'CDB' ? ' selected' : '') + '>' + p + '</option>';
    }).join('');
    return '' +
      '<div class="al-ativo" data-i="' + i + '">' +
        '<div class="al-ativo-head">' +
          '<span class="al-ativo-num">Ativo ' + (i + 1) + '</span>' +
          '<label class="al-toggle" title="Isento de IR para pessoa física">' +
            '<input type="checkbox" class="al-isento">' +
            '<span class="al-toggle-track"><span class="al-toggle-thumb"></span></span>' +
            '<span class="al-toggle-lbl">Isento de IR</span>' +
          '</label>' +
        '</div>' +
        '<div class="al-ativo-grid">' +
          '<div class="ac-field"><label>Papel</label>' +
            '<select class="al-papel">' + opts + '</select></div>' +
          '<div class="ac-field"><label>Emissor</label>' +
            '<input type="text" class="al-emissor" placeholder="Banco..."></div>' +
          '<div class="ac-field"><label>Indexador</label>' +
            '<select class="al-idx">' +
              '<option value="Pré" selected>Pré</option>' +
              '<option value="%CDI">%CDI</option>' +
              '<option value="CDI+">CDI+</option>' +
              '<option value="IPCA+">IPCA+</option>' +
            '</select></div>' +
          '<div class="ac-field"><label>Taxa <span class="unit">%</span></label>' +
            '<input type="text" inputmode="decimal" class="al-taxa" placeholder="0,00"></div>' +
          '<div class="ac-field"><label>Vencimento</label>' +
            '<input type="date" class="al-venc"></div>' +
          '<div class="ac-field"><label>Aplicação hoje <span class="unit">R$</span></label>' +
            '<input type="text" inputmode="decimal" class="al-aplic" placeholder="0,00"></div>' +
        '</div>' +
      '</div>';
  }

  function lerCard(card) {
    var q = function (sel) { return card.querySelector(sel); };
    return {
      papel:   q('.al-papel').value,
      emissor: q('.al-emissor').value,
      idx:     q('.al-idx').value,
      taxa:    q('.al-taxa').value,
      venc:    q('.al-venc').value,
      aplic:   q('.al-aplic').value,
      isento:  q('.al-isento').checked,
    };
  }
  function escreverCard(card, v) {
    var q = function (sel) { return card.querySelector(sel); };
    q('.al-papel').value   = v.papel;
    q('.al-emissor').value = v.emissor;
    q('.al-idx').value     = v.idx;
    q('.al-taxa').value    = v.taxa;
    q('.al-venc').value    = v.venc;
    q('.al-aplic').value   = v.aplic;
    q('.al-isento').checked = v.isento;
  }

  function gerarCards() {
    var qtd = Math.round(pBR(document.getElementById('al-qtd').value)) || 0;
    qtd = Math.max(1, Math.min(MAX_ATIVOS, qtd || 1));
    var atuais = Array.prototype.map.call(wrap.children, lerCard);
    var html = '';
    for (var i = 0; i < qtd; i++) html += cardHTML(i);
    wrap.innerHTML = html;
    Array.prototype.forEach.call(wrap.children, function (card, i) {
      if (atuais[i]) escreverCard(card, atuais[i]);
      ligarCard(card);
    });
    instalarFormatacao(wrap);
    recalc();
  }

  function ligarCard(card) {
    card.querySelectorAll('input, select').forEach(function (el) {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    // Isenção automática pelo papel (sobrescrevível pelo toggle)
    card.querySelector('.al-papel').addEventListener('change', function () {
      card.querySelector('.al-isento').checked = !!ISENTOS[this.value];
      recalc();
    });
  }

  /* ── Cálculo de uma linha ────────────────────────────────── */
  function fTaxaLabel(idx, taxa) {
    var t = fPct(taxa).replace('%', '');
    if (idx === 'Pré')   return t + '% a.a. - Pré';
    if (idx === '%CDI')  return t + '% do CDI';
    if (idx === 'CDI+')  return 'CDI + ' + t + '% a.a.';
    return 'IPCA + ' + t + '% a.a.';
  }

  function calcLinha(v, cdi, ipca, today) {
    var taxa  = pBR(v.taxa) / 100 || 0;
    var aplic = pBR(v.aplic) || 0;
    if (!v.venc || aplic <= 0) return null;
    var dV = new Date(v.venc + 'T12:00:00');
    if (dV <= today) return null;

    var du = networkdays(today, dV);
    var dc = Math.round((dV - today) / 86400000);
    var ta = taFn(v.idx, taxa, cdi, ipca);
    var td = tdFn(ta);
    var bruto = fvFn(aplic, td, du);
    var aliq  = aliqIR(dc);
    var ir    = v.isento ? 0 : (bruto - aplic) * aliq;
    var liq   = bruto - ir;

    return {
      papel: v.papel, emissor: v.emissor || '—',
      taxaLbl: fTaxaLabel(v.idx, taxa),
      venc: dV, du: du, aliq: aliq, isento: v.isento,
      aplic: aplic, bruto: bruto, ir: ir, liq: liq,
      roi: liq / aplic - 1,
    };
  }

  /* ── Recalcular e renderizar tabela ──────────────────────── */
  function recalc() {
    var cdi  = pBR(document.getElementById('al-cdi').value) / 100 || 0;
    var ipca = pBR(document.getElementById('al-ipca').value) / 100 || 0;
    var today = new Date(); today.setHours(0, 0, 0, 0);

    var linhas = [];
    Array.prototype.forEach.call(wrap.children, function (card) {
      var r = calcLinha(lerCard(card), cdi, ipca, today);
      if (r) linhas.push(r);
    });

    var tbody = document.querySelector('#al-tbl tbody');
    var tfoot = document.querySelector('#al-tbl tfoot');
    var vazio = document.getElementById('al-vazio');

    if (!linhas.length) {
      tbody.innerHTML = ''; tfoot.innerHTML = '';
      vazio.style.display = '';
      document.getElementById('al-fgc-avisos').innerHTML = '';
      return;
    }
    vazio.style.display = 'none';

    var tot = { aplic: 0, bruto: 0, ir: 0, liq: 0 };
    tbody.innerHTML = linhas.map(function (r) {
      tot.aplic += r.aplic; tot.bruto += r.bruto; tot.ir += r.ir; tot.liq += r.liq;
      var irCell = r.isento
        ? '<span class="pos">ISENTO</span>'
        : fBRL(r.ir) + ' <span class="muted">(' + fPct(r.aliq, 1) + ')</span>';
      return '<tr>' +
        '<td>' + esc(r.papel) + '</td>' +
        '<td>' + esc(r.emissor) + '</td>' +
        '<td>' + esc(r.taxaLbl) + '</td>' +
        '<td>' + fDate(r.venc) + '</td>' +
        '<td>' + fBRL(r.aplic) + '</td>' +
        '<td>' + fBRL(r.bruto) + '</td>' +
        '<td>' + irCell + '</td>' +
        '<td class="blu">' + fBRL(r.liq) + '</td>' +
        '<td class="pos">' + fPct0(r.roi) + '</td>' +
      '</tr>';
    }).join('');

    tfoot.innerHTML = '<tr>' +
      '<td colspan="4">Total · ' + linhas.length + ' ativo' + (linhas.length > 1 ? 's' : '') + '</td>' +
      '<td>' + fBRL(tot.aplic) + '</td>' +
      '<td>' + fBRL(tot.bruto) + '</td>' +
      '<td>' + fBRL(tot.ir) + '</td>' +
      '<td class="blu">' + fBRL(tot.liq) + '</td>' +
      '<td class="pos">' + fPct0(tot.liq / tot.aplic - 1) + '</td>' +
    '</tr>';

    renderAvisosFGC(linhas);
  }

  /* ── Avisos: limite FGC por emissor (R$ 250 mil no vcto) ─── */
  function renderAvisosFGC(linhas) {
    var box = document.getElementById('al-fgc-avisos');
    var porEmissor = {};
    linhas.forEach(function (r) {
      if (!FGC_COBERTOS[r.papel]) return; // LF/LIG não contam no FGC
      var k = (r.emissor || '—').trim().toLowerCase();
      if (!porEmissor[k]) porEmissor[k] = { nome: r.emissor.trim() || '—', bruto: 0 };
      porEmissor[k].bruto += r.bruto;
    });
    var avisos = [];
    Object.keys(porEmissor).forEach(function (k) {
      var e = porEmissor[k];
      if (e.bruto > LIMITE_FGC) {
        avisos.push('<div class="al-aviso neg"><strong>' + esc(e.nome) + ':</strong> bruto projetado de ' +
          fBRL(e.bruto) + ' no vencimento — excede o limite FGC de R$ 250.000,00 em ' +
          fBRL(e.bruto - LIMITE_FGC) + '.</div>');
      }
    });
    var temForaFGC = linhas.some(function (r) { return !FGC_COBERTOS[r.papel]; });
    if (temForaFGC) {
      avisos.push('<div class="al-aviso info">LF e LIG não contam para o limite do FGC (LIG tem garantia da carteira de lastro).</div>');
    }
    box.innerHTML = avisos.join('');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* ROI inteiro, como na proposta ao cliente (fPct força mínimo de 2 casas) */
  function fPct0(v) {
    if (isNaN(v) || !isFinite(v)) return '—';
    return Math.round(v * 100).toLocaleString('pt-BR') + '%';
  }

  /* ── PDF ─────────────────────────────────────────────────── */
  function gerarPDF() {
    var cdi  = document.getElementById('al-cdi').value || '0';
    var ipca = document.getElementById('al-ipca').value || '0';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var cdiN  = pBR(cdi) / 100 || 0;
    var ipcaN = pBR(ipca) / 100 || 0;

    var linhas = [];
    Array.prototype.forEach.call(wrap.children, function (card) {
      var r = calcLinha(lerCard(card), cdiN, ipcaN, today);
      if (r) linhas.push(r);
    });
    if (!linhas.length) { alert('Preencha ao menos um ativo para gerar o PDF.'); return; }

    var tot = { aplic: 0, bruto: 0, ir: 0, liq: 0 };
    var rows = linhas.map(function (r) {
      tot.aplic += r.aplic; tot.bruto += r.bruto; tot.ir += r.ir; tot.liq += r.liq;
      return [
        esc(r.papel), esc(r.emissor), esc(r.taxaLbl), fDate(r.venc),
        fBRL(r.aplic), fBRL(r.bruto),
        r.isento ? '<span class="pos">ISENTO</span>' : fBRL(r.ir) + ' (' + fPct(r.aliq, 1) + ')',
        '<span class="blu">' + fBRL(r.liq) + '</span>',
        '<span class="pos">' + fPct0(r.roi) + '</span>',
      ];
    });
    rows.push([
      '<b>Total</b>', '', '', '',
      '<b>' + fBRL(tot.aplic) + '</b>', '<b>' + fBRL(tot.bruto) + '</b>',
      '<b>' + fBRL(tot.ir) + '</b>', '<b>' + fBRL(tot.liq) + '</b>',
      '<b>' + fPct0(tot.liq / tot.aplic - 1) + '</b>',
    ]);

    gerarPDFCalc({
      titulo:    'Alocação FGC',
      subtitulo: 'Sugestão de alocação em renda fixa bancária',
      tituloPremissas: 'Premissas',
      premissas: [
        { lbl: 'CDI estimado a.a.',  val: cdi + '%' },
        { lbl: 'IPCA estimado a.a.', val: ipca + '%' },
        { lbl: 'Limite FGC',         val: 'R$ 250.000,00 por CPF/emissor' },
      ],
      destaque: {
        label: 'Valor líquido projetado total',
        val:   fBRL(tot.liq),
        sub:   'Aplicação de ' + fBRL(tot.aplic) + ' em ' + linhas.length + ' ativo' + (linhas.length > 1 ? 's' : ''),
      },
      tabela: {
        titulo: 'Tabela de sugestão',
        thead: ['Papel', 'Emissor', 'Taxa', 'Vencimento', 'Aplicação',
                'Bruto projetado', 'IR', 'Líquido projetado', 'ROI líq.'],
        rows: rows,
      },
      discIR: '<strong>IR:</strong> tabela regressiva (22,5% até 180 dias · 20% até 360 · 17,5% até 720 · 15% acima). ' +
              'LCI/LCA/LCD/LIG isentas para pessoa física. <strong>FGC:</strong> garantia de até R$ 250.000 por CPF/instituição, ' +
              'teto global de R$ 1 milhão a cada 4 anos. LF e LIG não possuem cobertura do FGC.',
      discWarn: true,
    });
  }

  /* ── Wire-up ─────────────────────────────────────────────── */
  ['al-cdi', 'al-ipca'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });
  var qtdEl = document.getElementById('al-qtd');
  qtdEl.addEventListener('input', gerarCards);
  qtdEl.addEventListener('change', gerarCards);

  var clearBtn = document.querySelector('.calc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    limparCalculadora(function () {
      document.getElementById('al-qtd').value = '3';
      gerarCards();
    });
  });

  var pdfBtn = document.getElementById('aloc-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDF);

  instalarFormatacao();
  gerarCards();
})();
