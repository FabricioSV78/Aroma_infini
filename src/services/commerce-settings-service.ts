import type { AdminPromotion, AdminSaveResult } from '../types/admin'
import type { ShippingSettings, ShippingZone } from '../types/shipping'
import type { Database, Json } from '../types/database.generated'
import { adminService, applyRemoteCommerceSettings } from './admin-service'
import { authService } from './auth-service'
import { isRemoteCatalog } from './catalog-source'
import { requireSupabaseClient } from './supabase-client'
import { verifySupabaseUser } from './verified-auth-user'
import {
  cachedPublicQuery,
  invalidatePublicQueryCache,
} from './public-query-cache'
import { UserFacingError } from './admin-messages'
import {
  isValidPeruLocation,
  getPeruProvinceOptions,
  peruDepartments,
} from '../content/peru'
import { emptyShippingSettings } from './shipping-rates'
export { emptyShippingSettings } from './shipping-rates'

function invalid(): never {
  throw new UserFacingError(
    'response',
    'No pudimos verificar la configuración comercial. Vuelve a cargar la página.',
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    invalid()
  return value
}
function integer(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    invalid()
  return value
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
  return value
}
function date(value: unknown): string {
  const result = text(value, 64, true)
  if (result && !Number.isFinite(Date.parse(result))) invalid()
  return result
}
function uuid(value: unknown): string {
  const result = text(value, 36)
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(result)) invalid()
  return result
}
function zoneFromDto(value: unknown): ShippingZone {
  const source = object(value),
    department = text(source.department, 80)
  const province = source.province === null ? null : text(source.province, 4)
  const district = source.district === null ? null : text(source.district, 6)
  if (
    !peruDepartments.some((item) => item.value === department) ||
    (province &&
      !getPeruProvinceOptions(department).some(
        (item) => item.value === province,
      )) ||
    (district &&
      (!province || !isValidPeruLocation(department, province, district)))
  )
    invalid()
  return {
    id: text(source.id, 100),
    name: text(source.name, 120),
    department,
    province,
    district,
    courierFeeCents: integer(source.courierFeeCents),
    motorizadoFeeCents:
      source.motorizadoFeeCents === null
        ? null
        : integer(source.motorizadoFeeCents),
    estimate: text(source.estimate, 80),
    active: boolean(source.active),
  }
}
export function parseShippingSettings(value: unknown): ShippingSettings {
  const source = object(value)
  if (!Array.isArray(source.zones) || source.zones.length > 1000) invalid()
  const zones = source.zones.map(zoneFromDto)
  if (
    new Set(zones.map((zone) => zone.id)).size !== zones.length ||
    new Set(
      zones.map(
        (zone) =>
          `${zone.department}:${zone.province ?? '*'}:${zone.district ?? '*'}`,
      ),
    ).size !== zones.length
  )
    invalid()
  return {
    configured: true,
    freeThresholdCents: integer(source.freeThresholdCents),
    provinceShippingEnabled: boolean(source.provinceShippingEnabled),
    nationalCourierFeeCents: integer(source.nationalCourierFeeCents),
    nationalEstimate: text(source.nationalEstimate, 80, true),
    zones,
  }
}
export interface ShippingEnvelope {
  shipping: ShippingSettings
  shippingVersion: number
}
export function parseShippingEnvelope(value: unknown): ShippingEnvelope {
  const source = object(value),
    version = integer(source.shippingVersion)
  if ((source.shipping === null) !== (version === 0)) invalid()
  return {
    shipping:
      source.shipping === null
        ? emptyShippingSettings()
        : parseShippingSettings(source.shipping),
    shippingVersion: version,
  }
}
function couponFromDto(value: unknown, version: unknown): AdminPromotion {
  const source = object(value),
    type = source.type
  if (type !== 'fixed' && type !== 'percent') invalid()
  if (
    typeof source.value !== 'number' ||
    !Number.isFinite(source.value) ||
    source.value <= 0 ||
    (type === 'percent' && source.value > 100)
  )
    invalid()
  const usageLimit =
    source.usageLimit === null ? null : integer(source.usageLimit, 1)
  return {
    id: uuid(source.id),
    code: text(source.code, 80),
    active: boolean(source.active),
    type,
    value: source.value,
    minimumCents: integer(source.minimumCents),
    startsAt: date(source.startsAt),
    endsAt: date(source.endsAt),
    usageLimit,
    used: integer(source.used),
    version: integer(version, 1),
  }
}
function parseAdminSettings(value: unknown) {
  const source = object(value),
    shipping = parseShippingEnvelope(source),
    versions = object(source.couponVersions)
  if (!Array.isArray(source.coupons) || source.coupons.length > 10000) invalid()
  const promotions = source.coupons.map((value) =>
    couponFromDto(value, versions[String(object(value).id)]),
  )
  if (
    new Set(promotions.map((item) => item.id)).size !== promotions.length ||
    new Set(promotions.map((item) => item.code)).size !== promotions.length
  )
    invalid()
  return { ...shipping, promotions }
}

let publicState: ShippingEnvelope = {
  shipping: emptyShippingSettings(),
  shippingVersion: 0,
}
const publicListeners = new Set<() => void>()
export const publicShippingSettings = {
  peek: () => publicState.shipping,
  version: () => publicState.shippingVersion,
  subscribe(listener: () => void) {
    publicListeners.add(listener)
    return () => {
      publicListeners.delete(listener)
    }
  },
  confirm(value: unknown) {
    const next = parseShippingEnvelope(value)
    if (next.shippingVersion < publicState.shippingVersion) return
    if (JSON.stringify(next) === JSON.stringify(publicState)) return
    publicState = next
    publicListeners.forEach((listener) => listener())
  },
  async load() {
    if (!isRemoteCatalog) return adminService.getSnapshot().shipping
    const value = await cachedPublicQuery(
      'commerce-settings',
      async () => {
        const { data, error } =
          await requireSupabaseClient().rpc('commerce_settings')
        if (error)
          throw new UserFacingError(
            'network',
            'No pudimos cargar las opciones de entrega. Revisa tu conexión y vuelve a intentar.',
          )
        return data
      },
      30000,
    )
    publicShippingSettings.confirm(value)
    return publicState.shipping
  },
}

interface Actor {
  userId: string
  token: string
  epoch: number
}
function currentAdminOwner(): string | null {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    !state.session.mfaRequired &&
    state.session.intent === 'account'
    ? state.session.user.id
    : null
}
let sessionEpoch = 0,
  sessionOwner = currentAdminOwner()
let settingsLoading: { actor: Actor; task: Promise<void> } | undefined
if (isRemoteCatalog)
  authService.subscribe(() => {
    const owner = currentAdminOwner()
    if (owner !== sessionOwner) {
      sessionOwner = owner
      sessionEpoch++
      settingsLoading = undefined
      applyRemoteCommerceSettings({
        shipping: emptyShippingSettings(),
        shippingVersion: 0,
        promotions: [],
      })
    }
  })
function sessionError(): never {
  sessionEpoch++
  settingsLoading = undefined
  applyRemoteCommerceSettings({
    shipping: emptyShippingSettings(),
    shippingVersion: 0,
    promotions: [],
  })
  throw new UserFacingError(
    'session',
    'Tu sesión administrativa cambió. Inicia sesión de nuevo antes de continuar.',
  )
}
async function stillActor(expected: Actor) {
  const state = authService.getSnapshot(),
    { data, error } = await requireSupabaseClient().auth.getSession()
  if (
    error ||
    expected.epoch !== sessionEpoch ||
    state.status !== 'authenticated' ||
    state.session?.user.id !== expected.userId ||
    state.session.user.role !== 'admin' ||
    state.session.mfaRequired ||
    state.session.intent !== 'account' ||
    data.session?.user.id !== expected.userId
  )
    sessionError()
}
async function actor(): Promise<Actor> {
  const startedEpoch = sessionEpoch,
    state = authService.getSnapshot()
  if (
    state.status !== 'authenticated' ||
    state.session?.user.role !== 'admin' ||
    state.session.mfaRequired ||
    state.session.intent !== 'account'
  )
    sessionError()
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (error || data.session?.user.id !== state.session.user.id) sessionError()
  const expected = {
    userId: state.session.user.id,
    token: data.session!.access_token,
    epoch: startedEpoch,
  }
  const verified = await verifySupabaseUser(expected.token)
  if (verified.error || verified.data.user?.id !== expected.userId)
    sessionError()
  await stillActor(expected)
  return expected
}
function checkError(error: { code?: string } | null, status: number) {
  if (!error) return
  if (status === 401 || status === 403 || error.code === '42501') sessionError()
  if (error.code === 'PT409' || error.code === '40001')
    throw new UserFacingError(
      'conflict',
      'Otra persona modificó esta configuración. Conserva tus cambios y vuelve a abrirla para revisar la versión actual.',
    )
  if (error.code === '23505')
    throw new UserFacingError(
      'duplicate',
      'Ese código ya existe. Usa otro código para el cupón.',
    )
  if (error.code === '23503')
    throw new UserFacingError(
      'referenced',
      'El cupón está relacionado con otros registros. Desactívalo para conservar su historial.',
    )
  if (['22023', '23514', '23502', '22P02', '22003'].includes(error.code ?? ''))
    throw new UserFacingError(
      'validation',
      'Revisa los valores, fechas y opciones de la configuración antes de guardar.',
    )
  throw new UserFacingError(
    'network',
    'No pudimos confirmar el guardado. Conserva tus cambios y vuelve a intentarlo.',
  )
}
type RpcName = keyof Database['api']['Functions']
async function rpc<N extends RpcName>(
  name: N,
  args: Database['api']['Functions'][N]['Args'] | undefined,
  expected: Actor,
) {
  await stillActor(expected)
  const response = await requireSupabaseClient()
    .rpc(name, args)
    .setHeader('Authorization', `Bearer ${expected.token}`)
  await stillActor(expected)
  checkError(response.error, response.status)
  return response.data
}
export async function loadAdminCommerceSettings(): Promise<void> {
  if (!isRemoteCatalog) return
  const current = await actor()
  if (
    settingsLoading?.actor.userId === current.userId &&
    settingsLoading.actor.epoch === current.epoch &&
    settingsLoading.actor.token === current.token
  )
    return settingsLoading.task
  const task = (async () => {
    const data = parseAdminSettings(
      await rpc('admin_commerce_settings', undefined, current),
    )
    await stillActor(current)
    applyRemoteCommerceSettings(data)
  })()
  settingsLoading = { actor: current, task }
  try {
    await task
  } finally {
    if (settingsLoading?.task === task) settingsLoading = undefined
  }
}
const json = (value: unknown) => value as Json

export const commerceSettingsService = {
  async saveShipping(
    shipping: ShippingSettings,
    expectedVersion: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return adminService.saveShipping(shipping)
    const current = await actor()
    const { configured: _configured, ...payload } = shipping
    void _configured
    const response = object(
      await rpc(
        'admin_save_shipping',
        { p_shipping: json(payload), p_expected_version: expectedVersion },
        current,
      ),
    )
    const canonical = parseShippingSettings(response.shipping),
      version = integer(response.version, 1)
    const publicEnvelope = parseShippingEnvelope({
      shipping: response.publicShipping,
      shippingVersion: version,
    })
    await stillActor(current)
    applyRemoteCommerceSettings({
      shipping: canonical,
      shippingVersion: version,
      promotions: adminService.getSnapshot().promotions,
    })
    invalidatePublicQueryCache()
    publicShippingSettings.confirm({
      shipping: publicEnvelope.shipping,
      shippingVersion: version,
    })
    return { kind: 'saved' }
  },
  async savePromotion(promotion: AdminPromotion): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return adminService.savePromotion(promotion)
    const current = await actor()
    const { used: _used, version: _version, ...payload } = promotion
    void _used
    void _version
    for (const key of ['startsAt', 'endsAt'] as const) {
      if (payload[key]) {
        const timestamp = new Date(payload[key]).getTime()
        if (!Number.isFinite(timestamp))
          return {
            kind: 'validation',
            message: 'Revisa las fechas de vigencia del cupón.',
          }
        payload[key] = new Date(timestamp).toISOString()
      }
    }
    const response = object(
      await rpc(
        'admin_save_coupon',
        { p_coupon: json(payload), p_expected_version: promotion.version ?? 0 },
        current,
      ),
    )
    const canonical = couponFromDto(response.coupon, response.version)
    await stillActor(current)
    const snapshot = adminService.getSnapshot()
    applyRemoteCommerceSettings({
      shipping: snapshot.shipping,
      shippingVersion: snapshot.shippingVersion ?? 0,
      promotions: [
        ...snapshot.promotions.filter((item) => item.id !== canonical.id),
        canonical,
      ],
    })
    return { kind: 'saved' }
  },
  async setPromotionActive(
    id: string,
    active: boolean,
    expectedVersion?: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) {
      adminService.setPromotionActive(id, active)
      return { kind: 'saved' }
    }
    const item = adminService
      .getSnapshot()
      .promotions.find((value) => value.id === id)
    if (!item)
      return {
        kind: 'validation',
        message: 'Ese cupón ya no está disponible. Actualiza la lista.',
      }
    return commerceSettingsService.savePromotion({
      ...item,
      active,
      version: expectedVersion ?? item.version,
    })
  },
  async deletePromotion(
    id: string,
    expectedVersion: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return adminService.deletePromotion(id)
    const current = await actor()
    await rpc(
      'admin_delete_coupon',
      { p_id: id, p_expected_version: expectedVersion },
      current,
    )
    const snapshot = adminService.getSnapshot()
    applyRemoteCommerceSettings({
      shipping: snapshot.shipping,
      shippingVersion: snapshot.shippingVersion ?? 0,
      promotions: snapshot.promotions.filter((item) => item.id !== id),
    })
    return { kind: 'saved' }
  },
}
