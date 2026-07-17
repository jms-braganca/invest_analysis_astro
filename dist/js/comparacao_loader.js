/**
 * comparacao_loader.js — Loader pra Comparador.
 *
 * Monta window.DADOS no formato esperado pelo shared/private-comparacao.js
 * usando dados do data pool V2. Carrega o JS legacy depois pra ele tomar
 * conta da UI (chart, chips, busca, sort, etc.).
 *
 * Formato esperado por private-comparacao.js:
 *   window.DADOS = {
 *     fundos: { '<cnpj>': { nome, classe, tipo, datas:[], cotas:[] } },
 *     benchmarks: { cdi: {datas, cotas}, ibov: {datas, cotas} },
 *     meta: { date_max, ... }
 *   }
 */

import { pool } from './data_pool.js';

function instDaURL() {
  // V2: lê instituição da hash (#inst=btg). Antes lia do path
  // (comparacao_btg.html), mas esses arquivos nunca existiram → 404.
  const h = (location.hash || '').replace('#', '');
  const m = h.match(/inst=([a-z]+)/);
  if (m) return m[1];
  // Fallback: ainda aceita o path antigo caso alguém tenha link salvo.
  const path = location.pathname;
  if (path.includes('_itau'))  return 'itau';
  if (path.includes('_btg'))   return 'btg';
  if (path.includes('_xp'))    return 'xp';
  if (path.includes('_inter')) return 'inter';
  return 'todos';
}

function setLabel(inst) {
  const l = { todos: 'Todos', itau: 'Itaú', btg: 'BTG', xp: 'XP', inter: 'Inter' };
  document.querySelectorAll('[data-inst-label]').forEach(el => el.textContent = l[inst] || 'Todos');
  // Marca botão ativo do switcher
  document.querySelectorAll('.inst-btn[data-inst]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.inst === inst);
  });
}

async function boot() {
  const inst = instDaURL();
  setLabel(inst);

  let meta, fundos, prevs, cotas, cotasPrev;
  try {
    [meta, fundos, prevs, cotas, cotasPrev] = await Promise.all([
      pool.meta(),
      inst === 'todos' ? pool.fundosTodos() : pool.fundos(inst),
      inst === 'todos' ? pool.previdenciaTodos().catch(() => []) : pool.previdencia(inst).catch(() => []),
      // Passo 6: boot carrega só a janela de 12m (~5× mais leve). 24m/Tudo
      // baixam o histórico completo (max) sob demanda via __cmpEnsureCotas.
      inst === 'todos' ? pool.cotasTodos('12m').catch(() => null) : pool.cotas(inst, '12m').catch(() => null),
      // Cotas diárias de previdência: pipeline gera cotas_<inst>_prev.json
      // a partir de cotas_<inst>_prev.csv. Se o arquivo não existir, fica
      // null e o fundo prev aparece na lista sem linha no chart.
      inst === 'todos' ? pool.cotasPrevTodos('12m').catch(() => null) : pool.cotasPrev(inst, '12m').catch(() => null),
    ]);
  } catch (e) {
    console.error('[comparacao_loader] falha:', e);
    return;
  }

  if (!cotas) {
    console.error('[comparacao_loader] sem cotas pra renderizar');
    return;
  }

  // Atualiza última data no footer.
  if (meta?.ultima_data_cota) {
    const [a, m, d] = meta.ultima_data_cota.split('-');
    document.querySelectorAll('[data-ultima-data]').forEach(el => el.textContent = `${d}/${m}/${a}`);
  }

  // Monta window.DADOS a partir dos blobs de cotas (regulares + prev). Extraído
  // em função pra re-montar quando o histórico completo (max) chega (Passo 6).
  function montarDADOS(cotas, cotasPrev) {
  // Monta dicionário de fundos no formato legado.
  //
  // IMPORTANTE: no modo "Todos", `cotas.datas` é a união ordenada das datas
  // de todas as instituições. Um fundo que só existe no Itaú vai ter `null`
  // nos slots onde apenas BTG/XP têm dado — o private-comparacao.js descarta
  // a série se o PRIMEIRO ponto da janela é null. Pra evitar isso, recortamos
  // o "head" de nulls antes de servir, preservando só o sub-array contíguo
  // com pelo menos 1 ponto válido no início.
  const dadosFundos = {};
  const datasGlobais = cotas.datas;

  // V2 emite retornos como arrays [mes, pmes, ytd, 12m, 24m] (idem pct_cdi/vs_ibov).
  // O private-comparacao.js (legado V1) espera um objeto:
  //   { is_equity, ret_mes, ret_pmes, ret_ytd, ret_12m, ret_24m,
  //     pctcdi_mes, ..., vsibov_mes, ... }
  // Convertemos aqui no loader pra não tocar no legado.
  const PERIOD_KEYS = ['mes', 'pmes', 'ytd', '12m', '24m'];
  const isEquityClasse = (c) => /vari[áa]vel|a[çc][õo]es/i.test(c || '');

  function montarRetornos(f) {
    const isEq = isEquityClasse(f.classe);
    const r = { is_equity: isEq };
    const arrRet = Array.isArray(f.retornos) ? f.retornos : [];
    const arrCdi = Array.isArray(f.pct_cdi)  ? f.pct_cdi  : [];
    const arrIbv = Array.isArray(f.vs_ibov)  ? f.vs_ibov  : [];
    PERIOD_KEYS.forEach((k, i) => {
      r['ret_'    + k] = arrRet[i] ?? null;
      r['pctcdi_' + k] = arrCdi[i] ?? null;
      r['vsibov_' + k] = arrIbv[i] ?? null;
    });
    return r;
  }

  function fmtPL(pl) {
    if (pl == null || isNaN(pl)) return null;
    const n = Number(pl);
    if (n >= 1e9) return 'R$ ' + (n / 1e9).toFixed(1).replace('.', ',') + ' bi';
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if (n >= 1e3) return 'R$ ' + (n / 1e3).toFixed(0) + ' mil';
    return 'R$ ' + n.toFixed(0);
  }

  // Empacota um fundo no formato esperado pelo private-comparacao.js,
  // recortando a série de cotas pra remover head/tail de nulls.
  // `fontecotas` é o payload {datas, cotas} apropriado (regulares ou prev).
  const empacotarDe = (f, tipo, fontecotas) => {
    if (!fontecotas) return null;
    const serie = fontecotas.cotas[f.serie_id || f.cnpj];
    if (!serie) return null;
    let ini = 0;
    while (ini < serie.length && serie[ini] == null) ini++;
    if (ini >= serie.length) return null;
    let fim = serie.length;
    while (fim > ini && serie[fim - 1] == null) fim--;
    return {
      nome: f.nome,
      classe: f.classe || (tipo === 'prev' ? 'Previdência' : 'Outros'),
      tipo,
      datas: fontecotas.datas.slice(ini, fim),
      cotas: serie.slice(ini, fim),
      retornos: montarRetornos(f),
      pl_fmt: fmtPL(f.pl),
    };
  };

  const empacotar     = (f) => empacotarDe(f, 'fundo', cotas);
  const empacotarPrev = (f) => {
    // Tenta a fonte específica de prev primeiro.
    const pkg = empacotarDe(f, 'prev', cotasPrev);
    if (pkg) return pkg;
    // Alguns fundos podem (raramente) coexistir nas cotas regulares.
    return empacotarDe(f, 'prev', cotas);
  };

  for (const f of fundos) {
    const pkg = empacotar(f);
    if (pkg) dadosFundos[f.serie_id || f.cnpj] = pkg;
  }
  for (const f of prevs) {
    if (dadosFundos[f.serie_id || f.cnpj]) continue;  // já tem como fundo
    const pkg = empacotarPrev(f);
    if (pkg) dadosFundos[f.serie_id || f.cnpj] = pkg;
  }

  // Benchmarks: CDI e Ibovespa diários (vêm dos scripts shared/data/).
  // Ambos formatos: [["YYYY-MM-DD", taxa_pct_diaria], ...]. Acumulamos
  // em "cota" começando em 100 pra alimentar o private-comparacao.js.
  const benchmarks = {};
  const acumular = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const inicio = datasGlobais[0];
    const fim = datasGlobais.at(-1);
    const datasArr = [];
    const cotasArr = [];
    let cota = 100;
    let started = false;
    for (const [dt, taxa] of raw) {
      if (dt < inicio) continue;
      if (dt > fim) break;
      if (!started) {
        datasArr.push(dt);
        cotasArr.push(cota);
        started = true;
        continue;
      }
      cota *= (1 + Number(taxa) / 100);
      datasArr.push(dt);
      cotasArr.push(Number(cota.toFixed(6)));
    }
    return datasArr.length ? { datas: datasArr, cotas: cotasArr } : null;
  };
  const bCdi = acumular(window.CDI_DATA);   if (bCdi)  benchmarks.cdi  = bCdi;
  const bIbov = acumular(window.IBOV_DATA); if (bIbov) benchmarks.ibov = bIbov;

  window.DADOS = {
    fundos: dadosFundos,
    benchmarks,
    meta: { date_max: datasGlobais.at(-1) },
  };

  console.log(`[comparacao_loader] ${Object.keys(dadosFundos).length} fundos prontos`);
  } // fim montarDADOS

  montarDADOS(cotas, cotasPrev);

  // Passo 6 — upgrade preguiçoso de janela. Boot carrega 12m; 24m/Tudo baixam o
  // histórico completo (max) sob demanda e re-montam DADOS. O legacy lê
  // window.DADOS a cada render, então re-montar reflete no próximo renderChart.
  let __janelaCarregada = '12m';
  window.__cmpEnsureCotas = async function (win) {
    const precisaMax = (win === '24m' || win === 'all' || win === 'max');
    if (!precisaMax || __janelaCarregada === 'max') return;
    const [cMax, cpMax] = await Promise.all([
      inst === 'todos' ? pool.cotasTodos('max').catch(() => null) : pool.cotas(inst, 'max').catch(() => null),
      inst === 'todos' ? pool.cotasPrevTodos('max').catch(() => null) : pool.cotasPrev(inst, 'max').catch(() => null),
    ]);
    if (!cMax) return;   // falhou: mantém 12m
    __janelaCarregada = 'max';
    montarDADOS(cMax, cpMax);
  };

  // Carrega o JS legacy. Ele usa `ready()` que vai disparar imediato porque
  // readyState !== 'loading' a essa altura.
  // Cache-bust: bump v=N quando mexer em shared/private-comparacao.js pra
  // forçar reload imediato em navegadores que cachearam a versão antiga.
  const s = document.createElement('script');
  s.src = 'shared/private-comparacao.js?v=4';
  s.defer = false;
  document.body.appendChild(s);
}

// Quando o usuário clica em outro banco, o href muda só a hash (#inst=xxx)
// e a página NÃO recarrega sozinha. Forçamos reload pra re-bootar tudo
// com os dados da nova instituição. Como o ?bench/?fundos vivem na mesma
// hash, eles são preservados pelo reload.
window.addEventListener('hashchange', () => {
  // só recarrega se mudou o filtro de instituição (não a janela/fundos sel)
  const novoInst = instDaURL();
  if (novoInst !== window.__instAtualLoader) location.reload();
});
window.__instAtualLoader = instDaURL();

boot();
