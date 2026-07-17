/**
 * crypto_ipb.js — Decripta o JSON IPB no browser via Web Crypto API.
 *
 * Pareado com Scripts/dashboard_projects_joao_privado/pipeline/encrypt_ipb.py.
 * Os parâmetros (iterações PBKDF2, tamanhos de salt/iv, AES-GCM) TÊM que bater.
 *
 * Formato do blob .enc:
 *   [salt: 16 bytes][iv: 12 bytes][ciphertext+tag: N bytes]
 *
 * Uso:
 *   import { decryptJSON, gatePrompt } from './shared/crypto_ipb.js';
 *   const data = await gatePrompt('./data/fundos_itauprivate.enc');
 *   // data já é o JSON parseado, ou o usuário fica preso no modal.
 *
 * Senha NÃO é cacheada — toda navegação/refresh pede de novo (escolha
 * do produto pra maior segurança e zero pegada em storage do browser).
 */

const PBKDF2_ITERATIONS = 250_000;
const SALT_LEN = 16;
const IV_LEN = 12;

/* ─── Decryption primitives ──────────────────────────────────── */

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const passKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Baixa o arquivo .enc e tenta decriptografar com a senha. Throw se falhar.
 * @returns {Promise<object>} O JSON parseado.
 */
export async function decryptJSON(url, password) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar ${url}`);
  const blob = new Uint8Array(await r.arrayBuffer());

  if (blob.byteLength < SALT_LEN + IV_LEN + 16) {
    throw new Error('Arquivo cifrado corrompido');
  }

  const salt = blob.slice(0, SALT_LEN);
  const iv = blob.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const data = blob.slice(SALT_LEN + IV_LEN);

  const key = await deriveKey(password, salt);
  let plaintextBuf;
  try {
    plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
  } catch (_) {
    throw new Error('Senha incorreta');
  }
  const text = new TextDecoder().decode(plaintextBuf);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Decifrou mas o conteúdo não é JSON válido');
  }
}

/* ─── Modal UI ───────────────────────────────────────────────── */

function buildModalHTML() {
  return `
    <div class="ipb-gate-backdrop" data-ipb-gate>
      <form class="ipb-gate-card" id="ipb-gate-form" autocomplete="off">
        <div class="ipb-gate-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 class="ipb-gate-title">Acesso restrito</h2>
        <p class="ipb-gate-sub">Esta página é protegida. Informe a senha pra continuar.</p>
        <input
          type="password"
          class="ipb-gate-input"
          id="ipb-gate-input"
          placeholder="Senha"
          autocomplete="current-password"
          spellcheck="false"
          required
        >
        <button type="submit" class="ipb-gate-btn" id="ipb-gate-btn">Entrar</button>
        <p class="ipb-gate-err" id="ipb-gate-err" hidden></p>
      </form>
    </div>
  `;
}

const MODAL_CSS = `
  .ipb-gate-backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: ipbGateFadeIn .25s ease-out;
  }
  @keyframes ipbGateFadeIn { from { opacity: 0 } to { opacity: 1 } }
  .ipb-gate-card {
    width: 100%; max-width: 380px;
    background: #1c1c1e;
    border: 0.5px solid rgba(255,255,255,0.10);
    border-radius: 22px;
    padding: 36px 32px 28px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.65);
    text-align: center;
    font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif;
    color: #f5f5f7;
  }
  .ipb-gate-icon {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: rgba(255,138,61,0.14);
    color: #FF8A3D;
    display: inline-flex;
    align-items: center; justify-content: center;
    margin-bottom: 18px;
  }
  .ipb-gate-icon svg { width: 22px; height: 22px; }
  .ipb-gate-title {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin: 0 0 6px;
  }
  .ipb-gate-sub {
    font-size: 13.5px;
    color: #a1a1a6;
    margin: 0 0 22px;
    line-height: 1.4;
  }
  .ipb-gate-input {
    width: 100%;
    padding: 12px 14px;
    background: #2c2c2e;
    border: 0.5px solid rgba(255,255,255,0.10);
    border-radius: 12px;
    font: inherit;
    font-size: 15px;
    color: #f5f5f7;
    text-align: center;
    outline: none;
    transition: all .15s ease;
    margin-bottom: 10px;
  }
  .ipb-gate-input::placeholder { color: #6e6e73; }
  .ipb-gate-input:focus {
    background: #3a3a3c;
    border-color: rgba(255,138,61,0.6);
    box-shadow: 0 0 0 3px rgba(255,138,61,0.16);
  }
  .ipb-gate-btn {
    width: 100%;
    padding: 12px 14px;
    background: #FF8A3D;
    color: #0a0a0a;
    border: none;
    border-radius: 12px;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s ease, transform .1s ease;
  }
  .ipb-gate-btn:hover { background: #FFA15E; }
  .ipb-gate-btn:active { transform: scale(.98); }
  .ipb-gate-btn:disabled {
    background: #3a3a3c;
    color: #6e6e73;
    cursor: progress;
  }
  .ipb-gate-err {
    color: #FF453A;
    font-size: 12.5px;
    margin: 12px 0 0;
    min-height: 16px;
  }
`;

function injectStyles() {
  if (document.getElementById('ipb-gate-styles')) return;
  const style = document.createElement('style');
  style.id = 'ipb-gate-styles';
  style.textContent = MODAL_CSS;
  document.head.appendChild(style);
}

/**
 * Mostra o modal, espera o user digitar a senha, tenta decifrar o url.
 * Resolve com o JSON quando der certo. Em falha, deixa o user tentar de novo.
 * Não tem como cancelar — modal é bloqueante. Senha NÃO é cacheada,
 * pede de novo em cada navegação/refresh.
 */
export async function gatePrompt(url) {
  injectStyles();

  return new Promise((resolve) => {
    document.body.insertAdjacentHTML('afterbegin', buildModalHTML());
    const backdrop = document.querySelector('[data-ipb-gate]');
    const form = backdrop.querySelector('#ipb-gate-form');
    const input = backdrop.querySelector('#ipb-gate-input');
    const btn = backdrop.querySelector('#ipb-gate-btn');
    const err = backdrop.querySelector('#ipb-gate-err');

    // Foca no input com pequeno delay (animação fade-in)
    setTimeout(() => input.focus(), 150);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = input.value;
      if (!pw) return;

      btn.disabled = true;
      btn.textContent = 'Verificando…';
      err.hidden = true;

      try {
        const data = await decryptJSON(url, pw);
        // Fade-out e remove o modal
        backdrop.style.opacity = '0';
        backdrop.style.transition = 'opacity .25s ease-out';
        setTimeout(() => backdrop.remove(), 250);
        resolve(data);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Entrar';
        err.textContent = e.message === 'Senha incorreta'
          ? 'Senha incorreta. Tente de novo.'
          : `Erro: ${e.message}`;
        err.hidden = false;
        input.select();
      }
    });
  });
}
