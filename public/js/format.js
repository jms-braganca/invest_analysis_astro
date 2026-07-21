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

const _MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Labels dos períodos de retorno a partir da data da última cota (ISO
 * 'YYYY-MM-DD'). O mês corrente é o mês dessa data e o anterior é o mês
 * imediatamente antes — nunca hardcode, senão os headers congelam enquanto
 * os números continuam andando.
 *
 * Devolve null se a data for ausente/inválida, pra o chamador manter o
 * placeholder genérico em vez de exibir um mês errado.
 */
export function labelsPeriodos(dataIso) {
  if (typeof dataIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
  const ano = parseInt(dataIso.slice(0, 4), 10);
  const mes = parseInt(dataIso.slice(5, 7), 10);
  if (mes < 1 || mes > 12) return null;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const aa = (y) => String(y % 100).padStart(2, '0');
  return {
    mes:   `${_MESES_ABREV[mes - 1]}/${aa(ano)}`,
    pmes:  `${_MESES_ABREV[mesAnt - 1]}/${aa(anoAnt)}`,
    ytd:   String(ano),
    '12m': '12 Meses',
    '24m': '24 Meses',
  };
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
