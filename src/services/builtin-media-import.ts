import type { Database } from '../types/database.generated'
import {
  inspectRasterHeader,
  MEDIA_SVG_MAX_BYTES,
  MEDIA_VARIANT_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
  parseManagedMediaAsset,
  parseManagedSvgAsset,
  parseManagedVideoAsset,
} from '../domain/media'
import { UserFacingError } from './admin-messages'
import type { LibraryAsset, MediaLibrarySection } from './media-library-service'
import { mediaLibraryService } from './media-library-service'
import { requireSupabaseClient } from './supabase-client'
import {
  uploadManagedImageFiles,
  uploadManagedVideo,
  type ExpectedMediaActor,
} from './media-upload'
import { uploadManagedSvg } from './media-svg-upload'

interface BuiltinSource {
  path: string
  kind: 'image' | 'video' | 'svg'
  section: string
  label: string
  width: number
  height: number
}
interface SourceAlias extends BuiltinSource {
  version: number
  asset: LibraryAsset | null
}
type RpcName = keyof Database['api']['Functions']
type RpcArgs<N extends RpcName> = Database['api']['Functions'][N]['Args']
const sourcePath =
  /^\/(?:images\/[a-z0-9-]+\.webp|videos\/[a-z0-9-]+\.(?:webp|mp4)|brand\/logo-on-light\.svg)$/

function failure(): never {
  throw new UserFacingError(
    'media-import',
    'No pudimos verificar un recurso del inventario. Los archivos ya incorporados se conservan; recarga la página y vuelve a centralizar.',
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failure()
  return value as Record<string, unknown>
}
function parseAsset(value: unknown): LibraryAsset {
  const source = object(value)
  return source.mimeType === 'video/mp4'
    ? parseManagedVideoAsset(source)
    : source.mimeType === 'image/svg+xml'
      ? parseManagedSvgAsset(source)
      : parseManagedMediaAsset(source)
}
export function parseBuiltinInventory(value: unknown): BuiltinSource[] {
  if (!Array.isArray(value) || !value.length || value.length > 500) failure()
  const seen = new Set<string>()
  return value.map((value) => {
    const item = object(value)
    if (
      typeof item.path !== 'string' ||
      !sourcePath.test(item.path) ||
      seen.has(item.path) ||
      !['image', 'video', 'svg'].includes(String(item.kind)) ||
      (item.kind === 'svg') !== item.path.endsWith('.svg') ||
      (item.kind === 'video') !== item.path.endsWith('.mp4') ||
      typeof item.section !== 'string' ||
      item.section.length > 100 ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      item.label.length > 160 ||
      typeof item.width !== 'number' ||
      !Number.isSafeInteger(item.width) ||
      item.width < 1 ||
      item.width > 4096 ||
      typeof item.height !== 'number' ||
      !Number.isSafeInteger(item.height) ||
      item.height < 1 ||
      item.height > 4096
    )
      failure()
    seen.add(item.path)
    return {
      path: item.path,
      kind: item.kind as BuiltinSource['kind'],
      section: item.section,
      label: item.label,
      width: item.width,
      height: item.height,
    }
  })
}
function verifyAsset(source: BuiltinSource, asset: LibraryAsset) {
  if (
    asset.width !== source.width ||
    asset.height !== source.height ||
    (source.kind === 'image') !== 'variants' in asset ||
    (source.kind === 'video') !==
      ('mimeType' in asset && asset.mimeType === 'video/mp4') ||
    (source.kind === 'svg') !==
      ('mimeType' in asset && asset.mimeType === 'image/svg+xml')
  )
    failure()
}
function parseAliases(
  value: unknown,
  inventory: BuiltinSource[],
): SourceAlias[] {
  const source = object(value)
  if (!Array.isArray(source.items) || source.items.length !== inventory.length)
    failure()
  const aliases = new Map<string, SourceAlias>()
  for (const supplied of source.items) {
    const item = object(supplied)
    const expected = inventory.find((source) => source.path === item.path)
    if (
      !expected ||
      aliases.has(expected.path) ||
      item.kind !== expected.kind ||
      item.width !== expected.width ||
      item.height !== expected.height ||
      typeof item.version !== 'number' ||
      !Number.isSafeInteger(item.version) ||
      item.version < 1
    )
      failure()
    const asset = item.asset == null ? null : parseAsset(item.asset)
    if (asset) verifyAsset(expected, asset)
    aliases.set(expected.path, { ...expected, version: item.version, asset })
  }
  return inventory.map((source) => aliases.get(source.path) ?? failure())
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new UserFacingError(
      'media-cancelled',
      'Se detuvo la centralización. Los recursos ya incorporados se conservan y puedes continuar después.',
    )
}
async function boundedResponse(
  response: Response,
  maximum: number,
): Promise<Uint8Array> {
  const length = response.headers.get('Content-Length')
  if (
    !response.ok ||
    !response.body ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum))
  )
    failure()
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maximum) failure()
      parts.push(next.value)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  if (!size) failure()
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}
async function readSource(path: string, maximum: number, signal?: AbortSignal) {
  if (!(path === '/media-default-inventory.json' || sourcePath.test(path)))
    failure()
  abort(signal)
  const response = await fetch(new URL(path, window.location.origin), {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.any([
      AbortSignal.timeout(60000),
      ...(signal ? [signal] : []),
    ]),
  })
  return boundedResponse(response, maximum)
}
async function command<N extends RpcName>(
  name: N,
  args: RpcArgs<N>,
  actor: ExpectedMediaActor,
  signal?: AbortSignal,
): Promise<unknown> {
  abort(signal)
  await actor.assertCurrent?.()
  const request = requireSupabaseClient()
    .rpc(name, args)
    .setHeader('Authorization', `Bearer ${actor.token}`)
  const response = await (signal ? request.abortSignal(signal) : request)
  await actor.assertCurrent?.()
  abort(signal)
  if (response.error) {
    if (response.error.code === 'PT409')
      throw new UserFacingError(
        'media-import-conflict',
        'Otro administrador cambió este recurso. Los archivos ya centralizados se conservan; vuelve a iniciar la centralización para revisar la versión actual.',
      )
    if ([401, 403].includes(response.status))
      throw new UserFacingError(
        'media-import-session',
        'Tu sesión administrativa cambió. Vuelve a iniciar sesión para continuar la centralización.',
      )
    failure()
  }
  return response.data
}
function section(source: BuiltinSource): MediaLibrarySection {
  if (source.path.startsWith('/brand/')) return 'identity'
  if (source.path.includes('/account-')) return 'account'
  if (source.section === 'Nosotros') return 'about'
  if (source.section === 'Compartir') return 'seo'
  if (source.section === 'Productos') return 'products'
  return 'home'
}
async function wait(milliseconds: number, signal?: AbortSignal) {
  if (milliseconds <= 0) return
  abort(signal)
  await new Promise<void>((resolve, reject) => {
    function stopped() {
      clearTimeout(timer)
      reject(
        new UserFacingError(
          'media-cancelled',
          'La centralización se detuvo. Puedes continuar después.',
        ),
      )
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stopped)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', stopped, { once: true })
  })
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(
        new UserFacingError(
          'media-import-video',
          'No pudimos leer el video incluido en la tienda.',
        ),
      )
    reader.readAsDataURL(blob)
  })
}

/** Explicit administrator action only. Fetches the reviewed same-origin source
 * inventory, preserves original bytes/dimensions and resumes committed aliases. */
export async function centralizeExistingMedia(
  actor: ExpectedMediaActor,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
) {
  const guardedActor: ExpectedMediaActor = {
    ...actor,
    assertCurrent: async () => {
      abort(signal)
      await actor.assertCurrent?.()
    },
  }
  await guardedActor.assertCurrent?.()
  const bytes = await readSource(
    '/media-default-inventory.json',
    256 * 1024,
    signal,
  )
  let decoded: unknown
  try {
    decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    )
  } catch {
    failure()
  }
  const inventory = parseBuiltinInventory(decoded)
  const aliases = parseAliases(
    await command('admin_media_aliases', {}, guardedActor, signal),
    inventory,
  )
  let imported = 0,
    lastUploadAt = 0
  onProgress(0, aliases.length)
  for (const source of aliases) {
    await guardedActor.assertCurrent?.()
    if (!source.asset) {
      // Stay below the durable 60 uploads/minute boundary, including retries.
      await wait(Math.max(0, 1800 - (Date.now() - lastUploadAt)), signal)
      const limit =
        source.kind === 'video'
          ? MEDIA_VIDEO_MAX_BYTES
          : source.kind === 'svg'
            ? MEDIA_SVG_MAX_BYTES
            : MEDIA_VARIANT_MAX_BYTES
      const bytes = await readSource(source.path, limit, signal)
      if (source.kind === 'image') {
        const header = inspectRasterHeader(bytes.subarray(0, 65536))
        if (
          !header ||
          header.mime !== 'image/webp' ||
          header.animated ||
          header.width !== source.width ||
          header.height !== source.height
        )
          failure()
      }
      const mime =
        source.kind === 'video'
          ? 'video/mp4'
          : source.kind === 'svg'
            ? 'image/svg+xml'
            : 'image/webp'
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: mime })
      lastUploadAt = Date.now()
      const asset =
        source.kind === 'image'
          ? await uploadManagedImageFiles([blob], 'site-image', guardedActor)
          : source.kind === 'video'
            ? await uploadManagedVideo(await dataUrl(blob), guardedActor)
            : await uploadManagedSvg(blob, guardedActor)
      verifyAsset(source, asset)
      const item = await mediaLibraryService.detail(asset.id)
      await guardedActor.assertCurrent?.()
      await mediaLibraryService.metadata(item, {
        name: source.label,
        alt: source.kind === 'svg' ? 'Aroma Infini' : '',
        section: section(source),
      })
      const receipt = object(
        await command(
          'admin_save_media_alias',
          {
            p_path: source.path,
            p_asset_id: asset.id,
            p_expected_version: source.version,
          },
          guardedActor,
          signal,
        ),
      )
      if (
        receipt.path !== source.path ||
        receipt.version !== source.version + 1
      )
        failure()
      const confirmed = parseAsset(receipt.asset)
      verifyAsset(source, confirmed)
      if (confirmed.id !== asset.id || confirmed.src !== asset.src) failure()
      const { rememberMediaAlias } = await import('./media-alias-registry')
      rememberMediaAlias(source.path, confirmed)
    }
    imported++
    onProgress(imported, aliases.length)
  }
  await guardedActor.assertCurrent?.()
  const { builtinMediaService } = await import('./builtin-media-service')
  await builtinMediaService.load(true)
  return { imported, total: aliases.length }
}
