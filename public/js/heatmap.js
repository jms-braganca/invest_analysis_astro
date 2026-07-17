/**
 * heatmap.js — Heatmap de matriz simétrica em SVG (Apple-style).
 *
 * Render manual (sem libs externas). Tooltip on hover. Células arredondadas.
 * Paleta:
 *   light → branco → navy (positivo) / vermelho (negativo)
 *   dark  → cinza dark (#1c1c1e) → verde (positivo) / laranja IPB (negativo)
 */

const CORES = {
  diverging(v) {
    const isDark = document.body.classList.contains('theme-dark');
    if (v == null || isNaN(v)) return isDark ? '#1c1c1e' : '#e8e8ed';
    const x = Math.max(-1, Math.min(1, v));
    if (isDark) {
      // Base cinza dark → cor saturada conforme |v|
      const base = { r: 28, g: 28, b: 30 };
      const tgt  = x >= 0 ? { r: 48,  g: 209, b: 88  }   // verde Apple (positivo)
                          : { r: 255, g: 55,  b: 95  };  // magenta vibrante (negativo)
      const t = Math.abs(x);
      const r = Math.round(base.r * (1 - t) + tgt.r * t);
      const g = Math.round(base.g * (1 - t) + tgt.g * t);
      const b = Math.round(base.b * (1 - t) + tgt.b * t);
      return `rgb(${r},${g},${b})`;
    }
    if (x >= 0) {
      const t = x;
      const r = Math.round(255 * (1 - t) + 26 * t);
      const g = Math.round(255 * (1 - t) + 58 * t);
      const b = Math.round(255 * (1 - t) + 122 * t);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = -x;
      const r = Math.round(255 * (1 - t) + 200 * t);
      const g = Math.round(255 * (1 - t) + 50 * t);
      const b = Math.round(255 * (1 - t) + 50 * t);
      return `rgb(${r},${g},${b})`;
    }
  },
};

export class Heatmap {
  constructor(root) {
    this.root = root;
    this.rotulos = [];
    this.rotulosCompletos = [];
    this.matriz = [];
    this._construir();
  }

  _construir() {
    this.root.classList.add('heatmap-wrap');
    this.root.innerHTML = `
      <div class="heatmap__top">
        <div>
          <div class="heatmap__title">Matriz de correlação. <span class="tone-muted">Pearson dos retornos diários.</span></div>
          <div class="heatmap__info" data-info>—</div>
        </div>
        <div class="heatmap__legenda-gradient">
          <span class="heatmap__legenda-num">−1</span>
          <span class="heatmap__legenda-bar" aria-hidden="true"></span>
          <span class="heatmap__legenda-num">+1</span>
        </div>
      </div>
      <div class="heatmap__container">
        <svg class="heatmap__svg" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="heatmap__tip" data-tip hidden></div>
      </div>
    `;
    this._svg = this.root.querySelector('.heatmap__svg');
    this._tip = this.root.querySelector('[data-tip]');
    this._infoEl = this.root.querySelector('[data-info]');

    this._svg.addEventListener('mousemove', (e) => this._onMove(e));
    this._svg.addEventListener('mouseleave', () => { this._tip.hidden = true; });
  }

  render({ rotulos, matriz, rotulosCompletos = null, info = '' }) {
    this.rotulos = rotulos;
    this.rotulosCompletos = rotulosCompletos || rotulos;
    this.matriz = matriz;
    if (this._infoEl && info) this._infoEl.textContent = info;

    const n = rotulos.length;
    if (n === 0) { this._svg.innerHTML = ''; return; }

    const MARGIN_LEFT = Math.min(220, Math.max(120, n > 12 ? 160 : 200));
    const MARGIN_TOP = MARGIN_LEFT;
    const CELL_MIN = 28, CELL_MAX = 72;
    const containerWidth = this.root.querySelector('.heatmap__container').clientWidth || 720;
    const espacoCels = containerWidth - MARGIN_LEFT - 20;
    const cellSize = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(espacoCels / n)));

    const w = MARGIN_LEFT + n * cellSize + 20;
    const h = MARGIN_TOP + n * cellSize + 20;
    this._svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this._svg.style.width = '100%';
    this._svg.style.height = `${h}px`;

    const FONT = Math.max(10, Math.min(13, cellSize * 0.3));
    const showVal = cellSize >= 36;

    const parts = [];

    // Labels topo (rotacionados).
    for (let j = 0; j < n; j++) {
      const x = MARGIN_LEFT + j * cellSize + cellSize / 2;
      const y = MARGIN_TOP - 8;
      parts.push(`
        <text class="heatmap__label"
              x="${x}" y="${y}"
              transform="rotate(-45 ${x} ${y})"
              text-anchor="start"
              font-size="${FONT}">${this._escape(rotulos[j])}</text>
      `);
    }

    // Labels esquerda.
    for (let i = 0; i < n; i++) {
      const x = MARGIN_LEFT - 8;
      const y = MARGIN_TOP + i * cellSize + cellSize / 2;
      parts.push(`
        <text class="heatmap__label"
              x="${x}" y="${y}"
              text-anchor="end"
              dominant-baseline="middle"
              font-size="${FONT}">${this._escape(rotulos[i])}</text>
      `);
    }

    // Células.
    const GAP = 2;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = this.matriz[i][j];
        const x = MARGIN_LEFT + j * cellSize + GAP / 2;
        const y = MARGIN_TOP + i * cellSize + GAP / 2;
        const sz = cellSize - GAP;
        const fill = CORES.diverging(v);
        parts.push(`
          <rect class="heatmap__cell"
                x="${x}" y="${y}"
                width="${sz}" height="${sz}"
                fill="${fill}"
                rx="5"
                data-i="${i}" data-j="${j}"></rect>
        `);
        if (showVal && v != null) {
          // Em dark, células com |v| baixo são cinza dark → texto branco;
          // |v| alto fica saturado (verde/laranja brilhante) → texto preto.
          const _isDark = document.body.classList.contains('theme-dark');
          const cor = _isDark
            ? (Math.abs(v) > 0.55 ? '#0a0a0a' : '#f5f5f7')
            : (Math.abs(v) > 0.55 ? '#fff'    : '#1d1d1f');
          const txt = (i === j) ? '1,00' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',');
          parts.push(`
            <text class="heatmap__val"
                  x="${x + sz / 2}" y="${y + sz / 2}"
                  text-anchor="middle"
                  dominant-baseline="central"
                  fill="${cor}"
                  font-size="${FONT - 1}"
                  pointer-events="none">${txt}</text>
          `);
        }
      }
    }
    this._svg.innerHTML = parts.join('');
  }

  _onMove(e) {
    const t = e.target.closest('rect[data-i]');
    if (!t) { this._tip.hidden = true; return; }
    const i = Number(t.dataset.i);
    const j = Number(t.dataset.j);
    const v = this.matriz[i][j];
    const nomeI = this.rotulosCompletos[i] || this.rotulos[i];
    const nomeJ = this.rotulosCompletos[j] || this.rotulos[j];

    this._tip.innerHTML = `
      <div><strong>${this._escape(nomeI)}</strong></div>
      <div><strong>${this._escape(nomeJ)}</strong></div>
      <div class="heatmap__tip-num">${v != null ? v.toFixed(3) : '—'}</div>
    `;
    this._tip.hidden = false;
    const rect = this.root.getBoundingClientRect();
    this._tip.style.left = `${e.clientX - rect.left + 12}px`;
    this._tip.style.top  = `${e.clientY - rect.top + 12}px`;
  }

  _escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
