/* ──────────────────────────────────────────────────────────────────────────
   compare-select.js
   ──────────────────────────────────────────────────────────────────────────
   Adiciona às páginas fundos.html e previdencia.html:
     1. Checkboxes em cada linha/card de fundo (limite de 10 selecionados)
     2. Botão "Comparar" que envia a seleção para comparacao.html via
        localStorage (chave 'cmp_pre_select') — a comparacao lê e limpa.
     3. Barra de screening abaixo da busca, com filtros:
          • Prazo de resgate (cotização + pagamento, em dias)
            Múltipla seleção: Imediato (0), Até 3, 3-10, 10-15, 15-30, 30-60, >60
          • Retorno mínimo (radio mutuamente exclusivo entre CDI e IBOV):
              - % CDI mínimo (≥95%, default 100%)
              - pp acima do IBOV (range -10pp a +20pp, default 0pp)
            Janela: 12 meses corridos da última cota.
            Fundos com menos de 12m mostram aviso (badge "Sem 12M").
          • "Apenas fundos abertos" (checkbox) — default ligado.

   Tudo feito em runtime sobre o HTML existente — não exige mudanças no
   Dashboard_Unificado.py. Lê CNPJ, status e prazo direto do DOM.
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── CONFIGURAÇÃO ────────────────────────────────────────────────────────
  var LIMITE_SELECAO = 10;
  var STORAGE_KEY    = 'cmp_pre_select';

  // Buckets de prazo de resgate (em dias — vamos somar cotização + pagamento,
  // ignorando se DU/DC, conforme decisão de produto).
  // Cada bucket: { id, label, min, max }  (max=Infinity para o último).
  var PRAZO_BUCKETS = [
    { id: 'p_imediato', label: 'Imediato (0)',  min: 0,   max: 0   },
    { id: 'p_ate3',     label: 'Até 3 dias',    min: 1,   max: 3   },
    { id: 'p_3a10',     label: '3 a 10 dias',   min: 4,   max: 10  },
    { id: 'p_10a15',    label: '10 a 15 dias',  min: 11,  max: 15  },
    { id: 'p_15a30',    label: '15 a 30 dias',  min: 16,  max: 30  },
    { id: 'p_30a60',    label: '30 a 60 dias',  min: 31,  max: 60  },
    { id: 'p_60mais',   label: 'Acima de 60',   min: 61,  max: Infinity },
  ];

  // ── DESCOBRIR PÁGINA ATIVA ─────────────────────────────────────────────
  // Detectamos pelo input de busca (id único por página). Estes são gerados
  // pelos templates fundos_template.html e previdencia_template.html.
  // Anteriormente usávamos #mainFundos/#mainPrev mas esses IDs só existem
  // no dashboard_completo.html — o gerar_paginas_internas.py extrai o
  // CONTEÚDO de dentro desses <main>, então no fundos.html final eles
  // não existem.
  var searchInput = document.getElementById('searchFundos') || document.getElementById('searchPrev');
  if (!searchInput) return;  // não é página de fundos/prev — sai.

  var tipoPagina = searchInput.id === 'searchPrev' ? 'PREVIDENCIA' : 'FUNDO';

  // Escopo: o <main class="main"> que contém o input de busca. Usamos esse
  // ancestor pra delimitar onde varremos linhas e onde a topbar é injetada.
  var mainEl = searchInput.closest('main') || document.body;
  var panel = mainEl;
  var searchBar = searchInput.closest('.search-bar');

  // ── ESTADO (em memória, fonte da verdade) ───────────────────────────────
  // Map cnpj → { nome, classe, tipo }  (tipo = 'FUNDO' | 'PREVIDENCIA')
  var selecionados = new Map();

  // Estado dos filtros de screening
  // IMPORTANTE: tudo começa SEM filtro. Screening é opt-in — só afeta a
  // vista quando o usuário ativa explicitamente. A busca por nome e a
  // seleção pra comparar funcionam independentemente do screening.
  var screening = {
    apenasAbertos: false,
    prazos: new Set(),                 // ids de buckets ativos
    modoRet: 'off',                    // 'off' | 'cdi' | 'ibov'
    minPctCdi: 100,                    // valor do slider quando modo='cdi'
    minPpIbov: 0,                      // valor do slider quando modo='ibov'
    janelaMeses: 12,                   // 12 | 24 — janela de retorno usada no filtro
  };

  // ── HELPERS ─────────────────────────────────────────────────────────────
  function $(sel, root) { return (root || panel).querySelector(sel); }
  function $$(sel, root) { return (root || panel).querySelectorAll(sel); }

  // Extrai prazo total (cot+pgto) em dias a partir do title do pill
  // "Prazo de resgate: cotização em 30 DC e pagamento em 1 DU" → 31
  // Casos: "cotização em X" e/ou "pagamento em Y". Se ausentes, retorna null.
  function extrairPrazoTotal(row) {
    var pill = row.querySelector('span[title^="Prazo de resgate"]');
    if (!pill) return null;
    var title = pill.getAttribute('title') || '';
    var matches = title.match(/(\d+)/g);
    if (!matches || matches.length === 0) return null;
    var soma = 0;
    for (var i = 0; i < matches.length; i++) soma += parseInt(matches[i], 10);
    return soma;
  }

  // Status = primeiro span dentro de .fundo-nome ou .fc-name (texto: ABERTO/FECHADO/...)
  function extrairStatus(row) {
    var nomeEl = row.querySelector('.fundo-nome, .fc-name');
    if (!nomeEl) return '';
    var statusSpan = nomeEl.querySelector('span');
    if (!statusSpan) return '';
    return (statusSpan.textContent || '').trim().toUpperCase();
  }

  function extrairCNPJ(row) {
    var el = row.querySelector('.fundo-cnpj-num, .fc-cnpj-num');
    return el ? (el.textContent || '').trim() : '';
  }

  function extrairNome(row) {
    var el = row.querySelector('.fundo-nome, .fc-name');
    if (!el) return '';
    // Clona pra remover spans (status pill) sem afetar o DOM original
    var clone = el.cloneNode(true);
    var spans = clone.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) spans[i].remove();
    return (clone.textContent || '').trim();
  }

  function extrairClasse(row) {
    var bloco = row.closest('.classe-bloco');
    if (!bloco) return '';
    var nomeEl = bloco.querySelector('.classe-nome');
    return nomeEl ? (nomeEl.textContent || '').trim() : '';
  }

  // ── HELPERS DE INDEXAÇÃO POR PERÍODO ───────────────────────────────────
  // Ordem de períodos no thead/cards (mesma do Dashboard_Unificado.py):
  //   [0] Mes_Corrente, [1] Mes_Anterior, [2] YTD, [3] 12_Meses, [4] 24_Meses
  // Cada período tem 3 colunas no desktop (Retorno, Bm, Bm%) e 1 .rc no mobile.
  //
  // PERIODOS_DO_FIM mapeia janela em meses → distância do FINAL da lista de
  // períodos. Como Mês Corrente/Anterior/YTD não são "janelas em meses" puras,
  // o filtro só faz sentido pra 12 e 24.
  var PERIODOS_DO_FIM = { 12: 1, 24: 0 };       // 24 = último; 12 = penúltimo
  var IDX_RC = { 12: 3, 24: 4 };                // posição do .rc no mobile-card

  // Retorna { ret, cdi, pct } com referências aos <td> da linha desktop
  // pra janela `meses`. Retorna null se a linha não tem tds suficientes.
  function tdsDoPeriodo(row, meses) {
    var tds = row.querySelectorAll('td');
    var len = tds.length;
    if (len < 3) return null;
    var idxFim = PERIODOS_DO_FIM[meses];
    if (idxFim === undefined) return null;
    return {
      ret: tds[len - 3 * idxFim - 3],
      cdi: tds[len - 3 * idxFim - 2],
      pct: tds[len - 3 * idxFim - 1],
    };
  }

  // Retorna o .rc do mobile-card correspondente à janela.
  function rcDoPeriodo(row, meses) {
    var rcs = row.querySelectorAll('.rc-grid > .rc');
    var idx = IDX_RC[meses];
    if (idx === undefined || rcs.length <= idx) return null;
    return rcs[idx];
  }

  // Lê % CDI da janela escolhida (12m ou 24m).
  // Desktop: pega a célula PCT do trio do período. Para fundos RV (que
  // mostram pp acima de IBOV no lugar), retornamos null e o filtro %CDI
  // simplesmente ignora.
  // Mobile: o .rc da janela tem .rc-sub com "98% CDI" ou "+1.5pp".
  function extrairPctCdi(row, meses) {
    if (row.tagName === 'TR') {
      var t = tdsDoPeriodo(row, meses);
      if (!t) return null;
      var span = t.pct.querySelector('span');
      var txt = (span ? span.textContent : t.pct.textContent || '').trim();
      if (txt.indexOf('pp') !== -1 || txt === '—' || txt === '-') return null;
      var n = parseFloat(txt.replace(',', '.').replace(/[^\d.\-]/g, ''));
      return isNaN(n) ? null : n;
    } else {
      var rc = rcDoPeriodo(row, meses);
      if (!rc) return null;
      var sub = rc.querySelector('.rc-sub');
      if (!sub) return null;
      var txt2 = (sub.textContent || '').trim();
      if (!/CDI/.test(txt2) || txt2 === '—') return null;
      var n2 = parseFloat(txt2.replace(',', '.').replace(/[^\d.\-]/g, ''));
      return isNaN(n2) ? null : n2;
    }
  }

  // Tem histórico na janela escolhida? (= existe valor numérico de retorno).
  // Desktop: a célula RET do trio com val-pos/neg/na.
  // Mobile: o .rc da janela tem .rc-val que se for "—" não tem.
  function temHistorico(row, meses) {
    if (row.tagName === 'TR') {
      var t = tdsDoPeriodo(row, meses);
      if (!t) return false;
      var span = t.ret.querySelector('span');
      if (!span) return false;
      return !span.classList.contains('val-na');
    } else {
      var rc = rcDoPeriodo(row, meses);
      if (!rc) return false;
      var val = rc.querySelector('.rc-val');
      if (!val) return false;
      var t2 = (val.textContent || '').trim();
      return t2 !== '—' && t2 !== '-';
    }
  }

  // Encontra o "vs Ibov" da janela escolhida (em pp).
  // Para fundos RV (usa_ibov=True), a célula PCT do trio contém "+1.5pp".
  // Para fundos não-RV retornamos null (filtro pp acima de IBOV ignora).
  function extrairPpIbov(row, meses) {
    if (row.tagName === 'TR') {
      var t = tdsDoPeriodo(row, meses);
      if (!t) return null;
      var txt = (t.pct.textContent || '').trim();
      if (txt.indexOf('pp') === -1) return null;
      var n = parseFloat(txt.replace(',', '.').replace(/[^\d.\-]/g, ''));
      return isNaN(n) ? null : n;
    } else {
      var rc = rcDoPeriodo(row, meses);
      if (!rc) return null;
      var sub = rc.querySelector('.rc-sub');
      if (!sub) return null;
      var txt2 = (sub.textContent || '').trim();
      if (txt2.indexOf('pp') === -1) return null;
      var n2 = parseFloat(txt2.replace(',', '.').replace(/[^\d.\-]/g, ''));
      return isNaN(n2) ? null : n2;
    }
  }

  // ── COLETA DE LINHAS ────────────────────────────────────────────────────
  // Importante: queremos APENAS as linhas dentro de .classe-bloco (não
  // pegamos as de .destaques-section, que costumam ser duplicatas).
  function todasLinhas() {
    var trs   = $$('.classe-bloco tbody tr.fund-row');
    var cards = $$('.classe-bloco .fund-card.fund-row');
    var out = [];
    for (var i = 0; i < trs.length; i++)   out.push(trs[i]);
    for (var j = 0; j < cards.length; j++) out.push(cards[j]);
    return out;
  }

  // ── INJEÇÃO DAS COLUNAS DE HEADER (uma vez por tabela) ──────────────────
  // Como adicionamos uma <td.cmp-check-cell> no início de cada <tr>, é
  // preciso também adicionar <col> no <colgroup> e <th> em cada <tr> do
  // <thead>, senão o alinhamento de colunas (que usa colgroup com larguras
  // fixas em col-fundo, col-data, etc.) fica todo deslocado em uma coluna.
  function injetarHeader(table) {
    if (table.dataset.cmpHeaderInjected === '1') return;
    var cg = table.querySelector('colgroup');
    if (cg) {
      var col = document.createElement('col');
      col.className = 'cmp-check-cell';
      cg.insertBefore(col, cg.firstChild);
    }
    var thead = table.querySelector('thead');
    if (thead) {
      // Para cada linha do thead (.group-header e .col-header), prepend th vazio.
      // Atenção: a primeira <tr> de header tem colspan, mas adicionar uma
      // coluna antes não quebra o colspan do "Fundo" (continua span=2).
      thead.querySelectorAll('tr').forEach(function (tr) {
        var th = document.createElement('th');
        th.className = 'cmp-check-cell';
        tr.insertBefore(th, tr.firstChild);
      });
    }
    table.dataset.cmpHeaderInjected = '1';
  }

  // ── INJEÇÃO DOS CHECKBOXES ──────────────────────────────────────────────
  function injetarCheckbox(row) {
    if (row.querySelector('.cmp-check-wrap')) return;  // já injetado
    var cnpj = extrairCNPJ(row);
    if (!cnpj) return;

    var wrap = document.createElement('label');
    wrap.className = 'cmp-check-wrap';
    wrap.title = 'Selecionar para comparar';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'cmp-check';
    cb.dataset.cnpj = cnpj;
    cb.checked = selecionados.has(cnpj);
    wrap.appendChild(cb);

    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      onToggle(cb, row);
    });
    // Clicar no label não dispara cliques de classe-header etc.
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });

    if (row.tagName === 'TR') {
      // Inserir como primeira td. Adiciona uma coluna no início.
      var td = document.createElement('td');
      td.className = 'cmp-check-cell';
      td.appendChild(wrap);
      row.insertBefore(td, row.firstChild);
    } else {
      // Card mobile — coloca como filho posicionado absolutamente no canto.
      // O CSS define position:absolute via classe no row.
      row.classList.add('has-cmp-check');
      row.insertBefore(wrap, row.firstChild);
    }
  }

  function onToggle(cb, row) {
    var cnpj = cb.dataset.cnpj;
    if (cb.checked) {
      if (selecionados.size >= LIMITE_SELECAO) {
        cb.checked = false;
        flashLimite();
        return;
      }
      selecionados.set(cnpj, {
        nome:   extrairNome(row),
        classe: extrairClasse(row),
        tipo:   tipoPagina,
      });
    } else {
      selecionados.delete(cnpj);
    }
    atualizarTopbar();
  }

  // ── BARRAS (Screening + Comparar) ──────────────────────────────────────
  // Duas barras separadas — fluxos independentes:
  //   1) Screening: filtra a vista (status, prazo, retorno mínimo)
  //   2) Comparar:  seleção de fundos pra exportar pra comparacao.html
  // Ordem visual: Screening logo após a busca; Comparar destacada com cor
  // teal (mesma da área "comparar" na sidebar) abaixo do Screening.
  function montarTopbar() {
    if (!searchBar) return;
    if (panel.querySelector('.cmp-screening-bar') || panel.querySelector('.cmp-compare-bar')) return;

    // ── Barra de Screening ───────────────────────────────────────────────
    var scr = document.createElement('div');
    scr.className = 'cmp-screening-bar';
    scr.innerHTML =
      '<div class="cmp-bar-head">' +
        '<button type="button" id="cmp-btn-toggle-screening" class="cmp-bar-trigger" aria-expanded="false">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>' +
          '<span>Filtrar fundos</span>' +
          '<span id="cmp-screen-active-pill" class="cmp-active-pill" hidden></span>' +
          '<svg class="cmp-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<span id="cmp-screen-count" class="cmp-screen-count"></span>' +
      '</div>' +
      '<div class="cmp-screening" id="cmp-screening" hidden>' +
        '<div class="cmp-screen-block">' +
          '<div class="cmp-screen-label">Situação</div>' +
          '<label class="cmp-pill-check">' +
            '<input type="checkbox" id="cmp-only-aberto">' +
            '<span>Apenas fundos abertos</span>' +
          '</label>' +
        '</div>' +
        '<div class="cmp-screen-block">' +
          '<div class="cmp-screen-label">Prazo total de resgate (cotização + pagamento)</div>' +
          '<div class="cmp-prazo-pills" id="cmp-prazo-pills"></div>' +
        '</div>' +
        '<div class="cmp-screen-block">' +
          '<div class="cmp-screen-label" id="cmp-ret-label">Retorno mínimo (12 meses)</div>' +
          '<div class="cmp-janela-toggle" role="group" aria-label="Janela de retorno">' +
            '<label class="cmp-janela-pill"><input type="radio" name="cmp-janela-ret" value="12" checked><span>12 meses</span></label>' +
            '<label class="cmp-janela-pill"><input type="radio" name="cmp-janela-ret" value="24"><span>24 meses</span></label>' +
          '</div>' +
          '<div class="cmp-radio-row">' +
            '<label class="cmp-radio"><input type="radio" name="cmp-modo-ret" value="off" checked> Sem filtro</label>' +
            '<label class="cmp-radio"><input type="radio" name="cmp-modo-ret" value="cdi"> % do CDI</label>' +
            '<label class="cmp-radio"><input type="radio" name="cmp-modo-ret" value="ibov"> pp acima do IBOV</label>' +
          '</div>' +
          '<div class="cmp-slider-row" id="cmp-slider-cdi" hidden>' +
            '<span class="cmp-slider-cap">95%</span>' +
            '<input type="range" id="cmp-range-cdi" min="95" max="200" step="1" value="100">' +
            '<span class="cmp-slider-cap">200%+</span>' +
            '<output id="cmp-out-cdi" class="cmp-slider-out">≥ 100% CDI</output>' +
          '</div>' +
          '<div class="cmp-slider-row" id="cmp-slider-ibov" hidden>' +
            '<span class="cmp-slider-cap">−10pp</span>' +
            '<input type="range" id="cmp-range-ibov" min="-10" max="20" step="1" value="0">' +
            '<span class="cmp-slider-cap">+20pp</span>' +
            '<output id="cmp-out-ibov" class="cmp-slider-out">≥ IBOV</output>' +
          '</div>' +
        '</div>' +
        '<div class="cmp-screen-actions">' +
          '<button type="button" id="cmp-screen-reset" class="cmp-btn cmp-btn-ghost cmp-btn-sm">Limpar filtros</button>' +
        '</div>' +
      '</div>';

    // ── Barra de Comparar (separada, com destaque teal) ─────────────────
    var cmp = document.createElement('div');
    cmp.className = 'cmp-compare-bar';
    cmp.innerHTML =
      '<div class="cmp-compare-left">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>' +
        '<span class="cmp-compare-title">Comparar fundos</span>' +
        '<span class="cmp-counter"><strong id="cmp-count">0</strong>/' + LIMITE_SELECAO + ' selecionado(s)</span>' +
      '</div>' +
      '<div class="cmp-compare-right">' +
        '<button type="button" id="cmp-btn-clear" class="cmp-btn cmp-btn-ghost" disabled>Limpar seleção</button>' +
        '<button type="button" id="cmp-btn-go" class="cmp-btn cmp-btn-compare" disabled>Comparar selecionados</button>' +
      '</div>';

    // Insere a barra de Screening logo após a search-bar (inline, no fluxo).
    searchBar.parentNode.insertBefore(scr, searchBar.nextSibling);
    // A barra Comparar é fixed (rodapé) — vai direto no <body> pra evitar
    // problemas com `overflow: hidden` em ancestrais e garantir z-index.
    document.body.appendChild(cmp);

    // Pills de prazo
    var pillsHost = scr.querySelector('#cmp-prazo-pills');
    PRAZO_BUCKETS.forEach(function (b) {
      var lbl = document.createElement('label');
      lbl.className = 'cmp-pill-check';
      lbl.innerHTML = '<input type="checkbox" data-prazo="' + b.id + '"><span>' + b.label + '</span>';
      pillsHost.appendChild(lbl);
    });

    // ── Listeners — Comparar
    cmp.querySelector('#cmp-btn-clear').addEventListener('click', limparSelecao);
    cmp.querySelector('#cmp-btn-go').addEventListener('click', irParaComparar);

    // ── Listeners — Screening
    var btnToggle = scr.querySelector('#cmp-btn-toggle-screening');
    btnToggle.addEventListener('click', function () {
      var s = scr.querySelector('#cmp-screening');
      var aberto = s.hidden;
      s.hidden = !aberto;
      btnToggle.classList.toggle('active', aberto);
      btnToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });

    scr.querySelector('#cmp-only-aberto').addEventListener('change', function (e) {
      screening.apenasAbertos = e.target.checked;
      aplicarScreening();
    });
    scr.querySelectorAll('input[data-prazo]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) screening.prazos.add(cb.dataset.prazo);
        else            screening.prazos.delete(cb.dataset.prazo);
        aplicarScreening();
      });
    });
    scr.querySelectorAll('input[name="cmp-modo-ret"]').forEach(function (rd) {
      rd.addEventListener('change', function () {
        screening.modoRet = rd.value;
        scr.querySelector('#cmp-slider-cdi').hidden  = (rd.value !== 'cdi');
        scr.querySelector('#cmp-slider-ibov').hidden = (rd.value !== 'ibov');
        aplicarScreening();
      });
    });
    var rangeCdi = scr.querySelector('#cmp-range-cdi');
    var outCdi   = scr.querySelector('#cmp-out-cdi');
    rangeCdi.addEventListener('input', function () {
      screening.minPctCdi = parseInt(rangeCdi.value, 10);
      outCdi.textContent = '≥ ' + screening.minPctCdi + '% CDI';
      aplicarScreening();
    });
    var rangeIbov = scr.querySelector('#cmp-range-ibov');
    var outIbov   = scr.querySelector('#cmp-out-ibov');
    rangeIbov.addEventListener('input', function () {
      screening.minPpIbov = parseInt(rangeIbov.value, 10);
      var sinal = screening.minPpIbov >= 0 ? '+' : '';
      outIbov.textContent = '≥ IBOV ' + sinal + screening.minPpIbov + 'pp';
      aplicarScreening();
    });

    // Toggle de janela (12m / 24m). Atualiza label do bloco e re-aplica
    // o screening pra recomputar a vista usando a coluna correta.
    scr.querySelectorAll('input[name="cmp-janela-ret"]').forEach(function (rd) {
      rd.addEventListener('change', function () {
        screening.janelaMeses = parseInt(rd.value, 10);
        var lbl = scr.querySelector('#cmp-ret-label');
        if (lbl) lbl.textContent = 'Retorno mínimo (' + screening.janelaMeses + ' meses)';
        aplicarScreening();
      });
    });

    scr.querySelector('#cmp-screen-reset').addEventListener('click', resetarScreening);
  }

  function flashLimite() {
    var btnGo = $('#cmp-btn-go');
    if (!btnGo) return;
    btnGo.classList.add('cmp-flash');
    setTimeout(function () { btnGo.classList.remove('cmp-flash'); }, 600);
  }

  function atualizarTopbar() {
    var n = selecionados.size;
    // A barra Comparar é fixed no <body> — fora do `panel`. Usamos
    // document.querySelector pra alcançar seus elementos.
    var cEl = document.getElementById('cmp-count');
    if (cEl) cEl.textContent = String(n);
    var btnGo = document.getElementById('cmp-btn-go');
    if (btnGo) btnGo.disabled = n < 2;
    var btnCl = document.getElementById('cmp-btn-clear');
    if (btnCl) btnCl.disabled = n === 0;
    var barCmp = document.querySelector('.cmp-compare-bar');
    if (barCmp) barCmp.classList.toggle('cmp-empty', n === 0);
  }

  function limparSelecao() {
    selecionados.clear();
    document.querySelectorAll('.cmp-check').forEach(function (cb) { cb.checked = false; });
    atualizarTopbar();
  }

  function irParaComparar() {
    if (selecionados.size < 2) return;
    // Serializa: lista de objetos { cnpj, nome, classe, tipo }
    var arr = [];
    selecionados.forEach(function (meta, cnpj) {
      arr.push({ cnpj: cnpj, nome: meta.nome, classe: meta.classe, tipo: meta.tipo });
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) { /* storage cheio? deixa ir mesmo assim */ }
    // Navega. comparacao.html está na raiz (fundos.html e previdencia.html
    // também são raiz, então URL relativa funciona).
    window.location.href = 'comparacao.html';
  }

  function resetarScreening() {
    screening.apenasAbertos = false;
    screening.prazos.clear();
    screening.modoRet = 'off';
    screening.minPctCdi = 100;
    screening.minPpIbov = 0;
    screening.janelaMeses = 12;

    $('#cmp-only-aberto').checked = false;
    $$('input[data-prazo]').forEach(function (cb) { cb.checked = false; });
    $$('input[name="cmp-modo-ret"]').forEach(function (rd) { rd.checked = (rd.value === 'off'); });
    $$('input[name="cmp-janela-ret"]').forEach(function (rd) { rd.checked = (rd.value === '12'); });
    var lblRet = $('#cmp-ret-label');
    if (lblRet) lblRet.textContent = 'Retorno mínimo (12 meses)';
    $('#cmp-slider-cdi').hidden = true;
    $('#cmp-slider-ibov').hidden = true;
    $('#cmp-range-cdi').value = 100;
    $('#cmp-out-cdi').textContent = '≥ 100% CDI';
    $('#cmp-range-ibov').value = 0;
    $('#cmp-out-ibov').textContent = '≥ IBOV';
    aplicarScreening();
  }

  // ── APLICAR SCREENING + BUSCA (integrado) ──────────────────────────────
  // A função filtrar() do dashboard.js mexe em row.style.display direto
  // ('none' ou ''). A nossa estratégia anterior (classe CSS com !important)
  // funcionava pra esconder, mas como o style:display='' tem prioridade DOM
  // e a class CSS vence só se não houver inline mais forte, resultava em
  // conflitos sutis: ao limpar filtros, linhas ocultas por busca anterior
  // não voltavam, e blocos ficavam expandidos vazios.
  //
  // Solução nova: trabalhamos JUNTO com a busca. Hookamos window.filtrar()
  // para rodar nosso aplicarScreening() depois — assim screening + busca
  // são aplicados em ordem, e o estado final do row.style.display reflete
  // ambos. Também atualizamos counts por classe e escondemos blocos vazios.
  function aplicarScreening() {
    // Lê o termo de busca atual (se houver). filtrar() do dashboard não
    // expõe esse estado, mas podemos lê-lo direto do input.
    var q = '';
    var inp = document.getElementById('searchFundos') || document.getElementById('searchPrev');
    if (inp) q = (inp.value || '').trim().toLowerCase();

    var rows = todasLinhas();
    rows.forEach(function (row) {
      var passaScr = passaScreening(row);
      var passaBus = !q || (row.textContent || '').toLowerCase().indexOf(q) !== -1;
      var visivel = passaScr && passaBus;
      // Mexemos diretamente no inline display — fonte única da verdade.
      row.style.display = visivel ? '' : 'none';
    });

    // Atualiza counts por classe e esconde blocos vazios.
    // Também: quando há busca/filtro ativo e a classe tem matches, EXPANDE
    // automaticamente o bloco — assim o usuário vê os resultados sem
    // precisar clicar em cada classe. Quando volta ao default (sem busca,
    // sem filtros), restaura o estado colapsado original.
    var algumFiltroAtivo = !!q
        || screening.apenasAbertos
        || screening.prazos.size > 0
        || screening.modoRet !== 'off';

    var totalGeral = 0;
    $$('.classe-bloco').forEach(function (bloco) {
      var visiveis = 0;
      bloco.querySelectorAll('tbody tr.fund-row, .mobile-cards .fund-card.fund-row').forEach(function (r) {
        // Conta cada FUNDO uma vez. Como há linhas duplicadas (desktop tr +
        // mobile card pro mesmo fundo), só contamos as <tr> (que existem
        // sempre, mesmo que invisíveis no mobile via CSS responsive).
        if (r.tagName === 'TR' && r.style.display !== 'none') visiveis++;
      });
      // Atualiza badge de count
      var badge = bloco.querySelector('.classe-count');
      if (badge) {
        if (!badge.dataset.cmpOriginal) {
          badge.dataset.cmpOriginal = badge.textContent;
        }
        badge.textContent = visiveis + ' fundo' + (visiveis !== 1 ? 's' : '');
      }
      // Esconde bloco se vazio
      bloco.classList.toggle('cmp-empty-by-screening', visiveis === 0);

      // Expande automaticamente quando há filtro ativo e há matches.
      // Quando o filtro/busca volta a vazio, restaura ao estado colapsado
      // original (que veio do gerador — todas começam .collapsed).
      var body = bloco.querySelector('.classe-body');
      var icon = bloco.querySelector('.classe-toggle-icon');
      if (body) {
        if (algumFiltroAtivo && visiveis > 0) {
          // Auto-expande se há filtro e algo a mostrar
          if (body.classList.contains('collapsed')) {
            body.dataset.cmpAutoExpanded = '1';
            body.classList.remove('collapsed');
            if (icon) icon.textContent = '▼';
          }
        } else if (!algumFiltroAtivo && body.dataset.cmpAutoExpanded === '1') {
          // Voltou ao default — recolhe os blocos que NÓS abrimos
          body.classList.add('collapsed');
          delete body.dataset.cmpAutoExpanded;
          if (icon) icon.textContent = '▶';
        }
      }

      totalGeral += visiveis;
    });

    // Atualiza contador no painel de screening (só se algum filtro está ativo)
    var algumAtivo = screening.apenasAbertos || screening.prazos.size > 0 || screening.modoRet !== 'off';
    var cnt = $('#cmp-screen-count');
    if (cnt) {
      cnt.textContent = algumAtivo ? (totalGeral + ' fundo' + (totalGeral !== 1 ? 's' : '') + ' atendem') : '';
    }
    // Pill "ativo" no botão Screening — mostra quantos filtros estão ligados
    var pill = $('#cmp-screen-active-pill');
    if (pill) {
      var nFiltros = 0;
      if (screening.apenasAbertos) nFiltros++;
      if (screening.prazos.size > 0) nFiltros++;
      if (screening.modoRet !== 'off') nFiltros++;
      pill.hidden = nFiltros === 0;
      pill.textContent = nFiltros + ' filtro' + (nFiltros !== 1 ? 's' : '') + ' ativo' + (nFiltros !== 1 ? 's' : '');
    }

    // Atualiza o contador da busca (countFundos / countPrev) que aparece
    // ao lado do input de busca. Só mexemos quando há busca ativa, pra
    // não conflitar com o comportamento original do filtrar() do dashboard.
    var cntBusca = document.getElementById('countFundos') || document.getElementById('countPrev');
    if (cntBusca && q) {
      cntBusca.textContent = totalGeral + ' fundo' + (totalGeral !== 1 ? 's' : '') + ' encontrado' + (totalGeral !== 1 ? 's' : '');
    } else if (cntBusca && !q) {
      cntBusca.textContent = '';
    }
  }

  // Hooka window.filtrar() (definida pelo Dashboard_Unificado.py inline) pra
  // que toda mudança na busca dispare o nosso aplicarScreening() depois.
  // Se filtrar() ainda não foi definida (ordem de scripts), tenta de novo
  // após 'load'. Como nosso script é carregado depois da definição inline
  // de filtrar(), normalmente está disponível direto.
  function hookarBusca() {
    var origFiltrar = window.filtrar;
    if (typeof origFiltrar === 'function') {
      window.filtrar = function (aba) {
        // Não chamamos o original — fazemos tudo no nosso aplicarScreening,
        // que já considera busca + screening + counts + blocos vazios.
        // Mas mantemos a assinatura caso outro código dependa.
        aplicarScreening();
      };
    } else {
      // Fallback: liga listener direto no input
      var inp = document.getElementById('searchFundos') || document.getElementById('searchPrev');
      if (inp) inp.addEventListener('input', aplicarScreening);
    }
  }

  function passaScreening(row) {
    // 1) Status
    if (screening.apenasAbertos) {
      var st = extrairStatus(row);
      if (st !== 'ABERTO') return false;
    }
    // 2) Prazo
    if (screening.prazos.size > 0) {
      var p = extrairPrazoTotal(row);
      if (p === null) return false;
      var match = false;
      for (var i = 0; i < PRAZO_BUCKETS.length; i++) {
        var b = PRAZO_BUCKETS[i];
        if (!screening.prazos.has(b.id)) continue;
        if (p >= b.min && p <= b.max) { match = true; break; }
      }
      if (!match) return false;
    }
    // 3) Retorno mínimo (na janela escolhida: 12 ou 24 meses)
    var janela = screening.janelaMeses;
    if (screening.modoRet === 'cdi') {
      if (!temHistorico(row, janela)) return false;
      var pct = extrairPctCdi(row, janela);
      if (pct === null) return false;
      if (pct < screening.minPctCdi) return false;
    } else if (screening.modoRet === 'ibov') {
      if (!temHistorico(row, janela)) return false;
      var pp = extrairPpIbov(row, janela);
      if (pp === null) return false;
      if (pp < screening.minPpIbov) return false;
    }
    return true;
  }

  // ── INTEGRAÇÃO COM A BUSCA EXISTENTE ────────────────────────────────────
  // O `filtrar()` do dashboard.js (Dashboard_Unificado.py) aplica
  // row.style.display = 'none' nas linhas que não casam com a busca.
  // Como a busca seta display="" pra mostrar, ela ignora nossa classe.
  // Solução: usar CSS pra que cmp-hidden-by-screening force display:none
  // independente do style inline. Acontece que `display: none !important`
  // numa CSS class vence inline `display:''` (que é vazio, não é "block").
  // Então só precisamos do CSS — sem reescrever a busca.

  // ── BADGE "SEM 12M" ────────────────────────────────────────────────────
  // Quando o filtro de retorno está ativo e a linha não tem 12M, ela é
  // escondida. Mas se o usuário desativa o filtro, queremos sinalizar
  // visualmente que esse fundo não tem 12m. Isso é só info — a UX da
  // explicação ("fundos com menos de 12 meses serão escondidos") mora no
  // próprio rótulo do filtro, então não vamos cluttar a tabela com badges
  // adicionais. Mantemos a heurística simples: filtra → some.

  // ── INIT ────────────────────────────────────────────────────────────────
  function init() {
    montarTopbar();
    // Headers de tabela: uma só vez por tabela
    $$('.classe-bloco .desktop-table table').forEach(injetarHeader);
    // Linhas: cada uma ganha o checkbox
    todasLinhas().forEach(injetarCheckbox);
    atualizarTopbar();
    hookarBusca();
    aplicarScreening();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
