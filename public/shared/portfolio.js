/* ============================================================
   portfolio.js v2 — Portfolio Tracker (template novo + dados reais)
   Consome window.__DASHBOARD_DATA__ injetado pelo CarteiraModelo.py
   ============================================================ */
(function () {
'use strict';

// ─── DADOS ─────────────────────────────────────────────────
// __DASHBOARD_DATA__ vem do <script> injetado no template pelo Python
const RAW = (typeof window !== 'undefined' && window.__DASHBOARD_DATA__) || {};

if (!RAW.kpi) {
  console.error('[portfolio] __DASHBOARD_DATA__ não disponível ou inválido. Renderização abortada.');
  return;
}

// Adapter: bate as chaves do JSON do CarteiraModelo.py com o que o JS espera
const PTAX = RAW.ptax || 5.0;
const DATA = {
  data_geracao: RAW.data_geracao,
  ano_atual: RAW.ano_atual,
  idade: RAW.idade,
  idade_inicial: RAW.idade_inicial,
  pl_inicial: RAW.pl_inicial,
  meta_if: RAW.meta_if,
  ptax: PTAX,
  kpi: RAW.kpi,
  cdi_ref: RAW.cdi_ref || { m: null, m_ant: null, ano: null },
  tir_carteira: RAW.tir_carteira,
  alloc: RAW.alloc || [],
  ativos_br: RAW.ativos_br || [],
  ativos_us: RAW.ativos_us || [],
  consol: RAW.consol || {},
  cal_br: RAW.cal_br || [],
  prev_fundos: RAW.prev_fundos || [],
  matur: RAW.matur || [],
  prev: RAW.prev || {},
  br_kpi: RAW.br_kpi || {},
  evo: RAW.evo || { labels: [], pl: [], aportes: [], pl_inicial: 0 },
  indicadores_historico: RAW.indicadores_historico || [],
  prev_aliq_vgbl: RAW.prev_aliq_vgbl || [],
  prev_aliq_pgbl: RAW.prev_aliq_pgbl || [],
};

// ─── ESTADO ─────────────────────────────────────────────────
let CUR = 'BRL', PER = 'y', VIEW = 'g', BR_FILT = 'all', US_CUR = 'USD', CONSOL_FILT = 'all';
let evoChart, prevDonut, usRoiChart, usTirChart, ifChart, rendaChart, prevMaturChart;

// ─── FORMATAÇÃO ─────────────────────────────────────────────
const fmtBR  = v => v == null ? '—' : 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const fmtBRk = v => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e6) return 'R$ ' + (v/1e6).toFixed(1).replace('.', ',') + ' mi';
  if (Math.abs(v) >= 1e3) return 'R$ ' + Math.round(v/1e3) + 'k';
  return 'R$ ' + Math.round(v);
};
const fmtUS  = v => v == null ? '—' : 'US$ ' + Math.round(v).toLocaleString('en-US');
const pct    = (v, d=2) => (v == null ? '—' : Number(v).toFixed(d).replace('.', ',') + '%');
const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
const setHTML = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };

// ─── HERO + KPIs ────────────────────────────────────────────
function renderHero() {
  const isBRL = CUR === 'BRL';
  const pl = DATA.kpi.pl;
  const br = DATA.kpi.brVal;
  const us = DATA.kpi.usVal;
  setText('heroVal', isBRL ? fmtBR(pl) : fmtUS(pl / PTAX));
  setText('heroBR',  isBRL ? fmtBR(br) : fmtUS(br / PTAX));
  setText('heroUS',  isBRL ? fmtBR(us) : fmtUS(us / PTAX));
  setText('heroSplit', `${(DATA.kpi.brSplit || 0).toFixed(1).replace('.',',')}/${(DATA.kpi.usSplit || 0).toFixed(1).replace('.',',')}`);

  const d = DATA.kpi[PER] || {};
  const dlt = document.getElementById('heroDelta');
  if (!dlt) return;
  if (PER === 'h' && d.cagr != null) {
    dlt.textContent = `↑ CAGR ${d.cagr.toFixed(1).replace('.', ',')}% a.a.`;
  } else if (d.plDelta != null) {
    dlt.textContent = `${d.plDelta >= 0 ? '↑' : '↓'} ${pct(Math.abs(d.plDelta))}`;
  } else {
    dlt.textContent = '—';
  }
  dlt.className = 'ptf-hero-delta' + (d.plDelta != null && d.plDelta < 0 ? ' neg' : '');
}

function renderKPIs() {
  const periodLabel = { m: 'do mês', y: 'YTD', h: 'histórico' };
  const d = DATA.kpi[PER] || {};
  const isBRL = CUR === 'BRL';
  const pl = DATA.kpi.pl;
  const rend = d.rend != null ? (isBRL ? d.rend : d.rend / PTAX) : null;
  const apor = d.apor != null ? (isBRL ? d.apor : d.apor / PTAX) : null;

  setText('kpiPL', isBRL ? fmtBR(pl) : fmtUS(pl / PTAX));
  setText('kpiPLDelta', PER === 'h' && d.cagr != null ? `CAGR ${d.cagr.toFixed(1)}% a.a.`
                                                       : `${d.plDelta >= 0 ? '+' : ''}${pct(d.plDelta)} ${PER === 'm' ? 'no mês' : 'YTD'}`);
  setText('kpiRendPer', periodLabel[PER]);
  setText('kpiAporPer', periodLabel[PER]);
  setText('kpiRend', rend == null ? '—' : (rend >= 0 ? '+' : '') + (isBRL ? fmtBR(rend) : fmtUS(rend)));
  if (d.rendPct != null) {
    setText('kpiRendDelta', (d.rendPct >= 0 ? '+' : '') + pct(d.rendPct));
    const dEl = document.getElementById('kpiRendDelta');
    if (dEl) dEl.className = 'delta ' + (d.rendPct >= 0 ? 'pos' : 'neg');
  } else {
    setText('kpiRendDelta', '—');
  }
  setText('kpiRendCtx', PER === 'm' ? 'cota no mês' : PER === 'y' ? 'cota YTD' : 'cota histórica');
  setText('kpiApor', apor == null ? '—' : (isBRL ? fmtBR(apor) : fmtUS(apor)));

  // Taxa de poupança (estrutura nova: kpi.taxa_poupanca_ytd)
  const tp = DATA.kpi.taxa_poupanca_ytd || {};
  if (tp.pct_renda_liq != null) {
    setText('kpiPoupancaPct', pct(tp.pct_renda_liq, 1));
  }
  if (tp.aporte_ytd != null) {
    setHTML('kpiPoupancaVal', (isBRL ? fmtBR(tp.aporte_ytd) : fmtUS(tp.aporte_ytd / PTAX)) + ' aportado');
  }

  // Hero — vals BR/US sob nova moeda
  setText('brVal', isBRL ? fmtBR(DATA.kpi.brVal) : fmtUS(DATA.kpi.brVal / PTAX));
  setText('usVal', isBRL ? fmtBR(DATA.kpi.usVal) : fmtUS(DATA.kpi.usVal / PTAX));

  // Splits dinâmicos
  setText('splitBRPct', `${(DATA.kpi.brSplit || 0).toFixed(1).replace('.',',')}% Brasil`);
  setText('splitUSPct', `${(DATA.kpi.usSplit || 0).toFixed(1).replace('.',',')}%`);
  const sb = document.getElementById('splitBR');
  const su = document.getElementById('splitUS');
  if (sb) sb.style.flex = String(DATA.kpi.brSplit || 80);
  if (su) su.style.flex = String(DATA.kpi.usSplit || 20);
}

// ─── REND LIST ──────────────────────────────────────────────
function renderRendList() {
  const periods = [
    { k: 'm', lbl: 'Mês' },
    { k: 'y', lbl: 'YTD' },
    { k: 'h', lbl: 'Histórico' },
  ];
  const validRend = periods.map(p => DATA.kpi[p.k] && DATA.kpi[p.k].rendPct).filter(v => v != null && !isNaN(v));
  const max = Math.max(...validRend.map(Math.abs), 1);

  const html = periods.map(p => {
    const d = DATA.kpi[p.k] || {};
    const rendPct = d.rendPct, cdiPct = d.cdi;
    if (rendPct == null) {
      return `<div class="ptf-rend-row">
        <div class="rend-per">${p.lbl}</div>
        <div class="rend-bar-wrap"></div>
        <div class="rend-val">—</div>
        <div class="rend-vs lo">—</div>
      </div>`;
    }
    const w = (Math.abs(rendPct) / max * 100).toFixed(1);
    let vsCls = 'lo', vsTxt = '—';
    if (cdiPct != null && cdiPct !== 0) {
      const ratio = (rendPct / cdiPct) * 100;
      if (rendPct < 0) vsCls = 'lo';
      else if (ratio >= 100) vsCls = 'hi';
      else if (ratio >= 80) vsCls = 'mid';
      vsTxt = Math.round(ratio) + '% CDI';
    } else if (p.k === 'h' && d.pct_cdi != null) {
      vsTxt = `${d.pct_cdi.toFixed(0)}% CDI`;
      vsCls = d.pct_cdi >= 100 ? 'hi' : d.pct_cdi >= 80 ? 'mid' : 'lo';
    }
    return `<div class="ptf-rend-row">
      <div class="rend-per">${p.lbl}</div>
      <div class="rend-bar-wrap"><div class="rend-bar" style="width:${w}%"></div></div>
      <div class="rend-val">${rendPct >= 0 ? '+' : ''}${pct(rendPct)}</div>
      <div class="rend-vs ${vsCls}">${vsTxt}</div>
    </div>`;
  }).join('');
  setHTML('rendList', html);
}

// ─── ALOCAÇÃO ───────────────────────────────────────────────
function renderAlloc() {
  const allocs = DATA.alloc || [];
  if (!allocs.length) { setHTML('allocList', '<p class="ptf-note">Sem dados de alocação.</p>'); return; }
  const max = Math.max(...allocs.map(c => Math.max(VIEW === 'g' ? c.t_g : c.t_l, VIEW === 'g' ? c.a_g : c.a_l))) + 4;
  let html = '';
  allocs.forEach(c => {
    const a = VIEW === 'g' ? c.a_g : c.a_l;
    const t = VIEW === 'g' ? c.t_g : c.t_l;
    const dv = a - t;
    const state = Math.abs(dv) <= 2 ? 'ok' : dv > 0 ? 'up' : 'dn';
    const fillColor = state === 'up' ? 'linear-gradient(90deg,#D97706,#FBBF24)'
                    : state === 'dn' ? 'linear-gradient(90deg,#0E7490,#22D3EE)'
                    : 'linear-gradient(90deg,#15803D,#22C55E)';
    const sign = dv >= 0 ? '+' : '';
    const flag = c.f === 'US' ? '🇺🇸' : '🇧🇷';
    const dvCls = state === 'up' ? 'neg' : state === 'dn' ? 'info' : 'pos';
    html += `<div class="alloc-row">
      <span class="alloc-flag-emoji">${flag}</span>
      <div>
        <div class="alloc-name">${c.n}</div>
        <div class="alloc-track">
          <div class="alloc-fill" style="width:${(a/max*100).toFixed(1)}%;background:${fillColor}"></div>
          <div class="alloc-tgt" style="left:${(t/max*100).toFixed(1)}%"></div>
        </div>
        <div class="alloc-meta">
          <span>Atual: <strong>${pct(a)}</strong></span>
          <span>Alvo: <strong>${pct(t, 0)}</strong></span>
          <span class="${dvCls}">${sign}${pct(Math.abs(dv))}pp</span>
        </div>
      </div>
      <div class="alloc-vals">${pct(a)}</div>
    </div>`;
  });
  setHTML('allocList', html);
}

// ─── EVO CHART ──────────────────────────────────────────────
function makeEvoChart() {
  const evo = DATA.evo;
  if (!evo.labels.length) return;
  const ctx = document.getElementById('evoChart');
  if (!ctx) return;
  const ctx2d = ctx.getContext('2d');
  const grad = ctx2d.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, 'rgba(0, 32, 96, 0.30)');
  grad.addColorStop(1, 'rgba(0, 32, 96, 0.02)');
  evoChart = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels: evo.labels,
      datasets: [
        { label: 'PL total', data: evo.pl, borderColor: '#002060', backgroundColor: grad, borderWidth: 2.5, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5 },
        { label: 'Aportes acumulados', data: evo.aportes.map(a => a + evo.pl_inicial), borderColor: '#9AA29C', borderDash: [6, 4], borderWidth: 1.8, fill: false, tension: 0.2, pointRadius: 0, pointHoverRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E', padding: 10, cornerRadius: 8, titleFont: { weight: '600' },
          callbacks: { label: c => c.dataset.label + ': R$ ' + Math.round(c.parsed.y).toLocaleString('pt-BR') },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#8A93AD' } },
        y: { grid: { color: 'rgba(232, 234, 239, 0.8)' }, ticks: { font: { size: 10 }, color: '#8A93AD', callback: v => 'R$ ' + (v/1e6).toFixed(1) + ' mi' } },
      },
    },
  });
}

// ─── CONSOLIDADA ────────────────────────────────────────────
function renderConsol() {
  const filt = CONSOL_FILT;
  let ativos = [];
  if (filt === 'all' || filt === 'BR') {
    DATA.ativos_br.forEach(a => ativos.push({
      n: a.n, c: a.c, v: a.v, apor: a.aportado, ret_m: a.ret_m, ret_m_ant: a.ret_m_ant, ret_ano: a.ret_ano, tir: a.tir, country: 'BR',
    }));
  }
  if (filt === 'all' || filt === 'US') {
    DATA.ativos_us.forEach(a => ativos.push({
      n: a.tk, c: a.cl, v: a.vu, apor: a.aportado || a.cu, ret_m: a.ret_m, ret_m_ant: a.ret_m_ant, ret_ano: a.ret_ano, tir: a.tir, country: 'US',
    }));
  }
  ativos.sort((a, b) => (b.v || 0) - (a.v || 0));

  const cdiBadge = (rendPct, cdiPct) => {
    if (cdiPct == null || cdiPct === 0 || rendPct == null) return '<span class="ptf-cdi-badge lo">—</span>';
    const ratio = (rendPct / cdiPct) * 100;
    let cls = 'lo';
    if (rendPct < 0) cls = 'lo';
    else if (ratio >= 100) cls = 'hi';
    else if (ratio >= 80) cls = 'mid';
    let txt = Math.round(ratio) + '%';
    if (ratio < -200) txt = '<−200%';
    if (ratio > 500) txt = '>500%';
    return `<span class="ptf-cdi-badge ${cls}">${txt}</span>`;
  };

  const html = ativos.map(a => {
    const flag = a.country === 'US' ? '🇺🇸' : '🇧🇷';
    const aporStr = a.country === 'BR' ? fmtBR(a.apor) : (a.apor == null ? '—' : fmtUS(a.apor));
    const valStr  = a.country === 'BR' ? fmtBR(a.v) : fmtUS(a.v);
    const ganho   = (a.v != null && a.apor != null) ? (a.v - a.apor) : null;
    let ganhoStr = '—', ganhoCls = '';
    if (ganho != null) {
      ganhoStr = a.country === 'BR'
        ? (ganho >= 0 ? '+' : '-') + 'R$ ' + Math.round(Math.abs(ganho)).toLocaleString('pt-BR')
        : (ganho >= 0 ? '+' : '-') + 'US$ ' + Math.round(Math.abs(ganho)).toLocaleString('en-US');
      ganhoCls = ganho >= 0 ? 'pos' : 'neg';
    }
    const tirStr = a.tir != null ? (a.tir >= 0 ? '+' : '') + pct(a.tir, 1) : '—';
    const tirCls = a.tir != null && a.tir >= 0 ? 'pos' : a.tir != null ? 'neg' : 'muted';

    return `<tr>
      <td><strong>${flag} ${a.n}</strong></td>
      <td>${aporStr}</td>
      <td>${valStr}</td>
      <td class="${ganhoCls}">${ganhoStr}</td>
      <td>${a.ret_m != null ? (a.ret_m >= 0 ? '+' : '') + pct(a.ret_m) : '—'}</td>
      <td>${a.country === 'US' ? '<span class="ptf-cdi-badge lo">—</span>' : cdiBadge(a.ret_m, DATA.cdi_ref.m)}</td>
      <td>${a.ret_m_ant != null ? (a.ret_m_ant >= 0 ? '+' : '') + pct(a.ret_m_ant) : '—'}</td>
      <td>${a.country === 'US' ? '<span class="ptf-cdi-badge lo">—</span>' : cdiBadge(a.ret_m_ant, DATA.cdi_ref.m_ant)}</td>
      <td>${a.ret_ano != null ? (a.ret_ano >= 0 ? '+' : '') + pct(a.ret_ano) : '—'}</td>
      <td>${a.country === 'US' ? '<span class="ptf-cdi-badge lo">—</span>' : cdiBadge(a.ret_ano, DATA.cdi_ref.ano)}</td>
      <td class="${tirCls}">${tirStr}</td>
    </tr>`;
  }).join('');

  setHTML('consolRows', html);

  // Total cards (consol)
  const c = DATA.consol || {};
  if (c.geral) {
    setText('totGeralSaldo', fmtBR(c.geral.saldo));
    setText('totGeralAportado', c.geral.aportado != null ? fmtBR(c.geral.aportado) : '—');
    if (c.geral.ganho != null) {
      const gh = (c.geral.ganho >= 0 ? '+' : '-') + 'R$ ' + Math.round(Math.abs(c.geral.ganho)).toLocaleString('pt-BR');
      const ghPct = c.geral.ganho_pct != null ? ` (${c.geral.ganho_pct >= 0 ? '+' : ''}${pct(c.geral.ganho_pct, 1)})` : '';
      setText('totGeralGanho', gh + ghPct);
      const el = document.getElementById('totGeralGanho');
      if (el) el.className = 'v ' + (c.geral.ganho >= 0 ? 'pos' : 'neg');
    } else {
      setText('totGeralGanho', '—');
    }
    setText('totGeralN', c.geral.n_ativos != null ? String(c.geral.n_ativos) : '—');
    setText('totGeralPct', `${(c.geral.pct_total || 100).toFixed(1).replace('.',',')}%`);
  }
  if (c.br) {
    setText('totBrSaldo', fmtBR(c.br.saldo));
    setText('totBrAportado', c.br.aportado != null ? fmtBR(c.br.aportado) : '—');
    if (c.br.ganho != null) {
      const gh = (c.br.ganho >= 0 ? '+' : '-') + 'R$ ' + Math.round(Math.abs(c.br.ganho)).toLocaleString('pt-BR');
      const ghPct = c.br.ganho_pct != null ? ` (${c.br.ganho_pct >= 0 ? '+' : ''}${pct(c.br.ganho_pct, 1)})` : '';
      setText('totBrGanho', gh + ghPct);
      const el = document.getElementById('totBrGanho');
      if (el) el.className = 'v ' + (c.br.ganho >= 0 ? 'pos' : 'neg');
    } else {
      setText('totBrGanho', '—');
    }
    setText('totBrN', String(c.br.n_ativos || 0));
    setText('totBrPct', `${(c.br.pct_total || 0).toFixed(1).replace('.',',')}%`);
  }
  if (c.us) {
    setText('totUsSaldo', fmtUS(c.us.saldo_usd));
    setText('totUsAportado', c.us.aportado_usd != null ? fmtUS(c.us.aportado_usd) : '—');
    if (c.us.ganho_usd != null) {
      const gh = (c.us.ganho_usd >= 0 ? '+' : '-') + 'US$ ' + Math.round(Math.abs(c.us.ganho_usd)).toLocaleString('en-US');
      const ghPct = c.us.ganho_pct != null ? ` (${c.us.ganho_pct >= 0 ? '+' : ''}${pct(c.us.ganho_pct, 1)})` : '';
      setText('totUsGanho', gh + ghPct);
      const el = document.getElementById('totUsGanho');
      if (el) el.className = 'v ' + (c.us.ganho_usd >= 0 ? 'pos' : 'neg');
    } else {
      setText('totUsGanho', '—');
    }
    setText('totUsN', String(c.us.n_ativos || 0));
    setText('totUsPct', `${(c.us.pct_total || 0).toFixed(1).replace('.',',')}%`);
  }

  // by class
  const byClass = {};
  DATA.ativos_br.forEach(a => { byClass[a.c] = (byClass[a.c] || 0) + (a.v || 0); });
  DATA.ativos_us.forEach(a => {
    const valBrl = (a.vu || 0) * PTAX; // converte USD pra BRL pra unificar
    byClass[a.cl] = (byClass[a.cl] || 0) + valBrl;
  });
  const total = Object.values(byClass).reduce((s, v) => s + v, 0) || 1;
  const sorted = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
  const clsHtml = sorted.map(([cn, v]) => {
    const pctV = v / total * 100;
    return `<div class="ptf-cls-row">
      <div>
        <div class="ptf-cls-name">${cn}</div>
        <div class="ptf-cls-pct">${pct(pctV, 1)}</div>
      </div>
      <div class="ptf-cls-v">${fmtBRk(v)}</div>
      <div class="ptf-cls-bar-fl"><div class="ptf-cls-bar" style="width:${pctV.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
  setHTML('consolClassList', clsHtml);
}

// ─── BR ─────────────────────────────────────────────────────
function renderBR() {
  const filtered = BR_FILT === 'all' ? DATA.ativos_br : DATA.ativos_br.filter(a => a.grp === BR_FILT);
  setText('brCount', filtered.length + ' ativos');
  setText('brSecCount', String(DATA.ativos_br.length));
  const total = DATA.ativos_br.reduce((s, a) => s + (a.v || 0), 0) || 1;

  const html = filtered.map(a => {
    let liq;
    if (a.liq === 'já liberado') liq = '<span style="color:var(--pos);font-weight:600">já liberado</span>';
    else if (a.liq === 'previdência') liq = '<span style="color:#7C3AED;font-weight:600">previdência</span>';
    else if (a.urgent) liq = '<span style="color:#B45309;font-weight:600">⚠ ' + a.liq + '</span>';
    else liq = a.liq || '—';
    return `<tr>
      <td>${a.n}</td>
      <td><span class="ptf-tag" style="background:var(--surface3);color:var(--muted)">${a.c}</span></td>
      <td>${fmtBR(a.v)}</td>
      <td>${pct(a.v / total * 100, 1)}</td>
      <td>${liq}</td>
    </tr>`;
  }).join('');
  setHTML('brRows', html);

  // KPIs Brasil header
  const k = DATA.br_kpi || {};
  setText('brKpiTotal', fmtBR(k.total));
  setText('brKpiTotalCount', `${k.n_total != null ? k.n_total : DATA.ativos_br.length} ativos`);
  setText('brKpiVenc', fmtBR(k.liq_30 || 0));
  if (k.proximo_venc_data && k.proximo_venc_nome) {
    setText('brKpiVencCtx', `⚠ ${k.proximo_venc_nome.length > 22 ? k.proximo_venc_nome.slice(0,20)+'…' : k.proximo_venc_nome} vence ${k.proximo_venc_data}`);
  } else {
    setText('brKpiVencCtx', '—');
  }
  setText('brKpiCaixa', fmtBR(k.ja_liq || 0));
  setText('brKpiCaixaCtx', `${k.n_ja_liq || 0} LCIs/LCAs em caixa`);
  setText('brKpiTravado', fmtBR(k.travado || 0));

  // Calendário insight
  if (k.cal_max_mes && k.cal_max_val) {
    setHTML('calInsight', `Mês mais relevante é <strong>${k.cal_max_mes}</strong>: R$ ${(k.cal_max_val/1000).toFixed(1).replace('.',',')}k vence em janela próxima.`);
  }

  // by class
  const byClass = {};
  DATA.ativos_br.forEach(a => { byClass[a.c] = (byClass[a.c] || 0) + (a.v || 0); });
  const sorted = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
  const clsHtml = sorted.map(([cn, v]) => {
    const pctV = v / total * 100;
    return `<div class="ptf-cls-row">
      <div>
        <div class="ptf-cls-name">${cn}</div>
        <div class="ptf-cls-pct">${pct(pctV, 1)}</div>
      </div>
      <div class="ptf-cls-v">${fmtBRk(v)}</div>
      <div class="ptf-cls-bar-fl"><div class="ptf-cls-bar" style="width:${pctV.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
  setHTML('brClassList', clsHtml);
}

// ─── CALENDÁRIO ────────────────────────────────────────────
function renderCal() {
  const max = Math.max(...DATA.cal_br.map(c => c.v), 1);
  const html = DATA.cal_br.map(c => {
    const h = c.v > 0 ? Math.max(c.v / max * 70, 8) : 3;
    const cls = c.v > max * 0.5 ? 'hl' : c.v > 0 ? '' : 'empty';
    const valStr = c.v > 0 ? fmtBRk(c.v) : '—';
    return `<div class="ptf-cal-col">
      <div class="ptf-cal-val">${valStr}</div>
      <div class="ptf-cal-bar-wrap"><div class="ptf-cal-bar ${cls}" style="height:${h}px"></div></div>
      <div class="ptf-cal-lbl">${c.m}</div>
    </div>`;
  }).join('');
  setHTML('calStrip', html);
}

// ─── OFFSHORE ──────────────────────────────────────────────
function renderUS() {
  const isBRL = US_CUR === 'BRL';
  const c = DATA.consol.us || {};
  const totalAtualUsd = c.saldo_usd != null ? c.saldo_usd : DATA.ativos_us.reduce((s, a) => s + (a.vu || 0), 0);
  const totalCustoUsd = c.aportado_usd != null ? c.aportado_usd : DATA.ativos_us.reduce((s, a) => s + (a.cu || 0), 0);
  const ganhoUsd = c.ganho_usd != null ? c.ganho_usd : (totalAtualUsd - totalCustoUsd);

  setText('usValEtfs', isBRL ? fmtBR(totalAtualUsd * PTAX) : fmtUS(totalAtualUsd));
  setText('usAporUsd', isBRL ? fmtBR(totalCustoUsd * PTAX) : fmtUS(totalCustoUsd));
  setText('usGanhoUsd', (ganhoUsd >= 0 ? '+' : '-') + (isBRL ? 'R$ ' + Math.round(Math.abs(ganhoUsd * PTAX)).toLocaleString('pt-BR')
                                                              : 'US$ ' + Math.round(Math.abs(ganhoUsd)).toLocaleString('en-US')));
  const ganhoEl = document.getElementById('usGanhoUsd');
  if (ganhoEl) {
    ganhoEl.className = 'ptf-kpi-v sm';
  }
  // Ganho %
  if (c.ganho_pct != null) {
    setText('usGanhoPct', (c.ganho_pct >= 0 ? '+' : '') + pct(c.ganho_pct, 1));
  }
  setText('usDolarMed', `R$ ${(DATA.kpi.dolar_medio_btg_inter || DATA.kpi.dolar_medio || 5.0).toFixed(2).replace('.',',')}`);
  setText('usPtax', `R$ ${PTAX.toFixed(2).replace('.',',')}`);
  const variacaoCambio = ((PTAX / (DATA.kpi.dolar_medio_btg_inter || DATA.kpi.dolar_medio || PTAX)) - 1) * 100;
  setText('usPtaxVar', (variacaoCambio >= 0 ? '+' : '') + pct(variacaoCambio, 1) + ' câmbio');
  const varEl = document.getElementById('usPtaxVar');
  if (varEl) varEl.className = 'delta ' + (variacaoCambio >= 0 ? 'pos' : 'neg');

  const html = [...DATA.ativos_us].sort((a, b) => (b.vu || 0) - (a.vu || 0)).map(a => {
    const cuStr = isBRL ? fmtBR((a.cu || 0) * PTAX) : fmtUS(a.cu);
    const vuStr = isBRL ? fmtBR((a.vu || 0) * PTAX) : fmtUS(a.vu);
    return `<tr>
      <td><strong>${a.tk}</strong></td>
      <td><span class="ptf-tag" style="background:var(--info-bg);color:var(--info)">${a.cl}</span></td>
      <td>${(a.qt || 0).toFixed(2)}</td>
      <td>${cuStr}</td>
      <td>${vuStr}</td>
      <td class="${a.roi >= 0 ? 'pos' : 'neg'}">${a.roi != null ? (a.roi >= 0 ? '+' : '') + pct(a.roi) : '—'}</td>
    </tr>`;
  }).join('');
  setHTML('usRows', html);

  makeUsRoiChart();
  makeUsTirChart();
}

function makeUsRoiChart() {
  if (usRoiChart) try { usRoiChart.destroy(); } catch(e) {}
  const sorted = [...DATA.ativos_us].filter(a => a.roi != null).sort((a, b) => b.roi - a.roi);
  if (!sorted.length) return;
  const ctx = document.getElementById('usRoiChart');
  if (!ctx) return;
  usRoiChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: sorted.map(a => a.tk),
      datasets: [{
        data: sorted.map(a => a.roi),
        backgroundColor: sorted.map(a => a.roi >= 0 ? '#16A34A' : '#DC2626'),
        borderRadius: 4,
        barThickness: 20,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E', cornerRadius: 8,
          callbacks: { label: c => 'ROI: ' + (c.parsed.x >= 0 ? '+' : '') + c.parsed.x.toFixed(2) + '%' },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(232, 234, 239, 0.8)' }, ticks: { font: { size: 10 }, color: '#8A93AD', callback: v => v + '%' } },
        y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#0D1B3E' } },
      },
    },
  });
}

function makeUsTirChart() {
  if (usTirChart) try { usTirChart.destroy(); } catch(e) {}
  const sorted = [...DATA.ativos_us].filter(a => a.tir != null).sort((a, b) => b.tir - a.tir);
  if (!sorted.length) return;
  const ctx = document.getElementById('usTirChart');
  if (!ctx) return;
  usTirChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: sorted.map(a => a.tk),
      datasets: [{
        data: sorted.map(a => a.tir),
        backgroundColor: sorted.map(a => a.tir >= 0 ? '#002060' : '#DC2626'),
        borderRadius: 4,
        barThickness: 20,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E', cornerRadius: 8,
          callbacks: { label: c => 'TIR: ' + (c.parsed.x >= 0 ? '+' : '') + c.parsed.x.toFixed(1) + '% a.a.' },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(232, 234, 239, 0.8)' }, ticks: { font: { size: 10 }, color: '#8A93AD', callback: v => v + '%' } },
        y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#0D1B3E' } },
      },
    },
  });
}

// ─── PREVIDÊNCIA ───────────────────────────────────────────
function renderPrev() {
  const p = DATA.prev || {};
  setText('prevSaldoBruto', fmtBR(p.saldo_bruto));
  setText('prevSaldoLiq', fmtBR(p.saldo_liquido));
  setText('prevAliqMedia', p.aliq_media != null ? pct(p.aliq_media, 1) : '—');
  setText('prevAporteMed', fmtBR(p.aporte_mensal_medio));

  // Tabela de alíquotas — combina VGBL + PGBL
  const aliqs = [35, 30, 25, 20, 15, 10];
  const rows = aliqs.map(aliq => {
    const v = (DATA.prev_aliq_vgbl || []).find(x => x.aliq === aliq) || {};
    const pg = (DATA.prev_aliq_pgbl || []).find(x => x.aliq === aliq) || {};
    const bruto = (v.saldo_bruto || 0) + (pg.saldo_bruto || 0);
    const irpf = (v.irpf || 0) + (pg.irpf || 0);
    const liq = (v.saldo_liquido || 0) + (pg.saldo_liquido || 0);
    const lblAliq = aliq === 10 ? '10% (mín.)' : `${aliq}%`;
    if (bruto === 0) {
      return `<tr><td><span class="ptf-aliq-pill">${lblAliq}</span></td><td class="muted">—</td><td class="muted">—</td><td class="muted">—</td></tr>`;
    }
    return `<tr>
      <td><span class="ptf-aliq-pill">${lblAliq}</span></td>
      <td>${fmtBR(bruto)}</td>
      <td class="neg">−${fmtBR(irpf)}</td>
      <td class="pos">${fmtBR(liq)}</td>
    </tr>`;
  }).join('');
  setHTML('prevAliqRows', rows);
}

function makePrevDonut() {
  const ctx = document.getElementById('prevDonut');
  if (!ctx || !DATA.prev_fundos.length) return;
  prevDonut = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: DATA.prev_fundos.map(f => f.n),
      datasets: [{
        data: DATA.prev_fundos.map(f => f.v),
        backgroundColor: DATA.prev_fundos.map(f => f.c),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { font: { size: 10.5 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          backgroundColor: '#0D1B3E', cornerRadius: 8,
          callbacks: { label: c => c.label + ': ' + fmtBRk(c.parsed) },
        },
      },
    },
  });
}

function makePrevMatur() {
  const ctx = document.getElementById('prevMatur');
  if (!ctx || !DATA.matur.length) return;

  let acumulado = 0;
  const dadosAcumulados = DATA.matur.map(m => { acumulado += m.v; return acumulado; });

  // Destaca o primeiro ano significativo (heurística: primeiro com pico)
  const maxV = Math.max(...DATA.matur.map(m => m.v));
  const anoDestaque = (DATA.matur.find(m => m.v >= maxV * 0.95) || {}).y;

  prevMaturChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: DATA.matur.map(m => m.y),
      datasets: [
        {
          label: 'Por ano',
          data: DATA.matur.map(m => m.v),
          backgroundColor: DATA.matur.map(m => m.y === anoDestaque ? '#002060' : '#3D5396'),
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
        {
          label: 'Acumulado',
          data: dadosAcumulados,
          backgroundColor: '#9DB4D9',
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { font: { size: 11 }, boxWidth: 12, padding: 10, color: '#0D1B3E' } },
        tooltip: {
          backgroundColor: '#0D1B3E', cornerRadius: 8,
          callbacks: {
            label: c => c.dataset.label === 'Por ano'
              ? fmtBRk(c.parsed.y) + ' atinge alíquota mínima em ' + c.label
              : 'Acumulado até ' + c.label + ': ' + fmtBRk(c.parsed.y),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#0D1B3E' } },
        y: { grid: { color: 'rgba(232, 234, 239, 0.8)' }, ticks: { font: { size: 10 }, color: '#8A93AD', callback: v => fmtBRk(v) } },
      },
    },
  });

  // Insight da maturação
  const totalMatur = acumulado;
  const primeiroAno = (DATA.matur.find(m => m.v > 0) || {}).y;
  if (primeiroAno && totalMatur > 0) {
    const anoFinal = DATA.matur[DATA.matur.length - 1].y;
    setHTML('maturInsight',
      `Em <strong>${primeiroAno}</strong>, primeiro lote atinge alíquota mínima de 10%. <strong>Acumulado até ${anoFinal}: ${fmtBRk(totalMatur)}</strong> com IR mínimo.`);
  }
}

// ─── INDEPENDÊNCIA FINANCEIRA ──────────────────────────────
function makeRendaChart() {
  const ctx = document.getElementById('rendaBar');
  if (!ctx) return;
  const atual = DATA.kpi.rendaAtual || 0, meta = DATA.kpi.rendaMeta || 1;
  rendaChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: [''],
      datasets: [
        { label: 'Atual', data: [atual], backgroundColor: '#16A34A', borderRadius: 6, barThickness: 38 },
        { label: 'Faltam', data: [Math.max(0, meta - atual)], backgroundColor: '#E8EAEF', borderRadius: 6, barThickness: 38 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E',
          callbacks: { label: c => c.dataset.label + ': ' + fmtBR(c.parsed.x) },
        },
      },
      scales: {
        x: { stacked: true, display: false, max: meta },
        y: { stacked: true, display: false },
      },
    },
  });

  // Pills da renda passiva
  setText('rendaAtualVal', fmtBR(atual));
  setText('rendaMetaVal', fmtBR(meta));
  setText('rendaPctAting', pct(atual / meta * 100, 1));
}

function renderIndicadores() {
  const hist = DATA.indicadores_historico || [];
  if (!hist.length) return;
  const cur = hist[0]; // mais recente
  setText('indicData', cur.data);
  setText('indicLiq', `${(cur.liquidez_corrente || 0).toFixed(1).replace('.', ',')} meses`);
  setText('indicCob', `${(cur.cobertura_meses || 0).toFixed(1).replace('.', ',')} meses`);
  setText('indicEnd', pct((cur.endividamento || 0) * 100, 1));
  setText('indicCT', pct((cur.capital_terceiros || 0) * 100, 1));
}

function makeIfChart() {
  const ctx = document.getElementById('ifChart');
  if (!ctx) return;
  const idadeIni = DATA.idade_inicial || 34;
  const plIni = DATA.kpi.pl;
  const aporteAnual = ((DATA.kpi.taxa_poupanca_ytd || {}).aporte_ytd || 0) * (12/4); // aproxima: ytd/4 meses × 12
  const cagr = ((DATA.kpi.h || {}).cagr || 7.92) / 100;

  const labels = [], pls = [];
  let pl = plIni;
  for (let i = idadeIni; i <= 65; i++) {
    labels.push(i);
    pls.push(pl);
    pl = pl * (1 + cagr) + aporteAnual;
  }

  const meta = DATA.meta_if;
  const ctx2d = ctx.getContext('2d');
  const grad = ctx2d.createLinearGradient(0, 0, 0, 340);
  grad.addColorStop(0, 'rgba(0, 32, 96, 0.30)');
  grad.addColorStop(1, 'rgba(0, 32, 96, 0.02)');

  ifChart = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Patrimônio projetado',
        data: pls,
        borderColor: '#002060',
        backgroundColor: grad,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1B3E', cornerRadius: 8,
          callbacks: {
            title: items => items[0].label + ' anos',
            label: c => 'Patrimônio: ' + fmtBRk(c.parsed.y),
          },
        },
        annotation: {
          annotations: {
            metaLine: {
              type: 'line',
              yMin: meta, yMax: meta,
              borderColor: '#16A34A', borderWidth: 2, borderDash: [6, 4],
              label: {
                display: true,
                content: 'Meta IF: ' + fmtBRk(meta),
                position: 'end',
                backgroundColor: '#16A34A',
                color: '#fff',
                font: { size: 11, weight: '600' },
                padding: 4,
              },
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'Idade (anos)', font: { size: 11 }, color: '#8A93AD' }, ticks: { font: { size: 10 }, color: '#8A93AD' } },
        y: { grid: { color: 'rgba(232, 234, 239, 0.8)' }, ticks: { font: { size: 10 }, color: '#8A93AD', callback: v => fmtBRk(v) } },
      },
    },
  });

  // Insight IF
  const idadeMeta = labels[pls.findIndex(v => v >= meta)];
  if (idadeMeta) {
    setHTML('ifInsight',
      `Mantendo o ritmo atual de aportes e CAGR de ${(cagr*100).toFixed(1).replace('.',',')}% a.a., o patrimônio atinge a meta IF (${fmtBRk(meta)}) aos <strong>${idadeMeta} anos</strong>.`);
  }
}

// ─── DATA INFO ─────────────────────────────────────────────
function renderInfo() {
  setText('dataGeracao', DATA.data_geracao || '—');
  setText('dataGeracaoFooter', DATA.data_geracao || '—');

  // CDI ref strip
  const cdi = DATA.cdi_ref || {};
  setText('cdiMes',    cdi.m     != null ? pct(cdi.m, 2)     : '—');
  setText('cdiMesAnt', cdi.m_ant != null ? pct(cdi.m_ant, 2) : '—');
  setText('cdiAno',    cdi.ano   != null ? pct(cdi.ano, 2)   : '—');

  // KPI Performance histórica (5º card)
  const h = DATA.kpi.h || {};
  if (h.pct_cdi != null) {
    setHTML('kpiHistPctCdi', `${h.pct_cdi.toFixed(1).replace('.',',')}% <span class="ptf-kpi-v-sub">do CDI</span>`);
  }
  if (h.cagr != null) {
    setText('kpiHistCagr', `CAGR ${h.cagr.toFixed(1).replace('.',',')}% a.a.`);
  }
}

// ─── BINDS ─────────────────────────────────────────────────
function bindToggles() {
  document.querySelectorAll('#curSeg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#curSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      CUR = b.dataset.v;
      renderHero(); renderKPIs();
    });
  });
  document.querySelectorAll('#perSeg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#perSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      PER = b.dataset.v;
      renderHero(); renderKPIs();
    });
  });
  document.querySelectorAll('#allocSeg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#allocSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      VIEW = b.dataset.v;
      renderAlloc();
    });
  });
  document.querySelectorAll('#consolFilt button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#consolFilt button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      CONSOL_FILT = b.dataset.v;
      renderConsol();
    });
  });
  document.querySelectorAll('#brFilt button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#brFilt button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      BR_FILT = b.dataset.v;
      renderBR();
    });
  });
  document.querySelectorAll('#usCurSeg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#usCurSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      US_CUR = b.dataset.v;
      renderUS();
    });
  });
}

// ─── INIT ──────────────────────────────────────────────────
function init() {
  renderInfo();
  renderHero();
  renderKPIs();
  renderRendList();
  renderAlloc();
  renderConsol();
  renderBR();
  renderCal();
  renderUS();
  renderPrev();
  renderIndicadores();

  setTimeout(() => {
    makeEvoChart();
    makePrevDonut();
    makePrevMatur();
    makeRendaChart();
    makeIfChart();
  }, 50);

  bindToggles();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
