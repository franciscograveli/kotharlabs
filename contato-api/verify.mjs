// Verificação ponta a ponta contra a pilha local (compose com Mailpit). Nunca use com SMTP real.
//   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
//   node contato-api/verify.mjs
const SITE = process.env.SITE || 'http://127.0.0.1:8081';
const MAILPIT = process.env.MAILPIT || 'http://127.0.0.1:8025';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (nome, cond, det = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${nome}${det ? '  → ' + det : ''}`);
};
let ipN = 0;
const novoIp = () => `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`;
const post = (corpo, { ip = novoIp(), tipo = 'json', extra = {} } = {}) =>
  fetch(SITE + '/api/contato', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': tipo === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', Accept: tipo === 'json' ? 'application/json' : 'text/html', 'X-Forwarded-For': ip, ...extra },
    body: tipo === 'json' ? JSON.stringify(corpo) : new URLSearchParams(corpo).toString(),
  });
const msgs = async () => (await (await fetch(MAILPIT + '/api/v1/messages')).json()).messages || [];
const valido = (t, extra = {}) => ({ nome: 'Ana Teste', email: 'ana@exemplo.com', tipo: 'startup', ideia: 'Quero validar um MVP de agendamento para clínicas.', website: '', t, ...extra });

await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });

// 0. o token vem embutido no HTML da home (SSI do nginx)
const html = await (await fetch(SITE + '/')).text();
const tokenHtml = /name="t" value="([^"]*)"/.exec(html)?.[1] || '';
ok('token assinado embutido no HTML (SSI)', /^\d{10,15}\.[\w-]{27}$/.test(tokenHtml), tokenHtml.slice(0, 20) + '…');
const rt = await fetch(SITE + '/api/contato/token');
const token = await rt.text();
ok('GET /api/contato/token devolve token', rt.ok && /^\d+\.[\w-]{27}$/.test(token));
console.log('…esperando 3,2 s para o token "envelhecer"');
await espera(3200);

// 1. envio válido
let r = await post(valido(token));
let j = await r.json();
ok('envio válido → 200 {ok:true}', r.status === 200 && j.ok === true, JSON.stringify(j));
await espera(500);
let lista = await msgs();
ok('e-mail chegou no Mailpit', lista.length === 1, `${lista.length} mensagem(ns)`);
if (lista[0]) {
  const m = lista[0];
  ok('assunto "[Site] Nova ideia: <nome>"', m.Subject === '[Site] Nova ideia: Ana Teste', m.Subject);
  ok('Reply-To é o visitante', m.ReplyTo?.[0]?.Address === 'ana@exemplo.com', JSON.stringify(m.ReplyTo));
  ok('Para contato@kotharlabs.com', m.To?.[0]?.Address === 'contato@kotharlabs.com');
}

// 2. HTML escapado + injeção de cabeçalho no nome
r = await post(valido(token, { nome: 'Eva <script>alert(1)</script>\r\nBcc: vitima@exemplo.com', ideia: 'Teste <img src=x onerror=alert(1)> & "aspas" — com texto suficiente.' }));
ok('nome com HTML e CRLF é aceito (sanitizado)', r.status === 200);
await espera(500);
lista = await msgs();
const xss = lista.find((m) => m.Subject.includes('Eva'));
if (xss) {
  const det = await (await fetch(`${MAILPIT}/api/v1/message/${xss.ID}`)).json();
  const raw = await (await fetch(`${MAILPIT}/api/v1/message/${xss.ID}/raw`)).text();
  const cabecalho = raw.split(/\r?\n\r?\n/)[0];
  ok('assunto sem quebra de linha', !/[\r\n]/.test(det.Subject), JSON.stringify(det.Subject));
  ok('nenhum cabeçalho Bcc injetado', !/^Bcc:/im.test(cabecalho) && !det.Bcc?.length && !/vitima@/.test(JSON.stringify(det.To) + JSON.stringify(det.Cc)));
  ok('HTML do e-mail escapado (sem <script> nem <img>)', det.HTML.includes('&lt;script&gt;') && det.HTML.includes('&lt;img') && !/<script|<img/i.test(det.HTML));
} else ok('e-mail do teste de escape chegou', false);

// 3. e-mail inválido e injeção no e-mail
for (const [rot, em] of [['e-mail sem @', 'ana.exemplo.com'], ['e-mail com CRLF + Bcc', 'a@b.co\r\nBcc: x@y.com'], ['e-mail com vírgula (2 destinos)', 'a@b.co,c@d.co']]) {
  r = await post(valido(token, { email: em }));
  j = await r.json();
  ok(`${rot} rejeitado (400, erros.email)`, r.status === 400 && !!j.erros?.email, JSON.stringify(j));
}
r = await post(valido(token, { tipo: 'governo', nome: '', ideia: 'curta' }));
j = await r.json();
ok('campos obrigatórios/enum rejeitados', r.status === 400 && j.erros?.tipo && j.erros?.nome && j.erros?.ideia, Object.keys(j.erros || {}).join(','));
r = await post(valido(token, { ideia: 'x'.repeat(2001) }));
ok('ideia > 2000 caracteres rejeitada', r.status === 400);

// 4. honeypot
const antes = (await msgs()).length;
r = await post(valido(token, { website: 'http://spam.exemplo' }));
j = await r.json();
await espera(500);
ok('honeypot: responde 200 mas NÃO envia', r.status === 200 && (await msgs()).length === antes, `${antes} → ${(await msgs()).length}`);

// 5. rápido demais
const tFresco = await (await fetch(SITE + '/api/contato/token')).text();
r = await post(valido(tFresco));
j = await r.json();
await espera(300);
ok('envio rápido demais barrado (400 rapido)', r.status === 400 && j.erro === 'rapido' && (await msgs()).length === antes, JSON.stringify(j));
r = await post(valido('1700000000000.' + 'a'.repeat(27)));
ok('token forjado barrado', r.status === 400 && (await r.json()).erro === 'token');
r = await post(valido(''));
ok('sem token barrado', r.status === 400);

// 6. corpo grande e tipo errado
r = await post({ ...valido(token), lixo: 'y'.repeat(20000) });
ok('corpo > 16 KB → 413', r.status === 413);
r = await fetch(SITE + '/api/contato', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'oi' });
ok('Content-Type inválido → 415', r.status === 415);
r = await fetch(SITE + '/api/contato');
ok('GET /api/contato → 405', r.status === 405);

// 7. limite de taxa por IP (5/hora)
const ipFixo = '10.77.0.1';
const codigos = [];
for (let i = 0; i < 7; i++) codigos.push((await post(valido(token), { ip: ipFixo })).status);
ok('limite por IP: 5 passam, o 6º e o 7º levam 429', codigos.join() === '200,200,200,200,200,429,429', codigos.join());
r = await post(valido(token), { ip: ipFixo });
ok('429 traz Retry-After', r.headers.get('retry-after') > 0, r.headers.get('retry-after'));
r = await post(valido(token), { ip: novoIp() });
ok('outro IP continua passando', r.status === 200);

// 8. formulário sem JavaScript (POST urlencoded → redireciona)
r = await post(valido(token), { tipo: 'form' });
ok('sem JS: 303 para /obrigado', r.status === 303 && r.headers.get('location') === '/obrigado', `${r.status} ${r.headers.get('location')}`);
const pg = await fetch(SITE + '/obrigado');
ok('/obrigado serve a página do site (200)', pg.status === 200 && (await pg.text()).includes('Recebido.'));
r = await post(valido(token, { email: 'ruim' }), { tipo: 'form' });
ok('sem JS, dado inválido: 303 para /erro-envio', r.status === 303 && r.headers.get('location') === '/erro-envio');

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo verde.');
process.exit(falhas ? 1 : 0);
