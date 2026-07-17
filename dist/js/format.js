/**
 * format.js — Formatadores para BR (R$, %, datas, CNPJ).
 */

const _fmtPct = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const _fmtPctInt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const _fmtMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const _fmtMoedaCompacta = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const _fmtDataBR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

export function pct(v) {
  if (v == null || isNaN(v)) return '—';
  return _fmtPct.format(v) + '%';
}

export function pctSinal(v) {
  if (v == null || isNaN(v)) return '—';
  const sinal = v > 0 ? '+' : '';
  return sinal + _fmtPct.format(v) + '%';
}

export function pctCDI(v) {
  if (v == null || isNaN(v)) return '—';
  return _fmtPctInt.format(v) + '%';
}

export function moeda(v) {
  if (v == null || isNaN(v)) return '—';
  return _fmtMoeda.format(v);
}

export function moedaCompacta(v) {
  if (v == null || isNaN(v)) return '—';
  // Intl.NumberFormat compact não inclui R$; prefixamos.
  const s = _fmtMoedaCompacta.format(v);
  return 'R$ ' + s;
}

export function dataBR(isoOrDate) {
  if (!isoOrDate) return '—';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return _fmtDataBR.format(d);
}

/**
 * Sinal aplicado a uma classe CSS pra colorir retornos.
 *   +ve → 'pos'
 *   -ve → 'neg'
 *   0 ou null → 'neutral'
 */
export function classeSinal(v) {
  if (v == null || isNaN(v)) return 'neutral';
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'neutral';
}

/**
 * Trunca string com ellipsis no fim.
 */
export function truncar(s, max) {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
