import { defineConfig } from 'astro/config';

// build.format: 'file' -> gera /fundos.html e /calculadoras/x.html, preservando
// EXATAMENTE as URLs .html das 25 páginas reais do site atual.
//
// Exceção conhecida: pages/calculadoras/index.astro (landing legada, chrome
// sidebar) sai como /calculadoras.html em vez de /calculadoras/index.html — o
// 'file' colapsa index aninhado. É uma página órfã (nada no site linka pra ela,
// só o autolink dela mesma, já ajustado). Se quiser preservar o bookmark antigo
// /calculadoras/index.html, dá pra adicionar um redirect aqui. Ver FUTURE.md.
export default defineConfig({
  build: { format: 'file' },
  // Prefetch nativo do Astro (Passo 3). prefetchAll + estratégia 'hover':
  // ao passar o mouse (ou focar) qualquer link interno do menu, a próxima
  // página é baixada em <link rel="prefetch"> em segundo plano, deixando o
  // clique quase instantâneo. Sob demanda (só no hover) e 100% reversível:
  // basta remover este bloco. Não muda nada visualmente.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
