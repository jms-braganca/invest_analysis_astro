/**
 * app_fundosipb.js — Entry point da página Itaú Private Bank.
 *
 * Reaproveita 100% da lógica de AppFundos (filtros, sort, busca,
 * class-rail, render de tabelas), só:
 *   • Carrega `data/fundos_itauprivate.json` diretamente, sem passar
 *     por data_pool (que valida a lista fixa INSTITUICOES_VALIDAS e
 *     onde "itauprivate" intencionalmente NÃO está, pra evitar
 *     vazamento na composição "Todos" das outras páginas).
 *   • Não tem switcher de instituição (a página é dedicada ao IPB).
 *   • Não tem floating bar / comparador (decisão do produto).
 *   • Esconde a coluna "Instituição" via CSS (todos os fundos são IPB).
 *
 * A página fundosipb.html tem `data-pagina="ipb"` no body pra evitar
 * o auto-boot do app_fundos.js.
 */

import { AppFundos } from './app_fundos.js';
import { pool } from './data_pool.js';
import { gatePrompt } from '../shared/crypto_ipb.js';

class AppFundosIPB extends AppFundos {
  constructor() {
    super({ kind: 'fundos' });
    this.instAtual = 'itauprivate';   // fixo
    this._payload = null;             // setado antes do _carregar() pelo boot
  }

  /** Sobrescreve: o método original pinta o range inline com azul +
   *  cinza claro hardcoded (`#e3e6ee`). Aqui usamos laranja IPB +
   *  cinza dark, e suporte ao novo sistema do CSS-painted track. */
  _paintRange(el) {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const v = Number(el.value);
    const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
    el.style.background =
      `linear-gradient(to right, #FF8A3D 0%, #FF8A3D ${pct}%, #2c2c2e ${pct}%, #2c2c2e 100%)`;
  }

  /** Sobrescreve: usa o payload já decifrado pelo boot, sem fetch. */
  async _carregar(/* ignora instId */) {
    const host = document.querySelector('[data-classes]');
    if (!this._payload) {
      host.innerHTML = `<p class="dyn-loading" style="color:#FF453A;">Sem dados carregados (decrypt falhou).</p>`;
      return;
    }
    this.fundos = this._prepFundos(this._payload.fundos || []);
    this._renderClasses();
  }
}

// Boot: gate de senha → decrypt do .enc → meta → render.
//
// O gatePrompt() trava a UI atrás de um modal até a senha correta. Só após
// isso o boot prossegue com o payload decifrado. Senha fica em sessionStorage
// pra refresh na mesma aba não pedir de novo.
(async () => {
  let payload;
  try {
    payload = await gatePrompt('./data/fundos_itauprivate.enc');
    // Sucesso → libera o body (a CSS html:not(.gate-ok) some).
    document.documentElement.classList.add('gate-ok');
  } catch (e) {
    console.error('[ipb] gate falhou:', e);
    document.body.innerHTML = `<p style="color:#FF453A;padding:40px;text-align:center;font-family:system-ui">
      Erro fatal: ${e.message}
    </p>`;
    return;
  }

  const app = new AppFundosIPB();
  app._payload = payload;

  // Carrega meta só pra o hero (data) e pros labels de período no header.
  try {
    app.meta = await pool.meta();
  } catch {
    app.meta = null;
  }
  app._bindUI();
  app._atualizarHero();
  await app._carregar();
})();
