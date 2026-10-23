// Worker do kotharlabs.com na Cloudflare: serve o dist/ (binding ASSETS) e faz o papel da contato-api + nginx.
// Mesmo contrato da contato-api/server.mjs: token de tempo "<ms>.<hmac>", JSON (fetch) ou formulário sem JS
// (303 para /obrigado ou /erro-envio). O e-mail sai pelo Email Routing da Cloudflare (binding EMAIL), sem SMTP.
import { EmailMessage } from 'cloudflare:email';

const MIN_MS = 3000; // envio mais rápido que isso é robô
const MAX_AGE_MS = 12 * 3600e3; // token mais velho que isso: recarregue a página
const LIM_IP = 5;
const LIM_POST_IP = 30; // teto para qualquer POST, válido ou não
const MAX_BODY = 16 * 1024;
const HORA = 3600e3;
const BASE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/contato/token' && request.method === 'GET') {
      return new Response(await novoToken(env.TOKEN_SECRET), { headers: { ...BASE, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (url.pathname === '/api/contato') return contato(request, env);
    if (url.pathname.startsWith('/api/')) return json(404, { ok: false, erro: 'nao_encontrado' });
    // sem Umami na Cloudflare: o /medir.js só existe com PUBLIC_UMAMI_WEBSITE_ID no build, e o POST some em silêncio
    if (url.pathname === '/medir') return new Response(null, { status: 204, headers: BASE });

    const resposta = await env.ASSETS.fetch(request);
    // o nginx da VPS embutia o token no HTML por SSI; aqui o HTMLRewriter faz o mesmo (vale também para quem está sem JS)
    if (!(resposta.headers.get('Content-Type') || '').includes('text/html')) return resposta;
    const token = await novoToken(env.TOKEN_SECRET);
    return new HTMLRewriter()
      .on('form#form-contato input[name="t"]', { element: (el) => el.setAttribute('value', token) })
      .transform(resposta);
  },
};

// ── token de tempo assinado (stateless): "<ms>.<hmac>" ──────────────────
const codificador = new TextEncoder();
async function assinar(segredo, ts) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, codificador.encode(String(ts))));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 27);
}
async function novoToken(segredo) {
  const ts = Date.now();
  return `${ts}.${await assinar(segredo, ts)}`;
}
async function checarToken(segredo, t) {
  const m = /^(\d{10,15})\.([\w-]{27})$/.exec(String(t || ''));
  if (!m) return 'token';
  if (!igual(await assinar(segredo, m[1]), m[2])) return 'token';
  const idade = Date.now() - Number(m[1]);
  if (idade < MIN_MS) return 'rapido';
  if (idade > MAX_AGE_MS) return 'expirado';
  return null;
}
const igual = (a, b) => a.length === b.length && [...a].reduce((dif, c, i) => dif | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

// ── limite de taxa em memória: vale por instância do Worker (a Cloudflare roda várias), então é só um freio ──
const janelas = new Map();
function usar(chave, max) {
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter((x) => agora - x < HORA);
  if (lista.length >= max) {
    janelas.set(chave, lista);
    return Math.ceil((HORA - (agora - lista[0])) / 1000);
  }
  lista.push(agora);
  janelas.set(chave, lista);
  if (janelas.size > 5000) janelas.clear();
  return 0;
}

// ── validação (igual à contato-api) ─────────────────────────────────────
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]', 'g');
const EMAIL = /^[^\s@<>(),;:\\"[\]]{1,64}@[^\s@<>(),;:\\"[\]]+\.[^\s@<>(),;:\\"[\]]{2,}$/;
const MSG = {
  nome: 'Diga seu nome.',
  email: 'Esse e-mail não parece certo.',
  tipo: 'Escolha Startup ou Empresa.',
  ideia: 'Escreva ao menos uma linha sobre a ideia.',
  ideiaLonga: 'Tem que caber em 2000 caracteres.',
};
const texto = (v) => (typeof v === 'string' ? v : '');

function validar(d) {
  const erros = {};
  const nome = texto(d.nome).replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  if (!nome || nome.length > 100) erros.nome = MSG.nome;
  const email = texto(d.email).trim();
  if (email.length > 254 || !EMAIL.test(email)) erros.email = MSG.email;
  const tipo = texto(d.tipo);
  if (tipo !== 'startup' && tipo !== 'empresa') erros.tipo = MSG.tipo;
  const ideia = texto(d.ideia).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (ideia.length < 10) erros.ideia = MSG.ideia;
  else if (ideia.length > 2000) erros.ideia = MSG.ideiaLonga;
  return { erros, dados: { nome, email, tipo, ideia } };
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ── e-mail (MIME montado à mão: texto + HTML, cabeçalhos codificados) ────
const b64 = (s) => {
  let bin = '';
  for (const byte of codificador.encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
const palavra = (s) => `=?UTF-8?B?${b64(s)}?=`;
const parte = (tipo, corpo) =>
  [`Content-Type: ${tipo}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(corpo).replace(/.{76}/g, '$&\r\n')].join('\r\n');

async function enviar(env, { nome, email, tipo, ideia }) {
  const rotulo = tipo === 'startup' ? 'Startup' : 'Empresa';
  const fronteira = `kothar-${crypto.randomUUID()}`;
  const mime = [
    `From: ${palavra('Site Kothar')} <${env.MAIL_FROM}>`,
    `To: <${env.MAIL_TO}>`,
    `Reply-To: ${palavra(nome)} <${email}>`,
    `Subject: ${palavra(`[Site] Nova ideia: ${nome.slice(0, 80)}`)}`,
    `Message-ID: <${crypto.randomUUID()}@kotharlabs.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${fronteira}"`,
    '',
    `--${fronteira}`,
    parte('text/plain', `Nome: ${nome}\nE-mail: ${email}\nVocê é: ${rotulo}\n\nIdeia:\n${ideia}\n`),
    `--${fronteira}`,
    parte(
      'text/html',
      `<p><strong>Nome:</strong> ${esc(nome)}<br><strong>E-mail:</strong> ${esc(email)}<br><strong>Você é:</strong> ${rotulo}</p>` +
        `<p><strong>Ideia:</strong></p><div style="white-space:pre-wrap">${esc(ideia)}</div>`,
    ),
    `--${fronteira}--`,
    '',
  ].join('\r\n');
  await env.EMAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, mime));
}

// ── HTTP ────────────────────────────────────────────────────────────────
const json = (status, obj, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...BASE, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const ir = (rota) => new Response(null, { status: 303, headers: { ...BASE, Location: rota } });
// responde no formato do cliente: JSON (fetch) ou redirecionamento (formulário sem JS)
const responder = (ehJson, status, corpo, rotaForm, extra) => (ehJson ? json(status, corpo, extra) : ir(rotaForm));

async function contato(request, env) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'metodo' }, { Allow: 'POST' });
  try {
    const corpo = await request.text();
    if (corpo.length > MAX_BODY) return json(413, { ok: false, erro: 'grande' });
    const tipo = (request.headers.get('Content-Type') || '').toLowerCase();
    let dados;
    let ehJson;
    if (tipo.startsWith('application/json')) {
      dados = JSON.parse(corpo);
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('json');
      ehJson = true;
    } else if (tipo.startsWith('application/x-www-form-urlencoded')) {
      dados = Object.fromEntries(new URLSearchParams(corpo));
      ehJson = false;
    } else return json(415, { ok: false, erro: 'invalida' });

    const acceptJson = ehJson || (request.headers.get('Accept') || '').includes('application/json');
    const erroForm = '/erro-envio/';
    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';

    const espera = usar('post:' + ip, LIM_POST_IP);
    if (espera) return responder(acceptJson, 429, { ok: false, erro: 'limite' }, erroForm, { 'Retry-After': String(espera) });
    // honeypot: finge sucesso para o robô não aprender nada
    if (texto(dados.website) !== '') return responder(acceptJson, 200, { ok: true }, '/obrigado/');
    const falhaToken = await checarToken(env.TOKEN_SECRET, dados.t);
    if (falhaToken) return responder(acceptJson, 400, { ok: false, erro: falhaToken }, erroForm);
    const { erros, dados: limpos } = validar(dados);
    if (Object.keys(erros).length) return responder(acceptJson, 400, { ok: false, erro: 'validacao', erros }, erroForm);
    const esperaIp = usar('envio:' + ip, LIM_IP);
    if (esperaIp) return responder(acceptJson, 429, { ok: false, erro: 'limite' }, erroForm, { 'Retry-After': String(esperaIp) });
    try {
      await enviar(env, limpos);
    } catch (e) {
      console.error(JSON.stringify({ evt: 'envio_falhou', erro: String(e?.message || e) }));
      return responder(acceptJson, 502, { ok: false, erro: 'envio' }, erroForm);
    }
    return responder(acceptJson, 200, { ok: true }, '/obrigado/');
  } catch {
    return json(400, { ok: false, erro: 'invalida' });
  }
}
