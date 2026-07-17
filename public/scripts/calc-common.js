/* ============================================================
   calc-common.js — Helpers compartilhados pelas 4 calculadoras
   Requer: window.CDI_DATA, window.IPCA_DATA, window.FERIADOS
           (carregados antes via shared/data/*.js + utils.js)
   ============================================================ */

/* ── Funções financeiras básicas ─────────────────────────── */
function taFn(idx, t, cdi, ipca) {
  if (idx === 'IPCA+') return (1 + t) * (1 + ipca) - 1;
  if (idx === '%CDI')  return t * cdi;
  if (idx === 'CDI+')  return (1 + t) * (1 + cdi) - 1;
  return t; // Pré
}
function tdFn(ta) { return Math.pow(1 + ta, 1/252) - 1; }
function fvFn(pv, d, n) { return pv * Math.pow(1 + d, n); }
function nperFn(d, pv, fv) {
  if (d <= 0 || pv <= 0 || fv <= 0) return 0;
  return Math.log(fv/pv) / Math.log(1 + d);
}
function rateFn(n, pv, fv) {
  if (n <= 0 || pv <= 0 || fv <= 0) return 0;
  return Math.pow(fv/pv, 1/n) - 1;
}

/* ── IR sobre renda fixa ────────────────────────────────── */
function aliqIR(diasCorridos) {
  if (diasCorridos <= 181) return 0.225;
  if (diasCorridos <  361) return 0.20;
  if (diasCorridos <  721) return 0.175;
  return 0.15;
}
function vliqFn(aplic, bruto, aliq, isento) {
  return isento ? bruto : aplic + (bruto - aplic) * (1 - aliq);
}

/* ── Acumular CDI/IPCA por período ──────────────────────── */
function acumCDI(d1, d2) {
  var acc = 1;
  var d = new Date(d1 + 'T12:00:00');
  var end = new Date(d2 + 'T12:00:00');
  while (d <= end) {
    var k = d.toISOString().slice(0, 10);
    var tx = (typeof cdiMap !== 'undefined') ? cdiMap.get(k) : null;
    if (tx != null) acc *= (1 + tx / 100);   // série está em % ao dia
    d.setDate(d.getDate() + 1);
  }
  return acc - 1;
}
function acumIPCA(d1, d2) {
  var ini = new Date(d1 + 'T12:00:00'); ini.setDate(1);
  var fim = new Date(d2 + 'T12:00:00'); fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
  var acc = 1, d = new Date(ini);
  while (d <= fim) {
    var k = d.toISOString().slice(0, 10);
    var tx = (typeof ipcaMap !== 'undefined') ? ipcaMap.get(k) : null;
    if (tx != null) acc *= (1 + tx);
    d.setMonth(d.getMonth() + 1);
  }
  return acc - 1;
}

/* ── Helpers DOM (set value, set color) ─────────────────── */
function sv(id, txt, cls) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = txt;
  if (cls) el.className = cls;
}
function sc(id, txt, col) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = txt;
  if (col) el.style.color = col;
}

/* ── Formatação live PT-BR (pontos de milhar) ───────────── */
function formatBRLive(rawValue, mode) {
  if (!rawValue) return '';
  var s = String(rawValue).replace(/[^0-9,]/g, '');
  if (mode === 'integer') {
    s = s.replace(/,/g, '');
    if (!s) return '';
    s = s.replace(/^0+(?=\d)/, '');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  var firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  var partes = s.split(',');
  var inteira = partes[0].replace(/^0+(?=\d)/, '') || '';
  var decimal = partes.length > 1 ? partes[1].slice(0, 2) : null;
  if (inteira === '' && decimal !== null) inteira = '0';
  var intFmt = inteira ? inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  if (decimal === null) return intFmt;
  return intFmt + ',' + decimal;
}
function attachLiveFormat(el, mode) {
  if (!el || el.dataset.liveFmt === '1') return;
  el.dataset.liveFmt = '1';
  el.addEventListener('input', function () {
    var old = el.value;
    var caret = el.selectionStart || 0;
    var keepBefore = 0;
    for (var i = 0; i < caret && i < old.length; i++) {
      var c = old.charAt(i);
      if (/[0-9]/.test(c) || (mode !== 'integer' && c === ',')) keepBefore++;
    }
    var formatted = formatBRLive(old, mode);
    if (formatted === old) return;
    el.value = formatted;
    var newPos = 0, consumed = 0;
    while (newPos < formatted.length && consumed < keepBefore) {
      var c2 = formatted.charAt(newPos);
      if (/[0-9]/.test(c2) || (mode !== 'integer' && c2 === ',')) consumed++;
      newPos++;
    }
    try { el.setSelectionRange(newPos, newPos); } catch (e) {}
  });
  if (mode !== 'integer') {
    el.addEventListener('blur', function () {
      var v = el.value;
      if (!v || v.indexOf(',') === -1) return;
      var partes = v.split(',');
      if (partes[1].length === 0) el.value = partes[0];
      else if (partes[1].length === 1) el.value = partes[0] + ',' + partes[1] + '0';
    });
  }
}

/* ── Aplicar formatação automática a todos os inputs ──── */
function instalarFormatacao(scope) {
  scope = scope || document;
  scope.querySelectorAll('input[inputmode="decimal"]').forEach(function (el) {
    attachLiveFormat(el, 'decimal');
  });
  scope.querySelectorAll('input[inputmode="numeric"]').forEach(function (el) {
    attachLiveFormat(el, 'integer');
  });
}

/* ── Limpar campos da página inteira ──────────────────── */
function limparCalculadora(recalc) {
  document.querySelectorAll('input[type="text"], input[type="date"], input[type="number"]').forEach(function (el) {
    el.value = '';
  });
  document.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
    el.checked = false;
  });
  document.querySelectorAll('select').forEach(function (sel) {
    var defaultOpt = sel.querySelector('option[selected]');
    sel.selectedIndex = defaultOpt ? Array.prototype.indexOf.call(sel.options, defaultOpt) : 0;
  });
  if (typeof recalc === 'function') recalc();
}

/* ── Formatação de data ────────────────────────────────── */
function fDate(d) {
  return !d ? '—' : d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

/* ── HELPER GENÉRICO PRA PDFs DE CALCULADORA ─────────────────────────
   Recebe um config e abre uma nova janela com HTML formatado para
   impressão (A4 retrato, 1 página). Já cuida do CSS comum, header,
   footer, botão "Imprimir / Salvar PDF" e disparo automático do print.

   Cada calculadora chama com:
     gerarPDFCalc({
       titulo:     'Limite FGC',                  // nome curto
       subtitulo:  '...opcional...',              // sobre a página (linha 2)
       premissas:  [{ lbl: 'CDI', val: '15,5%' }, ...],   // grid de 3 cols
       destaque:   { label: 'Invista hoje', val: 'R$ 234.567,00', sub: '...' },  // opcional, faixa navy
       resultado:  [{ lbl: 'Dias úteis', val: '252', col: 'pos' }, ...],          // outra grid
       tabela:     { thead: ['col1','col2'], rows: [['a','b'],...] },             // opcional
       discIR:     '<texto opcional>',
       discWarn:   true,                          // mostra "Mera simulação"
     });
*/
function gerarPDFCalc(cfg) {
  var w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para gerar o PDF.'); return; }
  var hoje = new Date().toLocaleDateString('pt-BR');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAllowSpan(s) {
    // permite <span> de cor (val-pos / val-neg) — usado pra valores já formatados
    return String(s == null ? '' : s);
  }

  var premissasHTML = '';
  if (cfg.premissas && cfg.premissas.length) {
    premissasHTML += '<h2>' + esc(cfg.tituloPremissas || 'Premissas') + '</h2>';
    premissasHTML += '<div class="grid">';
    cfg.premissas.forEach(function (p) {
      premissasHTML +=
        '<div class="box"><div class="box-lbl">' + esc(p.lbl) + '</div>' +
        '<div class="box-val">' + escAllowSpan(p.val) + '</div></div>';
    });
    premissasHTML += '</div>';
  }

  var destaqueHTML = '';
  if (cfg.destaque) {
    destaqueHTML =
      '<div class="aporte">' +
        '<div><div class="aporte-lbl">' + esc(cfg.destaque.label) + '</div></div>' +
        '<div class="aporte-val">' + escAllowSpan(cfg.destaque.val) + '</div>' +
        (cfg.destaque.sub ? '<div class="aporte-sub">' + esc(cfg.destaque.sub) + '</div>' : '') +
      '</div>';
  }

  var resultadoHTML = '';
  if (cfg.resultado && cfg.resultado.length) {
    resultadoHTML += '<h2>' + esc(cfg.tituloResultado || 'Resultado') + '</h2>';
    resultadoHTML += '<div class="grid">';
    cfg.resultado.forEach(function (r) {
      var cls = r.col === 'pos' ? ' pos' : (r.col === 'neg' ? ' neg' : (r.col === 'blu' ? ' blu' : ''));
      resultadoHTML +=
        '<div class="box"><div class="box-lbl">' + esc(r.lbl) + '</div>' +
        '<div class="box-val' + cls + '">' + escAllowSpan(r.val) + '</div></div>';
    });
    resultadoHTML += '</div>';
  }

  var tabelaHTML = '';
  if (cfg.tabela && cfg.tabela.rows && cfg.tabela.rows.length) {
    tabelaHTML += '<h2>' + esc(cfg.tabela.titulo || 'Detalhamento') + '</h2>';
    tabelaHTML += '<table><thead><tr>';
    (cfg.tabela.thead || []).forEach(function (h) {
      tabelaHTML += '<th>' + esc(h) + '</th>';
    });
    tabelaHTML += '</tr></thead><tbody>';
    cfg.tabela.rows.forEach(function (row) {
      tabelaHTML += '<tr>';
      row.forEach(function (cell, i) {
        tabelaHTML += '<td' + (i === 0 ? ' class="left"' : '') + '>' + escAllowSpan(cell) + '</td>';
      });
      tabelaHTML += '</tr>';
    });
    tabelaHTML += '</tbody></table>';
  }

  var warnHTML = cfg.discWarn !== false
    ? '<div class="warn"><strong>Atenção — Mera simulação:</strong> projeção exclusivamente <b>ilustrativa</b>. Não constitui aconselhamento financeiro nem garantia de retorno.</div>'
    : '';

  var discHTML = cfg.discIR
    ? '<div class="disc ir">' + cfg.discIR + '</div>'
    : '';

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
'<title>' + esc(cfg.titulo) + ' — ' + hoje + '</title>' +
'<style>' +
'@page{size:A4 portrait;margin:7mm 9mm}' +
'*{box-sizing:border-box}' +
'body{font-family:"Helvetica","Arial",sans-serif;color:#111;font-size:9px;margin:0;padding:0;line-height:1.35}' +
'h1{font-size:14px;color:#002060;margin:0;font-weight:700}' +
'.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #002060;padding-bottom:4px;margin-bottom:8px}' +
'.hdr-sub{font-size:8.5px;color:#666;text-align:right}' +
'h2{font-size:9px;color:#002060;margin:8px 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:.5px solid #d0d4dc;padding-bottom:2px}' +
'.aporte{background:#002060;color:#fff;border-radius:4px;padding:8px 14px;margin:6px 0;text-align:center;display:flex;align-items:center;justify-content:space-between;gap:14px}' +
'.aporte-lbl{font-size:8px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.7);font-weight:600}' +
'.aporte-val{font-size:18px;font-weight:700;letter-spacing:-.2px}' +
'.aporte-sub{font-size:8px;color:rgba(255,255,255,.65);text-align:right;flex:1}' +
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:6px}' +
'.box{background:#f5f5f7;border-radius:3px;padding:5px 9px}' +
'.box-lbl{font-size:7.5px;color:#666;text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px}' +
'.box-val{font-size:11px;font-weight:600;color:#111;font-variant-numeric:tabular-nums}' +
'.box-val.pos{color:#0a6640}.box-val.neg{color:#b91c1c}.box-val.blu{color:#003399}' +
'table{width:100%;border-collapse:collapse;font-size:8.5px;margin-top:2px;table-layout:auto}' +
'thead th{background:#002060;color:#fff;padding:4px 5px;font-size:7.5px;font-weight:600;text-transform:uppercase;letter-spacing:.2px;text-align:right;line-height:1.15}' +
'thead th:first-child{text-align:left}' +
'tbody td{padding:3px 5px;border-bottom:.5px solid #e5e5e7;text-align:right;font-variant-numeric:tabular-nums;line-height:1.25}' +
'tbody td.left{text-align:left;font-weight:500;color:#333}' +
'tbody tr:nth-child(even){background:#fafafa}' +
'.disc{padding:5px 9px;border-radius:2px;font-size:8px;margin:5px 0 2px;border-left:2px solid;line-height:1.35}' +
'.disc.ir{background:#FFF8E6;border-color:#7A5C00;color:#7A5C00}' +
'.warn{background:#FFF8E1;border:1px solid #F59E0B;border-left:3px solid #F59E0B;border-radius:2px;padding:5px 9px;margin:6px 0 2px;font-size:8px;line-height:1.35;color:#78350F}' +
'.foot{margin-top:6px;font-size:7px;color:#999;text-align:center;line-height:1.4}' +
'@media print{button{display:none}}' +
'button{position:fixed;top:10px;right:10px;padding:8px 16px;background:#002060;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600}' +
'</style></head><body>' +
'<button onclick="window.print()">Imprimir / Salvar PDF</button>' +
'<div class="hdr"><h1>' + esc(cfg.titulo) + '</h1>' +
  '<div class="hdr-sub">' + esc(cfg.subtitulo || '') + (cfg.subtitulo ? ' · ' : '') + hoje + '</div></div>' +
destaqueHTML +
premissasHTML +
resultadoHTML +
tabelaHTML +
discHTML +
warnHTML +
'<div class="foot">Ferramentas Especialistas · ' + esc(cfg.titulo) + ' · Gerado em ' + hoje + '</div>' +
'</body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
}
