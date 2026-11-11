// Bootstrap references only. Preserve these original bytes and compositions
// when importing the catalogue into managed storage; never re-crop defaults.
export const siteMediaDefaults = {
  'about.hero.desktop': {
    src: '/images/editorial-essential-v3-1536.webp',
    srcSet:
      '/images/editorial-essential-v3-480.webp 480w, /images/editorial-essential-v3-960.webp 960w, /images/editorial-essential-v3-1536.webp 1536w',
    width: 1536,
    height: 864,
    alt: 'Frasco de perfume sobre piedra clara, junto a una pieza de madera.',
  },
  'about.hero.mobile': {
    src: '/images/editorial-essential-v3-mobile-780.webp',
    srcSet:
      '/images/editorial-essential-v3-mobile-480.webp 480w, /images/editorial-essential-v3-mobile-780.webp 780w',
    width: 780,
    height: 858,
    alt: 'Frasco de perfume sobre piedra clara, junto a una pieza de madera.',
  },
  'about.story': {
    src: '/images/olfactory-santal.webp',
    width: 960,
    height: 1200,
    alt: 'Virutas de madera y vainas de cardamomo sobre una superficie de piedra.',
  },
  'auth.customer.desktop': {
    src: '/images/account-selection-v1-portrait-1024.webp',
    srcSet:
      '/images/account-selection-v1-portrait-480.webp 480w, /images/account-selection-v1-portrait-780.webp 780w, /images/account-selection-v1-portrait-1024.webp 1024w',
    width: 1024,
    height: 1536,
    alt: '',
  },
  'auth.customer.mobile': {
    src: '/images/account-selection-v1-wide-1536.webp',
    srcSet:
      '/images/account-selection-v1-wide-960.webp 960w, /images/account-selection-v1-wide-1536.webp 1536w',
    width: 1536,
    height: 512,
    alt: '',
  },
  'identity.logo': {
    src: '/brand/logo-on-light.svg',
    width: 774,
    height: 374,
    alt: 'Aroma Infini',
  },
  'seo.home': {
    src: '/images/hero-v2-lumiere-desktop-1536.webp',
    width: 1536,
    height: 864,
    alt: 'Universo editorial de Aroma Infini',
  },
  'seo.catalog': {
    src: '/images/featured-duo-v3-1536.webp',
    width: 1448,
    height: 1086,
    alt: 'Selección de perfumes de Aroma Infini',
  },
  'seo.brands': {
    src: '/images/discovery-bois-1536.webp',
    width: 1536,
    height: 2304,
    alt: 'Selección de marcas de Aroma Infini',
  },
} as const
