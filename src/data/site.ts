export const SITE = {
  nome: 'Kothar Labs',
  url: 'https://kotharlabs.com',
  email: 'contato@kotharlabs.com',
  // número de WhatsApp do Drivou, que também atende a Kothar
  whatsapp: { numero: '5532935053115', exibicao: '(32) 93505-3115', schema: '+55-32-93505-3115' },
  titulo: 'Kothar Labs · Software sob medida para startups e empresas',
  descricao: 'Software sob medida para startups e empresas. MVP, sistemas internos e consultoria técnica. Preço antes de começar, código seu.',
} as const;

export const whatsapp = `https://wa.me/${SITE.whatsapp.numero}`;

export const mailto = (assunto?: string) =>
  `mailto:${SITE.email}${assunto ? `?subject=${encodeURIComponent(assunto)}` : ''}`;
