/**
 * home_counts.js — Atualiza dinamicamente os .count nos home-cards
 * (Fundos 555, Previdência, Comparar Fundos, Correlação) lendo de
 * data/meta.json. Mantém os textos hardcoded como fallback caso o fetch
 * falhe.
 */

import { pool } from './data_pool.js';

async function atualizar() {
  let meta;
  try { meta = await pool.meta(); } catch { return; }

  let nFundos = 0, nPrev = 0;
  for (const i of meta.instituicoes || []) {
    if (i.oculto) continue;   // pula instituições ocultas (ex.: itauprivate)
    nFundos += i.n_fundos || 0;
    nPrev   += i.n_prev   || 0;
  }
  const nAtivos = nFundos + nPrev;

  const fmt = (n) => n.toLocaleString('pt-BR');

  // Map: href → texto. Procuramos pelos cards do home.
  const updates = {
    'fundos.html':       `${fmt(nFundos)} fundos`,
    'previdencia.html':  `${fmt(nPrev)} fundos`,
    'comparacao.html':   `${fmt(nAtivos)} ativos`,
    'correlacao.html':   `${fmt(nFundos)} ativos`,
  };

  document.querySelectorAll('.home-card').forEach(card => {
    const href = card.getAttribute('href') || '';
    const count = card.querySelector('.home-card-foot .count');
    if (!count) return;
    const novo = updates[href];
    if (novo) count.textContent = novo;
  });
  // A data do rodapé ("Atualizado em") é preenchida por shared/atb_footer_date.js
  // usando meta.gerado_em (data do deploy), não a data da cota.
}

atualizar();
