// Textos y datos editables de Nosotros y Contacto.
export const aboutPageContent = {
  title: 'Aroma Infini, una forma de elegir perfume.',
  introduction:
    'Reunimos perfumes de distintas casas para que conozcas sus notas, perfiles y presentaciones con calma.',
  image: {
    desktop: '/images/editorial-essential-v3-1536.webp',
    desktopSet:
      '/images/editorial-essential-v3-480.webp 480w, /images/editorial-essential-v3-960.webp 960w, /images/editorial-essential-v3-1536.webp 1536w',
    mobileSet:
      '/images/editorial-essential-v3-mobile-480.webp 480w, /images/editorial-essential-v3-mobile-780.webp 780w',
    alt: 'Frasco de perfume sobre una superficie de piedra junto a una pieza de madera.',
    caption: 'Aroma Infini',
  },
  approach: {
    eyebrow: 'Nuestra propuesta',
    title: 'Información para decidir.',
    description:
      'Cada ficha explica cómo se siente el perfume y muestra sus opciones de compra.',
  },
  principles: [
    {
      number: '01',
      title: 'Explora',
      description: 'Conoce las casas y sus colecciones.',
    },
    {
      number: '02',
      title: 'Compara',
      description: 'Compara notas, intensidad, tamaños y precios.',
    },
    {
      number: '03',
      title: 'Elige a tu ritmo',
      description: 'Guarda tus favoritos y vuelve cuando quieras.',
    },
  ],
  action: 'Explorar perfumes',
} as const

export const contactPageContent = {
  title: '¿En qué podemos ayudarte?',
  introduction:
    'Consulta información de pedidos, envíos o productos, o escríbenos por WhatsApp.',
  direct: {
    eyebrow: 'Atención directa',
    title: 'Hablemos por WhatsApp.',
    description: 'Si preguntas por una compra, incluye tu código de pedido.',
    action: 'Escribir por WhatsApp',
  },
  guide: {
    eyebrow: 'Enlaces útiles',
    title: 'Ve directo a la información.',
  },
  topics: [
    { title: 'Elegir un perfume', to: '/tienda' },
    { title: 'Seguir un pedido', to: '/seguir-pedido' },
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
