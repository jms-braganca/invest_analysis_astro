/**
 * app_inicio.js — Hub Início com cards de acesso a cada ferramenta.
 *
 * Conta dinâmica de fundos / planos de prev via meta.json (sem fetch dos
 * arquivos pesados de fundos_<inst>.json).
 */

import { pool } from './data_pool.js';
import { renderTopbar, renderFooter } from './topbar.js';

const CARDS = [
  {
    eyebrow: 'Fundos 555',
    titulo: 'Performance e ranking.',
    desc: 'Retornos, prazos e benchmarks dos fundos da plataforma sob ICVM 175.',
    href: 'pages/fundos.html',
    contagemKey: 'n_fundos',
    contagemLabel: 'fundos',
  },
  {
    eyebrow: 'Previdência',
    titulo: 'PGBL e VGBL.',
    desc: 'Catálogo de previdência com performance histórica e taxa.',
    href: 'pages/previdencia.html',
    contagemKey: 'n_prev',
    contagemLabel: 'planos',
  },
  {
    eyebrow: 'Comparar fundos',
    titulo: 'Compare lado a lado.',
    desc: 'Selecione fundos e compare retornos por janela, com gráfico de cotas.',
    href: 'pages/comparacao.html',
    contagemKey: 'n_fundos',
    contagemLabel: 'ativos',
  },
  {
    eyebrow: 'Correlação',
    titulo: 'Matriz de correlação.',
    desc: 'Como os retornos diários dos fundos se relacionam — base pra diversificação.',
    href: 'pages/correlacao.html',
    contagemKey: 'n_fundos',
    contagemLabel: 'ativos',
  },
  {
    eyebrow: 'Planejamento',
    titulo: 'Cenários e simulações.',
    desc: 'Aposentadoria, FGC, troca de fundo, financiamento e mais.',
    href: 'pages/planejamento.html',
    contagemKey: null,
    contagemLabel: 'Em breve',
    soon: true,
  },
  {
    eyebrow: 'Portfolio',
    titulo: 'Carteira pessoal.',
    desc: 'Acompanhamento da carteira modelo com performance vs. benchmarks.',
    href: 'pages/portfolio.html',
    contagemKey: null,
    contagemLabel: 'Em breve',
    soon: true,
  },
];

async function boot() {
  await renderTopbar({ pagina: 'inicio', mostrarSubmenu: false });

  let meta = null;
  try {
    meta = await pool.meta();
  } catch {}

  const totais = _totais(meta);

  const grid = document.querySelector('[data-hub-grid]');
  grid.innerHTML = CARDS.map(c => {
    const tag = c.soon ? 'div' : 'a';
    const href = c.soon ? '' : `href="${c.href}"`;
    const cls  = c.soon ? 'hub-card hub-card--soon' : 'hub-card';
    const contagem = c.soon
      ? c.contagemLabel
      : (totais[c.contagemKey] != null ? `${totais[c.contagemKey].toLocaleString('pt-BR')} ${c.contagemLabel}` : '');
    return `
      <${tag} class="${cls}" ${href}>
        <div class="hub-card__eyebrow">${c.eyebrow}</div>
        <div class="hub-card__title">${c.titulo}</div>
        <p class="hub-card__desc">${c.desc}</p>
        <div class="hub-card__footer">
          ${c.soon ? '<span class="hub-card__link">Em breve</span>' : '<span class="hub-card__link">Abrir</span>'}
          <span class="hub-card__count">${contagem}</span>
        </div>
      </${tag}>
    `;
  }).join('');

  await renderFooter({ pagina: 'Início' });
}

function _totais(meta) {
  if (!meta) return {};
  let n_fundos = 0, n_prev = 0;
  for (const i of meta.instituicoes) {
    if (i.oculto) continue;   // pula instituições ocultas (ex.: itauprivate)
    n_fundos += i.n_fundos || 0;
    n_prev   += i.n_prev   || 0;
  }
  return { n_fundos, n_prev };
}

boot();
