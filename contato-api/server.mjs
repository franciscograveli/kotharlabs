// contato-api: POST /api/contato → e-mail por SMTP. Sem banco, sem disco, sem cookies.
// Config só por variáveis de ambiente (ver .env.example).
import http from 'node:http';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const env = process.env;
const PORT = Number(env.PORT || 3000);
const MAIL_TO = env.MAIL_TO || 'contato@kotharlabs.com';
const MIN_MS = Number(env.MIN_FILL_MS || 3000); // envio mais rápido que isso é robô
const MAX_AGE_MS = 12 * 3600e3; // token mais velho que isso: recarregue a página
const LIM_IP = Number(env.RATE_IP_PER_HOUR || 5);
const LIM_POST_IP = Number(env.RATE_POST_IP_PER_HOUR || 30); // teto para qualquer POST, válido ou não
const LIM_GLOBAL = Number(env.RATE_GLOBAL_PER_HOUR || 60);
const MAX_BODY = 16 * 1024;
const HORA = 3600e3;

for (const k of ['SMTP_HOST', 'MAIL_FROM']) {
  if (!env[k]) {
    log('config_faltando', { var: k });
    process.exit(1);
  }
}
// sem TOKEN_SECRET o segredo nasce no boot: tokens emitidos antes de um restart deixam de valer
const SEGREDO = env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

const smtpPort = Number(env.SMTP_PORT || 587);
const transporte = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: smtpPort,
  secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : smtpPort === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

// log só do necessário: nada de nome, e-mail, IP ou corpo
function log(evt, extra = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), evt, ...extra }));
}

// ── token de tempo assinado (stateless): "<ms>.<hmac>" ──────────────────
const assinar = (ts) => crypto.createHmac('sha256', SEGREDO).update(String(ts)).digest('base64url').slice(0, 27);
const novoToken = () => {
  const ts = Date.now();
  return `${ts}.${assinar(ts)}`;
};
function checarToken(t) {
  const m = /^(\d{10,15})\.([\w-]{27})$/.exec(String(t || ''));
  if (!m) return 'token';
  const esperado = Buffer.from(assinar(m[1]));
  const recebido = Buffer.from(m[2]);
  if (!crypto.timingSafeEqual(esperado, recebido)) return 'token';
  const idade = Date.now() - Number(m[1]);
  if (idade < MIN_MS) return 'rapido';
  if (idade > MAX_AGE_MS) return 'expirado';
  return null;
}

// ── limite de taxa em memória (janela deslizante de 1 hora) ─────────────
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
  return 0;
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of janelas) if (!v.some((x) => agora - x < HORA)) janelas.delete(k);
}, 10 * 60e3).unref();

// IP do visitante: o proxy (Traefik) escreve o IP no fim do X-Forwarded-For; o nginx do site repassa sem acrescentar
function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) || req.socket.remoteAddress || 'desconhecido';
}

// ── validação ───────────────────────────────────────────────────────────
const CTRL = /[\u0000-\u001f\u007f\u2028\u2029]/g;
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

async function enviar({ nome, email, tipo, ideia }) {
  const rotulo = tipo === 'startup' ? 'Startup' : 'Empresa';
  await transporte.sendMail({
    from: env.MAIL_FROM,
    to: MAIL_TO,
    replyTo: { name: nome, address: email },
    subject: `[Site] Nova ideia: ${nome.slice(0, 80)}`,
    text: `Nome: ${nome}\nE-mail: ${email}\nVocê é: ${rotulo}\n\nIdeia:\n${ideia}\n`,
    html:
      `<p><strong>Nome:</strong> ${esc(nome)}<br><strong>E-mail:</strong> ${esc(email)}<br><strong>Você é:</strong> ${rotulo}</p>` +
      `<p><strong>Ideia:</strong></p><div style="white-space:pre-wrap">${esc(ideia)}</div>`,
  });
}

// ── HTTP ────────────────────────────────────────────────────────────────
function ler(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const partes = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(Object.assign(new Error('grande'), { status: 413 }));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function parse(req, corpo) {
  const tipo = String(req.headers['content-type'] || '').toLowerCase();
  if (tipo.startsWith('application/json')) {
    const j = JSON.parse(corpo);
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('json');
    return { dados: j, json: true };
  }
  if (tipo.startsWith('application/x-www-form-urlencoded')) return { dados: Object.fromEntries(new URLSearchParams(corpo)), json: false };
  throw Object.assign(new Error('tipo'), { status: 415 });
}

const BASE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (res, status, obj, extra = {}) => {
  res.writeHead(status, { ...BASE, 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(obj));
};
const ir = (res, rota) => {
  res.writeHead(303, { ...BASE, Location: rota });
  res.end();
};

// responde no formato do cliente: JSON (fetch) ou redirecionamento (formulário sem JS)
function responder(res, ehJson, status, corpo, rotaForm, extra) {
  if (ehJson) return json(res, status, corpo, extra);
  return ir(res, rotaForm);
}

const servidor = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/healthz') {
      res.writeHead(200, { ...BASE, 'Content-Type': 'text/plain' });
      return res.end('ok\n');
    }
    // texto puro, sem quebra de linha: o nginx o embute no HTML do site (SSI)
    if (pathname === '/api/contato/token' && req.method === 'GET') {
      res.writeHead(200, { ...BASE, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(novoToken());
    }
    if (pathname !== '/api/contato') return json(res, 404, { ok: false, erro: 'nao_encontrado' });
    if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'metodo' }, { Allow: 'POST' });

    const ip = ipDe(req);
    const espera = usar('post:' + ip, LIM_POST_IP);
    const { dados, json: ehJson } = parse(req, await ler(req));
    const acceptJson = ehJson || String(req.headers.accept || '').includes('application/json');
    const erroForm = '/erro-envio';

    if (espera) {
      log('bloqueado', { motivo: 'taxa_post' });
      return responder(res, acceptJson, 429, { ok: false, erro: 'limite' }, erroForm, { 'Retry-After': espera });
    }
    // honeypot: finge sucesso para o robô não aprender nada
    if (texto(dados.website) !== '') {
      log('bloqueado', { motivo: 'honeypot' });
      return responder(res, acceptJson, 200, { ok: true }, '/obrigado');
    }
    const falhaToken = checarToken(dados.t);
    if (falhaToken) {
      log('bloqueado', { motivo: falhaToken });
      return responder(res, acceptJson, 400, { ok: false, erro: falhaToken }, erroForm);
    }
    const { erros, dados: limpos } = validar(dados);
    if (Object.keys(erros).length) {
      log('bloqueado', { motivo: 'validacao', campos: Object.keys(erros) });
      return responder(res, acceptJson, 400, { ok: false, erro: 'validacao', erros }, erroForm);
    }
    const esperaIp = usar('envio:' + ip, LIM_IP);
    const esperaGlobal = esperaIp ? 0 : usar('global', LIM_GLOBAL);
    if (esperaIp || esperaGlobal) {
      log('bloqueado', { motivo: esperaIp ? 'taxa_ip' : 'taxa_global' });
      return responder(res, acceptJson, 429, { ok: false, erro: 'limite' }, erroForm, { 'Retry-After': esperaIp || esperaGlobal });
    }
    try {
      await enviar(limpos);
    } catch (e) {
      log('smtp_falhou', { codigo: e.code || e.responseCode || 'erro' });
      return responder(res, acceptJson, 502, { ok: false, erro: 'envio' }, erroForm);
    }
    log('enviado', { ms: Date.now() - t0 });
    return responder(res, acceptJson, 200, { ok: true }, '/obrigado');
  } catch (e) {
    const status = e.status || 400;
    log('requisicao_invalida', { status });
    if (!res.headersSent) json(res, status, { ok: false, erro: status === 413 ? 'grande' : 'invalida' }, { Connection: 'close' });
  }
});
servidor.headersTimeout = 10_000;
servidor.requestTimeout = 15_000;
servidor.keepAliveTimeout = 5_000;
servidor.listen(PORT, '0.0.0.0', () => log('ouvindo', { porta: PORT }));
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => servidor.close(() => process.exit(0)));
