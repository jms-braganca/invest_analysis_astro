/* ──────────────────────────────────────────────────────────────────────────
   calc-amortizacao.js — Simulador de Amortização (SAC e Price)
   ──────────────────────────────────────────────────────────────────────────
   Réplica fiel da lógica de um simulador de financiamento com:
     · Sistemas SAC (amortização constante) e Price (parcela fixa)
     · Taxa de juros informada ao ano ou ao mês (conversão composta)
     · Correção monetária sobre o saldo devedor (índice anual → mensal composto)
     · Taxa/seguro fixo por parcela
     · Múltiplos aportes extraordinários, cada um disparado "após a parcela N",
       em modo "reduzir prazo" ou "reduzir parcela"
     · Comparativo entre o financiamento com e sem antecipação
     · Tabela detalhada mês a mês (e visão anual)

   MECÂNICA (validada contra simulador de mercado), por parcela k:
     dívida          = saldo do mês anterior
     correção        = dívida × i_corr_mensal
     dívida corrigida= dívida + correção
     juros           = dívida corrigida × i_juros_mensal
     SAC:   amort.   = dívida corrigida / parcelas_restantes
     Price: parcela  = dívida corrigida × fator_price(i, parcelas_restantes)
            amort.   = parcela − juros
     parcela total   = juros + amort. + seguro
     saldo           = dívida corrigida − amort. − (aporte extra, se houver)

   Aporte "reduzir prazo": mantém a prestação e resolve o novo número de
   parcelas restantes sobre o saldo reduzido (o prazo encurta).
   Aporte "reduzir parcela": mantém o prazo original; a prestação é
   recalculada para baixo automaticamente sobre o saldo menor.
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // ── PARSE / FORMAT ──────────────────────────────────────────────────
  function parseNum(s) {
    if (s == null) return 0;
    s = String(s).trim().replace('%', '').replace(/\s/g, '');
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
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];
  function parseDateInput(v) {
    // input type=date → "YYYY-MM-DD"
    if (!v) return new Date();
    var p = v.split('-');
    if (p.length === 3) return new Date(+p[0], +p[1] - 1, +p[2]);
    return new Date(v);
  }
  function addMonths(d, m) {
    var nd = new Date(d.getTime());
    nd.setMonth(nd.getMonth() + m);
    return nd;
  }
  function fMesAno(d) {
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return mm + '/' + d.getFullYear();
  }
  function fMesAnoLongo(d) {
    return MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  // ── MATEMÁTICA FINANCEIRA ───────────────────────────────────────────
  function mensalDeAnual(a) { return Math.pow(1 + a, 1 / 12) - 1; }
  function fatorPrice(i, n) {
    if (n <= 0) return 0;
    if (Math.abs(i) < 1e-12) return 1 / n;
    var x = Math.pow(1 + i, n);
    return (i * x) / (x - 1);
  }
  // resolve o nº de parcelas para uma prestação-base fixa sobre um saldo
  function prazoPrice(saldo, pmtBase, i) {
    if (pmtBase <= saldo * i + 1e-9) return 600; // prestação não cobre nem os juros → trava no teto
    if (Math.abs(i) < 1e-12) return Math.ceil(saldo / pmtBase);
    var x = pmtBase / (pmtBase - saldo * i);
    var R = Math.log(x) / Math.log(1 + i);
    return Math.max(1, Math.round(R));
  }

  // ── MOTOR ───────────────────────────────────────────────────────────
  // p = { pv, n, system:'sac'|'price', iJuros, iCorr, seguro, plans:[{after,amount,mode}] }
  function simular(p) {
    var rows = [];
    var saldo = p.pv;
    var N = p.n;                  // prazo total vigente (pode encurtar)
    var iJ = p.iJuros, iC = p.iCorr, seg = p.seguro;
    var totJuros = 0, totSeg = 0, totCorr = 0, totExtra = 0, totAmort = 0;
    var guard = 0;

    // expande aportes (avulsos e recorrentes) em eventos por mês
    var eventos = {};
    (p.plans || []).forEach(function (pl) {
      var vezes = (pl.count && pl.count > 1) ? pl.count : 1;
      var passo = (pl.interval && pl.interval > 0) ? pl.interval : 1;
      for (var c = 0; c < vezes; c++) {
        var mes = pl.after + c * passo;
        (eventos[mes] = eventos[mes] || []).push({ amount: pl.amount, mode: pl.mode });
      }
    });
    var budgetValor = p.budgetValor || 0;
    var budgetInicio = p.budgetInicio || 1;

    for (var k = 1; saldo > 0.005 && k <= N && guard < 100000; k++, guard++) {
      var R = N - k + 1;          // parcelas restantes (inclui a atual)
      var corr = saldo * iC;
      var divCorr = saldo + corr;
      var juros = divCorr * iJ;

      var amort, parcelaBase;
      if (p.system === 'price') {
        // Price: parcela fixa recalculada sobre o saldo corrigido e o prazo restante
        parcelaBase = divCorr * fatorPrice(iJ, R);
        amort = parcelaBase - juros;
      } else { // sac
        // SAC: amortização constante = dívida corrigida / parcelas restantes
        amort = divCorr / R;
        parcelaBase = juros + amort;
      }
      // trava da última parcela
      if (amort > divCorr) { amort = divCorr; parcelaBase = juros + amort; }

      // seguro/taxa: cobrado em toda parcela, exceto a última do prazo contratado
      var seguroMes = (k === p.n) ? 0 : seg;
      var parcela = parcelaBase + seguroMes;
      var saldoApos = divCorr - amort;

      // aportes extraordinários (avulsos / recorrentes) disparados após esta parcela
      var extraMes = 0;
      var aqui = eventos[k] || [];
      for (var a = 0; a < aqui.length; a++) {
        var pl = aqui[a];
        var amt = Math.min(pl.amount, saldoApos);
        if (amt <= 0) continue;
        saldoApos -= amt;
        extraMes += amt;
        if (pl.mode === 'prazo' && saldoApos > 0.005) {
          // "Reduzir prazo": mantém o nível da prestação e encurta o número de parcelas
          if (p.system === 'price') {
            N = k + prazoPrice(saldoApos, parcelaBase, iJ);
          } else {
            // SAC: novo prazo que preserva a prestação atual (juros+amort)
            var dcN = saldoApos * (1 + iC);
            var amortN = parcelaBase - dcN * iJ;
            var Rnew = (amortN > 1e-9) ? Math.max(1, Math.round(dcN / amortN)) : R;
            N = k + Rnew;
          }
        }
        // modo 'parcela': prazo inalterado → prestação recalcula para baixo
      }

      // orçamento mensal fixo: paga T todo mês; o excedente (T − parcela) vira
      // amortização (sempre reduz prazo). Se a parcela já passa de T, não há extra.
      if (budgetValor > 0 && k >= budgetInicio && saldoApos > 0.005) {
        var folga = budgetValor - parcela;
        if (folga > 0) {
          var amtB = Math.min(folga, saldoApos);
          saldoApos -= amtB;
          extraMes += amtB;
        }
      }

      totJuros += juros; totSeg += seguroMes; totCorr += corr;
      totExtra += extraMes; totAmort += amort;

      rows.push({
        k: k, data: addMonths(p.dataInicio, k),
        divida: saldo, corr: corr, divCorr: divCorr, juros: juros,
        amort: amort, seguro: seguroMes, parcela: parcela,
        extra: extraMes, saldo: saldoApos < 0 ? 0 : saldoApos,
      });
      saldo = saldoApos;
    }

    var totalPago = p.pv + totJuros + totSeg + totCorr;
    return {
      rows: rows,
      pv: p.pv,
      qtdParcelas: rows.length,
      totalPago: totalPago,
      totJuros: totJuros,
      totSeg: totSeg,
      totCorr: totCorr,
      totExtra: totExtra,
      primeira: rows.length ? rows[0].parcela : 0,
      ultima: rows.length ? rows[rows.length - 1].parcela : 0,
      dataUltima: rows.length ? rows[rows.length - 1].data : p.dataInicio,
      system: p.system,
    };
  }

  // ── ESTADO DOS PLANOS (aportes) ─────────────────────────────────────
  var planSeq = 0;
  function lerPlanos() {
    var planos = [];
    document.querySelectorAll('#amz-plans .amz-plan').forEach(function (el) {
      var amount = parseNum(el.querySelector('.amz-plan-amount').value);
      var after = parseInt(el.querySelector('.amz-plan-after').value, 10) || 0;
      var mode = el.querySelector('.amz-plan-mode').value;
      var count = parseInt(el.querySelector('.amz-plan-count').value, 10) || 1;
      var interval = parseInt(el.querySelector('.amz-plan-interval').value, 10) || 1;
      if (amount > 0 && after > 0) {
        planos.push({ amount: amount, after: after, mode: mode,
                      count: Math.max(1, count), interval: Math.max(1, interval) });
      }
    });
    return planos;
  }
  var trashSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  var pencilSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function novoPlano(opts) {
    opts = opts || {};
    planSeq++;
    var wrap = document.createElement('div');
    wrap.className = 'amz-plan';
    wrap.innerHTML =
      '<div class="amz-plan-summary">' +
        '<div class="amz-plan-sum-text"></div>' +
        '<div class="amz-plan-sum-actions">' +
          '<button type="button" class="amz-plan-edit-btn">' + pencilSVG + 'Editar</button>' +
          '<button type="button" class="amz-plan-del" title="Remover aporte" aria-label="Remover aporte">' + trashSVG + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="amz-plan-edit">' +
        '<div class="amz-plan-row amz-plan-row1">' +
          '<div class="amz-plan-field">' +
            '<label>Valor do aporte <span class="unit">R$</span></label>' +
            '<input type="text" inputmode="decimal" class="amz-plan-amount" placeholder="50.000,00">' +
          '</div>' +
          '<div class="amz-plan-field">' +
            '<label>Após a parcela <span class="unit">nº</span></label>' +
            '<input type="text" inputmode="numeric" class="amz-plan-after" placeholder="12">' +
          '</div>' +
          '<div class="amz-plan-field">' +
            '<label>Efeito</label>' +
            '<select class="amz-plan-mode cmc-select">' +
              '<option value="prazo">Reduzir prazo</option>' +
              '<option value="parcela">Reduzir parcela</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="amz-plan-row amz-plan-row2">' +
          '<div class="amz-plan-field">' +
            '<label>Repetir <span class="unit">vezes (1 = aporte único)</span></label>' +
            '<input type="text" inputmode="numeric" class="amz-plan-count" placeholder="1">' +
          '</div>' +
          '<div class="amz-plan-field">' +
            '<label>A cada <span class="unit">meses (12 = anual)</span></label>' +
            '<input type="text" inputmode="numeric" class="amz-plan-interval" placeholder="1">' +
          '</div>' +
          '<div class="amz-plan-note" aria-live="polite"></div>' +
        '</div>' +
        '<div class="amz-plan-edit-actions">' +
          '<button type="button" class="amz-plan-done">Concluir</button>' +
          '<button type="button" class="amz-plan-del-2">Remover</button>' +
        '</div>' +
      '</div>';
    var inAmt = wrap.querySelector('.amz-plan-amount');
    var inAft = wrap.querySelector('.amz-plan-after');
    var selMode = wrap.querySelector('.amz-plan-mode');
    var inCnt = wrap.querySelector('.amz-plan-count');
    var inIvl = wrap.querySelector('.amz-plan-interval');
    var note = wrap.querySelector('.amz-plan-note');
    var sumText = wrap.querySelector('.amz-plan-sum-text');
    if (opts.amount) inAmt.value = opts.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (opts.after) inAft.value = String(opts.after);
    if (opts.mode) selMode.value = opts.mode;
    if (opts.count) inCnt.value = String(opts.count);
    if (opts.interval) inIvl.value = String(opts.interval);

    function atualizarNota() {
      var cnt = parseInt(inCnt.value, 10) || 1;
      var aft = parseInt(inAft.value, 10) || 0;
      var ivl = parseInt(inIvl.value, 10) || 1;
      if (cnt > 1 && aft > 0) {
        var ult = aft + (cnt - 1) * Math.max(1, ivl);
        note.textContent = cnt + '× — parcelas ' + aft + ', ' + (aft + Math.max(1, ivl)) +
          (cnt > 2 ? ', …, ' : ', ') + ult + '.';
      } else {
        note.textContent = '';
      }
    }
    function atualizarResumo() {
      var amt = parseNum(inAmt.value);
      var aft = parseInt(inAft.value, 10) || 0;
      var cnt = parseInt(inCnt.value, 10) || 1;
      var ivl = parseInt(inIvl.value, 10) || 1;
      var modo = selMode.value === 'parcela' ? 'reduzir parcela' : 'reduzir prazo';
      if (amt <= 0 || aft <= 0) {
        sumText.innerHTML = '<span class="amz-plan-sum-empty">Aporte incompleto — clique em Editar</span>';
        return;
      }
      var txt = '<strong>' + fBRL(amt) + '</strong> · após a parcela ' + aft + ' · ' + modo;
      if (cnt > 1) txt += ' · <span class="amz-plan-sum-rep">' + cnt + '× a cada ' +
        Math.max(1, ivl) + (Math.max(1, ivl) === 1 ? ' mês' : ' meses') + '</span>';
      sumText.innerHTML = txt;
    }
    function setEditing(on) {
      wrap.classList.toggle('editing', on);
    }
    function onChange() { atualizarNota(); atualizarResumo(); recalcular(); }
    [inAmt, inAft, inCnt, inIvl].forEach(function (el) { el.addEventListener('input', onChange); });
    selMode.addEventListener('change', onChange);
    inAmt.addEventListener('blur', function () {
      var v = parseNum(inAmt.value);
      if (v > 0) inAmt.value = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      atualizarResumo();
    });
    wrap.querySelector('.amz-plan-edit-btn').addEventListener('click', function () { setEditing(true); });
    wrap.querySelector('.amz-plan-done').addEventListener('click', function () { atualizarResumo(); setEditing(false); });
    function remover() { wrap.remove(); recalcular(); }
    wrap.querySelector('.amz-plan-del').addEventListener('click', remover);
    wrap.querySelector('.amz-plan-del-2').addEventListener('click', remover);

    $('amz-plans').appendChild(wrap);
    atualizarNota();
    atualizarResumo();
    // novo aporte (sem valores) já abre em modo edição; aporte pré-preenchido vem fechado
    setEditing(!(opts.amount && opts.after));
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  var ultimoBase = null, ultimoCom = null; // guardados p/ PDF

  function setKPIvazio() {
    $('amz-dest-val').textContent = '—';
    $('amz-dest-sub').textContent = 'Preencha os campos acima para simular.';
    ['amz-pv-val','amz-juros-val','amz-corr-val','amz-seg-val',
     'amz-prim-val','amz-ult-val','amz-qtd-val','amz-data-val','amz-amort-val'].forEach(function (id) {
      if ($(id)) $(id).textContent = '—';
    });
    $('amz-compare').style.display = 'none';
    $('amz-tbody').innerHTML =
      '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--private-muted2)">Preencha os dados acima.</td></tr>';
  }

  function renderTabela(res) {
    var anual = $('amz-view').value === 'ano';
    var tb = $('amz-tbody');
    var html = '';
    if (!anual) {
      res.rows.forEach(function (r) {
        html += '<tr>' +
          '<td class="amz-c0">' + r.k + ' · ' + fMesAno(r.data) + '</td>' +
          '<td>' + fBRL(r.divida) + '</td>' +
          '<td>' + fBRL(r.corr) + '</td>' +
          '<td>' + fBRL(r.divCorr) + '</td>' +
          '<td>' + fBRL(r.juros) + '</td>' +
          '<td>' + fBRL(r.amort) + '</td>' +
          '<td>' + fBRL(r.seguro) + '</td>' +
          '<td><strong>' + fBRL(r.parcela) + '</strong></td>' +
          '<td>' + (r.extra > 0 ? '<span class="amz-extra">' + fBRL(r.extra) + '</span>' : '—') + '</td>' +
          '<td>' + fBRL(r.saldo) + '</td>' +
        '</tr>';
      });
    } else {
      // agrega por blocos de 12 parcelas
      var bloco = null, ano = 0;
      for (var i = 0; i < res.rows.length; i++) {
        var r = res.rows[i];
        if (i % 12 === 0) {
          if (bloco) html += linhaAno(bloco);
          ano++;
          bloco = { ano: ano, dataIni: r.data, dividaIni: r.divida,
                    corr: 0, juros: 0, amort: 0, seguro: 0, parcela: 0, extra: 0, saldo: r.saldo };
        }
        bloco.corr += r.corr; bloco.juros += r.juros; bloco.amort += r.amort;
        bloco.seguro += r.seguro; bloco.parcela += r.parcela; bloco.extra += r.extra;
        bloco.saldo = r.saldo; bloco.dataFim = r.data;
      }
      if (bloco) html += linhaAno(bloco);
    }
    tb.innerHTML = html || '<tr><td colspan="10" style="text-align:center;padding:20px">—</td></tr>';
  }
  function linhaAno(b) {
    return '<tr>' +
      '<td class="amz-c0">Ano ' + b.ano + ' · ' + b.dataIni.getFullYear() + '</td>' +
      '<td>' + fBRL(b.dividaIni) + '</td>' +
      '<td>' + fBRL(b.corr) + '</td>' +
      '<td>' + fBRL(b.dividaIni + b.corr) + '</td>' +
      '<td>' + fBRL(b.juros) + '</td>' +
      '<td>' + fBRL(b.amort) + '</td>' +
      '<td>' + fBRL(b.seguro) + '</td>' +
      '<td><strong>' + fBRL(b.parcela) + '</strong></td>' +
      '<td>' + (b.extra > 0 ? '<span class="amz-extra">' + fBRL(b.extra) + '</span>' : '—') + '</td>' +
      '<td>' + fBRL(b.saldo) + '</td>' +
    '</tr>';
  }

  function recalcular() {
    var pv = parseNum($('amz-pv').value);
    var n = parseInt($('amz-n').value, 10) || 0;
    var system = $('amz-system').value;
    var rate = parseNum($('amz-rate').value) / 100;
    var rateType = $('amz-rate-type').value; // 'anual' | 'mensal'
    var corrAnual = parseNum($('amz-corr').value) / 100;
    var seguro = parseNum($('amz-seguro').value);
    var dataInicio = parseDateInput($('amz-date').value);

    if (pv <= 0 || n <= 0 || !system || rate < 0 || isNaN(rate)) {
      setKPIvazio();
      ultimoBase = ultimoCom = null;
      return;
    }

    var iJuros = rateType === 'mensal' ? rate : mensalDeAnual(rate);
    var iCorr = corrAnual > 0 ? mensalDeAnual(corrAnual) : 0;
    var planos = lerPlanos();
    var budgetValor = parseNum($('amz-budget').value);
    var budgetInicio = parseInt($('amz-budget-start').value, 10) || 1;

    var base = { pv: pv, n: n, system: system, iJuros: iJuros, iCorr: iCorr,
                 seguro: seguro, plans: [], dataInicio: dataInicio };
    var resBase = simular(base);
    var temPlanos = planos.length > 0 || budgetValor > 0;
    var resCom = temPlanos
      ? simular(Object.assign({}, base, { plans: planos, budgetValor: budgetValor, budgetInicio: budgetInicio }))
      : resBase;

    ultimoBase = resBase; ultimoCom = resCom;
    var R = resCom; // resultado exibido = com antecipação (ou base)

    // destaque
    $('amz-dest-val').textContent = fBRL(R.totalPago);
    $('amz-dest-sub').textContent =
      (system === 'price' ? 'Tabela Price' : 'Tabela SAC') + ' · ' +
      R.qtdParcelas + ' parcelas · ' + fPct(iJuros, 4) + ' a.m. (' +
      (rateType === 'mensal' ? fPct(rate, 2) + ' a.m.' : fPct(rate, 2) + ' a.a.') + ')';

    // KPIs
    $('amz-pv-val').textContent = fBRL(R.pv);
    $('amz-juros-val').textContent = fBRL(R.totJuros);
    $('amz-corr-val').textContent = fBRL(R.totCorr);
    $('amz-seg-val').textContent = fBRL(R.totSeg);
    $('amz-prim-val').textContent = fBRL(R.primeira);
    $('amz-ult-val').textContent = fBRL(R.ultima);
    $('amz-qtd-val').textContent = R.qtdParcelas + ' parc.';
    $('amz-data-val').textContent = fMesAnoLongo(R.dataUltima);
    $('amz-amort-val').textContent = fBRL(R.totExtra);

    // comparativo com vs sem
    var cmp = $('amz-compare');
    if (temPlanos) {
      var economia = resBase.totalPago - resCom.totalPago;
      var reducao = resBase.qtdParcelas - resCom.qtdParcelas;
      cmp.style.display = '';
      cmp.querySelector('.amz-cmp-eco').textContent = fBRL(economia);
      var partes = [];
      partes.push('quitação em ' + fMesAnoLongo(resCom.dataUltima));
      if (reducao > 0) partes.push(reducao + ' parcelas a menos');
      partes.push('aporte total de ' + fBRL(resCom.totExtra));
      cmp.querySelector('.amz-cmp-sub').textContent =
        'Com a antecipação: ' + partes.join(' · ') + '. Sem antecipação o total seria ' +
        fBRL(resBase.totalPago) + ' (' + resBase.qtdParcelas + ' parcelas, até ' +
        fMesAnoLongo(resBase.dataUltima) + ').';
    } else {
      cmp.style.display = 'none';
    }

    renderTabela(R);
  }

  // ── PDF ─────────────────────────────────────────────────────────────
  function gerarPDF() {
    if (!ultimoCom) { alert('Preencha os dados antes de gerar o PDF.'); return; }
    var R = ultimoCom, B = ultimoBase;
    var temPlanos = R !== B;
    var getV = function (id) { return ($(id).textContent || '').trim(); };

    // tabela anual resumida para o PDF
    var thead = ['Ano', 'Juros', 'Correção', 'Amort.', 'Seguro', 'Parcela', 'Aporte', 'Saldo final'];
    var rows = [];
    var bloco = null, ano = 0;
    for (var i = 0; i < R.rows.length; i++) {
      var r = R.rows[i];
      if (i % 12 === 0) {
        if (bloco) rows.push(linhaAnoPDF(bloco));
        ano++; bloco = { ano: ano, corr: 0, juros: 0, amort: 0, seguro: 0, parcela: 0, extra: 0, saldo: r.saldo, dataIni: r.data };
      }
      bloco.corr += r.corr; bloco.juros += r.juros; bloco.amort += r.amort;
      bloco.seguro += r.seguro; bloco.parcela += r.parcela; bloco.extra += r.extra; bloco.saldo = r.saldo;
    }
    if (bloco) rows.push(linhaAnoPDF(bloco));

    var premissas = [
      { lbl: 'Valor financiado', val: getV('amz-pv-val') },
      { lbl: 'Sistema', val: R.system === 'price' ? 'Tabela Price' : 'Tabela SAC' },
      { lbl: 'Taxa de juros', val: $('amz-rate').value + (($('amz-rate-type').value === 'mensal') ? '% a.m.' : '% a.a.') },
      { lbl: 'Correção monetária', val: ($('amz-corr').value || '0') + '% a.a.' },
      { lbl: 'Seguro/taxa', val: fBRL(parseNum($('amz-seguro').value)) + ' / parcela' },
      { lbl: 'Parcelas', val: getV('amz-qtd-val') },
    ];

    var resultado = [
      { lbl: 'Total de juros', val: getV('amz-juros-val'), col: 'neg' },
      { lbl: 'Correção paga', val: getV('amz-corr-val'), col: 'neg' },
      { lbl: 'Taxas/seguros', val: getV('amz-seg-val'), col: 'neg' },
      { lbl: '1ª parcela', val: getV('amz-prim-val') },
      { lbl: 'Última parcela', val: getV('amz-ult-val') },
      { lbl: 'Total amortizado (aportes)', val: getV('amz-amort-val'), col: 'blu' },
    ];

    var disc = temPlanos
      ? '<strong>Com antecipação:</strong> economia de ' +
        fBRL(B.totalPago - R.totalPago) + ' frente ao cenário sem aportes (' +
        (B.qtdParcelas - R.qtdParcelas) + ' parcelas a menos).'
      : '<strong>Sem antecipação:</strong> cenário sem aportes extraordinários. ' +
        'Adicione um aporte para ver o impacto na economia e no prazo.';

    gerarPDFCalc({
      titulo: 'Simulador de Amortização — ' + (R.system === 'price' ? 'Price' : 'SAC'),
      subtitulo: 'SAC e Price com correção monetária e aportes',
      tituloPremissas: 'Premissas do financiamento',
      premissas: premissas,
      destaque: { label: 'Total a pagar', val: getV('amz-dest-val'), sub: getV('amz-dest-sub') },
      tituloResultado: 'Resumo',
      resultado: resultado,
      tabela: { titulo: 'Evolução anual', thead: thead, rows: rows },
      discIR: disc,
      discWarn: true,
    });
  }
  function linhaAnoPDF(b) {
    return ['Ano ' + b.ano + ' (' + b.dataIni.getFullYear() + ')',
      fBRL(b.juros), fBRL(b.corr), fBRL(b.amort), fBRL(b.seguro),
      fBRL(b.parcela), b.extra > 0 ? fBRL(b.extra) : '—', fBRL(b.saldo)];
  }

  // ── BIND ────────────────────────────────────────────────────────────
  function bindMon(id) {
    var el = $(id); if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('blur', function () {
      var v = parseNum(el.value);
      if (v > 0) el.value = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }
  function bindRaw(id) {
    var el = $(id); if (!el) return;
    el.addEventListener('input', recalcular);
    el.addEventListener('change', recalcular);
  }

  bindMon('amz-pv');
  bindMon('amz-seguro');
  bindMon('amz-budget');
  bindRaw('amz-budget-start');
  bindRaw('amz-n');
  bindRaw('amz-rate');
  bindRaw('amz-corr');
  bindRaw('amz-system');
  bindRaw('amz-rate-type');
  bindRaw('amz-date');
  bindRaw('amz-view');

  var addBtn = $('amz-add-plan');
  if (addBtn) addBtn.addEventListener('click', function () {
    // conclui (fecha) automaticamente qualquer aporte em edição antes de abrir um novo
    document.querySelectorAll('#amz-plans .amz-plan.editing').forEach(function (el) {
      el.classList.remove('editing');
    });
    novoPlano();
  });

  var clearBtn = $('amz-clear');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    ['amz-pv','amz-rate','amz-n','amz-corr','amz-seguro','amz-budget','amz-budget-start']
      .forEach(function (id) { if ($(id)) $(id).value = ''; });
    $('amz-plans').innerHTML = '';
    recalcular();
  });

  var pdfBtn = $('amz-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', gerarPDF);

  recalcular();
})();
