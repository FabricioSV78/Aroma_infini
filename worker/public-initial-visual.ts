import inventory from '../public/media-default-inventory.json' with { type: 'json' }
import {
  getHeroFallback,
  orderedHeroContent,
  resolveHeroDestination,
} from '../src/domain/hero-content'
import {
  HERO_DESKTOP_WIDTHS,
  HERO_MOBILE_WIDTHS,
  heroVisualQueries,
  heroVisualSources,
} from '../src/domain/hero-visuals'
import { managedImageCandidates } from '../src/domain/managed-image-candidates'
import {
  parseManagedMediaAsset,
  parseManagedMediaPath,
  type ManagedMediaAsset,
} from '../src/domain/media'
import { headingText } from '../src/utils/heading-text'
import {
  getVariantPrice,
  validateProductDiscount,
  type VariantPrice,
} from '../src/services/product-discounts'
import { formatPEN } from '../src/services/currency'
import { getProductPresentation } from '../src/services/product-presentation'
import { isPerfume, variantLabel } from '../src/domain/product-type'
import { PRODUCT_CARD_IMAGE_SIZES } from '../src/domain/product-card-image'
import { PRODUCT_GALLERY_SIZES } from '../src/domain/product-gallery'
import { getCatalogGenders, orders } from '../src/domain/catalog-query'
import {
  PUBLIC_INITIAL_REVEALS,
  type PublicInitialRevealKey,
} from '../src/domain/public-initial-motion'
import {
  MAX_OLFACTORY_FAMILIES,
  MAX_PRODUCT_OLFACTORY_FAMILIES,
} from '../src/domain/olfactory-family'
import type {
  Brand,
  Product,
  ProductDiscount,
  ProductGalleryView,
  ProductVariant,
} from '../src/types/catalog'
import type { readInitialHome } from './home-initial'

type InitialHome = NonNullable<Awaited<ReturnType<typeof readInitialHome>>>

export interface PublicInitialVisualOptions {
  path: string
  home?: InitialHome
  catalog?: unknown
  product?: unknown
  aliases: ReadonlyMap<string, string>
}

const originals = new Set(
  inventory.filter((item) => item.kind === 'image').map((item) => item.path),
)
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const revealAttributes = (key: PublicInitialRevealKey) =>
  `data-public-reveal="${key}" data-scroll-reveal="${PUBLIC_INITIAL_REVEALS[key].mode}" data-revealed`

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Only public catalog records from this request can resolve a product CTA.
 * A missing optional product projection leaves the existing client path intact. */
function destinations(value: unknown) {
  const context = record(value)
  const items = context?.items
  if (!Array.isArray(items) || items.length > 100) return []
  return items.flatMap((item) => {
    const row = record(item),
      product = record(row?.product)
    if (
      (row?.active !== undefined && row.active !== true) ||
      typeof product?.id !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(product.id) ||
      typeof product.slug !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)
    )
      return []
    return [{ id: product.id, slug: product.slug }]
  })
}

function imageSources(
  image: string | null,
  fallbackImage: string,
  orientation: 'mobile' | 'desktop',
  assets: InitialHome['assets'],
  aliases: ReadonlyMap<string, string>,
) {
  const widths =
    orientation === 'mobile' ? HERO_MOBILE_WIDTHS : HERO_DESKTOP_WIDTHS
  if (image) {
    const candidate = assets.find((asset) => asset.src === image)
    if (!candidate || 'mimeType' in candidate) throw Error('unverified-image')
    const asset: ManagedMediaAsset = parseManagedMediaAsset(candidate)
    return {
      src: asset.src,
      srcset: managedImageCandidates(asset, widths)
        .map((variant) => `${variant.src} ${variant.width}w`)
        .join(', '),
    }
  }
  const source = (width: number) => {
    const path = `/images/${fallbackImage}-${orientation}-${width}.webp`
    if (!originals.has(path)) throw Error('unverified-original')
    const alias = aliases.get(path)
    // No revival of a bundled original that has been retired by the backend.
    if (!alias || !parseManagedMediaPath(alias)) throw Error('missing-alias')
    return alias
  }
  return {
    src: source(orientation === 'mobile' ? 1024 : 1536),
    srcset: widths.map((width) => `${source(width)} ${width}w`).join(', '),
  }
}

const svg = (path: string) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg>`
const chevron = svg('m8 4 8 8-8 8')

function homeVisual({ home, catalog, aliases }: PublicInitialVisualOptions) {
  if (!home) return ''
  const slides = orderedHeroContent(home.document.content.hero, true)
  const slide = slides[0]
  if (!slide) return ''
  const visual = heroVisualSources(slide),
    queries = heroVisualQueries(slide),
    mobile = imageSources(
      visual.mobile,
      visual.fallbackImage,
      'mobile',
      home.assets,
      aliases,
    ),
    desktop = imageSources(
      visual.desktop,
      visual.fallbackImage,
      'desktop',
      home.assets,
      aliases,
    )
  const context = record(catalog),
    features = record(context?.features),
    destination = resolveHeroDestination(slide.destination, {
      products: destinations(catalog),
      complementsEnabled: features?.complementsEnabled === true,
    })
  // Do not show a different CTA while its required public data is unavailable.
  if (slide.showButton && slide.cta && !destination.href) return ''
  const fallback = getHeroFallback(slide.fallbackIndex),
    presentation = { ...fallback, ...slide },
    campaign = slide.fallbackIndex === null ? slide.id : fallback.image,
    title = slide.title.split('\n').filter(Boolean).map(headingText),
    hasCopy =
      slide.showText ||
      Boolean(slide.showButton && destination.href && slide.cta),
    defaultImage =
      slide.mediaType !== 'video' &&
      !slide.desktopImage &&
      slide.fallbackIndex !== null
  const dots =
    slides.length > 1
      ? `<div class="hero-accessibility hero-position" aria-hidden="true" inert><div class="hero-position-tracks">${slides.map((_, index) => `<button type="button" tabindex="-1"${index === 0 ? ' class="is-current"' : ''}><span aria-hidden="true"></span></button>`).join('')}</div></div>`
      : ''
  const heading = slide.showText
    ? `<div class="hero-copy-heading">${slide.eyebrow ? `<p class="eyebrow">${escape(slide.eyebrow)}</p>` : ''}${title.length ? `<h1 class="hero-title">${title.map((line) => `<span>${escape(line)}</span>`).join('')}</h1>` : ''}</div>`
    : ''
  const copy =
    slide.showText || (slide.showButton && destination.href)
      ? `<div class="hero-copy" data-show-text="${slide.showText}">${heading}<div class="hero-copy-details">${slide.showText && slide.description ? `<p class="hero-description">${escape(slide.description)}</p>` : ''}${slide.showButton && destination.href && slide.cta ? `<a class="button button--primary hero-cta" href="${escape(destination.href)}">${escape(slide.cta)}${svg('M4 12h15m-6-6 6 6-6 6')}</a>` : ''}</div></div>`
      : ''
  // Indicators retain their existing geometry while remaining outside the
  // keyboard/accessibility tree until the interactive carousel takes over.
  const arrows =
    slides.length > 1
      ? `<div class="hero-navigation" aria-hidden="true" inert><button type="button" tabindex="-1">${chevron}</button><button type="button" tabindex="-1">${chevron}</button></div>`
      : ''
  return `<div class="home" data-initial-content="home"><div data-home-section="hero"><section class="hero" aria-roledescription="carrusel" aria-label="Selección editorial">${dots}<div class="hero-stage"><div class="hero-slide is-active" data-tone="${escape(presentation.tone)}" data-layout="${escape(presentation.layout)}" data-campaign="${escape(campaign)}" data-media-type="${slide.mediaType}" data-has-copy="${hasCopy}" data-default-image="${defaultImage}" role="group" aria-roledescription="diapositiva" aria-label="1 de ${slides.length}" aria-hidden="false"><div class="hero-image"><picture><source media="${escape(queries.mobile)}" srcset="${escape(mobile.srcset)}" sizes="100vw" width="1024" height="1536"><img src="${escape(desktop.src)}" srcset="${escape(desktop.srcset)}" sizes="100vw" width="2048" height="1152" alt="${escape(slide.alt)}" fetchpriority="high" decoding="async"></picture></div>${copy}</div></div>${arrows}<p class="sr-only">Diapositiva 1 de ${slides.length}: ${escape(title.join(' ') || slide.alt)}</p></section></div></div>`
}

function text(value: unknown, maximum = 1000): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw Error('invalid-text')
  return value
}
function integer(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw Error('invalid-number')
  return value
}
function uuid(value: unknown): string {
  const result = text(value, 36)
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(result))
    throw Error('invalid-id')
  return result
}
function slug(value: unknown): string {
  const result = text(value, 512)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw Error('invalid-slug')
  return result
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw Error('invalid-array')
  return value
}
function brands(value: unknown): Brand[] {
  return array(value, 10000).map((value) => {
    const item = record(value)
    return {
      id: uuid(item?.id),
      name: text(item?.name, 160),
      slug: slug(item?.slug),
    }
  })
}
function mediaFor(
  source: string,
  assets: unknown,
  aliases: ReadonlyMap<string, string>,
) {
  if (parseManagedMediaPath(source)) {
    const candidate = array(assets, 100).find(
      (entry) => record(entry)?.src === source,
    )
    const asset = parseManagedMediaAsset(candidate)
    return {
      src: asset.src,
      srcset: managedImageCandidates(asset, [480, 960])
        .map((v) => `${v.src} ${v.width}w`)
        .join(', '),
    }
  }
  if (!originals.has(source)) throw Error('invalid-original')
  const alias = aliases.get(source)
  if (!alias || !parseManagedMediaPath(alias))
    throw Error('missing-image-alias')
  return { src: alias, srcset: '' }
}
interface VisualProduct {
  product: Product
  lead: string
  gallery: ProductGalleryView[]
  assets: unknown
}
function productRecord(value: unknown): VisualProduct {
  const source = record(value),
    raw = record(source?.product),
    detail = record(source?.detail)
  if (
    !source ||
    (source.active !== undefined && source.active !== true) ||
    !raw ||
    !detail ||
    !['perfume', 'complemento'].includes(String(raw.productType))
  )
    throw Error('invalid-product')
  const variants: ProductVariant[] = array(raw.variants, 200).map((value) => {
    const variant = record(value)
    if (!variant || typeof variant.active !== 'boolean')
      throw Error('invalid-variant')
    const priceCents = integer(variant.priceCents, 1)
    const finalPriceCents =
      variant.finalPriceCents === undefined
        ? undefined
        : integer(variant.finalPriceCents, 1)
    if (finalPriceCents !== undefined && finalPriceCents > priceCents)
      throw Error('invalid-price')
    return {
      id: uuid(variant.id),
      ml: variant.ml === null ? null : integer(variant.ml, 1),
      ...(variant.label == null ? {} : { label: text(variant.label, 160) }),
      priceCents,
      ...(finalPriceCents === undefined ? {} : { finalPriceCents }),
      stock: integer(variant.stock),
      active: variant.active,
    }
  })
  if (!variants.some((variant) => variant.active && variant.stock > 0))
    throw Error('unavailable-product')
  let discount: ProductDiscount | null = null
  if (raw.discount !== null) {
    const offer = record(raw.discount)
    if (
      !offer ||
      typeof offer.active !== 'boolean' ||
      (offer.type !== 'fixed' && offer.type !== 'percent')
    )
      throw Error('invalid-discount')
    discount = {
      active: offer.active,
      type: offer.type,
      value: integer(offer.value, 1),
      startsAt: text(offer.startsAt, 64),
      endsAt: text(offer.endsAt, 64),
    }
    if (validateProductDiscount(discount, variants))
      throw Error('invalid-discount')
  }
  const product: Product = {
    id: uuid(raw.id),
    slug: slug(raw.slug),
    name: text(raw.name, 240),
    brandId: raw.brandId === '' ? '' : uuid(raw.brandId),
    image: text(raw.image, 240),
    productType: raw.productType as 'perfume' | 'complemento',
    family: text(raw.family),
    olfactoryFamilies: array(
      raw.olfactoryFamilies,
      MAX_PRODUCT_OLFACTORY_FAMILIES,
    ).map((family) => text(family, 64)),
    variants,
    discount,
  }
  const gallery = array(detail.gallery, 4).map((value): ProductGalleryView => {
    const view = record(value)
    if (
      !view ||
      !['full', 'detail-top', 'detail-base'].includes(String(view.framing))
    )
      throw Error('invalid-gallery')
    return {
      image: text(view.image, 240),
      alt: text(view.alt),
      framing: view.framing as ProductGalleryView['framing'],
    }
  })
  if (!gallery.length || gallery[0].image !== product.image)
    throw Error('invalid-primary-image')
  return {
    product,
    gallery,
    lead: text(detail.shortDescription, 10000),
    assets: source.mediaAssets,
  }
}
function priceMarkup(price: VariantPrice, prefix = '') {
  const discounted = price.finalCents < price.originalCents
  return `<span class="price-display${discounted ? ' price-display--discounted' : ''}">${prefix ? `<span class="price-display__prefix">${escape(prefix)}</span>` : ''}<strong class="price-display__current">${escape(formatPEN(price.finalCents))}</strong>${discounted ? `<del class="price-display__original">${escape(formatPEN(price.originalCents))}</del>` : ''}</span>`
}
function offerMarkup(product: Product, price: VariantPrice, inline = false) {
  if (!price.discountActive || !product.discount) return ''
  const fixed = product.discount.type === 'fixed'
  return `<span class="offer-label${inline ? ' offer-label--inline' : ''}${fixed ? ' offer-label--fixed' : ''}"><span aria-hidden="true">−${fixed ? escape(formatPEN(price.discountCents)) : `${product.discount.value} %`}</span><span class="sr-only">${fixed ? `Oferta: ahorra ${escape(formatPEN(price.discountCents))}` : `Oferta: ${product.discount.value} % de descuento`}</span></span>`
}
const breadcrumb = (
  current: string,
  parent?: { href: string; label: string },
) =>
  `<nav class="${parent ? 'product' : 'catalog'}-breadcrumb${parent ? ' container' : ''}" ${revealAttributes(parent ? 'productBreadcrumb' : 'catalogBreadcrumb')} aria-label="Ruta de navegación"><a href="/">Inicio</a><span aria-hidden="true">/</span>${parent ? `<a href="${escape(parent.href)}">${escape(parent.label)}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${escape(current)}</span></nav>`
function catalogCard(
  item: VisualProduct,
  brand: Brand | undefined,
  aliases: ReadonlyMap<string, string>,
  first: boolean,
  order: number,
) {
  const { product } = item,
    image = mediaFor(product.image, item.assets, aliases),
    presentation = getProductPresentation(product.variants)
  const prices = presentation.variants.map((variant) =>
    getVariantPrice(product, variant),
  )
  const price = prices.reduce((a, b) => (a.finalCents < b.finalCents ? a : b))
  const prefix =
    new Set(prices.map((price) => price.finalCents)).size > 1 ? 'Desde' : ''
  return `<article class="product-card product-card--standard" style="--scroll-reveal-order:${Math.min(order, 5)}"><div class="product-photo"><a class="product-image-link media-loading-frame" href="/producto/${escape(product.slug)}" aria-label="Ver ${escape(product.name)}"><img class="product-image-primary media-image" data-media-state="ready" src="${escape(image.src)}"${image.srcset ? ` srcset="${escape(image.srcset)}"` : ''} sizes="${escape(PRODUCT_CARD_IMAGE_SIZES)}" width="1024" height="1280" loading="${first ? 'eager' : 'lazy'}" fetchpriority="${first ? 'high' : 'auto'}" decoding="async" alt="${escape(item.gallery[0].alt || product.name)}"></a>${offerMarkup(product, price)}<button class="icon-button product-favorite" type="button" inert aria-disabled="true" aria-label="Cargando favoritos" aria-busy="true">${svg('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z')}</button></div><div class="product-meta"><p class="eyebrow brand-label">${escape(brand?.name ?? '')}</p><h2><a href="/producto/${escape(product.slug)}">${escape(product.name)}${svg('M4 12h15m-6-6 6 6-6 6')}</a></h2><p class="product-family">${escape(isPerfume(product) ? product.family : 'Complemento')}</p><div class="product-price">${priceMarkup(price, prefix)}<span class="product-volume">${escape(presentation.variants.map(variantLabel).join(' · '))}</span></div></div></article>`
}
function catalogVisual(options: PublicInitialVisualOptions, url: URL) {
  const source = record(options.catalog)
  if (!source) return ''
  const items = array(source.items, 12).map(productRecord),
    total = integer(source.total),
    availableTotal = integer(source.availableTotal),
    allBrands = brands(source.brands)
  if (!total || !availableTotal || !items.length) return ''
  const feature = record(source.features),
    complements = feature?.complementsEnabled === true
  const brandSlug = url.pathname.startsWith('/marcas/')
    ? url.pathname.slice(8)
    : undefined
  const brand = brandSlug
    ? allBrands.find((item) => item.slug === brandSlug)
    : undefined
  if (brandSlug && !brand) return ''
  // Unknown search/chip state retains its ordinary client route; never guess.
  if (url.search || url.pathname === '/buscar') return ''
  const title = brand?.name ?? 'Explora la tienda'
  const checkboxes = (
    name: string,
    values: { value: string; label: string }[],
  ) =>
    `<fieldset><legend class="sr-only">${escape(name)}</legend>${values.map((value) => `<label><input type="checkbox" name="${escape(name)}" value="${escape(value.value)}">${escape(value.label)}</label>`).join('')}</fieldset>`
  const group = (id: string, title: string, content: string, open = false) =>
    `<details class="catalog-filter-group" data-filter-group="${id}"${open ? ' open' : ''}><summary><span>${title}</span></summary><div class="catalog-filter-group__content">${content}</div></details>`
  const familyCodes = array(source.familyCodes, 1000).map((value) =>
    text(value, 100),
  )
  const families = array(source.olfactoryFamilies, 1000).flatMap((value) => {
    const f = record(value)
    return f?.active === true &&
      typeof f.value === 'string' &&
      familyCodes.includes(f.value)
      ? [{ value: text(f.value, 100), label: text(f.label, 160) }]
      : []
  })
  const filters = `<form class="catalog-filter-form" inert aria-busy="true"><div class="catalog-filter-fields">${
    complements
      ? group(
          'type',
          'Tipo de producto',
          checkboxes('tipo', [
            { value: 'perfume', label: 'Perfumes' },
            { value: 'complemento', label: 'Complementos' },
          ]),
          true,
        )
      : ''
  }${
    !brand
      ? group(
          'brand',
          'Marca',
          checkboxes(
            'marca',
            allBrands.map((b) => ({ value: b.slug, label: b.name })),
          ),
          true,
        )
      : ''
  }${group('gender', 'Género', checkboxes('genero', [...getCatalogGenders()]))}${families.length ? group('family', 'Familia olfativa', checkboxes('familia', families), true) : ''}${group('price', 'Precio en soles', '<fieldset><legend class="sr-only">Precio en soles</legend><div class="catalog-price-fields"><label>Mínimo<input name="min" type="number" min="0" max="1000000" step="0.01"></label><label>Máximo<input name="max" type="number" min="0" max="1000000" step="0.01"></label></div></fieldset>')}</div><div class="catalog-filter-actions"><button type="button" class="text-link" inert aria-disabled="true">Limpiar selección</button><button class="button button--primary" type="button" inert aria-disabled="true">Aplicar filtros</button></div></form>`
  return `<div class="store-page catalog-page container" data-initial-content="catalog"><div class="catalog-intro">${brand ? `<nav class="catalog-breadcrumb" ${revealAttributes('catalogBreadcrumb')} aria-label="Ruta de navegación"><a href="/">Inicio</a><span aria-hidden="true">/</span><a href="/marcas">Marcas</a><span aria-hidden="true">/</span><span aria-current="page">${escape(brand.name)}</span></nav>` : breadcrumb('Tienda')}<header class="catalog-heading" ${revealAttributes('catalogHeading')}><div><p class="${brand ? 'eyebrow' : 'eyebrow brand-label'}">${brand ? 'Universo de marca' : 'La selección de Aroma Infini'}</p><h1>${escape(title)}</h1></div><p>${escape(brand ? `Conoce los productos de ${brand.name} y sus presentaciones.` : complements ? 'Descubre perfumes y complementos, compara sus presentaciones y encuentra tu elección.' : 'Descubre perfumes, compara sus presentaciones y encuentra tu elección.')}</p></header></div><div class="catalog-layout"><aside class="catalog-sidebar" ${revealAttributes('catalogSidebar')} aria-label="Filtros de la tienda"><h2>Filtrar por</h2>${filters}</aside><div class="catalog-listing"><div class="catalog-toolbar" ${revealAttributes('catalogToolbar')}><button class="button button--secondary catalog-filter-trigger" type="button" inert aria-disabled="true" aria-busy="true">Filtros</button><p>${total} ${total === 1 ? 'producto' : 'productos'}</p><label class="catalog-sort"><span>Ordenar</span><select inert aria-disabled="true" aria-label="Ordenar">${orders.map((order) => `<option value="${order.value}"${order.value === 'mas-vendidos' ? ' selected' : ''}>${escape(order.label)}</option>`).join('')}</select></label></div><div class="catalog-results"><div class="product-grid" ${revealAttributes('catalogGrid')}>${items
    .map((item, index) =>
      catalogCard(
        item,
        allBrands.find((brand) => brand.id === item.product.brandId),
        options.aliases,
        index === 0,
        index,
      ),
    )
    .join('')}</div></div></div></div></div>`
}
function productVisual(options: PublicInitialVisualOptions, url: URL) {
  const context = record(options.product)
  if (!context || url.search) return ''
  const item = productRecord(context.record),
    { product } = item
  if (url.pathname !== `/producto/${product.slug}`) return ''
  const allBrands = brands(context.brands),
    brand = allBrands.find((entry) => entry.id === product.brandId),
    selected = product.variants.find(
      (variant) => variant.active && variant.stock > 0,
    )!
  const price = getVariantPrice(product, selected),
    perfume = isPerfume(product)
  // Resolve labels only against this response's vocabulary. Never mutate the
  // shared browser-oriented registry while handling concurrent Worker reads.
  const definitions = array(
    context.olfactoryFamilies ?? [],
    MAX_OLFACTORY_FAMILIES,
  ).map((value) => {
    const family = record(value)
    return {
      value: text(family?.value, 64),
      aromaLabel: text(family?.aromaLabel, 80),
    }
  })
  const aromaLabels = perfume
    ? (product.olfactoryFamilies ?? []).map(
        (value) =>
          definitions.find((family) => family.value === value)?.aromaLabel ??
          value,
      )
    : []
  const image = mediaFor(product.image, item.assets, options.aliases)
  const photo = (
    source: ReturnType<typeof mediaFor>,
    alt: string,
    thumbnail = false,
  ) =>
    `<img class="product-gallery-photo" data-state="ready" src="${escape(source.src)}"${source.srcset ? ` srcset="${escape(source.srcset)}"` : ''} sizes="${escape(PRODUCT_GALLERY_SIZES)}" width="${thumbnail ? 480 : 960}" height="${thumbnail ? 600 : 1200}" loading="${thumbnail ? 'lazy' : 'eager'}" fetchpriority="${thumbnail ? 'low' : 'high'}" decoding="async" alt="${escape(alt)}">`
  const shipping = record(context.shipping),
    threshold =
      shipping?.freeThresholdCents === undefined
        ? 0
        : integer(shipping.freeThresholdCents)
  const timed = price.discountActive && Boolean(product.discount?.endsAt.trim())
  const notices =
    timed || threshold > 0
      ? `<ul class="product-purchase-notices" aria-label="Condiciones de compra">${timed ? `<li>${svg('M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2')}<span>Oferta por tiempo limitado</span></li>` : ''}${threshold ? `<li>${svg('M1 4h13v13H1V4Zm13 5h4l4 5v3h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0')}<span>Envío gratis desde ${escape(formatPEN(threshold))}</span></li>` : ''}</ul>`
      : ''
  const thumbnails = item.gallery
    .map(
      (view, index) =>
        `<button class="product-thumbnail" type="button" tabindex="-1"${index === 0 ? ' aria-current="true"' : ''}>${photo(mediaFor(view.image, item.assets, options.aliases), '', true)}<span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></button>`,
    )
    .join('')
  const variants = product.variants
    .filter((variant) => variant.active)
    .map((variant) => {
      const p = getVariantPrice(product, variant)
      return `<label${variant.stock > 0 ? '' : ' class="is-unavailable"'}><input type="radio" name="variant-${escape(product.id)}"${variant.id === selected.id ? ' checked' : ''}><span><strong>${escape(variantLabel(variant))}</strong><small>${priceMarkup(variant.stock > 0 ? p : { ...p, finalCents: p.originalCents })}</small></span>${variant.stock > 0 ? '' : '<em>Agotado</em>'}</label>`
    })
    .join('')
  const benefits = `<ul class="product-purchase-benefits${perfume ? '' : ' product-purchase-benefits--two'}" aria-label="Beneficios de compra">${perfume ? `<li>${svg('M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Zm-4 9 3 3 5-5')}<span><strong>100% original</strong><small>Productos garantizados</small></span></li>` : ''}<li>${svg('M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 5h20M6 15h5')}<span><strong>Pago seguro</strong><small>Compra protegida</small></span></li><li>${svg('M1 4h13v13H1V4Zm13 5h4l4 5v3h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0')}<span><strong>${shipping?.provinceShippingEnabled === true ? 'Envíos a todo el Perú' : 'Envíos a Lima y Callao'}</strong><small>Opciones de entrega disponibles</small></span></li></ul>`
  const infoNavigation = `<nav class="product-info-nav" aria-label="Información de este producto" inert aria-busy="true">${perfume ? '<a href="#informacion-producto" aria-disabled="true">Familia olfativa <span aria-hidden="true">↓</span></a>' : ''}<a href="#informacion-producto" aria-disabled="true">Descripción <span aria-hidden="true">↓</span></a><a href="#informacion-producto" aria-disabled="true">Reseñas <span aria-hidden="true">↓</span></a></nav>`
  return `<article class="store-page product-page" data-initial-content="product">${breadcrumb(product.name, { href: perfume ? '/tienda?tipo=perfume' : '/tienda?tipo=complemento', label: perfume ? 'Perfumes' : 'Complementos' })}<div class="product-intro container" ${revealAttributes('productIntro')}><section class="product-gallery${item.gallery.length === 1 ? ' product-gallery--single' : ''}" style="--scroll-reveal-order:0" aria-label="Galería de ${escape(product.name)}"><div class="product-gallery-layout"><div class="product-thumbnails" aria-hidden="true" inert>${thumbnails}</div><div class="product-gallery-track"><figure class="product-gallery-frame product-gallery-frame--${item.gallery[0].framing} is-active">${photo(image, item.gallery[0].alt || `Vista 1 de ${product.name}`)}</figure></div></div><div class="product-gallery-mobile-controls"><p>01<span aria-hidden="true"> / </span>${String(item.gallery.length).padStart(2, '0')}</p><div aria-hidden="true" inert>${item.gallery.map((_, index) => `<button type="button" tabindex="-1"${index === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</div></div></section><section class="product-purchase" style="--scroll-reveal-order:1" aria-labelledby="product-title"><div class="product-purchase-heading"><div>${brand ? `<a class="product-brand" href="/tienda?marca=${escape(brand.slug)}">${escape(brand.name)}</a>` : ''}${!perfume || aromaLabels.length ? `<p class="product-kind">${escape(perfume ? aromaLabels.join(' · ') : 'Complemento')}</p>` : ''}</div><button class="product-save" type="button" inert aria-disabled="true" aria-busy="true">${svg('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z')}Guardar</button></div><h1 id="product-title">${escape(product.name)}</h1><div class="product-selected-price"><div class="product-selected-price__amounts">${offerMarkup(product, price, true)}${priceMarkup(price)}</div></div><p class="product-lead">${escape(item.lead)}</p>${notices}<fieldset class="product-variants" inert aria-busy="true"><legend>Presentación</legend>${variants}</fieldset><button class="button button--primary product-cart-button" type="button" inert aria-disabled="true" aria-busy="true"><span class="product-cart-button__label">Añadir al carrito</span></button>${benefits}${infoNavigation}</section></div></article>`
}

/** Progressive public visual, not a second application or an authorization
 * cache. Missing/unverified data always retains the ordinary client route. */
export function publicInitialVisual(
  options: PublicInitialVisualOptions,
): string {
  try {
    const url = new URL(options.path, 'https://initial.invalid')
    if (url.pathname === '/' && !url.search) return homeVisual(options)
    if (
      url.pathname === '/tienda' ||
      /^\/marcas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)
    )
      return catalogVisual(options, url)
    if (/^\/producto\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname))
      return productVisual(options, url)
    return ''
  } catch {
    return ''
  }
}
