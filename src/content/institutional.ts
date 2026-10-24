// Textos y datos editables de Nosotros y Contacto.
// El relato de origen de Nosotros es provisional, autorizado por el cliente
// mientras se confirma la historia real de la marca. Sustituirlo antes de publicar.
export const aboutPageContent = {
  hero: {
    eyebrow: 'Aroma Infini · Perfumería multimarca',
    title: 'Distintas casas. Un perfume que sientas tuyo',
    introduction:
      'Un lugar donde mirar más allá del frasco y reconocer lo que te gusta.',
    image: {
      desktop: '/images/editorial-essential-v3-1536.webp',
      desktopSet:
        '/images/editorial-essential-v3-480.webp 480w, /images/editorial-essential-v3-960.webp 960w, /images/editorial-essential-v3-1536.webp 1536w',
      mobileSet:
        '/images/editorial-essential-v3-mobile-480.webp 480w, /images/editorial-essential-v3-mobile-780.webp 780w',
      alt: 'Frasco de perfume sobre piedra clara, junto a una pieza de madera.',
    },
  },
  story: {
    eyebrow: 'Nuestra historia',
    title: 'La curiosidad como punto de partida',
    paragraphs: [
      'Aroma Infini nace de una idea sencilla: elegir un perfume puede ser tan personal como llevarlo. Queríamos que la búsqueda comenzara por la curiosidad, no por una respuesta predeterminada.',
      'Por eso reunimos distintas firmas en un mismo lugar y dejamos espacio para explorar sus matices con calma. Cada persona reconoce algo diferente en un aroma; esa diferencia es parte del encanto.',
    ],
    image: {
      src: '/images/olfactory-santal.webp',
      alt: 'Virutas de madera y vainas de cardamomo sobre una superficie de piedra.',
    },
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

export interface ContactDetails {
  // Número internacional confirmado, sin símbolos. Cambia solo este dato cuando corresponda.
  whatsappNumber: string | null
  email: string | null
  hours: string | null
  socialLinks: { label: string; url: string }[]
}

export const contactDetails: ContactDetails = {
  whatsappNumber: '51955565209', // Número provisional proporcionado por el propietario.
  email: null,
  hours: null,
  socialLinks: [],
}
