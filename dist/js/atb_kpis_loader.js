/**
 * atb_kpis_loader.js — Popula os valores dos KPIs (CDI e Ibov) na sub-topbar
 * a partir do meta.json. Atualiza os spans data-kpi-{cdi|ibov}-{mes|ano|12m}.
 *
 * O private-topbar.js (legacy) cuida do rotator que alterna entre os grupos
 * CDI/Ibov — só precisamos preencher os números antes/depois do init.
 */

import { pool } from './data_pool.js';
import { pctSinal } from './format.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function popular() {
  let meta;
  try { meta = await pool.meta(); } catch { return; }

  const cdi  = meta.cdi_acumulado  || {};
  const ibov = meta.ibov_acumulado || {};

  // Label do mês corrente baseada em meta.ultima_data_cota.
  if (meta.ultima_data_cota) {
    const m = parseInt(meta.ultima_data_cota.split('-')[1], 10);
    const mesLabel = MESES[m - 1];
    document.querySelectorAll('[data-month]').forEach(el => el.textContent = mesLabel);
  }

  const fmt = (v) => v == null ? '—' : pctSinal(v);
  const apply = (sel, v, withSign = false) => {
    document.querySelectorAll(sel).forEach(el => {
      el.textContent = v == null ? '—' : (withSign ? pctSinal(v) : (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%');
      el.classList.remove('pos', 'neg');
      if (v != null) {
        if (v > 0) el.classList.add('pos');
        else if (v < 0) el.classList.add('neg');
      }
    });
  };

  // CDI: sempre positivo, mostra sem sinal "+" (já é convenção).
  apply('[data-kpi-cdi-mes]', cdi['Mês']);
  apply('[data-kpi-cdi-ano]', cdi['Ano']);
  apply('[data-kpi-cdi-12m]', cdi['12M']);

  // Ibov: pode ser negativo, mostra com sinal.
  apply('[data-kpi-ibov-mes]', ibov['Mês'], true);
  apply('[data-kpi-ibov-ano]', ibov['Ano'], true);
  apply('[data-kpi-ibov-12m]', ibov['12M'], true);
}

popular();
