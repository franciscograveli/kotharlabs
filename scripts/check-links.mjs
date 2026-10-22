// Confere links e recursos internos do dist/ (href/src, âncoras #id e arquivos).
// Uso: pnpm build && pnpm check:links
import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

const DIST = resolve('dist');
const paginas = [];
(async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if (p.endsWith('.html')) paginas.push(p);
  }
})(DIST).then(async () => {
  const existe = (p) => access(p).then(() => true, () => false);
  const quebrados = [];
  let total = 0;

  for (const arquivo of paginas) {
    const html = await readFile(arquivo, 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const rota = '/' + arquivo.slice(DIST.length + 1).replace(/index\.html$/, '');
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const url = m[1];
      if (/^(mailto:|tel:|https?:|data:|javascript:)/.test(url)) continue;
      total++;
      const [caminho, ancora] = url.split('#');
      if (!caminho) {
        if (ancora && !ids.has(ancora)) quebrados.push(`${rota} → #${ancora} (âncora sem id)`);
        continue;
      }
      const alvo = caminho.startsWith('/') ? join(DIST, caminho) : join(dirname(arquivo), caminho);
      const ok = (await existe(alvo)) || (await existe(join(alvo, 'index.html'))) || (await existe(alvo + '.html'));
      if (!ok) quebrados.push(`${rota} → ${url}`);
    }
  }

  console.log(`${paginas.length} página(s), ${total} links/recursos internos conferidos.`);
  if (quebrados.length) {
    console.error('QUEBRADOS:\n' + quebrados.map((q) => '  ' + q).join('\n'));
    process.exit(1);
  }
  console.log('Nenhum link interno quebrado.');
});
