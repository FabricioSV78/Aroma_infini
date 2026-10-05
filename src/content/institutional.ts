// Textos y datos editables de Nosotros y Contacto.
export const aboutPageContent = {
  title: 'El perfume se descubre a tu manera.',
  introduction:
    'En Aroma Infini reunimos fragancias para que explores, compares y elijas a tu propio ritmo.',
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
    title: 'Explora. Compara. Elige.',
    description:
      'Presentamos cada fragancia con la información esencial para ayudarte a encontrar la que va contigo.',
  },
  principles: [
    {
      number: '01',
      title: 'Explora',
      description: 'Descubre marcas, familias olfativas y notas.',
    },
    {
      number: '02',
      title: 'Compara',
      description: 'Revisa el perfil, la presentación y el precio.',
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
    'Escríbenos tu duda o encuentra rápidamente la información que necesitas.',
  direct: {
    eyebrow: 'Atención directa',
    title: 'Hablemos por WhatsApp.',
    description: 'Cuéntanos qué necesitas. Te responderemos por este canal.',
    action: 'Escribir por WhatsApp',
  },
  guide: {
    eyebrow: 'Enlaces útiles',
    title: 'Encuentra lo que necesitas.',
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
