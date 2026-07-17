/**
 * series.js — Funções vetoriais sobre séries de cotas.
 *
 * Padrão: arrays paralelos a `datas`, com `null` quando ausente.
 * Nada aqui depende do DOM — pura matemática.
 */

/**
 * Recorta cotas pra uma janela contígua final. Aceita strings:
 *   '1m', '3m', '6m', '12m', '24m', 'max', '60m'
 *
 * Se a janela é maior que o histórico, retorna o histórico todo.
 *
 * Retorna { datas, cotas } com mesmos shapes.
 */
export function recortarJanela({ datas, cotas }, janela) {
  if (!datas.length) return { datas: [], cotas: {} };
  if (janela === 'max') return { datas, cotas };

  const m = parseInt(janela, 10);
  if (!m || isNaN(m)) return { datas, cotas };

  const ultimaStr = datas[datas.length - 1];
  const ultima = new Date(ultimaStr + 'T00:00:00');
  const corte = new Date(ultima);
  corte.setMonth(corte.getMonth() - m);
  const corteStr = corte.toISOString().slice(0, 10);

  // Binary search pelo primeiro índice >= corteStr.
  let lo = 0, hi = datas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (datas[mid] < corteStr) lo = mid + 1;
    else hi = mid;
  }

  const datasNova = datas.slice(lo);
  const cotasNova = {};
  for (const [cnpj, serie] of Object.entries(cotas)) {
    cotasNova[cnpj] = serie.slice(lo);
  }
  return { datas: datasNova, cotas: cotasNova };
}

/**
 * Normaliza uma série pra começar em 100. Cuida do caso onde o início
 * da janela tem null (fundo criado depois) — usa o primeiro valor válido.
 */
export function normalizarBase100(serie) {
  let baseIdx = -1;
  for (let i = 0; i < serie.length; i++) {
    if (serie[i] != null) { baseIdx = i; break; }
  }
  if (baseIdx < 0) return serie.slice();   // série toda null
  const base = serie[baseIdx];
  if (!base) return serie.slice();
  return serie.map(v => v == null ? null : (v / base) * 100);
}

/**
 * Retorno acumulado em % (do primeiro valor não-null ao último não-null).
 */
export function retornoAcum(serie) {
  let primeiro = null, ultimo = null;
  for (let i = 0; i < serie.length; i++) {
    if (serie[i] != null) { primeiro = serie[i]; break; }
  }
  for (let i = serie.length - 1; i >= 0; i--) {
    if (serie[i] != null) { ultimo = serie[i]; break; }
  }
  if (primeiro == null || ultimo == null) return null;
  return ((ultimo / primeiro) - 1) * 100;
}

/**
 * Retornos diários (log returns) a partir da série de cotas.
 * Retorna array do mesmo tamanho com null na primeira posição e onde houver gap.
 */
export function retornosDiarios(serie) {
  const out = new Array(serie.length).fill(null);
  let prev = null;
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i];
    if (v != null && prev != null && prev > 0) {
      out[i] = Math.log(v / prev);
    }
    if (v != null) prev = v;
  }
  return out;
}

/**
 * Volatilidade anualizada (% a.a.) — desvio padrão dos log returns × √252.
 */
export function volAnualizada(serie) {
  const r = retornosDiarios(serie).filter(v => v != null);
  if (r.length < 5) return null;
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

/**
 * Maximum drawdown (%, número negativo ou zero).
 */
export function maxDrawdown(serie) {
  let pico = -Infinity;
  let maxDD = 0;
  for (const v of serie) {
    if (v == null) continue;
    if (v > pico) pico = v;
    if (pico > 0) {
      const dd = (v / pico - 1) * 100;
      if (dd < maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/**
 * Correlação de Pearson entre duas séries (alinhadas pelo eixo, valores onde
 * ambas têm dado). Usa retornos diários (não cotas brutas).
 */
export function correlacaoPearson(serieA, serieB) {
  if (serieA.length !== serieB.length) return null;
  const ra = retornosDiarios(serieA);
  const rb = retornosDiarios(serieB);
  const xs = [], ys = [];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] != null && rb[i] != null) {
      xs.push(ra[i]); ys.push(rb[i]);
    }
  }
  if (xs.length < 10) return null;

  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/**
 * Matriz NxN de correlações pra um conjunto de séries (Map<cnpj, serie>).
 * Retorna { cnpjs: [...], matriz: number[][] } onde matriz[i][j] é a corr
 * entre cnpjs[i] e cnpjs[j]. Simétrica, diagonal = 1.
 */
export function matrizCorrelacao(seriesMap) {
  const cnpjs = [...seriesMap.keys()];
  const series = cnpjs.map(c => seriesMap.get(c));
  const n = cnpjs.length;
  // Pré-calcula retornos uma vez.
  const retornos = series.map(s => retornosDiarios(s));
  const matriz = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matriz[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const c = _correlacaoEntreRetornos(retornos[i], retornos[j]);
      matriz[i][j] = c;
      matriz[j][i] = c;
    }
  }
  return { cnpjs, matriz };
}

function _correlacaoEntreRetornos(ra, rb) {
  const xs = [], ys = [];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] != null && rb[i] != null) {
      xs.push(ra[i]); ys.push(rb[i]);
    }
  }
  if (xs.length < 10) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}
