import type { Database } from '../types/database.generated'
import {
  isImageMediaPurpose,
  parseManagedMediaAsset,
  parseManagedVideoAsset,
  parseManagedSvgAsset,
  validPreparedImageDimensions,
  type ImageMediaPurpose,
  type ManagedMediaAsset,
  type ManagedVideoAsset,
  type ManagedSvgAsset,
} from '../domain/media'
import { authService } from './auth-service'
import { isRemoteCatalog } from './catalog-source'
import { requireSupabaseClient } from './supabase-client'
import { verifySupabaseUser } from './verified-auth-user'
import { registerManagedMedia, registerManagedVideo } from './media-registry'
import { UserFacingError } from './admin-messages'
import type { ExpectedMediaActor } from './media-upload'

export const MEDIA_LIBRARY_SECTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'products', label: 'Productos' },
  { value: 'about', label: 'Nosotros' },
  { value: 'account', label: 'Cuenta' },
  { value: 'identity', label: 'Identidad' },
  { value: 'seo', label: 'Vista al compartir' },
  { value: 'other', label: 'Otros' },
] as const
export type MediaLibrarySection =
  (typeof MEDIA_LIBRARY_SECTIONS)[number]['value']
export type MediaLibraryState =
  'used' | 'unused' | 'pending' | 'deleting' | 'deleted' | 'disabled'
export const mediaStateLabels: Record<MediaLibraryState, string> = {
  used: 'En uso',
  unused: 'Sin usar',
  pending: 'Preparando',
  deleting: 'Eliminando',
  deleted: 'Eliminado',
  disabled: 'Desactivado',
}
export type MediaLibraryFilter =
  'all' | 'used' | 'unused' | 'pending' | 'deleted'
export type LibraryAsset =
  ManagedMediaAsset | ManagedVideoAsset | ManagedSvgAsset
export interface MediaLibraryItem {
  id: string
  name: string
  alt: string
  section: MediaLibrarySection
  version: number
  purpose: ImageMediaPurpose | 'film-video' | 'site-vector'
  state: MediaLibraryState
  createdAt: string
  retireAfter: string | null
  useCount: number
  asset: LibraryAsset | null
}
export interface MediaLibraryPage {
  items: MediaLibraryItem[]
  total: number
  page: number
  pageSize: number
}
export interface MediaLibraryDetail extends MediaLibraryItem {
  usages: { section: string; label: string; key: string }[]
  events: { id: string; type: string; createdAt: string; code: string | null }[]
}
type RpcName = keyof Database['api']['Functions']
type RpcArgs<N extends RpcName> = Database['api']['Functions'][N]['Args']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let actorGeneration = 0
let previousOwner: string | null = null

function owner() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    !state.session.mfaRequired &&
    state.session.intent === 'account'
    ? state.session.user.id
    : null
}
previousOwner = owner()
authService.subscribe(() => {
  const nextOwner = owner()
  if (previousOwner !== nextOwner) {
    actorGeneration++
    previousOwner = nextOwner
  }
})
function invalid(): never {
  throw new UserFacingError(
    'media-response',
    'No pudimos verificar la biblioteca. Vuelve a cargar los archivos.',
  )
}
function sessionError(): never {
  throw new UserFacingError(
    'media-session',
    'Tu sesión administrativa cambió. Inicia sesión de nuevo antes de continuar.',
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) invalid()
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
function date(value: unknown): string {
  const result = boundedText(value, 64)
  if (!Number.isFinite(Date.parse(result))) invalid()
  return result
}
function parseItem(value: unknown): MediaLibraryItem {
  const source = object(value)
  if (
    typeof source.id !== 'string' ||
    !uuid.test(source.id) ||
    !MEDIA_LIBRARY_SECTIONS.some(
      (section) => section.value === source.section,
    ) ||
    !['used', 'unused', 'pending', 'deleting', 'deleted', 'disabled'].includes(
      String(source.state),
    ) ||
    !(
      source.purpose === 'film-video' ||
      source.purpose === 'site-vector' ||
      isImageMediaPurpose(source.purpose)
    )
  )
    invalid()
  const supplied = source.asset == null ? null : object(source.asset)
  const asset = !supplied
    ? null
    : supplied.mimeType === 'image/svg+xml'
      ? parseManagedSvgAsset(supplied)
      : source.purpose === 'film-video'
        ? parseManagedVideoAsset(supplied)
        : parseManagedMediaAsset(supplied)
  if (asset && asset.id !== source.id) invalid()
  if (['used', 'unused'].includes(String(source.state)) && !asset) invalid()
  return {
    id: source.id,
    name: boundedText(source.name, 200),
    alt: boundedText(source.alt, 500),
    section: source.section as MediaLibrarySection,
    version: integer(source.version, 1),
    purpose: source.purpose,
    state: source.state as MediaLibraryState,
    createdAt: date(source.createdAt),
    retireAfter: source.retireAfter == null ? null : date(source.retireAfter),
    useCount: integer(source.useCount),
    asset,
  }
}
function register(item: MediaLibraryItem) {
  if (item.asset) {
    if ('variants' in item.asset) registerManagedMedia(item.asset)
    else if (item.asset.mimeType === 'video/mp4')
      registerManagedVideo(item.asset)
  }
}
export function parseMediaLibraryPage(value: unknown): MediaLibraryPage {
  const source = object(value)
  if (!Array.isArray(source.items) || source.items.length > 100) invalid()
  const items = source.items.map(parseItem)
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid()
  const page = {
    items,
    total: integer(source.total),
    page: integer(source.page, 1),
    pageSize: integer(source.pageSize, 1),
  }
  if (page.pageSize > 100 || page.items.length > page.pageSize) invalid()
  items.forEach(register)
  return page
}
export function parseMediaLibraryDetail(value: unknown): MediaLibraryDetail {
  const source = object(value)
  const item = parseItem(source)
  if (
    !Array.isArray(source.usages) ||
    source.usages.length > 1000 ||
    !Array.isArray(source.events) ||
    source.events.length > 100
  )
    invalid()
  const usages = source.usages.map((value) => {
    const usage = object(value)
    return {
      section: boundedText(usage.section, 100),
      label: boundedText(usage.label, 300),
      key: boundedText(usage.key, 300),
    }
  })
  const events = source.events.map((value) => {
    const event = object(value)
    return {
      id: boundedText(event.id, 100),
      type: boundedText(event.type, 100),
      createdAt: date(event.createdAt),
      code: event.code == null ? null : boundedText(event.code, 100),
    }
  })
  register(item)
  return { ...item, usages, events }
}
export function isMediaCompatible(
  item: MediaLibraryItem,
  purpose?: ImageMediaPurpose | 'film-video',
  allowSvg = false,
) {
  if (!item.asset || !['used', 'unused'].includes(item.state)) return false
  if (!purpose) return true
  if (purpose === 'film-video')
    return 'mimeType' in item.asset && item.asset.mimeType === 'video/mp4'
  if ('mimeType' in item.asset && item.asset.mimeType === 'image/svg+xml')
    return purpose === 'site-image' && allowSvg
  if (
    'mimeType' in item.asset ||
    !validPreparedImageDimensions(item.asset.width, item.asset.height, purpose)
  )
    return false
  if (purpose === 'site-image') return true
  return true
}
export async function mediaLibraryActor(): Promise<ExpectedMediaActor> {
  if (!isRemoteCatalog)
    throw new UserFacingError(
      'media-config',
      'La biblioteca está disponible cuando la tienda está conectada a su almacenamiento.',
    )
  const generation = actorGeneration
  const userId = owner()
  if (!userId) sessionError()
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (error || data.session?.user.id !== userId) sessionError()
  const token = data.session.access_token
  const verified = await verifySupabaseUser(token)
  if (verified.error || verified.data.user?.id !== userId) sessionError()
  const assertCurrent = async () => {
    const current = await requireSupabaseClient().auth.getSession()
    if (
      generation !== actorGeneration ||
      owner() !== userId ||
      current.error ||
      current.data.session?.user.id !== userId
    )
      sessionError()
  }
  await assertCurrent()
  return { userId, token, assertCurrent }
}
async function rpc<N extends RpcName>(
  name: N,
  args: RpcArgs<N>,
): Promise<unknown> {
  const actor = await mediaLibraryActor()
  const response = await requireSupabaseClient()
    .rpc(name, args)
    .setHeader('Authorization', `Bearer ${actor.token}`)
  await actor.assertCurrent?.()
  if (response.error) {
    if ([401, 403].includes(response.status) || response.error.code === '42501')
      sessionError()
    if (['PT409', '40001'].includes(response.error.code))
      throw new UserFacingError(
        'media-conflict',
        'Este archivo cambió en otra sesión. Tus campos se conservan; recarga sus datos para revisar la versión actual.',
      )
    if (response.error.code === '23503')
      throw new UserFacingError(
        'media-used',
        'El archivo sigue en uso. Reemplázalo o quítalo de sus ubicaciones antes de programar su eliminación.',
      )
    if (['22023', '23514', '23502'].includes(response.error.code))
      throw new UserFacingError(
        'media-validation',
        'Revisa el nombre, el texto alternativo y la sección del archivo.',
      )
    throw new UserFacingError(
      'media-network',
      'No pudimos confirmar la operación. Tus campos se conservan; revisa la conexión y vuelve a intentarlo.',
    )
  }
  return response.data
}
export const mediaLibraryService = {
  async list({
    query = '',
    section = '',
    state = 'all',
    page = 1,
  }: {
    query?: string
    section?: MediaLibrarySection | ''
    state?: MediaLibraryFilter
    page?: number
  } = {}) {
    return parseMediaLibraryPage(
      await rpc('admin_media_library', {
        p_query: query,
        p_section: section || undefined,
        p_state: state,
        p_page: page,
        p_page_size: 20,
      }),
    )
  },
  async detail(id: string) {
    return parseMediaLibraryDetail(
      await rpc('admin_media_detail', { p_asset_id: id }),
    )
  },
  async metadata(
    item: MediaLibraryItem,
    fields: Pick<MediaLibraryItem, 'name' | 'alt' | 'section'>,
  ) {
    const result = parseItem(
      await rpc('admin_media_metadata', {
        p_asset_id: item.id,
        p_name: fields.name,
        p_alt: fields.alt,
        p_section: fields.section,
        p_expected_version: item.version,
      }),
    )
    register(result)
    return result
  },
  async retire(item: MediaLibraryItem) {
    const result = parseItem(
      await rpc('admin_media_retire', {
        p_asset_id: item.id,
        p_expected_version: item.version,
      }),
    )
    register(result)
    return result
  },
}
