/* calc-applecare.js — Compara Apple Care+ tradicional (por device) vs
   Apple Care One (US$ 19,99/mês para até 3 devices + US$ 5,99 por device
   adicional). Lê preços dos atributos data-monthly/data-annual de cada
   input qty[data-applecare-row].

   IDs:
     ac-q-<idx>           — input de qty por device
     ac-qty-total         — qty total
     ac-trad-m / -a       — Tradicional mensal / anual
     ac-one-m  / -a       — Apple Care One mensal / anual
     ac-dif-m  / -a       — Diferença mensal / anual (positiva = One mais barato)
     ac-veredito-wrap     — destaque (.ac-aporte)
     ac-veredito-val/-sub — texto do veredito
*/
(function () {
  'use strict';

  // ── Parâmetros do Apple Care One ──────────────────────────────────
  const ONE_BASE_MONTHLY    = 19.99;   // até 3 dispositivos
  const ONE_BASE_DEVICES    = 3;
  const ONE_EXTRA_MONTHLY   = 5.99;    // cada device acima de 3

  // ── Formatação ──────────────────────────────────────────────────
  // Preços do site da Apple estão em USD — formatar como "US$ 1.234,56".
  function fmtUSD(v) {
    const abs = Math.abs(v);
    const s = abs.toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '-' : '') + 'US$ ' + s;
  }

  // Lê qty de um input — aceita vazio, formata só inteiro >=0.
  function lerQty(inp) {
    const raw = (inp.value || '').replace(/\D/g, '');
    const n = parseInt(raw, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function recalc() {
    let totalDevices = 0;
    let tradMonthly  = 0;
    let tradAnnual   = 0;

    document.querySelectorAll('input[data-applecare-row]').forEach(function (inp) {
      const qty = lerQty(inp);
      const m   = parseFloat(inp.dataset.monthly) || 0;
      const y   = parseFloat(inp.dataset.annual)  || 0;
      totalDevices += qty;
      tradMonthly  += qty * m;
      tradAnnual   += qty * y;
    });

    // Apple Care One — só faz sentido com ≥1 device.
    let oneMonthly = 0;
    if (totalDevices > 0) {
      oneMonthly = ONE_BASE_MONTHLY;
      if (totalDevices > ONE_BASE_DEVICES) {
        oneMonthly += (totalDevices - ONE_BASE_DEVICES) * ONE_EXTRA_MONTHLY;
      }
    }
    // Apple Care One só tem cobrança mensal (site oficial). Pra comparar
    // com o "anual" do tradicional, projetamos 12 × mensal.
    const oneAnnual  = oneMonthly * 12;

    const difMonthly = tradMonthly - oneMonthly;   // positivo = One economiza
    const difAnnual  = tradAnnual  - oneAnnual;

    // ── Pinta resultados ─────────────────────────────────────────
    setTxt('ac-qty-total', totalDevices ? totalDevices + ' dispositivo' + (totalDevices > 1 ? 's' : '') : '—');
    setTxt('ac-trad-m', totalDevices ? fmtUSD(tradMonthly) : '—');
    setTxt('ac-trad-a', totalDevices ? fmtUSD(tradAnnual)  : '—');
    setTxt('ac-one-m',  totalDevices ? fmtUSD(oneMonthly)  : '—');
    setTxt('ac-one-a',  totalDevices ? fmtUSD(oneAnnual)   : '—');

    // ── Veredito ──────────────────────────────────────────────────
    const wrap = document.getElementById('ac-veredito-wrap');
    const val  = document.getElementById('ac-veredito-val');
    const sub  = document.getElementById('ac-veredito-sub');
    if (!wrap || !val || !sub) return;

    wrap.classList.remove('ac-vd-pos', 'ac-vd-neg', 'ac-vd-eq');

    if (totalDevices === 0) {
      val.textContent = '—';
      sub.textContent = 'Adicione pelo menos 1 dispositivo para comparar.';
      return;
    }

    if (difMonthly > 0.005) {
      val.textContent = 'Apple Care One: economia de ' + fmtUSD(difMonthly) + '/mês';
      sub.innerHTML   = 'No ano você economiza <strong>' + fmtUSD(difAnnual) + '</strong> com o One.';
      wrap.classList.add('ac-vd-pos');
    } else if (difMonthly < -0.005) {
      val.textContent = 'Apple Care+ tradicional: economia de ' + fmtUSD(-difMonthly) + '/mês';
      sub.innerHTML   = 'No ano você economiza <strong>' + fmtUSD(-difAnnual) + '</strong> mantendo o plano por device.';
      wrap.classList.add('ac-vd-neg');
    } else {
      val.textContent = 'Empate técnico.';
      sub.textContent = 'Os dois planos custam praticamente o mesmo nesta configuração.';
      wrap.classList.add('ac-vd-eq');
    }
  }

  function setTxt(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  // ── Setup de eventos ────────────────────────────────────────────
  function init() {
    // Recalcula em qualquer input
    document.querySelectorAll('input[data-applecare-row]').forEach(function (inp) {
      inp.addEventListener('input',  recalc);
      inp.addEventListener('change', recalc);
      // Sanitiza: aceita só dígitos enquanto digita
      inp.addEventListener('blur', function () {
        const n = lerQty(inp);
        inp.value = n > 0 ? String(n) : '';
        recalc();
      });
    });

    // Steppers + / −
    document.querySelectorAll('[data-ac-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id   = btn.dataset.acStep;
        const sign = btn.dataset.acSign === '-' ? -1 : 1;
        const inp  = document.getElementById(id);
        if (!inp) return;
        const cur = lerQty(inp);
        const next = Math.max(0, cur + sign);
        inp.value = next > 0 ? String(next) : '';
        recalc();
      });
    });

    // Limpar tudo
    const clr = document.getElementById('ac-clear');
    if (clr) {
      clr.addEventListener('click', function () {
        document.querySelectorAll('input[data-applecare-row]').forEach(function (inp) {
          inp.value = '';
        });
        recalc();
      });
    }

    // PDF
    const pdfBtn = document.getElementById('ac-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () { window.print(); });
    }

    recalc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
