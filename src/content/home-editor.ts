import { heroSlides } from './home'

export interface HomeHeroContent {
  eyebrow: string
  title: string
  description: string
  cta: string
  alt: string
  desktopImage: string | null
  mobileImage: string | null
}

export interface HomeFilmContent {
  eyebrow: string
  title: string
  description: string
  cta: string
  video: string | null
  poster: string | null
}

export interface HomeContent {
  hero: HomeHeroContent[]
  film: HomeFilmContent
}

const defaultFilm: HomeFilmContent = {
  eyebrow: 'El ritual del perfume',
  title: 'Un gesto.\nAlgo muy tuyo.',
  description:
    'Hay pequeños momentos que cambian el día. Elegir un aroma, sentirlo en la piel y hacerlo parte de ti.',
  cta: 'Encuentra tu perfume',
  video: null,
  poster: null,
}

export function createDefaultHomeContent(): HomeContent {
  return {
    hero: heroSlides.map((slide) => ({
      eyebrow: slide.eyebrow,
      title: slide.title.join('\n'),
      description: slide.description,
      cta: slide.cta,
      alt: slide.alt,
      desktopImage: null,
      mobileImage: null,
    })),
    film: { ...defaultFilm },
  }
}

export function normalizeHomeContent(value: unknown): HomeContent {
  const defaults = createDefaultHomeContent()
  if (!value || typeof value !== 'object') return defaults
  const content = value as Partial<HomeContent>
  const sourceHero = Array.isArray(content.hero) ? content.hero : []
  return {
    hero: defaults.hero.map((slide, index) => {
      const candidate = sourceHero[index]
      if (!candidate || typeof candidate !== 'object') return slide
      return {
        eyebrow:
          typeof candidate.eyebrow === 'string'
            ? candidate.eyebrow
            : slide.eyebrow,
        title:
          typeof candidate.title === 'string' ? candidate.title : slide.title,
        description:
          typeof candidate.description === 'string'
            ? candidate.description
            : slide.description,
        cta: typeof candidate.cta === 'string' ? candidate.cta : slide.cta,
        alt: typeof candidate.alt === 'string' ? candidate.alt : slide.alt,
        desktopImage:
          typeof candidate.desktopImage === 'string' &&
          candidate.desktopImage.startsWith('data:image/webp;base64,')
            ? candidate.desktopImage
            : null,
        mobileImage:
          typeof candidate.mobileImage === 'string' &&
          candidate.mobileImage.startsWith('data:image/webp;base64,')
            ? candidate.mobileImage
            : null,
      }
    }),
    film: {
      eyebrow:
        typeof content.film?.eyebrow === 'string'
          ? content.film.eyebrow
          : defaults.film.eyebrow,
      title:
        typeof content.film?.title === 'string'
          ? content.film.title
          : defaults.film.title,
      description:
        typeof content.film?.description === 'string'
          ? content.film.description
          : defaults.film.description,
      cta:
        typeof content.film?.cta === 'string'
          ? content.film.cta
          : defaults.film.cta,
      video:
        typeof content.film?.video === 'string' &&
        content.film.video.startsWith('data:video/mp4;base64,')
          ? content.film.video
          : null,
      poster:
        typeof content.film?.poster === 'string' &&
        content.film.poster.startsWith('data:image/webp;base64,')
          ? content.film.poster
          : null,
    },
  }
}

export function validateHomeContent(content: HomeContent): string | null {
  if (content.hero.length !== heroSlides.length)
    return 'El carrusel debe conservar sus cinco campañas.'

  const fields = content.hero.flatMap((slide, index) => [
    { name: `Etiqueta de campaña ${index + 1}`, value: slide.eyebrow, max: 60 },
    { name: `Título de campaña ${index + 1}`, value: slide.title, max: 90 },
    {
      name: `Descripción de campaña ${index + 1}`,
      value: slide.description,
      max: 180,
    },
    { name: `Botón de campaña ${index + 1}`, value: slide.cta, max: 45 },
    { name: `Descripción de imagen ${index + 1}`, value: slide.alt, max: 160 },
  ])
  fields.push(
    { name: 'Etiqueta del video', value: content.film.eyebrow, max: 60 },
    { name: 'Título del video', value: content.film.title, max: 90 },
    { name: 'Texto del video', value: content.film.description, max: 300 },
    { name: 'Botón del video', value: content.film.cta, max: 45 },
  )
  for (const { name, value, max } of fields) {
    if (!value.trim()) return `${name}: completa este campo.`
    if (value.length > max) return `${name}: máximo ${max} caracteres.`
  }
  if (
    content.hero.some(
      (slide) =>
        slide.title.split('\n').length > 3 ||
        slide.title.split('\n').some((line) => !line.trim()),
    )
  )
    return 'Cada título del carrusel admite de una a tres líneas con texto.'
  if (
    content.film.title.split('\n').length > 2 ||
    content.film.title.split('\n').some((line) => !line.trim())
  )
    return 'El título del video admite una o dos líneas con texto.'
  if (
    content.hero.some((slide) =>
      [slide.desktopImage, slide.mobileImage].some(
        (image) =>
          image !== null && !image.startsWith('data:image/webp;base64,'),
      ),
    )
  )
    return 'Una imagen del carrusel no tiene un formato válido.'
  if (
    content.film.video &&
    !content.film.video.startsWith('data:video/mp4;base64,')
  )
    return 'El video editorial debe ser MP4.'
  if (
    content.film.poster &&
    !content.film.poster.startsWith('data:image/webp;base64,')
  )
    return 'La vista previa del video no tiene un formato válido.'
  return null
}
