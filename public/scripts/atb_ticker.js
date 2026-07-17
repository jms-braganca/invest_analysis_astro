/* ============================================================
   atb_ticker.js — Faixa rolante de cotações (estilo "ticker tape").

   Fonte: brapi.dev (B3 + dólar + cripto), consumida NO NAVEGADOR.
   • Sem manutenção de dados: cada visita busca o valor (cache de 15 min
     no localStorage para não estourar o limite da API).
   • Uma requisição por ticker (amigável ao plano free; símbolo cru no path
     para os índices ^BVSP / ^IFIX funcionarem).
   • Renderiza dentro de qualquer elemento [data-ticker] (acima da topbar).

   CONFIG: cole seu token em BRAPI_TOKEN (ou defina window.BRAPI_TOKEN antes
   de carregar este script). O token fica público no front — é assim mesmo
   para APIs client-side; use o token free.
   ============================================================ */
(function () {
  'use strict';

  var BRAPI_TOKEN = (typeof window !== 'undefined' && window.BRAPI_TOKEN) || 'gYnKmdyfVvQdFpWXxM81SH';

  // Índices primeiro, depois ações (via /api/quote, 1 por requisição).
  var ACOES = [
    '^BVSP', '^IFIX',
    'PETR4', 'VALE3', 'ITUB4', 'ABEV3', 'MGLU3', 'GGBR4',
    'WEGE3', 'BBDC3', 'AXIA3', 'ITSA4', 'BBAS3', 'VIVT3',
    'SBSP3', 'RDOR3', 'BBSE3', 'EMBJ3', 'PRIO3', 'BPAC11'
  ];
  var ROTULOS = { '^BVSP': 'IBOV', '^IFIX': 'IFIX' };   // nomes amigáveis

  var CACHE_KEY = 'atb_ticker_v4';
  var TTL = 15 * 60 * 1000;            // 15 min
  var API = 'https://brapi.dev/api';

  var host = document.querySelector('[data-ticker]');
  if (!host) return;

  injectStyle();

  if (!BRAPI_TOKEN || BRAPI_TOKEN.indexOf('COLE_SEU_TOKEN') === 0) {
    console.warn('[ticker] Token brapi não definido. Cole seu token em ' +
                 'shared/atb_ticker.js (BRAPI_TOKEN) ou via window.BRAPI_TOKEN.');
    return;
  }

  var cached = readCache();
  if (cached && cached.items && cached.items.length) render(cached.items);

  if (!cached || (Date.now() - cached.t) > TTL) {
    carregar().then(function (items) {
      if (items && items.length) {
        render(items);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: items })); } catch (e) {}
      }
    }).catch(function () {});
  }

  /* ---------- coleta (1 requisição por ticker) ---------- */
  function carregar() {
    var tk = encodeURIComponent(BRAPI_TOKEN);
    var tasks = [];

    tasks.push(function () {
      return fetchJSON(API + '/v2/currency?currency=USD-BRL&token=' + tk).then(function (j) {
        var c = j && j.currency && j.currency[0];
        return c ? item('DÓLAR', num(c.bidPrice), pctNum(c.pctChange != null ? c.pctChange : c.percentageChange), 2, 'R$ ') : null;
      }).catch(function () { return null; });
    });

    tasks.push(function () {
      return fetchJSON(API + '/v2/crypto?coin=BTC&currency=BRL&token=' + tk).then(function (j) {
        var c = j && j.coins && j.coins[0];
        return c ? item('BITCOIN', num(c.regularMarketPrice), pctNum(c.regularMarketChangePercent), 0, 'R$ ') : null;
      }).catch(function () { return null; });
    });

    ACOES.forEach(function (sym) {
      tasks.push(function () {
        // símbolo cru no path — a brapi espera ^BVSP literal (não %5EBVSP)
        return fetchJSON(API + '/quote/' + sym + '?token=' + tk).then(function (j) {
          var r = j && j.results && j.results[0];
          if (!r) return null;
          var isIdx = sym.indexOf('^') === 0;
          return item(ROTULOS[sym] || r.symbol, num(r.regularMarketPrice),
                      pctNum(r.regularMarketChangePercent),
                      isIdx ? 0 : 2, isIdx ? '' : 'R$ ', isIdx ? ' pts' : '');
        }).catch(function () { return null; });
      });
    });

    // Sequencial com pausa — evita o rate limit (429) do plano free da brapi.
    var out = [];
    function delay(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
    function next(i) {
      if (i >= tasks.length) return Promise.resolve(out);
      return tasks[i]().then(function (r) {
        if (r) out.push(r);
        if (out.length) render(out);            // vai aparecendo conforme chega
        return delay(180);
      }).then(function () { return next(i + 1); });
    }
    return next(0).then(function () {
      if (!out.length) console.warn('[ticker] Nenhuma cotação retornada — verifique o token/plano da brapi (aba Network).');
      return out;
    });
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) {
        console.warn('[ticker] brapi HTTP ' + r.status + ' em ' + url.replace(/token=[^&]+/, 'token=***'));
        throw new Error('HTTP ' + r.status);
      }
      return r.json();
    });
  }

  /* ---------- normalização / formatação ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function pctNum(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  function item(label, price, pct, dec, prefix, suffix) {
    return { label: label, price: price, pct: pct, dec: dec, prefix: prefix || '', suffix: suffix || '' };
  }

  function fmtPrice(it) {
    if (it.price == null) return '—';
    var s = it.price.toLocaleString('pt-BR', { minimumFractionDigits: it.dec, maximumFractionDigits: it.dec });
    return it.prefix + s + it.suffix;
  }
  function fmtPct(p) {
    if (p == null) return '';
    var sinal = p > 0 ? '+' : (p < 0 ? '−' : '');
    return sinal + Math.abs(p).toFixed(2).replace('.', ',') + '%';
  }

  /* ---------- render (marquee com loop sem emenda) ---------- */
  function render(items) {
    var inner = items.map(function (it) {
      var cls = it.pct == null ? '' : (it.pct > 0 ? 'tk-up' : (it.pct < 0 ? 'tk-down' : ''));
      return '<span class="tk-item"><span class="tk-sym">' + esc(it.label) + '</span>' +
             '<span class="tk-px">' + fmtPrice(it) + '</span>' +
             '<span class="tk-chg ' + cls + '">' + fmtPct(it.pct) + '</span></span>';
    }).join('');
    host.innerHTML = '<div class="tk-tape"><div class="tk-track">' + inner + inner + '</div></div>';
    host.classList.add('is-ready');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  /* ---------- estilo (claro/escuro) ---------- */
  function injectStyle() {
    if (document.getElementById('atb-ticker-style')) return;
    var css =
      // Layout do ticker (display/altura/sticky/offset do topbar/fundo/borda)
      // vem do head (.atb-ticker em private-topbar.css) pra reservar o espaço já
      // no 1º paint e não causar CLS. Aqui só os estilos do CONTEÚDO.
      '.tk-tape{position:relative;overflow:hidden;height:100%}' +
      '.tk-track{display:inline-flex;align-items:center;height:38px;white-space:nowrap;will-change:transform;animation:tkscroll 90s linear infinite}' +
      '.tk-tape:hover .tk-track{animation-play-state:paused}' +
      '.tk-item{display:inline-flex;align-items:baseline;gap:7px;padding:0 18px;border-right:.5px solid rgba(0,0,0,.07);font-size:13px}' +
      'body.theme-dark .tk-item{border-right-color:rgba(255,255,255,.07)}' +
      '.tk-sym{font-weight:600;letter-spacing:.02em;color:#1d1d1f}' +
      'body.theme-dark .tk-sym{color:#f5f5f7}' +
      '.tk-px{color:#48484a}body.theme-dark .tk-px{color:#c7c7cc}' +
      '.tk-chg{font-variant-numeric:tabular-nums}' +
      '.tk-up{color:#0a7d2e}.tk-down{color:#dc2626}' +
      'body.theme-dark .tk-up{color:#30d158}body.theme-dark .tk-down{color:#ff453a}' +
      '@keyframes tkscroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}' +
      '@media (prefers-reduced-motion: reduce){.tk-track{animation:none}}';
    var st = document.createElement('style');
    st.id = 'atb-ticker-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
})();
