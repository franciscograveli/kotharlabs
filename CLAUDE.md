# Kothar Labs — site institucional (kotharlabs.com)

## O que é
Kothar é uma casa de desenvolvimento de software e consultoria (Brasil, foco em startups e PMEs, ecossistema tecnoPARQ UFV / Viçosa).
Tom: direto, excelente, humor seco (90% sério). Evitar cara de "site feito por IA", WordPress ou template padrão.

## Tarefa
Converter `referencia/kothar-landing.html` (landing de uma página, já aprovada visualmente) em um projeto **Astro** estático, sem mudar o visual.

## Regras
- Fidelidade visual: o HTML de referência é a verdade. Não "melhorar" layout, cores, espaçamentos ou textos.
- Sem Tailwind e sem bibliotecas de UI. CSS próprio, com variáveis CSS para os tokens abaixo.
- Componentes Astro: Header, Hero, ParaQuem, Servicos, Clientes, Como, Oficio, Duvidas, Contato, Footer, Relevo (filtro SVG).
- Fontes **self-hosted** (pasta `fonts/`, `@font-face` com `font-display: swap`), sem Google Fonts.
- Imagens do `assets/clientes/` viram arquivos otimizados; no HTML de referência elas estão embutidas em base64.
- Carrossel de clientes: arrastável com mouse (inércia + snap), setas e teclado. Pode usar Embla Carousel (vanilla) ou JS simples; carregar só nessa seção.
- FAQ continua em `<details>` nativo.
- Contato: por enquanto `mailto:contato@kotharlabs.com` (prazo de resposta: 24 horas).
- SEO: title, description, Open Graph (`assets/social/og-image-1200x630.png`), favicons (`assets/favicon/`), `lang="pt-BR"`, sitemap, robots.txt.
- Acessibilidade: contraste AA, foco visível, `prefers-reduced-motion`.
- Meta: Lighthouse 95+ em todas as categorias (mobile).
- Build deve gerar `dist/` estático. Deploy: VPS com nginx ou Caddy servindo `dist/` (incluir exemplo de config e HTTPS).

## Tokens
Papel #F3EEE3 · Linho #E6DECB · Tinta #1C1B19 · Cobre #A4501F · Verde-garrafa #22342B · Forja #1E1A16 · Elevado #28231D · Osso #EAE2D0 · Bronze #D98F5C · Areia #A89F8C · Pedra #5C574D · fio-claro #CFC5AE · fio-escuro #3A332A
Fontes: Libre Caslon Text (títulos), IBM Plex Sans (texto), IBM Plex Mono (rótulos).

## Regras de marca (não quebrar)
- Logo: punção pentagonal com K, filete interno em cobre e 5 rebites; wordmark KOTHAR em Libre Caslon, espaçado ~0,3em. A versão com "— LABS —" é a oficial em cabeçalho, rodapé e peças formais. Nunca redesenhar o logo: usar os SVG de `assets/logos/`.
- Sem botões com formato de pentágono, sem cantos chanfrados, sem arredondamento exagerado. Botões retangulares simples.
- Baixo relevo (deboss) é a assinatura: realçado por sombra, não por cor.
- Drivou, Bemtevy e Bubu & Dudu aparecem como **clientes**, nunca como produtos da Kothar.
- Logos da Bemtevy e Bubu & Dudu são provisórios (SVG simples): trocar quando houver os originais.
- CNPJ ainda não existe: quando existir, entra na linha legal do rodapé.
