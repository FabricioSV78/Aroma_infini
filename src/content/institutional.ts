// Textos y datos editables de Nosotros y Contacto.
// El contenido describe la propuesta actual; no atribuye una historia de origen
// o un proceso de fabricación que el negocio no haya confirmado.
export const aboutPageContent = {
  hero: {
    eyebrow: 'Aroma Infini · Perfumería multimarca',
    title: 'Distintas casas. Un perfume que sientas tuyo',
    introduction:
      'Un lugar donde mirar más allá del frasco y reconocer lo que te gusta.',
  },
  story: {
    eyebrow: 'Nuestra esencia',
    title: 'Distintos aromas, una elección personal',
    paragraphs: [
      'Somos una perfumería multimarca: un espacio para descubrir perfumes de distintas casas y reconocer los aromas que conectan contigo.',
      'Explora perfiles, presentaciones y precios a tu ritmo. La información de cada producto y el recomendador te ayudan a comparar opciones según tus preferencias.',
    ],
  },
  proposal: {
    eyebrow: 'Nuestra propuesta',
    title: 'Un espacio para elegir con criterio',
    description:
      'Cada ficha reúne el perfil del perfume, sus presentaciones, precio y disponibilidad. Puedes recorrer el catálogo a tu ritmo y volver a las opciones que más te interesen.',
    primaryAction: 'Explorar perfumes',
    secondaryAction: 'Conocer las marcas',
  },
} as const

export const contactPageContent = {
  title: 'Contacto',
  introduction:
    'Estamos para ayudarte con tu pedido, una entrega o un perfume.',
  direct: {
    eyebrow: 'Atención directa',
    title: 'Hablemos por WhatsApp',
    description: 'Si preguntas por una compra, incluye tu código de pedido.',
    action: 'Escribir por WhatsApp',
  },
  guide: {
    title: 'Accesos rápidos',
  },
  topics: [
    { title: 'Seguir pedido', to: '/seguir-pedido' },
    { title: 'Envíos y entregas', to: '/envios' },
  ],
} as const
