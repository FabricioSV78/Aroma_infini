import type {
  Brand,
  Product,
  ProductDetail,
  ProductDiscount,
  ProductGalleryView,
  ProductVariant,
} from '../types/catalog'
import {
  isOlfactoryFamily,
  MAX_PRODUCT_OLFACTORY_FAMILIES,
  parseOlfactoryFamilyDefinitions,
  replaceOlfactoryFamilies,
  type OlfactoryFamilyDefinition,
} from '../domain/olfactory-family'
import type { StoreFeatures } from '../domain/store-features'
import type { HomeContent } from '../types/home'
import { publicHomeContent } from './home-content-service'
import {
  parseShippingEnvelope,
  publicShippingSettings,
} from './commerce-settings-service'
import type { ShippingSettings } from '../types/shipping'
import { requireSupabaseClient } from './supabase-client'
import { parseManagedMediaPath } from '../domain/media'
import { rememberManagedAssets } from './media-registry'
import type {
  LocalStorefrontRepository,
  StorefrontProductRecord,
  StorefrontSnapshot,
} from './storefront-repository'

export class CatalogReadError extends Error {
  constructor() {
    super('No pudimos cargar el catálogo. Inténtalo de nuevo.')
    this.name = 'CatalogReadError'
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CatalogReadError()
  return value as Record<string, unknown>
}

function text(value: unknown, maximum = 100000): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new CatalogReadError()
  return value
}

function integer(value: unknown, minimum = 0): number {
  if (
    !Number.isSafeInteger(value) ||
    typeof value !== 'number' ||
    value < minimum
  )
    throw new CatalogReadError()
  return value
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new CatalogReadError()
  return value
}

function uuid(value: unknown): string {
  const result = text(value, 36)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new CatalogReadError()
  return result
}

function slug(value: unknown): string {
  const result = text(value, 512)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(result)) throw new CatalogReadError()
  return result
}

function list<T>(
  value: unknown,
  parse: (item: unknown) => T,
  maximum: number,
): T[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new CatalogReadError()
  return value.map(parse)
}

function unique<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) throw new CatalogReadError()
  return values
}

/** References only: uploaded data/blob URLs must never travel through PostgreSQL. */
export function parseCatalogImage(value: unknown, allowEmpty = false): string {
  const source = text(value, 2048)
  if (!source && allowEmpty) return ''
  if (parseManagedMediaPath(source)) return source
  if (/^\/(?:images|brand)\/[a-zA-Z0-9_./-]+$/.test(source)) {
    if (source.split('/').some((part) => part === '..' || part === '.'))
      throw new CatalogReadError()
    return source
  }
  try {
    const address = new URL(source)
    if (
      address.protocol === 'https:' &&
      !address.username &&
      !address.password &&
      !address.hash
    )
      return source
  } catch {
    /* Invalid references fail closed below. */
  }
  throw new CatalogReadError()
}

function date(value: unknown): string {
  const result = text(value, 64)
  if (result && !Number.isFinite(Date.parse(result)))
    throw new CatalogReadError()
  return result
}

export function parseCatalogBrand(value: unknown): Brand {
  const brand = record(value)
  const name = text(brand.name, 160)
  if (!name.trim()) throw new CatalogReadError()
  return { id: uuid(brand.id), slug: slug(brand.slug), name }
}

function parseVariant(value: unknown, allowDraft: boolean): ProductVariant {
  const variant = record(value)
  const ml = variant.ml === null ? null : integer(variant.ml, 1)
  const priceCents = integer(variant.priceCents)
  const finalPriceCents =
    !allowDraft && variant.finalPriceCents !== undefined
      ? integer(variant.finalPriceCents, 1)
      : undefined
  if (finalPriceCents !== undefined && finalPriceCents > priceCents)
    throw new CatalogReadError()
  return {
    id: uuid(variant.id),
    ...(variant.sku == null ? {} : { sku: text(variant.sku, 160) }),
    ml,
    ...(variant.label == null ? {} : { label: text(variant.label, 160) }),
    priceCents,
    ...(finalPriceCents === undefined ? {} : { finalPriceCents }),
    stock: integer(variant.stock),
    active: boolean(variant.active),
  }
}

function parseOffer(value: unknown): ProductDiscount | null {
  if (value === null) return null
  const offer = record(value)
  if (offer.type !== 'percent' && offer.type !== 'fixed')
    throw new CatalogReadError()
  const amount = integer(offer.value, 1)
  if (offer.type === 'percent' && amount > 99) throw new CatalogReadError()
  return {
    active: boolean(offer.active),
    type: offer.type,
    value: amount,
    startsAt: date(offer.startsAt),
    endsAt: date(offer.endsAt),
  }
}

function parseGallery(value: unknown): ProductGalleryView {
  const item = record(value)
  if (!['full', 'detail-top', 'detail-base'].includes(text(item.framing, 20)))
    throw new CatalogReadError()
  return {
    image: parseCatalogImage(item.image),
    alt: text(item.alt, 1000),
    framing:
      item.framing === 'full'
        ? 'full'
        : item.framing === 'detail-top'
          ? 'detail-top'
          : 'detail-base',
  }
}

/** Rebuild a typed DTO instead of asserting an untrusted JSON object as Product. */
export function parseCatalogProductRecord(
  value: unknown,
  allowDraft = false,
): StorefrontProductRecord {
  const source = record(value)
  const raw = record(source.product)
  if (source.mediaAssets !== undefined)
    rememberManagedAssets(source.mediaAssets)
  const details = record(source.detail)
  const notes = record(details.notes)
  if (raw.productType !== 'perfume' && raw.productType !== 'complemento')
    throw new CatalogReadError()
  const families = unique(
    list(
      raw.olfactoryFamilies,
      (family) => {
        if (!isOlfactoryFamily(family)) throw new CatalogReadError()
        return family
      },
      MAX_PRODUCT_OLFACTORY_FAMILIES,
    ),
  )
  const variants = list(
    raw.variants,
    (value) => parseVariant(value, allowDraft),
    200,
  )
  unique(variants.map((variant) => variant.id))
  if (
    !allowDraft &&
    !variants.some((variant) => variant.active && variant.stock > 0)
  )
    throw new CatalogReadError()
  const code = text(raw.sku, 5)
  if (!/^\d{5}$/.test(code)) throw new CatalogReadError()
  const product: Product = {
    id: uuid(raw.id),
    sku: code,
    slug: slug(raw.slug),
    name: text(raw.name, 240),
    brandId: raw.brandId === '' ? '' : uuid(raw.brandId),
    productType: raw.productType,
    image: parseCatalogImage(raw.image, allowDraft),
    family: text(raw.family, 1000),
    olfactoryFamilies: families,
    olfactoryFamily: families[0] ?? null,
    variants,
    discount: parseOffer(raw.discount),
  }
  const level = details.intensityLevel
  if (level !== null && level !== 1 && level !== 2 && level !== 3)
    throw new CatalogReadError()
  const intensity =
    level === 1
      ? 'Suave'
      : level === 2
        ? 'Moderada'
        : level === 3
          ? 'Intensa'
          : null
  if (details.intensity !== intensity) throw new CatalogReadError()
  const detail: ProductDetail = {
    shortDescription: text(details.shortDescription),
    description: text(details.description),
    olfactoryImage:
      details.olfactoryImage === null
        ? null
        : parseCatalogImage(details.olfactoryImage),
    notes: {
      top: list(notes.top, (note) => text(note, 160), 100),
      heart: list(notes.heart, (note) => text(note, 160), 100),
      base: list(notes.base, (note) => text(note, 160), 100),
    },
    intensityLevel: level,
    intensity,
    occasion: text(details.occasion, 1000),
    season: text(details.season, 1000),
    gallery: list(details.gallery, parseGallery, 4),
    recommendationIds: unique(list(details.recommendationIds, uuid, 100)),
  }
  if (!allowDraft && !detail.gallery.length) throw new CatalogReadError()
  const gender = source.gender
  if (
    gender !== null &&
    gender !== 'hombre' &&
    gender !== 'mujer' &&
    gender !== 'unisex'
  )
    throw new CatalogReadError()
  return {
    product,
    detail,
    gender,
    popularity: integer(source.popularity),
    newest: integer(source.newest),
  }
}

interface CatalogSettings {
  shipping: ShippingSettings | null
  shippingVersion: number
  features: StoreFeatures
  featuredBrandId: string | null
  olfactoryFamilies: OlfactoryFamilyDefinition[]
  homeAnnouncement: HomeContent['announcement'] | null
  homeVersion: number
}

interface CatalogPage {
  items: StorefrontProductRecord[]
  total: number
}

export function parseCatalogPage(value: unknown): CatalogPage {
  const page = record(value)
  return {
    items: list(page.items, (item) => parseCatalogProductRecord(item), 100),
    total: integer(page.total),
  }
}

export function parseCatalogSettings(value: unknown): CatalogSettings {
  const settings = record(value)
  const shipping = parseShippingEnvelope({
    shipping: settings.shipping ?? null,
    shippingVersion: settings.shippingVersion ?? 0,
  })
  const announcement =
    settings.homeAnnouncement === undefined ||
    settings.homeAnnouncement === null
      ? null
      : record(settings.homeAnnouncement)
  return {
    shipping: shipping.shipping.configured === false ? null : shipping.shipping,
    shippingVersion: shipping.shippingVersion,
    features: {
      complementsEnabled: boolean(record(settings.features).complementsEnabled),
    },
    featuredBrandId:
      settings.featuredBrandId === null ? null : uuid(settings.featuredBrandId),
    olfactoryFamilies: parseOlfactoryFamilyDefinitions(
      settings.olfactoryFamilies,
    ),
    homeAnnouncement:
      announcement === null
        ? null
        : {
            deliveryText: text(announcement.deliveryText, 70),
            freeShippingLabel: text(announcement.freeShippingLabel, 40),
          },
    homeVersion:
      settings.homeVersion === undefined ? 0 : integer(settings.homeVersion),
  }
}

type EditorialSnapshot = Pick<
  StorefrontSnapshot,
  'shipping' | 'media' | 'content'
>

interface StorefrontOptions {
  editorial: () => EditorialSnapshot
  subscribeEditorial: (listener: () => void) => () => void
  readPage: (limit: number, offset: number) => Promise<unknown>
  readBrands: () => Promise<unknown>
  readSettings: () => Promise<unknown>
  now?: () => number
}

export interface SupabaseStorefrontRepository extends LocalStorefrontRepository {
  invalidate(): void
  readMetadata(): Promise<StorefrontSnapshot>
  confirmRecords(
    records: StorefrontProductRecord[],
    metadata?: { brands: Brand[]; settings: CatalogSettings },
    selection?: { productIds: string[]; variantIds: string[] },
  ): void
}

/** A bounded public cache; pending/private admin data can never enter this snapshot. */
export function createSupabaseStorefrontRepository({
  editorial,
  subscribeEditorial,
  readPage,
  readBrands,
  readSettings,
  now = Date.now,
}: StorefrontOptions): SupabaseStorefrontRepository {
  const listeners = new Set<() => void>()
  function readEditorial(): EditorialSnapshot {
    const current = editorial()
    return {
      shipping: current.shipping,
      media: current.media,
      content: current.content,
    }
  }
  let settings: CatalogSettings = {
    shipping: null,
    shippingVersion: 0,
    features: { complementsEnabled: false },
    featuredBrandId: null,
    olfactoryFamilies: [],
    homeAnnouncement: null,
    homeVersion: 0,
  }
  const initial = readEditorial()
  let snapshot: StorefrontSnapshot = {
    ...initial,
    content: { ...initial.content, featuredBrandId: null },
    brands: [],
    products: [],
    features: settings.features,
  }
  let generation = 0
  let completedAt = -Infinity
  let pending: Promise<StorefrontSnapshot> | undefined
  let metadataCompletedAt = -Infinity
  let metadataPending: Promise<StorefrontSnapshot> | undefined

  function notify() {
    listeners.forEach((listener) => listener())
  }
  function mergeEditorial() {
    const content = readEditorial()
    snapshot = {
      ...snapshot,
      ...content,
      content: {
        ...content.content,
        featuredBrandId: settings.featuredBrandId,
      },
    }
  }
  subscribeEditorial(() => {
    mergeEditorial()
    notify()
  })

  async function load(): Promise<StorefrontSnapshot> {
    const expectedGeneration = generation
    try {
      const [firstValue, brandsValue, settingsValue] = await Promise.all([
        readPage(100, 0),
        readBrands(),
        readSettings(),
      ])
      const nextSettings = parseCatalogSettings(settingsValue)
      if (expectedGeneration !== generation) return readSnapshot()
      replaceOlfactoryFamilies(nextSettings.olfactoryFamilies)
      const first = parseCatalogPage(firstValue)
      if (first.total > 10000) throw new CatalogReadError()
      const products = [...first.items]
      if (products.length > first.total) throw new CatalogReadError()
      for (let offset = 100; offset < first.total; offset += 100) {
        const page = parseCatalogPage(await readPage(100, offset))
        if (page.total !== first.total || !page.items.length)
          throw new CatalogReadError()
        products.push(...page.items)
      }
      if (products.length !== first.total) throw new CatalogReadError()
      unique(products.map(({ product }) => product.id))
      const brands = list(brandsValue, parseCatalogBrand, 10000)
      unique(brands.map((brand) => brand.id))
      if (
        products.some(
          ({ product }) =>
            product.productType === 'complemento' &&
            !nextSettings.features.complementsEnabled,
        )
      )
        throw new CatalogReadError()
      if (expectedGeneration !== generation) return readSnapshot()
      settings = nextSettings
      publicShippingSettings.confirm({
        shipping: settings.shipping,
        shippingVersion: settings.shippingVersion,
      })
      publicHomeContent.metadata(
        settings.homeAnnouncement,
        settings.homeVersion,
      )
      const content = readEditorial()
      snapshot = {
        ...content,
        brands,
        products,
        features: settings.features,
        content: {
          ...content.content,
          featuredBrandId: settings.featuredBrandId,
        },
      }
      completedAt = now()
      metadataCompletedAt = now()
      notify()
      return snapshot
    } catch {
      if (expectedGeneration !== generation) return readSnapshot()
      completedAt = -Infinity
      snapshot = { ...snapshot, brands: [], products: [] }
      notify()
      throw new CatalogReadError()
    }
  }

  function readSnapshot(): Promise<StorefrontSnapshot> {
    if (now() - completedAt < 5000) return Promise.resolve(snapshot)
    if (!pending) {
      const current = load()
      pending = current
      void current
        .finally(() => {
          if (pending === current) pending = undefined
        })
        .catch(() => {})
    }
    return pending
  }

  async function readMetadata(): Promise<StorefrontSnapshot> {
    if (now() - metadataCompletedAt < 30000) return snapshot
    if (!metadataPending) {
      const expectedGeneration = generation
      const operation = (async () => {
        const [brandValue, settingsValue] = await Promise.all([
          readBrands(),
          readSettings(),
        ])
        const nextSettings = parseCatalogSettings(settingsValue)
        const brands = list(brandValue, parseCatalogBrand, 10000)
        unique(brands.map((brand) => brand.id))
        if (generation !== expectedGeneration) return readMetadata()
        settings = nextSettings
        publicShippingSettings.confirm({
          shipping: settings.shipping,
          shippingVersion: settings.shippingVersion,
        })
        publicHomeContent.metadata(
          settings.homeAnnouncement,
          settings.homeVersion,
        )
        replaceOlfactoryFamilies(settings.olfactoryFamilies)
        snapshot = { ...snapshot, brands, features: settings.features }
        mergeEditorial()
        metadataCompletedAt = now()
        notify()
        return snapshot
      })()
      metadataPending = operation
      void operation
        .finally(() => {
          if (metadataPending === operation) metadataPending = undefined
        })
        .catch(() => {})
    }
    return metadataPending
  }

  return {
    readSnapshot,
    readMetadata,
    confirmRecords(records, metadata, selection) {
      if (metadata) {
        settings = metadata.settings
        publicShippingSettings.confirm({
          shipping: settings.shipping,
          shippingVersion: settings.shippingVersion,
        })
        publicHomeContent.metadata(
          settings.homeAnnouncement,
          settings.homeVersion,
        )
        replaceOlfactoryFamilies(settings.olfactoryFamilies)
        snapshot = {
          ...snapshot,
          brands: metadata.brands,
          features: settings.features,
        }
        metadataCompletedAt = now()
      }
      const retained = selection
        ? snapshot.products.filter(
            ({ product }) =>
              !selection.productIds.includes(product.id) &&
              !product.variants.some((variant) =>
                selection.variantIds.includes(variant.id),
              ),
          )
        : snapshot.products
      const confirmed = new Map(
        retained.map((record) => [record.product.id, record]),
      )
      records.forEach((record) => confirmed.set(record.product.id, record))
      snapshot = { ...snapshot, products: [...confirmed.values()] }
      mergeEditorial()
      notify()
    },
    peekSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    invalidate() {
      generation += 1
      completedAt = -Infinity
      pending = undefined
      metadataCompletedAt = -Infinity
      metadataPending = undefined
      // A confirmed administrative write refreshes mounted public consumers.
      // Keep the previous confirmed snapshot while reading to avoid a blank
      // intermediate render. An error clears it and reaches explicit callers.
      // Current route loaders revalidate their own bounded data. A catalog
      // mutation must not trigger an unsolicited download of every product.
    },
  }
}

export function createRemoteStorefrontTransport() {
  return {
    async readPage(limit: number, offset: number) {
      const { data, error } = await requireSupabaseClient().rpc(
        'catalog_products',
        { p_limit: limit, p_offset: offset },
      )
      if (error) throw new CatalogReadError()
      return data
    },
    async readBrands() {
      const { data, error } =
        await requireSupabaseClient().rpc('catalog_brands')
      if (error) throw new CatalogReadError()
      return data
    },
    async readSettings() {
      const { data, error } =
        await requireSupabaseClient().rpc('catalog_settings')
      if (error) throw new CatalogReadError()
      return data
    },
  }
}
