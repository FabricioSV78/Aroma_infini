import { heroDisplayOrder, heroSlides } from './home'
import type {
  HomeContent,
  HomeFilmContent,
  HomeFinderContent,
} from '../types/home'
import type { FinderResult, FinderStep } from '../types/fragrance-finder'
import { isManagedMediaSource, parseManagedVideoPath } from '../domain/media'
import { HERO_MAX_CAMPAIGNS, isHeroDestination } from '../domain/hero-content'
export type {
  HomeAnnouncementContent,
  HomeContent,
  HomeFilmContent,
  HomeFinderContent,
  HomeHeroContent,
  HomeHeroDestination,
} from '../types/home'

const defaultFilm: HomeFilmContent = {
  eyebrow: 'El ritual del perfume',
  title: 'Un gesto\nAlgo muy tuyo',
  description:
    'Hay pequeños momentos que cambian el día. Elegir un aroma, sentirlo en la piel y hacerlo parte de ti.',
  cta: 'Encuentra tu perfume',
  video: null,
  poster: null,
  mobileVideo: null,
  mobilePoster: null,
}

const previousSilenceAlt =
  'Frasco verde sobre un bloque de vidrio entre reflejos de luz'

const finderStepKeys: FinderStep[] = [
  'family',
  'occasion',
  'intensity',
  'budget',
]
const finderResultKeys: FinderResult['kind'][] = [
  'matches',
  'partial',
  'budget',
  'empty',
  'unavailable',
  'preferences',
]
const finderOptionKeys = ['family', 'occasion', 'intensity'] as const
const webpPrefix = 'data:image/webp;base64,'
const maxFinderOptionsPerStep = 30
const maxFinderBudgets = 6

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function isWebpDataUri(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(webpPrefix)) return false
  const encoded = value.slice(webpPrefix.length)
  return (
    encoded.length > 0 &&
    encoded.length <= 8_000_000 &&
    encoded.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
}

function webpOrNull(value: unknown): string | null {
  return typeof value === 'string' &&
    (isWebpDataUri(value) || isManagedMediaSource(value))
    ? value
    : null
}

function isHomeVideo(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('data:video/mp4;base64,') ||
      parseManagedVideoPath(value) !== null)
  )
}

function isStableFinderValue(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 100) return false
  if (['__proto__', 'constructor', 'prototype'].includes(value)) return false
  return (
    value ===
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function normalizeEnabledOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const selected = [...new Set(value.filter(isStableFinderValue))].slice(
    0,
    maxFinderOptionsPerStep,
  )
  return selected.length ? selected : null
}

function validFinderBudgets(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= maxFinderBudgets &&
    value.every(
      (budget: unknown) =>
        Number.isSafeInteger(budget) &&
        (budget as number) >= 1 &&
        (budget as number) <= 10_000,
    ) &&
    value.every(
      (budget: number, index: number) =>
        index === 0 || value[index - 1] < budget,
    )
  )
}

/** The built-in visuals remain fallbacks until a custom WebP is uploaded. */
export function createDefaultFinderContent(): HomeFinderContent {
  return {
    eyebrow: 'Tu aroma empieza aquí',
    title: 'Encuentra tu\nperfume ideal',
    description:
      'Cuatro elecciones sencillas. Perfumes disponibles que encajan con tus preferencias.',
    cta: 'Encontrar mi perfume',
    desktopImage: null,
    mobileImage: null,
    entryLabel: 'Tu primera elección',
    entryQuestion: '¿Qué aroma te atrae?',
    modalTitle: 'Encuentra tu perfume ideal',
    steps: {
      family: {
        label: 'Aroma',
        question: '¿Qué aroma te atrae más?',
        description:
          'Elige una dirección para empezar. No necesitas conocer las notas.',
      },
      occasion: {
        label: 'Momento',
        question: '¿Cuándo te gustaría llevarlo?',
        description:
          'Piensa en el momento para el que estás buscando un perfume.',
      },
      intensity: {
        label: 'Presencia',
        question: '¿Qué intensidad prefieres?',
        description:
          'Usamos la intensidad indicada en cada ficha; no equivale a horas de duración.',
      },
      budget: {
        label: 'Presupuesto',
        question: '¿Cuánto te gustaría invertir?',
        description:
          'Buscaremos una presentación disponible dentro de ese importe.',
      },
    },
    optionLabels: { family: {}, occasion: {}, intensity: {} },
    enabledOptions: { family: null, occasion: null, intensity: null },
    familyVisuals: {
      amaderado: { description: 'La dirección de las maderas', image: null },
      floral: { description: 'La dirección de las flores', image: null },
      verde: { description: 'Una dirección vegetal', image: null },
      citrico: { description: 'La dirección de los cítricos', image: null },
      ambar: { description: 'La dirección ambarada', image: null },
    },
    noPreferenceLabel: 'Sin preferencia',
    budgets: [400, 500, 650],
    budgetNoLimitLabel: 'Sin límite de presupuesto',
    resultCopy: {
      matches: {
        title: 'Perfumes que encajan contigo',
        description:
          'Coinciden con las preferencias que elegiste. Estas presentaciones tienen stock disponible.',
      },
      partial: {
        title: 'Cerca de lo que buscas',
        description:
          'No hay una coincidencia completa. Explora estas opciones cercanas a lo que elegiste.',
      },
      budget: {
        title: 'Dentro de tu presupuesto',
        description:
          'Elegiste solo un presupuesto. Estas son las presentaciones disponibles de menor precio; puedes afinar tu búsqueda indicando un aroma.',
      },
      empty: {
        title: 'Todavía no encontramos esa combinación',
        description:
          'No hay perfumes disponibles para esas preferencias y ese presupuesto. Puedes cambiar tus respuestas o explorar la tienda.',
      },
      unavailable: {
        title: 'No hay perfumes disponibles ahora',
        description:
          'El catálogo no tiene presentaciones con stock para recomendar. Puedes volver a intentarlo más adelante.',
      },
      preferences: {
        title: 'Danos una pista para empezar',
        description:
          'Elige al menos un aroma, un momento, una intensidad o un presupuesto. Así podremos orientarte con una razón concreta.',
      },
    },
    singleResultTitle: 'Tu perfume recomendado',
  }
}

function normalizeFinderContent(
  value: unknown,
  preserveRemoteContent = false,
): HomeFinderContent {
  const defaults = createDefaultFinderContent()
  if (!isRecord(value)) return defaults
  const steps = isRecord(value.steps) ? value.steps : {}
  const optionLabels = isRecord(value.optionLabels) ? value.optionLabels : {}
  const enabledOptions = isRecord(value.enabledOptions)
    ? value.enabledOptions
    : {}
  const familyVisuals = isRecord(value.familyVisuals) ? value.familyVisuals : {}
  const resultCopy = isRecord(value.resultCopy) ? value.resultCopy : {}
  const budgetValues = value.budgets
  const budgets: HomeFinderContent['budgets'] = validFinderBudgets(budgetValues)
    ? [...budgetValues]
    : defaults.budgets

  return {
    eyebrow: textOrDefault(value.eyebrow, defaults.eyebrow),
    title: textOrDefault(value.title, defaults.title),
    description: textOrDefault(value.description, defaults.description),
    cta: textOrDefault(value.cta, defaults.cta),
    desktopImage: webpOrNull(value.desktopImage),
    mobileImage: webpOrNull(value.mobileImage),
    entryLabel: textOrDefault(value.entryLabel, defaults.entryLabel),
    entryQuestion: textOrDefault(value.entryQuestion, defaults.entryQuestion),
    modalTitle: textOrDefault(value.modalTitle, defaults.modalTitle),
    steps: Object.fromEntries(
      finderStepKeys.map((key) => {
        const saved = isRecord(steps[key]) ? steps[key] : {}
        const original = defaults.steps[key]
        return [
          key,
          {
            label: textOrDefault(saved.label, original.label),
            question: textOrDefault(saved.question, original.question),
            description: textOrDefault(saved.description, original.description),
          },
        ]
      }),
    ) as HomeFinderContent['steps'],
    optionLabels: Object.fromEntries(
      finderOptionKeys.map((key) => [
        key,
        Object.fromEntries(
          Object.entries(isRecord(optionLabels[key]) ? optionLabels[key] : {})
            .filter(
              ([stableValue, label]) =>
                stableValue.length > 0 &&
                stableValue.length <= 100 &&
                typeof label === 'string',
            )
            .map(([stableValue, label]) => [stableValue, label]),
        ),
      ]),
    ) as HomeFinderContent['optionLabels'],
    enabledOptions: Object.fromEntries(
      finderOptionKeys.map((key) => [
        key,
        normalizeEnabledOptions(enabledOptions[key]),
      ]),
    ) as HomeFinderContent['enabledOptions'],
    familyVisuals: Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(preserveRemoteContent ? {} : defaults.familyVisuals),
          ...Object.keys(familyVisuals),
        ]),
      ]
        .filter((key) => key.length > 0 && key.length <= 100)
        .map((key) => {
          const saved = isRecord(familyVisuals[key]) ? familyVisuals[key] : {}
          const original = defaults.familyVisuals[key]
          return [
            key,
            {
              description: textOrDefault(
                saved.description,
                original?.description ?? '',
              ),
              image: webpOrNull(saved.image),
            },
          ]
        }),
    ),
    noPreferenceLabel: textOrDefault(
      value.noPreferenceLabel,
      defaults.noPreferenceLabel,
    ),
    budgets,
    budgetNoLimitLabel: textOrDefault(
      value.budgetNoLimitLabel,
      defaults.budgetNoLimitLabel,
    ),
    resultCopy: Object.fromEntries(
      finderResultKeys.map((key) => {
        const saved = isRecord(resultCopy[key]) ? resultCopy[key] : {}
        const original = defaults.resultCopy[key]
        return [
          key,
          {
            title: textOrDefault(saved.title, original.title),
            description: textOrDefault(saved.description, original.description),
          },
        ]
      }),
    ) as HomeFinderContent['resultCopy'],
    singleResultTitle: textOrDefault(
      value.singleResultTitle,
      defaults.singleResultTitle,
    ),
  }
}

const legacyHeroKeys = [
  'alt',
  'cta',
  'description',
  'desktopImage',
  'eyebrow',
  'mobileImage',
  'title',
]

/** Only the exact old seven-field contract is upgraded; unknown fields remain errors. */
export function upgradeLegacyHeroContent(value: unknown): unknown {
  if (
    !Array.isArray(value) ||
    value.length !== heroSlides.length ||
    !value.every(
      (slide) =>
        isRecord(slide) &&
        Object.keys(slide).sort().join(',') === legacyHeroKeys.join(','),
    )
  )
    return value
  return value.map((slide, index) => ({
    ...slide,
    id: `campaign-${index}`,
    fallbackIndex: index,
    order: heroDisplayOrder.findIndex((sourceIndex) => sourceIndex === index),
    mediaType: 'image',
    video: null,
    mobileVideo: null,
    poster: null,
    mobilePoster: null,
    showText: true,
    showButton: true,
    published: true,
    destination: { type: 'shop' },
  }))
}

export function createDefaultHomeContent(): HomeContent {
  return {
    featuredBrandId: 'atelier',
    announcement: {
      deliveryText: 'Envíos en Lima y Callao',
      freeShippingLabel: 'Gratis desde',
    },
    hero: heroSlides.map((slide, index) => ({
      id: `campaign-${index}`,
      fallbackIndex: index,
      order: heroDisplayOrder.findIndex((sourceIndex) => sourceIndex === index),
      mediaType: 'image',
      video: null,
      mobileVideo: null,
      poster: null,
      mobilePoster: null,
      showText: true,
      showButton: true,
      published: true,
      destination: { type: 'shop' },
      eyebrow: slide.eyebrow,
      title: slide.title.join('\n'),
      description: slide.description,
      cta: slide.cta,
      alt: slide.alt,
      desktopImage: null,
      mobileImage: null,
    })),
    film: { ...defaultFilm },
    finder: createDefaultFinderContent(),
  }
}

export function normalizeHomeContent(
  value: unknown,
  { preserveRemoteContent = false }: { preserveRemoteContent?: boolean } = {},
): HomeContent {
  const defaults = createDefaultHomeContent()
  if (!value || typeof value !== 'object') return defaults
  const content = value as Partial<HomeContent>
  const sourceHero = Array.isArray(content.hero) ? content.hero : []
  return {
    featuredBrandId:
      content.featuredBrandId === null
        ? null
        : typeof content.featuredBrandId === 'string'
          ? content.featuredBrandId.trim() || null
          : defaults.featuredBrandId,
    announcement: {
      deliveryText:
        typeof content.announcement?.deliveryText === 'string'
          ? content.announcement.deliveryText
          : defaults.announcement.deliveryText,
      freeShippingLabel:
        typeof content.announcement?.freeShippingLabel === 'string'
          ? content.announcement.freeShippingLabel
          : defaults.announcement.freeShippingLabel,
    },
    hero: (Array.isArray(content.hero) ? sourceHero : defaults.hero).map(
      (candidate, index) => {
        const fallback =
          isRecord(candidate) && typeof candidate.fallbackIndex === 'number'
            ? candidate.fallbackIndex
            : index
        const slide = defaults.hero[fallback] ?? defaults.hero[0]
        if (!candidate || typeof candidate !== 'object') return slide
        return {
          id:
            typeof candidate.id === 'string'
              ? candidate.id
              : `campaign-${index}`,
          fallbackIndex:
            candidate.fallbackIndex === null ||
            typeof candidate.fallbackIndex === 'number'
              ? candidate.fallbackIndex
              : index,
          order:
            typeof candidate.order === 'number'
              ? candidate.order
              : heroDisplayOrder.findIndex(
                  (sourceIndex) => sourceIndex === index,
                ),
          mediaType: candidate.mediaType === 'video' ? 'video' : 'image',
          video: isHomeVideo(candidate.video) ? candidate.video : null,
          mobileVideo: isHomeVideo(candidate.mobileVideo)
            ? candidate.mobileVideo
            : null,
          poster: webpOrNull(candidate.poster),
          mobilePoster: webpOrNull(candidate.mobilePoster),
          showText: candidate.showText !== false,
          showButton: candidate.showButton !== false,
          published: candidate.published !== false,
          destination: isHeroDestination(candidate.destination)
            ? candidate.destination
            : { type: 'shop' },
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
          cta:
            typeof candidate.cta === 'string' &&
            (preserveRemoteContent ||
              candidate.cta.trim().toLocaleLowerCase('es') !== 'ver destacados')
              ? candidate.cta
              : slide.cta,
          alt:
            !preserveRemoteContent &&
            fallback === 1 &&
            candidate.alt === previousSilenceAlt
              ? slide.alt
              : typeof candidate.alt === 'string'
                ? candidate.alt
                : slide.alt,
          desktopImage: webpOrNull(candidate.desktopImage),
          mobileImage: webpOrNull(candidate.mobileImage),
        }
      },
    ),
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
      video: isHomeVideo(content.film?.video) ? content.film.video : null,
      poster: webpOrNull(content.film?.poster),
      mobileVideo: isHomeVideo(content.film?.mobileVideo)
        ? content.film.mobileVideo
        : null,
      mobilePoster: webpOrNull(content.film?.mobilePoster),
    },
    finder: normalizeFinderContent(content.finder, preserveRemoteContent),
  }
}

export function validateHomeContent(
  content: HomeContent,
  { allowEmptyHero = false }: { allowEmptyHero?: boolean } = {},
): string | null {
  if (
    content.hero.length < (allowEmptyHero ? 0 : 1) ||
    content.hero.length > HERO_MAX_CAMPAIGNS
  )
    return 'El carrusel admite entre una y diez campañas.'
  if (
    new Set(content.hero.map((slide) => slide.id)).size !==
      content.hero.length ||
    new Set(content.hero.map((slide) => slide.order)).size !==
      content.hero.length
  )
    return 'Las campañas deben tener identificadores y posiciones únicos.'
  for (const slide of content.hero) {
    const number = slide.order + 1
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(slide.id) ||
      !Number.isSafeInteger(slide.order) ||
      slide.order < 0 ||
      slide.order >= HERO_MAX_CAMPAIGNS ||
      (slide.fallbackIndex !== null &&
        (!Number.isSafeInteger(slide.fallbackIndex) ||
          slide.fallbackIndex < 0 ||
          slide.fallbackIndex >= heroSlides.length)) ||
      !['image', 'video'].includes(slide.mediaType) ||
      [slide.showText, slide.showButton, slide.published].some(
        (value) => typeof value !== 'boolean',
      ) ||
      !isHeroDestination(slide.destination)
    )
      return `Campaña ${number}: revisa su configuración y destino.`
    for (const [name, value, max, required] of [
      ['Etiqueta', slide.eyebrow, 60, false],
      ['Título', slide.title, 90, slide.published && slide.showText],
      ['Descripción', slide.description, 180, false],
      ['Botón', slide.cta, 45, slide.published && slide.showButton],
      [
        'Descripción de imagen',
        slide.alt,
        160,
        slide.published && slide.mediaType === 'image',
      ],
    ] as const) {
      if (typeof value !== 'string' || (required && !value.trim()))
        return `${name} de campaña ${number}: completa este campo.`
      if (value.length > max)
        return `${name} de campaña ${number}: máximo ${max} caracteres.`
    }
    if (
      slide.title &&
      (slide.title.split('\n').length > 3 ||
        slide.title.split('\n').some((line) => !line.trim()))
    )
      return `Título de campaña ${number}: admite de una a tres líneas con texto.`
    if (
      slide.published &&
      slide.mediaType === 'video' &&
      (!slide.video || !slide.poster)
    )
      return `Campaña ${number}: selecciona un video y su portada antes de publicarla.`
    if (
      slide.published &&
      slide.mediaType === 'image' &&
      slide.fallbackIndex === null &&
      !slide.desktopImage
    )
      return `Campaña ${number}: selecciona una imagen antes de publicarla.`
    if (slide.mobileVideo && !slide.mobilePoster)
      return `Campaña ${number}: el video móvil necesita su portada.`
    if (
      [slide.video, slide.mobileVideo].some(
        (video) => video !== null && !isHomeVideo(video),
      )
    )
      return `Campaña ${number}: el video debe ser MP4.`
    if (
      [slide.poster, slide.mobilePoster].some(
        (poster) => poster !== null && webpOrNull(poster) === null,
      )
    )
      return `Campaña ${number}: la portada no tiene un formato válido.`
  }

  const fields: { name: string; value: string; max: number }[] = []
  fields.push(
    {
      name: 'Mensaje de entrega de la franja superior',
      value: content.announcement.deliveryText,
      max: 70,
    },
    {
      name: 'Texto de envío gratis de la franja superior',
      value: content.announcement.freeShippingLabel,
      max: 40,
    },
    { name: 'Etiqueta del video', value: content.film.eyebrow, max: 60 },
    { name: 'Título del video', value: content.film.title, max: 90 },
    { name: 'Texto del video', value: content.film.description, max: 300 },
    { name: 'Botón del video', value: content.film.cta, max: 45 },
    {
      name: 'Etiqueta del recomendador',
      value: content.finder.eyebrow,
      max: 60,
    },
    { name: 'Título del recomendador', value: content.finder.title, max: 90 },
    {
      name: 'Descripción del recomendador',
      value: content.finder.description,
      max: 180,
    },
    { name: 'Botón del recomendador', value: content.finder.cta, max: 45 },
    {
      name: 'Etiqueta de la primera pregunta',
      value: content.finder.entryLabel,
      max: 60,
    },
    { name: 'Primera pregunta', value: content.finder.entryQuestion, max: 100 },
    {
      name: 'Título del cuestionario',
      value: content.finder.modalTitle,
      max: 90,
    },
    {
      name: 'Opción sin preferencia',
      value: content.finder.noPreferenceLabel,
      max: 50,
    },
    {
      name: 'Opción sin límite de presupuesto',
      value: content.finder.budgetNoLimitLabel,
      max: 60,
    },
    {
      name: 'Título del resultado individual',
      value: content.finder.singleResultTitle,
      max: 100,
    },
  )
  for (const key of finderStepKeys) {
    const step = content.finder.steps[key]
    fields.push(
      { name: `Etiqueta del paso ${key}`, value: step.label, max: 40 },
      { name: `Pregunta del paso ${key}`, value: step.question, max: 100 },
      { name: `Ayuda del paso ${key}`, value: step.description, max: 220 },
    )
  }
  for (const key of finderResultKeys) {
    const result = content.finder.resultCopy[key]
    fields.push(
      { name: `Título del resultado ${key}`, value: result.title, max: 100 },
      {
        name: `Descripción del resultado ${key}`,
        value: result.description,
        max: 300,
      },
    )
  }
  for (const { name, value, max } of fields) {
    if (!value.trim()) return `${name}: completa este campo.`
    if (value.length > max) return `${name}: máximo ${max} caracteres.`
  }
  if (
    content.film.title.split('\n').length > 2 ||
    content.film.title.split('\n').some((line) => !line.trim())
  )
    return 'El título del video admite una o dos líneas con texto.'
  if (
    content.finder.title.split('\n').length > 2 ||
    content.finder.title.split('\n').some((line) => !line.trim())
  )
    return 'El título del recomendador admite una o dos líneas con texto.'
  if (/^\s*\d+\s*\/\s*\d+\b/.test(content.finder.entryLabel))
    return 'La etiqueta de la primera pregunta no debe incluir el progreso 1/4; se muestra automáticamente.'
  if (
    content.hero.some((slide) =>
      [slide.desktopImage, slide.mobileImage].some(
        (image) => image !== null && webpOrNull(image) === null,
      ),
    )
  )
    return 'Una imagen del carrusel no tiene un formato válido.'
  if (
    [content.film.video, content.film.mobileVideo].some(
      (video) => video != null && !isHomeVideo(video),
    )
  )
    return 'El video editorial debe ser MP4.'
  if (
    [content.film.poster, content.film.mobilePoster].some(
      (poster) => poster != null && webpOrNull(poster) === null,
    )
  )
    return 'La vista previa del video no tiene un formato válido.'
  if (
    [content.finder.desktopImage, content.finder.mobileImage].some(
      (image) => image !== null && webpOrNull(image) === null,
    )
  )
    return 'Una imagen del recomendador no tiene un formato WebP válido.'
  for (const [family, visual] of Object.entries(content.finder.familyVisuals)) {
    if (!family || family.length > 100)
      return 'Una familia aromática tiene una clave inválida.'
    if (visual.description.length > 90)
      return `Texto de apoyo de ${family}: máximo 90 caracteres.`
    if (visual.image !== null && webpOrNull(visual.image) === null)
      return `Imagen de ${family}: el archivo debe ser WebP válido.`
  }
  for (const key of finderOptionKeys) {
    const enabled = content.finder.enabledOptions[key]
    if (enabled !== null) {
      if (!Array.isArray(enabled) || enabled.length < 1)
        return `Activa al menos una opción de ${key} para que la pregunta pueda responderse.`
      if (enabled.length > maxFinderOptionsPerStep)
        return `El paso ${key} admite como máximo ${maxFinderOptionsPerStep} opciones.`
      if (enabled.some((value) => !isStableFinderValue(value)))
        return `Una opción activa de ${key} tiene una clave inválida.`
      if (new Set(enabled).size !== enabled.length)
        return `Hay opciones activas duplicadas en ${key}.`
    }
    for (const [stableValue, label] of Object.entries(
      content.finder.optionLabels[key],
    )) {
      if (!stableValue || stableValue.length > 100)
        return `Una opción de ${key} tiene una clave inválida.`
      if (!label.trim()) return `Opción de ${key}: completa el nombre.`
      if (label.length > 60) return `Opción de ${key}: máximo 60 caracteres.`
    }
  }
  if (!validFinderBudgets(content.finder.budgets))
    return 'Los presupuestos deben ser entre uno y seis montos enteros en soles, sin duplicados y de menor a mayor (entre S/ 1 y S/ 10 000).'
  return null
}
