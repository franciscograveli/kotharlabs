# syntax=docker/dockerfile:1

# ── build: gera dist/ e o snippet de CSP ───────────────────────────────
FROM node:24.22.1-alpine3.24 AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# id público do site no Umami (não é segredo): sem ele, o script de medição não entra no build
ARG PUBLIC_UMAMI_WEBSITE_ID=""
ENV PUBLIC_UMAMI_WEBSITE_ID=$PUBLIC_UMAMI_WEBSITE_ID
RUN pnpm build && node scripts/gen-csp.mjs dist /app/csp.conf

# ── final: só o estático, nginx sem root, porta 8080 ───────────────────
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/csp.conf /etc/nginx/snippets/csp.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
USER 101
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
