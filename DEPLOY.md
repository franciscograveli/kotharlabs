# Deploy — kotharlabs.com

Contêiner próprio: nginx sem privilégios servindo o `dist/` na porta **8080**.
A VPS usa **Coolify** (proxy Traefik dele, HTTPS automático): o Coolify builda a imagem a partir
do `Dockerfile` na própria VPS, então não há rótulos nem rede de proxy neste repositório.

## Publicar pelo Coolify
São **dois contêineres**: o site (nginx, porta 8080) e o `contato-api` (Node, porta 3000, só na rede interna).
O nginx do site encaminha `/api/` para `http://contato-api:3000`, então os dois precisam estar na mesma rede
do compose. Por isso o recurso no Coolify é **Docker Compose**, não mais um Dockerfile solto.

1. **Repositório:** o Coolify precisa clonar o projeto. Faça o commit e o push do código.
2. **Novo recurso → Docker Compose** (Docker Compose Empty não; o de repositório), branch `main`,
   *Docker Compose Location* `/docker-compose.yml`. Não use o `docker-compose.local.yml` (é só de teste: traz o Mailpit).
3. **Variáveis de ambiente** (aba Environment Variables; o Coolify as lê do compose). Nunca vão para o repositório:

   | Variável | Obrigatória | O que é |
   |---|---|---|
   | `SMTP_HOST` | sim | servidor SMTP do provedor do e-mail |
   | `SMTP_PORT` | não (587) | porta (465 = TLS direto) |
   | `SMTP_SECURE` | não | `true`/`false`; vazio = `true` só na 465 |
   | `SMTP_USER`, `SMTP_PASS` | conforme o provedor | credenciais; marque `SMTP_PASS` como *secret* |
   | `MAIL_TO` | não (`contato@kotharlabs.com`) | quem recebe |
   | `MAIL_FROM` | sim | remetente, ex.: `Site Kothar <site@kotharlabs.com>` (precisa estar autorizado no provedor: SPF/DKIM) |
   | `TOKEN_SECRET` | recomendada | `openssl rand -hex 32`; sem ela o token de tempo é regenerado a cada restart |

   Limites opcionais no próprio serviço: `MIN_FILL_MS` (3000), `RATE_IP_PER_HOUR` (5), `RATE_POST_IP_PER_HOUR` (30), `RATE_GLOBAL_PER_HOUR` (60).
   O modelo está em `contato-api/.env.example`.
4. **Domínio:** no serviço `kotharlabs`, `https://kotharlabs.com` (porta `8080`) e `https://www.kotharlabs.com`
   com redirecionamento para non-www. O serviço `contato-api` **não** recebe domínio nem porta publicada.
5. **Health check:** já está no compose (`/healthz` em cada serviço).
6. **Deploy.** Para atualizar: push no `main` e **Redeploy**.

O endurecimento (somente leitura, `cap_drop ALL`, `no-new-privileges`, limites) já está no `docker-compose.yml`.
Os nomes exatos dos campos podem variar conforme a versão do Coolify.

### Como o formulário funciona em produção
- `POST /api/contato` passa pelo nginx do site até o `contato-api`; o navegador só fala com `kotharlabs.com` (CSP: tudo `'self'`).
- O token de tempo assinado é embutido na home pelo nginx (SSI: `/api/contato/token`). Com a API parada o site continua de pé:
  o `fetch` recebe 503 e mostra o plano B; o formulário sem JavaScript cai em `/erro-envio`, que traz o e-mail.
- O IP para o limite de taxa vem do último valor de `X-Forwarded-For` (o Traefik o escreve; o nginx repassa sem acrescentar).
  Se o proxy da VPS não escrever esse cabeçalho, o limite passa a contar pelo IP do contêiner do nginx (todos viram um só).
- O nginx resolve `contato-api` pelo DNS do Docker (`resolver 127.0.0.11`). Se o nome do serviço mudar, ajuste `deploy/nginx.conf`.
- Nada é gravado em disco; o log tem só eventos (enviado, bloqueado + motivo), sem nome, e-mail, IP ou texto.

## Medição de visitas (Umami)
Medição sem cookies e sem banner, hospedada por nós: contêiner `umami` + `umami-db` (Postgres) no `docker-compose.yml`,
em redes internas (`medicao`: site ↔ umami; `banco`: umami ↔ postgres, sem saída). Nenhuma porta é publicada.
O navegador só fala com `kotharlabs.com`: o script é `/medir.js` (estático, ~1,2 KB, `async`) e os eventos vão por `POST /medir`,
que o nginx encaminha para `umami:3000/api/send`. O painel do Umami **não** passa pelo domínio do site. Mede só: página (sem query/hash),
domínio de origem e cliques em `[data-evento]` (botão do cabeçalho e botão do formulário). Respeita Do Not Track e GPC.
Se o Umami cair, `/medir` responde 204 e o visitante não percebe; o CSP continua só `'self'`.

Variáveis (ver `.env.example`): `UMAMI_DB_PASSWORD` (`openssl rand -hex 24`), `UMAMI_APP_SECRET` (`openssl rand -hex 32`) e
`UMAMI_WEBSITE_ID`. Nunca vão para o repositório.

**Primeira subida (ordem importa, porque o id do site só existe depois que o Umami roda):**
1. Faça o deploy com `UMAMI_DB_PASSWORD` e `UMAMI_APP_SECRET` preenchidas e `UMAMI_WEBSITE_ID` vazia (o site sobe sem medição).
2. Abra o painel do Umami (veja abaixo), entre com `admin` / `umami` e **troque a senha na hora**.
3. *Settings → Websites → Add website* (domínio `kotharlabs.com`); copie o **Website ID** (UUID; não é segredo, vai no HTML).
4. Cadastre-o como `UMAMI_WEBSITE_ID` (marque como variável de **build time** no Coolify, pois ela entra no build do site) e faça **Redeploy**.
5. Confira: abra o site, e no painel a visita aparece em *Realtime*.

**Painel:** não é exposto pelo site. Duas opções (decisão sua): (a) um domínio só do painel no Coolify, no serviço `umami`, porta `3000`
(ex.: um subdomínio; a tela de login do Umami fica pública, então senha forte); (b) sem domínio, acessando por túnel SSH/porta local.
Sem domínio o painel não fica na internet. Observação: redes `internal` do Docker não publicam portas; no teste local o
`docker-compose.local.yml` coloca o Umami também na rede padrão para publicar `127.0.0.1:3001`.

**Backup:** o histórico está no volume `umami-db-data` (Postgres). Inclua-o no backup da VPS; sem ele as estatísticas se perdem num rebuild do volume.
**Retenção:** o Umami não apaga dados sozinho. Defina um prazo e a rotina de limpeza (ver `docs/REVISAO-JURIDICA.md`, item 14).
**IP:** o Umami usa o IP só para deduzir país/região/cidade e um identificador de sessão calculado com sal; o IP não é gravado (sem coluna de IP no banco).
Ele lê o primeiro valor de `X-Forwarded-For` (o Traefik o escreve; o nginx repassa sem acrescentar).

### Testar a medição localmente
```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d umami-db umami
# painel em http://127.0.0.1:3001 (admin/umami); crie o site e copie o ID
UMAMI_WEBSITE_ID=<id> docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```
O Umami ignora navegadores que se parecem com robôs (ex.: `HeadlessChrome` no UA); para testar com automação, defina um `userAgent` comum.
O banco do teste local fica em memória (`tmpfs`): some ao derrubar. Em produção é o volume nomeado.

## Rollback
No Coolify, aba do recurso → **Deployments**: o histórico guarda os builds anteriores; use **Rollback**
(ou **Redeploy** de um commit anterior).

## Testar localmente (sem Coolify, sem SMTP real)
```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
curl -i http://127.0.0.1:8081/            # 200
curl -i http://127.0.0.1:8081/healthz     # 200 "ok"
open http://127.0.0.1:8025                # Mailpit: caixa de entrada de teste
node contato-api/verify.mjs               # envio válido, honeypot, rápido demais, limite, e-mail inválido, HTML escapado, sem JS
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```
O `docker-compose.local.yml` troca o SMTP pelo Mailpit (nada sai da máquina). O `verify.mjs` usa IPs de teste via
`X-Forwarded-For`; rodar de novo antes de 1 hora esbarra no limite só para o mesmo IP, e reiniciar o `contato-api` zera os contadores.
Para testar o plano B: `docker compose ... stop contato-api` e enviar o formulário.

## Antes do DNS apontar para a VPS
- O Coolify só emite o certificado depois que o DNS aponta. Até lá, teste o contêiner pelo terminal do
  próprio recurso no Coolify (`wget -qO- http://127.0.0.1:8080/healthz`) ou localmente, como acima.
- Pelo proxy, sem DNS: `curl -i -k --resolve kotharlabs.com:443:<IP_DA_VPS> https://kotharlabs.com/`
  (`-k` só para teste; o certificado válido não existe ainda).

## Quando o domínio apontar
1. No provedor de DNS, crie registros `A` para `kotharlabs.com` e `www.kotharlabs.com` com o IP da VPS.
2. Conferir: `dig +short kotharlabs.com` e `dig +short www.kotharlabs.com` devolvem o IP da VPS.
3. Esperar o Coolify emitir o certificado (alguns minutos) e abrir `https://kotharlabs.com`.
4. Testar o redirecionamento: `curl -I https://www.kotharlabs.com` deve responder 301/308 para `https://kotharlabs.com/`.
5. Conferir cabeçalhos: `curl -I https://kotharlabs.com` (CSP, X-Frame-Options, Cache-Control).
   HSTS não vem do nginx do contêiner (ele só fala HTTP); se quiser, ligue no proxy depois que o HTTPS estiver estável.

## Observações
- **CSP:** gerado no build por `scripts/gen-csp.mjs`, com o hash do único `<style>` inline. Se alguém
  adicionar `style=""`, `on*=""` ou `<script>` inline, o build falha (em vez de afrouxar a política).
- **Fontes `immutable`:** os arquivos em `/fonts/` não têm hash no nome. Ao trocar uma fonte, renomeie o arquivo.
- **Sem segredos no repositório.**
