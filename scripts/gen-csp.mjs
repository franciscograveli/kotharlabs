// Gera o snippet de CSP do nginx a partir do dist/ já construído.
// O CSP é estrito (sem 'unsafe-inline'): o único inline permitido é o bloco <style>
// do Astro, fixado por hash. Se aparecer style="", on*="" ou <script> inline executável,
// o build falha em vez de afrouxar a política.
// Uso: node scripts/gen-csp.mjs dist csp.conf      (nginx da VPS)
//      node scripts/gen-csp.mjs dist dist/_headers (Cloudflare)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [, , dist = 'dist', saida = 'csp.conf'] = process.argv;
const htmls = [];
(async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if (p.endsWith('.html')) htmls.push(p);
  }
})(dist).then(async () => {
  const hashes = new Set();
  const problemas = [];
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
    // remove o conteúdo de <style>/<script> antes de procurar atributos inline
    const marcacao = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/g, (t) => t.match(/^<[^>]*>/)[0]);
    if (/\sstyle\s*=/.test(marcacao)) problemas.push(`${f}: atributo style="" inline`);
    if (/\son[a-z]+\s*=/.test(marcacao)) problemas.push(`${f}: manipulador on*="" inline`);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1];
      if (!/\ssrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs) && m[2].trim()) {
        problemas.push(`${f}: <script> inline executável`);
      }
    }
  }
  if (problemas.length) {
    console.error('CSP estrito não é possível, inline encontrado:\n  ' + problemas.join('\n  '));
    process.exit(1);
  }
  const csp = [
    "default-src 'self'",
    // /medir.js (medição própria) e o POST para /medir saem do mesmo domínio: 'self' basta, sem afrouxar nada
    "script-src 'self'",
    `style-src 'self' ${[...hashes].join(' ')}`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  if (saida.endsWith('_headers')) {
    // Cloudflare (Workers static assets): mesmos cabeçalhos do deploy/security-headers.conf e do cache do nginx
    const seguranca = [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'X-Frame-Options: DENY',
      'Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      'Strict-Transport-Security: max-age=31536000',
      `Content-Security-Policy: ${csp}`,
    ];
    const longo = 'Cache-Control: public, max-age=31536000, immutable';
    const regras = [
      ['/*', [...seguranca, 'Cache-Control: no-cache']],
      ['/_astro/*', ['! Cache-Control', longo]],
      ['/fonts/*', ['! Cache-Control', longo]],
      ['/favicon/*', ['! Cache-Control', 'Cache-Control: public, max-age=86400']],
      ['/og-image.png', ['! Cache-Control', 'Cache-Control: public, max-age=86400']],
    ];
    await writeFile(saida, regras.map(([rota, linhas]) => `${rota}\n${linhas.map((l) => `  ${l}`).join('\n')}\n`).join(''));
  } else {
    await writeFile(saida, `add_header Content-Security-Policy "${csp}" always;\n`);
  }
  console.log(`CSP gerado em ${saida} (${hashes.size} hash(es) de <style>).`);
});
