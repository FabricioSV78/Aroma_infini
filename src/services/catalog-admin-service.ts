import type {
  AdminBrand,
  AdminProduct,
  AdminSaveResult,
  BatchBrandSaveResult,
} from '../types/admin'
import type { ProductDiscount } from '../types/catalog'
import type { StoreFeatures } from '../domain/store-features'
import {
  brandNameKey,
  previewBrandRegistration,
} from '../domain/brand-registration'
import type { Database, Json } from '../types/database.generated'
import {
  adminService as local,
  applyRemoteCatalog,
  applyRemoteHome,
} from './admin-service'
import { isRemoteCatalog } from './catalog-source'
import { authService } from './auth-service'
import { requireSupabaseClient } from './supabase-client'
import { verifySupabaseUser } from './verified-auth-user'
import { readAdminPageBatches } from './admin-page-batches'
import {
  parseCatalogBrand,
  parseCatalogProductRecord,
} from './supabase-storefront'
import { invalidateSupabaseStorefront } from './storefront-repository'
import { UserFacingError } from './admin-messages'
import type { HomeContent, HomeMedia } from '../types/home'
import { validateHomeContent } from '../content/home-editor'
import { uploadProductMedia } from './media-upload'
import {
  parseOlfactoryFamilyDefinitions,
  replaceOlfactoryFamilies,
  validateOlfactoryFamilyName,
  type OlfactoryFamilyDefinition,
} from '../domain/olfactory-family'
import {
  parseHomeDocument,
  prepareHomeDocument,
  publicHomeContent,
} from './home-content-service'

type RpcName = keyof Database['api']['Functions']
type RpcArgs<N extends RpcName> = Database['api']['Functions'][N]['Args']
interface Actor {
  userId: string
  token: string
  epoch: number
}
let sessionEpoch = 0
function currentAdminOwner(): string | null {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    !state.session.mfaRequired &&
    state.session.intent === 'account'
    ? state.session.user.id
    : null
}
let sessionOwner: string | null = currentAdminOwner()
let loadedOwner: string | null = null
let loading: Promise<void> | undefined
let loadingOwner: string | null = null
let epoch = 0
let readRevision = 0
let settingsVersion: number | null = null

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UserFacingError(
      'response',
      'La respuesta del catálogo no es válida. Vuelve a cargar la página.',
    )
  return value as Record<string, unknown>
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new UserFacingError(
      'response',
      'No pudimos verificar la versión del catálogo. Vuelve a cargar la página.',
    )
  return value
}
function features(value: unknown): StoreFeatures {
  const settings = object(value)
  if (typeof settings.complementsEnabled !== 'boolean')
    throw new UserFacingError(
      'response',
      'No pudimos leer la configuración del catálogo.',
    )
  return { complementsEnabled: settings.complementsEnabled }
}
function catalogPage(value: unknown): Record<string, unknown> {
  const page = object(value)
  if (
    !Array.isArray(page.products) ||
    page.products.length > 100 ||
    !Array.isArray(page.brands) ||
    !Array.isArray(page.olfactoryFamilies) ||
    typeof page.total !== 'number' ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0 ||
    page.total > 10000 ||
    (page.total > 0 && page.products.length === 0)
  )
    throw new UserFacingError(
      'response',
      'La respuesta del catálogo está incompleta o no es válida. Vuelve a cargarlo.',
    )
  object(page.productVersions)
  object(page.brandVersions)
  features(page.features)
  revision(page.settingsVersion)
  return page
}
function product(value: unknown, version: unknown): AdminProduct {
  const source = object(value)
  if (
    typeof source.active !== 'boolean' ||
    typeof source.lowStockThreshold !== 'number' ||
    !Number.isSafeInteger(source.lowStockThreshold) ||
    source.lowStockThreshold < 0
  )
    throw new UserFacingError(
      'response',
      'No pudimos leer el producto. Vuelve a cargar la página.',
    )
  return {
    ...parseCatalogProductRecord(source, true),
    active: source.active,
    lowStockThreshold: source.lowStockThreshold,
    version: revision(version),
  }
}
function brand(value: unknown, version: unknown): AdminBrand {
  const source = object(value)
  if (typeof source.active !== 'boolean')
    throw new UserFacingError('response', 'No pudimos leer la marca.')
  return {
    ...parseCatalogBrand(source),
    active: source.active,
    version: revision(version),
  }
}

function sessionError(): never {
  throw new UserFacingError(
    'session',
    'Tu sesión administrativa cambió. Inicia sesión de nuevo antes de continuar.',
  )
}
async function actor(): Promise<Actor> {
  const startedEpoch = sessionEpoch
  const state = authService.getSnapshot()
  if (
    state.status !== 'authenticated' ||
    state.session?.user.role !== 'admin' ||
    state.session.mfaRequired ||
    state.session.intent !== 'account'
  )
    sessionError()
  const userId = state.session.user.id
  const client = requireSupabaseClient()
  const { data: current, error } = await client.auth.getSession()
  if (error || !current.session || current.session.user.id !== userId)
    sessionError()
  const token = current.session.access_token
  const verified = await verifySupabaseUser(token)
  if (verified.error || verified.data.user?.id !== userId) sessionError()
  const expected = { userId, token, epoch: startedEpoch }
  await stillActor(expected)
  return expected
}
async function stillActor(expected: Actor) {
  const state = authService.getSnapshot()
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (
    error ||
    expected.epoch !== sessionEpoch ||
    state.status !== 'authenticated' ||
    state.session?.user.id !== expected.userId ||
    state.session.user.role !== 'admin' ||
    state.session.mfaRequired ||
    data.session?.user.id !== expected.userId
  )
    sessionError()
}

function checkError(error: { code?: string } | null, status: number): void {
  if (!error) return
  if (
    status === 401 ||
    status === 403 ||
    ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '')
  )
    sessionError()
  if (error.code === 'PT409' || error.code === '40001')
    throw new UserFacingError(
      'conflict',
      'Otra persona modificó este registro. Conserva tus cambios y vuelve a abrirlo para revisar la versión actual.',
    )
  if (error.code === '23505')
    throw new UserFacingError(
      'duplicate',
      'Ya existe un producto, marca, URL o SKU con esos datos. Revisa el registro antes de guardar.',
    )
  if (error.code === '23503')
    throw new UserFacingError(
      'referenced',
      'Este registro está asociado a otros datos. Revisa sus productos y referencias antes de cambiarlo.',
    )
  if (['22023', '23514', '23502', '22P02', '22003'].includes(error.code ?? ''))
    throw new UserFacingError(
      'validation',
      'Revisa los campos del registro: marca, presentaciones, precios, descuento e imágenes almacenadas.',
    )
  throw new UserFacingError(
    'network',
    'No pudimos confirmar el guardado con Supabase. Conserva tus datos y revisa el listado antes de volver a intentarlo.',
  )
}

async function rpc<N extends RpcName>(
  name: N,
  args: RpcArgs<N> | undefined,
  expected: Actor,
): Promise<unknown> {
  await stillActor(expected)
  const response = await requireSupabaseClient()
    .rpc(name, args)
    .setHeader('Authorization', `Bearer ${expected.token}`)
  await stillActor(expected)
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.error?.code === '42501'
  )
    clearRemoteCatalog()
  if (response.error?.code === 'PT409' || response.error?.code === '40001') {
    // Keep the editor's original version, but refresh the list used when the
    // administrator returns to review the newer record. No automatic retry.
    await loadAdminCatalog(true).catch(() => {})
  }
  checkError(response.error, response.status)
  return response.data
}

function invalidateCatalogReads() {
  readRevision++
  loading = undefined
  loadingOwner = null
}
/** Only the SQL association/write invalidates reads; preparation/R2 uploads do not. */
async function command<N extends RpcName>(
  name: N,
  args: RpcArgs<N> | undefined,
  expected: Actor,
): Promise<unknown> {
  invalidateCatalogReads()
  try {
    return await rpc(name, args, expected)
  } finally {
    // Also obsolete reads started while the write was awaiting its response.
    invalidateCatalogReads()
  }
}

function clearRemoteCatalog() {
  epoch++
  loadedOwner = null
  settingsVersion = null
  loading = undefined
  loadingOwner = null
  applyRemoteCatalog({
    products: [],
    brands: [],
    features: { complementsEnabled: false },
  })
}

/** Reuse only the complete, already-authorized in-memory catalog of this
 * still-valid owner. This is not an authorization result or a write shortcut. */
export function hasCurrentAdminCatalog(): boolean {
  if (!isRemoteCatalog || !loadedOwner) return false
  const state = authService.getSnapshot()
  return (
    state.status === 'authenticated' &&
    state.session?.user.id === loadedOwner &&
    state.session.user.role === 'admin' &&
    state.session.intent === 'account' &&
    !state.session.mfaRequired &&
    state.session.expiresAt > Date.now()
  )
}

/** Home is loaded only for its editor; other admin lists need no editorial payload. */
export async function loadAdminHome(): Promise<void> {
  if (!isRemoteCatalog) return
  // The catalog continuity check and Home actor check use the same current
  // credential. Share their in-flight verification instead of serializing it.
  const [, current] = await Promise.all([loadAdminCatalog(), actor()])
  const value = await rpc('admin_home_document', undefined, current)
  const home = parseHomeDocument(
    value,
    local.getSnapshot().homeContent.featuredBrandId,
  )
  await stillActor(current)
  applyRemoteHome(home, settingsVersion ?? undefined)
}
if (isRemoteCatalog)
  authService.subscribe(() => {
    const state = authService.getSnapshot()
    const currentOwner =
      state.status === 'authenticated' &&
      state.session?.user.role === 'admin' &&
      !state.session.mfaRequired &&
      state.session.intent === 'account'
        ? state.session.user.id
        : null
    if (sessionOwner !== currentOwner) {
      sessionOwner = currentOwner
      sessionEpoch++
    }
    if (
      loadedOwner &&
      (state.status !== 'authenticated' ||
        state.session?.user.id !== loadedOwner ||
        state.session.user.role !== 'admin' ||
        state.session.mfaRequired)
    )
      clearRemoteCatalog()
  })

/** Loads only the authorized catalog; never copies browser fixtures into SQL. */
export async function loadAdminCatalog(force = false): Promise<void> {
  if (!isRemoteCatalog) return
  const current = await actor()
  if (loadedOwner === current.userId && !force) return
  if (loading && loadingOwner === current.userId) return loading
  const started = ++epoch
  const startedReadRevision = readRevision
  const operation = (async () => {
    const products: AdminProduct[] = []
    let brands: AdminBrand[] = []
    let selectedFeatures: StoreFeatures = { complementsEnabled: false }
    let selectedVersion = 0
    let featuredBrandId: string | null = null
    let olfactoryFamilies: OlfactoryFamilyDefinition[] = []
    const ids = new Set<string>()
    const { pages, total } = await readAdminPageBatches(
      async (offset) =>
        catalogPage(
          await rpc(
            'admin_catalog_page',
            { p_limit: 100, p_offset: offset },
            current,
          ),
        ),
      (page) => page.total,
      () => {
        throw new UserFacingError(
          'response',
          'El catálogo cambió durante la carga o excede el límite de esta consulta. Vuelve a cargarlo.',
        )
      },
    )
    for (const [index, page] of pages.entries()) {
      const offset = index * 100
      if (
        !Array.isArray(page.products) ||
        !Array.isArray(page.brands) ||
        typeof page.total !== 'number' ||
        !Number.isSafeInteger(page.total) ||
        page.total < 0 ||
        page.total > 10000 ||
        page.total !== total
      )
        throw new UserFacingError(
          'response',
          'El catálogo cambió durante la carga o excede el límite de esta consulta. Vuelve a cargarlo.',
        )
      const versions = object(page.productVersions)
      const pageFamilies = parseOlfactoryFamilyDefinitions(
        page.olfactoryFamilies,
        true,
      )
      if (offset === 0) olfactoryFamilies = pageFamilies
      else if (
        JSON.stringify(pageFamilies) !== JSON.stringify(olfactoryFamilies)
      )
        throw new UserFacingError(
          'response',
          'Las familias cambiaron durante la carga. Vuelve a intentarlo.',
        )
      await stillActor(current)
      if (startedReadRevision !== readRevision) return
      replaceOlfactoryFamilies(olfactoryFamilies)
      const brandVersions = object(page.brandVersions)
      const records = page.products.map((entry) => {
        const id = object(object(entry).product).id
        if (typeof id !== 'string')
          throw new UserFacingError(
            'response',
            'El producto no tiene un identificador válido.',
          )
        const record = product(entry, versions[id])
        if (ids.has(id))
          throw new UserFacingError(
            'response',
            'El catálogo cambió durante la carga. Vuelve a cargarlo.',
          )
        ids.add(id)
        return record
      })
      if (records.length > 100 || (records.length === 0 && offset < total))
        throw new UserFacingError(
          'response',
          'La respuesta del catálogo está incompleta.',
        )
      products.push(...records)
      if (offset === 0) {
        brands = page.brands.map((entry) => {
          const id = object(entry).id
          if (typeof id !== 'string')
            throw new UserFacingError(
              'response',
              'La marca no tiene un identificador válido.',
            )
          return brand(entry, brandVersions[id])
        })
        selectedFeatures = features(page.features)
        selectedVersion = revision(page.settingsVersion)
        featuredBrandId =
          typeof page.featuredBrandId === 'string' ? page.featuredBrandId : null
      }
    }
    if (products.length !== total)
      throw new UserFacingError(
        'response',
        'El catálogo está incompleto. Vuelve a cargarlo.',
      )
    await stillActor(current)
    if (startedReadRevision !== readRevision) return
    if (started !== epoch) sessionError()
    loadedOwner = current.userId
    settingsVersion = selectedVersion
    applyRemoteCatalog({
      products,
      brands,
      features: selectedFeatures,
      featuredBrandId,
      olfactoryFamilies,
    })
  })()
  loading = operation
  loadingOwner = current.userId
  try {
    await operation
  } finally {
    if (loading === operation) {
      loading = undefined
      loadingOwner = null
    }
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const draftIds = new Map<string, string>()
function canonicalId(id: string) {
  if (uuidPattern.test(id)) return id
  let canonical = draftIds.get(id)
  if (!canonical) {
    canonical = crypto.randomUUID()
    draftIds.set(id, canonical)
  }
  return canonical
}
function writeRecord(record: AdminProduct): AdminProduct {
  return {
    ...record,
    newest: Math.min(2147483647, Math.max(0, Math.trunc(record.newest))),
    product: {
      ...record.product,
      id: canonicalId(record.product.id),
      variants: record.product.variants.map((variant) => ({
        ...variant,
        id: canonicalId(variant.id),
      })),
    },
  }
}
function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
function mediaError(record: AdminProduct): AdminSaveResult | null {
  if (
    [
      record.product.image,
      record.detail.olfactoryImage,
      ...record.detail.gallery.map((image) => image.image),
    ].some((image) => image && /^(data:|blob:)/i.test(image))
  )
    return {
      kind: 'validation',
      message:
        'Las fotografías nuevas necesitan almacenamiento permanente. La conexión con R2 está pendiente; conserva tus archivos.',
    }
  return null
}
async function savedProduct(value: unknown, current: Actor) {
  const result = object(value)
  const record = product(result.record, result.version)
  await stillActor(current)
  const snapshot = local.getSnapshot()
  applyRemoteCatalog({
    products: [
      ...snapshot.products.filter(
        (item) => item.product.id !== record.product.id,
      ),
      record,
    ],
    brands: snapshot.brands,
    features: snapshot.features,
  })
  invalidateSupabaseStorefront()
  return { kind: 'saved' as const }
}

/** Match the reviewed command, allowing only server-issued product/variant SKUs.
 * Sorting by UUID avoids treating the SQL row order as an import difference. */
function sameImportedRecord(saved: AdminProduct, requested: AdminProduct) {
  const variants = new Map(
    saved.product.variants.map((item) => [item.id, item]),
  )
  const expected = product(
    {
      ...requested,
      product: {
        ...requested.product,
        sku: saved.product.sku,
        olfactoryFamilies: requested.product.olfactoryFamilies ?? [],
        discount: requested.product.discount ?? null,
        variants: requested.product.variants.map((variant) => ({
          ...variant,
          sku: variant.sku || variants.get(variant.id)?.sku,
        })),
      },
    },
    saved.version,
  )
  const ordered = (record: AdminProduct) => ({
    ...record,
    product: {
      ...record.product,
      variants: [...record.product.variants].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    },
  })
  return JSON.stringify(ordered(saved)) === JSON.stringify(ordered(expected))
}

async function confirmImportedProducts(
  value: unknown,
  requested: readonly AdminProduct[],
  current: Actor,
) {
  const response = object(value)
  const versions = object(response.productVersions)
  const ids = new Set(requested.map((record) => record.product.id))
  if (
    !Array.isArray(response.products) ||
    response.products.length !== requested.length ||
    ids.size !== requested.length
  )
    throw new UserFacingError(
      'response',
      'No pudimos verificar todos los productos importados. Revisa el listado antes de reintentar.',
    )
  const confirmed = response.products.map((entry) => {
    const id = object(object(entry).product).id
    if (typeof id !== 'string' || !ids.delete(id))
      throw new UserFacingError(
        'response',
        'La importación devolvió un producto inesperado. Revisa el listado.',
      )
    return product(entry, versions[id])
  })
  const expected = new Map(
    requested.map((record) => [record.product.id, record]),
  )
  if (
    confirmed.some(
      (record) =>
        record.version !== 1 ||
        !sameImportedRecord(record, expected.get(record.product.id)!),
    )
  )
    throw new UserFacingError(
      'response',
      'No pudimos confirmar los datos revisados de la importación. Revisa el listado antes de reintentar.',
    )
  await stillActor(current)
  const snapshot = local.getSnapshot()
  const replaced = new Set(confirmed.map((record) => record.product.id))
  applyRemoteCatalog({
    products: [
      ...snapshot.products.filter((record) => !replaced.has(record.product.id)),
      ...confirmed,
    ],
    brands: snapshot.brands,
    features: snapshot.features,
  })
  invalidateSupabaseStorefront()
}

export const catalogAdminService = {
  ...local,
  async saveOlfactoryFamily(input: {
    label: string
    code?: string
    active: boolean
    version?: number
  }): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveOlfactoryFamily(input)
    const invalid = validateOlfactoryFamilyName(input.label, input.code)
    if (invalid) return { kind: 'validation', message: invalid }
    const current = await actor()
    try {
      await command(
        'admin_save_olfactory_family',
        {
          p_label: input.label,
          p_code: input.code,
          p_active: input.active,
          p_expected_version: input.version,
        },
        current,
      )
    } catch (error) {
      if (error instanceof UserFacingError && error.code === 'duplicate')
        return {
          kind: 'validation',
          message:
            'Ya existe una familia con ese nombre. Revisa el listado antes de guardar.',
        }
      throw error
    }
    await stillActor(current)
    const olfactoryFamilies = parseOlfactoryFamilyDefinitions(
      await rpc('admin_olfactory_families', undefined, current),
      true,
    )
    const snapshot = local.getSnapshot()
    applyRemoteCatalog({
      products: snapshot.products,
      brands: snapshot.brands,
      features: snapshot.features,
      olfactoryFamilies,
    })
    invalidateSupabaseStorefront()
    return { kind: 'saved' }
  },
  async deleteOlfactoryFamily(
    code: string,
    version: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.deleteOlfactoryFamily(code, version)
    const current = await actor()
    await command(
      'admin_delete_olfactory_family',
      { p_code: code, p_expected_version: version },
      current,
    )
    await stillActor(current)
    const olfactoryFamilies = parseOlfactoryFamilyDefinitions(
      await rpc('admin_olfactory_families', undefined, current),
      true,
    )
    const snapshot = local.getSnapshot()
    applyRemoteCatalog({
      products: snapshot.products,
      brands: snapshot.brands,
      features: snapshot.features,
      olfactoryFamilies,
    })
    invalidateSupabaseStorefront()
    return { kind: 'saved' }
  },
  async saveProduct(record: AdminProduct): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveProduct(record)
    const current = await actor()
    record = await uploadProductMedia(record, {
      ...current,
      assertCurrent: () => stillActor(current),
    })
    return savedProduct(
      await command(
        'admin_save_product',
        {
          p_record: json(writeRecord(record)),
          p_expected_version: record.version ?? undefined,
        },
        current,
      ),
      current,
    )
  },
  async setProductActive(
    id: string,
    active: boolean,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.setProductActive(id, active)
    const record = local
      .getSnapshot()
      .products.find((item) => item.product.id === id)
    if (!record)
      return {
        kind: 'validation',
        message: 'El producto ya no existe. Vuelve a cargar el catálogo.',
      }
    return catalogAdminService.saveProduct({ ...record, active })
  },
  async saveProductDiscount(
    id: string,
    discount: ProductDiscount | null,
    expectedVersion?: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveProductDiscount(id, discount)
    const record = local
      .getSnapshot()
      .products.find((item) => item.product.id === id)
    if (!record)
      return { kind: 'validation', message: 'El producto ya no existe.' }
    const current = await actor()
    return savedProduct(
      await command(
        'admin_save_offer',
        {
          p_product_id: id,
          p_offer: json(discount),
          p_expected_version: revision(expectedVersion ?? record.version),
        },
        current,
      ),
      current,
    )
  },
  async saveBrand(record: AdminBrand): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveBrand(record)
    const current = await actor()
    await command(
      'admin_save_brand',
      {
        p_brand: json({ ...record, id: canonicalId(record.id) }),
        p_expected_version: record.version ?? undefined,
      },
      current,
    )
    invalidateSupabaseStorefront()
    await loadAdminCatalog(true)
    return { kind: 'saved' }
  },
  async setBrandActive(id: string, active: boolean): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.setBrandActive(id, active)
    const snapshot = local.getSnapshot()
    const record = snapshot.brands.find((item) => item.id === id)
    if (!record)
      return { kind: 'validation', message: 'La marca ya no existe.' }
    if (
      !active &&
      snapshot.products.some(
        (item) => item.active && item.product.brandId === id,
      )
    )
      return {
        kind: 'validation',
        message: 'Desactiva primero los productos visibles de esta marca.',
      }
    return catalogAdminService.saveBrand({ ...record, active })
  },
  async saveBrandsBatch(
    text: string,
    expectedRevision: number,
  ): Promise<BatchBrandSaveResult> {
    if (!isRemoteCatalog) return local.saveBrandsBatch(text, expectedRevision)
    const snapshot = local.getSnapshot()
    if (snapshot.revision !== expectedRevision)
      return {
        kind: 'validation',
        message:
          'Las marcas cambiaron. Vuelve a revisar la lista antes de guardar.',
      }
    const preview = previewBrandRegistration(text, snapshot.brands)
    if (!preview.valid || preview.limitExceeded)
      return {
        kind: 'validation',
        message:
          'Revisa la lista y registra hasta 1000 marcas nuevas por operación.',
      }
    const current = await actor()
    const response = object(
      await command(
        'admin_register_brands',
        { p_names: preview.rows.map((row) => row.name) },
        current,
      ),
    )
    if (!Array.isArray(response.created))
      throw new UserFacingError(
        'response',
        'No pudimos verificar las marcas creadas. Revisa el listado antes de volver a intentarlo.',
      )
    const versions = object(response.versions)
    const created = response.created.map((entry) =>
      brand(entry, versions[String(object(entry).id)]),
    )
    const createdByName = new Map(
      created.map((entry) => [brandNameKey(entry.name), entry]),
    )
    const errors = new Map<number, string>()
    if (!Array.isArray(response.errors) || !Array.isArray(response.existing))
      throw new UserFacingError(
        'response',
        'No pudimos verificar el resultado. Revisa el listado de marcas antes de volver a intentarlo.',
      )
    for (const error of response.errors) {
      const entry = object(error)
      if (typeof entry.line !== 'number' || !Number.isInteger(entry.line))
        throw new UserFacingError(
          'response',
          'El resultado de marcas está incompleto. Revisa el listado.',
        )
      errors.set(
        entry.line,
        'No se pudo registrar esta marca. Revisa su nombre.',
      )
    }
    const existingNames = new Set(
      response.existing.map((name) => brandNameKey(String(name))),
    )
    const actual = {
      ...preview,
      valid: 0,
      existing: 0,
      duplicate: 0,
      error: 0,
      rows: preview.rows.map((row, index) => {
        const saved = createdByName.get(brandNameKey(row.name))
        const failure = errors.get(index + 1)
        const result =
          row.status === 'valid'
            ? {
                ...row,
                status: saved
                  ? ('valid' as const)
                  : failure || !existingNames.has(brandNameKey(row.name))
                    ? ('error' as const)
                    : ('existing' as const),
                slug: saved?.slug ?? row.slug,
                message: saved
                  ? 'Registrada.'
                  : (failure ??
                    (existingNames.has(brandNameKey(row.name))
                      ? 'Esta marca ya está registrada.'
                      : 'No pudimos confirmar esta marca. Revisa el listado.')),
              }
            : row
        return result
      }),
    }
    for (const row of actual.rows) actual[row.status]++
    invalidateSupabaseStorefront()
    await loadAdminCatalog(true)
    return { kind: 'saved', created, preview: actual }
  },
  async saveProductsBatch(
    records: readonly AdminProduct[],
    expectedRevision: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog)
      return local.saveProductsBatch(records, expectedRevision)
    if (local.getSnapshot().revision !== expectedRevision)
      return {
        kind: 'validation',
        message:
          'El catálogo cambió. Vuelve a revisar el archivo antes de importar.',
      }
    for (const record of records) {
      const error = mediaError(record)
      if (error) return error
    }
    const current = await actor()
    const requested = records.map(writeRecord)
    try {
      const response = await command(
        'admin_import_products',
        { p_records: json(requested) },
        current,
      )
      await confirmImportedProducts(response, requested, current)
    } catch (error) {
      if (
        error instanceof UserFacingError &&
        ['session', 'validation', 'referenced'].includes(error.code)
      )
        throw error
      // A lost response can follow a committed transaction. Read the same
      // UUIDs; never manufacture new IDs or repeat a successful import blindly.
      try {
        await loadAdminCatalog(true)
        await stillActor(current)
        const snapshot = local.getSnapshot()
        const found = new Map(
          snapshot.products.map((record) => [record.product.id, record]),
        )
        const confirmed = requested.map((record) =>
          found.get(record.product.id),
        )
        if (
          confirmed.every(
            (record, index) =>
              record?.version === 1 &&
              sameImportedRecord(record, requested[index]),
          )
        ) {
          invalidateSupabaseStorefront()
          return { kind: 'saved' }
        }
      } catch {
        // Preserve the original failure and reviewed file if reconciliation
        // cannot establish the complete exact operation for the same actor.
      }
      throw error
    }
    return { kind: 'saved' }
  },
  async saveStoreFeatures(value: StoreFeatures): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveStoreFeatures(value)
    const current = await actor()
    const response = object(
      await command(
        'admin_save_features',
        {
          p_complements_enabled: value.complementsEnabled,
          p_expected_version: revision(settingsVersion),
        },
        current,
      ),
    )
    const snapshot = local.getSnapshot()
    settingsVersion = revision(response.version)
    applyRemoteCatalog({
      products: snapshot.products,
      brands: snapshot.brands,
      features: features(response.features),
    })
    invalidateSupabaseStorefront()
    return { kind: 'saved' }
  },
  async saveHome(
    media: HomeMedia,
    content: HomeContent,
    value?: StoreFeatures,
    expectedHomeVersion?: number,
    expectedSettingsVersion?: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveHome(media, content, value)
    const invalid = validateHomeContent(content)
    if (invalid) return { kind: 'validation', message: invalid }
    const snapshot = local.getSnapshot()
    const homeVersion = expectedHomeVersion ?? snapshot.homeVersion
    const homeSettingsVersion =
      expectedSettingsVersion ?? snapshot.homeSettingsVersion
    if (
      typeof homeVersion !== 'number' ||
      !Number.isSafeInteger(homeVersion) ||
      homeVersion < 0 ||
      typeof homeSettingsVersion !== 'number' ||
      !Number.isSafeInteger(homeSettingsVersion) ||
      homeSettingsVersion < 1
    )
      throw new UserFacingError(
        'response',
        'Vuelve a cargar el editor del Home antes de guardar los cambios.',
      )
    const current = await actor()
    const selectedFeatures = value ?? snapshot.features
    const prepared = await prepareHomeDocument(media, content, {
      userId: current.userId,
      token: current.token,
      assertCurrent: () => stillActor(current),
    })
    const response = object(
      await command(
        'admin_save_home',
        {
          p_media: json(prepared.media),
          p_content: json(prepared.content),
          p_complements_enabled: selectedFeatures.complementsEnabled,
          p_featured_brand_id: content.featuredBrandId ?? undefined,
          p_expected_version: homeVersion,
          p_expected_settings_version: homeSettingsVersion,
        },
        current,
      ),
    )
    const canonicalHome = parseHomeDocument(
      response.home,
      content.featuredBrandId,
    )
    await stillActor(current)
    settingsVersion = revision(response.settingsVersion)
    const canonicalFeatures = features(response.features)
    const latest = local.getSnapshot()
    applyRemoteCatalog({
      products: latest.products,
      brands: latest.brands,
      features: canonicalFeatures,
      featuredBrandId: content.featuredBrandId,
    })
    applyRemoteHome(canonicalHome, settingsVersion)
    invalidateSupabaseStorefront()
    publicHomeContent.confirm(canonicalHome)
    return { kind: 'saved' }
  },
}
