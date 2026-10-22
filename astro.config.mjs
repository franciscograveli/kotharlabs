import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://kotharlabs.com',
  output: 'static',
  // páginas de resultado do formulário não entram no sitemap
  integrations: [sitemap({ filter: (p) => !/\/(obrigado|erro-envio)\/?$/.test(p) })],
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
  // scripts sempre em arquivo (o CSP não permite <script> inline)
  vite: { build: { assetsInlineLimit: 0 } },
});
