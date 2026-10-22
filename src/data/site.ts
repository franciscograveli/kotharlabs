export const SITE = {
  nome: 'Kothar Labs',
  url: 'https://kotharlabs.com',
  email: 'contato@kotharlabs.com',
  titulo: 'Kothar Labs · Software sob medida para startups e empresas',
  descricao: 'Software sob medida para startups e empresas. MVP, sistemas internos e consultoria técnica. Preço antes de começar, código seu.',
} as const;

export const mailto = (assunto?: string) =>
  `mailto:${SITE.email}${assunto ? `?subject=${encodeURIComponent(assunto)}` : ''}`;
