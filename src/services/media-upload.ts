import type { AdminProduct } from '../types/admin'
import type {
  ImageMediaPurpose,
  ManagedMediaAsset,
  ManagedVideoAsset,
  ProductMediaPurpose,
} from '../domain/media'
import {
  inspectRasterHeader,
  MEDIA_UPLOAD_MAX_BYTES,
  MEDIA_VARIANT_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
  parseManagedMediaAsset,
  parseManagedMediaPath,
  parseManagedVideoAsset,
  parseManagedVideoPath,
  imageMediaWidths,
  validPreparedImageDimensions,
} from '../domain/media'
import { isPerfume } from '../domain/product-type'
import { authService } from './auth-service'
import { requireSupabaseClient } from './supabase-client'
import { mediaApiBaseUrl } from './asset-source'
import { registerManagedMedia } from './media-registry'
import { UserFacingError } from './admin-messages'

export { registerManagedMedia, rememberManagedAssets } from './media-registry'

export interface ExpectedMediaActor {
  userId: string
  token: string
  /** The catalog command owns its session generation, including same-user login. */
  assertCurrent?: () => Promise<void>
}

interface PreparedVariant {
  blob: Blob
  width: number
  height: number
}

interface UploadAttempt {
  operationId: string
  asset?: ManagedMediaAsset
  pending?: Promise<ManagedMediaAsset>
  createdAt: number
}

// Retry metadata only: never persist image bytes, passwords or bearer tokens.
const attempts = new Map<string, UploadAttempt>()
const retryLifetime = 10 * 60 * 1000
const maxRetryEntries = 500

function sessionError(): never {
  throw new UserFacingError(
    'media-session',
    'Tu sesión administrativa cambió. Vuelve a iniciar sesión antes de subir las fotografías.',
  )
}

async function assertActor(
  expected: ExpectedMediaActor,
  cancelled: () => boolean,
) {
  if (cancelled()) sessionError()
  await expected.assertCurrent?.()
  const state = authService.getSnapshot()
  if (
    state.status !== 'authenticated' ||
    state.session?.user.id !== expected.userId ||
    state.session.user.role !== 'admin' ||
    state.session.mfaRequired ||
    state.session.intent !== 'account'
  )
    sessionError()
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (error || data.session?.user.id !== expected.userId || cancelled())
    sessionError()
}

function invalidImage(
  message = 'No pudimos preparar esta fotografía para guardarla. Selecciónala de nuevo.',
): never {
  throw new UserFacingError('media-image', message)
}

async function draftBlob(source: string, signal: AbortSignal): Promise<Blob> {
  if (source.startsWith('data:')) {
    const prefix = 'data:image/webp;base64,'
    if (
      !source.startsWith(prefix) ||
      source.length >
        Math.ceil((MEDIA_VARIANT_MAX_BYTES * 4) / 3) + prefix.length + 4
    )
      invalidImage(
        'La fotografía preparada debe ser WebP y pesar 4 MB o menos. Selecciona un archivo más ligero.',
      )
    const encoded = source.slice(prefix.length)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) invalidImage()
    try {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      )
      return new Blob([bytes], { type: 'image/webp' })
    } catch {
      invalidImage()
    }
  }
  if (!source.startsWith('blob:')) invalidImage()
  // Blob URLs belong to this document; they are never accepted as final URLs
  // or fetched from arbitrary remote origins on behalf of an administrator.
  let address: URL
  try {
    address = new URL(source)
  } catch {
    invalidImage()
  }
  if (address.origin !== window.location.origin) invalidImage()
  const response = await fetch(source, { signal, credentials: 'omit' })
  if (!response.ok) invalidImage()
  const blob = await response.blob()
  if (
    !blob.size ||
    blob.size > MEDIA_VARIANT_MAX_BYTES ||
    blob.type !== 'image/webp'
  )
    invalidImage()
  return blob
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/webp') resolve(blob)
        else
          reject(
            new UserFacingError(
              'media-webp',
              'Este navegador no pudo preparar las versiones WebP. Prueba con un navegador actualizado.',
            ),
          )
      },
      'image/webp',
      0.9,
    ),
  )
}

/** Only existing prepared pixels are reduced; an 800px source gets no 960px URL. */
export async function prepareManagedImageVariants(
  source: string,
  purpose: ImageMediaPurpose,
  signal = new AbortController().signal,
): Promise<PreparedVariant[]> {
  const blob = await draftBlob(source, signal)
  if (signal.aborted) sessionError()
  const header = inspectRasterHeader(
    new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer()),
  )
  if (
    !header ||
    header.mime !== 'image/webp' ||
    header.animated ||
    !blob.size ||
    blob.size > MEDIA_VARIANT_MAX_BYTES ||
    !validPreparedImageDimensions(header.width, header.height, purpose)
  )
    invalidImage(
      'La fotografía debe ser WebP estática y respetar la proporción y las dimensiones indicadas para esta ubicación.',
    )
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    invalidImage()
  }
  try {
    if (bitmap.width !== header.width || bitmap.height !== header.height)
      invalidImage()
    const variants: PreparedVariant[] = []
    for (const width of imageMediaWidths(bitmap.width, purpose)) {
      if (signal.aborted) sessionError()
      const height = Math.round((width * bitmap.height) / bitmap.width)
      if (width === bitmap.width) {
        variants.push({ blob, width, height })
        continue
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) invalidImage()
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, width, height)
      const reduced = await canvasBlob(canvas)
      if (!reduced.size || reduced.size > MEDIA_VARIANT_MAX_BYTES)
        invalidImage(
          'Una versión de la fotografía supera 4 MB. Selecciona un archivo más ligero.',
        )
      variants.push({ blob: reduced, width, height })
    }
    if (
      variants.reduce((sum, variant) => sum + variant.blob.size, 0) >
      MEDIA_UPLOAD_MAX_BYTES
    )
      invalidImage(
        'Las versiones de la fotografía superan el tamaño permitido. Selecciona un archivo más ligero.',
      )
    return variants
  } finally {
    bitmap.close()
  }
}

/** Compatibility entry point for the existing product save flow. */
export function prepareProductMediaVariants(
  source: string,
  purpose: ProductMediaPurpose,
  signal?: AbortSignal,
) {
  return prepareManagedImageVariants(source, purpose, signal)
}

async function fingerprint(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function responseValue(response: Response): Promise<unknown> {
  if (!response.body)
    throw new UserFacingError(
      'media-response',
      'No pudimos verificar la subida. Conserva tus fotografías y vuelve a guardar.',
    )
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 64 * 1024) {
        await reader.cancel()
        throw new Error('Oversized media response')
      }
      parts.push(chunk.value)
    }
    const contents = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      contents.set(part, offset)
      offset += part.byteLength
    }
    return JSON.parse(new TextDecoder().decode(contents)) as unknown
  } catch {
    throw new UserFacingError(
      'media-response',
      'No pudimos verificar la subida. Conserva tus fotografías y vuelve a guardar.',
    )
  } finally {
    reader.releaseLock()
  }
}

function checkUploadStatus(status: number): void {
  if (status >= 200 && status < 300) return
  if (status === 401 || status === 403) sessionError()
  if (status === 413)
    throw new UserFacingError(
      'media-size',
      'La fotografía supera el tamaño permitido. Selecciona una imagen más ligera.',
    )
  if (status === 415 || status === 422 || status === 400)
    throw new UserFacingError(
      'media-validation',
      'La fotografía no cumple el formato o las dimensiones permitidas. Revisa el archivo y vuelve a guardarlo.',
    )
  if (status === 429)
    throw new UserFacingError(
      'media-rate-limit',
      'Has subido muchas fotografías en poco tiempo. Espera un momento y vuelve a guardar; tu borrador se conserva.',
    )
  if (status === 409)
    throw new UserFacingError(
      'media-conflict',
      'La fotografía cambió durante la subida. Conserva tus archivos y vuelve a guardarla.',
    )
  throw new UserFacingError(
    'media-network',
    'No pudimos terminar de guardar las fotografías. Revisa tu conexión y vuelve a guardar; tu borrador se conserva.',
  )
}

async function transferPhoto(
  variants: PreparedVariant[],
  purpose: ImageMediaPurpose,
  expected: ExpectedMediaActor,
  signal: AbortSignal,
  cancelled: () => boolean,
): Promise<ManagedMediaAsset> {
  const master = variants.at(-1)
  if (!master) invalidImage()
  const masterHash = await fingerprint(master.blob)
  const key = `${expected.userId}:${purpose}:${masterHash}`
  const now = Date.now()
  for (const [cacheKey, attempt] of attempts) {
    if (!attempt.pending && now - attempt.createdAt > retryLifetime)
      attempts.delete(cacheKey)
  }
  let attempt = attempts.get(key)
  if (!attempt) {
    if (attempts.size >= maxRetryEntries) {
      const oldest = [...attempts].find(([, value]) => !value.pending)
      if (oldest) attempts.delete(oldest[0])
    }
    attempt = { operationId: crypto.randomUUID(), createdAt: now }
    attempts.set(key, attempt)
  }
  await assertActor(expected, cancelled)
  if (attempt.asset) return attempt.asset
  if (attempt.pending) {
    const result = await attempt.pending
    await assertActor(expected, cancelled)
    return result
  }
  const origin = mediaApiBaseUrl()
  if (origin === null)
    throw new UserFacingError(
      'media-config',
      'La conexión de fotografías no está configurada correctamente. Solicita una revisión técnica.',
    )
  const entry = attempt
  const operation = (async () => {
    const body = new FormData()
    body.append('operationId', entry.operationId)
    body.append('purpose', purpose)
    for (const variant of variants)
      body.append('files', variant.blob, `${variant.width}.webp`)
    const response = await fetch(`${origin}/api/admin/media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expected.token}` },
      body,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    })
    await assertActor(expected, cancelled)
    checkUploadStatus(response.status)
    const value = await responseValue(response)
    if (!value || typeof value !== 'object' || !('asset' in value))
      throw new UserFacingError(
        'media-response',
        'No pudimos verificar la fotografía guardada. Conserva tus archivos y vuelve a guardar.',
      )
    let asset: ManagedMediaAsset
    try {
      asset = parseManagedMediaAsset(value.asset)
    } catch {
      throw new UserFacingError(
        'media-response',
        'La respuesta de fotografías no es válida. Conserva tus archivos y solicita una revisión técnica.',
      )
    }
    // Do not accept a "success" for another size or missing derivative set.
    if (
      parseManagedMediaPath(asset.src)?.hash !== masterHash ||
      asset.width !== master.width ||
      asset.height !== master.height ||
      asset.variants.length !== variants.length ||
      variants.some(
        (variant) =>
          !asset.variants.some(
            (saved) =>
              saved.width === variant.width && saved.height === variant.height,
          ),
      )
    )
      throw new UserFacingError(
        'media-response',
        'No pudimos verificar todas las versiones de la fotografía. Conserva tus archivos y vuelve a guardar.',
      )
    await assertActor(expected, cancelled)
    registerManagedMedia(asset)
    entry.asset = asset
    return asset
  })()
  entry.pending = operation
  try {
    return await operation
  } finally {
    if (entry.pending === operation) entry.pending = undefined
  }
}

/** One Home draft upload is scoped to the caller's verified save generation. */
export async function guardedUpload<T>(
  expected: ExpectedMediaActor,
  run: (signal: AbortSignal, cancelled: () => boolean) => Promise<T>,
): Promise<T> {
  const abort = new AbortController()
  let cancelled = false
  const unbind = authService.subscribe(() => {
    const state = authService.getSnapshot()
    if (
      state.status !== 'authenticated' ||
      state.session?.user.id !== expected.userId ||
      state.session.user.role !== 'admin' ||
      state.session.mfaRequired ||
      state.session.intent !== 'account'
    ) {
      cancelled = true
      abort.abort()
    }
  })
  const wasCancelled = () => cancelled || abort.signal.aborted
  try {
    await assertActor(expected, wasCancelled)
    const verified = await requireSupabaseClient().auth.getUser(expected.token)
    if (verified.error || verified.data.user?.id !== expected.userId)
      sessionError()
    await assertActor(expected, wasCancelled)
    const result = await run(abort.signal, wasCancelled)
    await assertActor(expected, wasCancelled)
    return result
  } catch (error) {
    if (wasCancelled()) sessionError()
    if (error instanceof UserFacingError) throw error
    throw new UserFacingError(
      'media-upload',
      'No pudimos terminar la subida. Revisa tu conexión y vuelve a guardar; tu borrador se conserva.',
    )
  } finally {
    unbind()
  }
}

/** Only data/blob drafts are uploaded. Already managed sources belong to the
 * caller's persisted manifest and must not be fetched/reuploaded as a proxy. */
export function uploadManagedImage(
  source: string,
  purpose: ImageMediaPurpose,
  expected: ExpectedMediaActor,
): Promise<ManagedMediaAsset> {
  return guardedUpload(expected, async (signal, cancelled) => {
    const variants = await prepareManagedImageVariants(source, purpose, signal)
    return transferPhoto(variants, purpose, expected, signal, cancelled)
  })
}

/** Import existing verified WebP variants without recropping or re-encoding.
 * The Worker still fully decodes every file and verifies immutable receipts. */
export function uploadManagedImageFiles(
  files: readonly Blob[],
  purpose: ImageMediaPurpose,
  expected: ExpectedMediaActor,
): Promise<ManagedMediaAsset> {
  return guardedUpload(expected, async (signal, cancelled) => {
    if (!files.length || files.length > 3) invalidImage()
    const variants: PreparedVariant[] = []
    for (const blob of files) {
      const header = inspectRasterHeader(
        new Uint8Array(await blob.slice(0, 65536).arrayBuffer()),
      )
      if (
        !header ||
        header.mime !== 'image/webp' ||
        header.animated ||
        blob.size < 1 ||
        blob.size > MEDIA_VARIANT_MAX_BYTES ||
        !validPreparedImageDimensions(header.width, header.height, purpose)
      )
        invalidImage()
      variants.push({ blob, width: header.width, height: header.height })
    }
    variants.sort((a, b) => a.width - b.width)
    const master = variants.at(-1)!
    if (
      new Set(variants.map((x) => x.width)).size !== variants.length ||
      variants.some(
        (x) =>
          Math.abs(x.height - (x.width * master.height) / master.width) > 1,
      ) ||
      variants.reduce((sum, x) => sum + x.blob.size, 0) > MEDIA_UPLOAD_MAX_BYTES
    )
      invalidImage()
    return transferPhoto(variants, purpose, expected, signal, cancelled)
  })
}

interface VideoAttempt {
  operationId: string
  createdAt: number
  asset?: ManagedVideoAsset
  pending?: Promise<ManagedVideoAsset>
}
const videoAttempts = new Map<string, VideoAttempt>()

async function draftVideoBlob(
  source: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (source.startsWith('data:')) {
    const prefix = 'data:video/mp4;base64,'
    if (
      !source.startsWith(prefix) ||
      source.length >
        Math.ceil((MEDIA_VIDEO_MAX_BYTES * 4) / 3) + prefix.length + 4
    )
      throw new UserFacingError(
        'media-video',
        'Selecciona un video MP4 de hasta 10 MB.',
      )
    const encoded = source.slice(prefix.length)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw new UserFacingError(
        'media-video',
        'No pudimos leer el video. Selecciónalo de nuevo.',
      )
    const binary = atob(encoded)
    return new Blob(
      [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
      { type: 'video/mp4' },
    )
  }
  if (
    !source.startsWith('blob:') ||
    new URL(source).origin !== window.location.origin
  )
    throw new UserFacingError(
      'media-video',
      'Selecciona un video desde tu equipo.',
    )
  const response = await fetch(source, { signal, credentials: 'omit' })
  if (!response.ok)
    throw new UserFacingError(
      'media-video',
      'No pudimos leer el video. Selecciónalo de nuevo.',
    )
  const blob = await response.blob()
  if (
    !blob.size ||
    blob.size > MEDIA_VIDEO_MAX_BYTES ||
    blob.type !== 'video/mp4'
  )
    throw new UserFacingError(
      'media-video',
      'Selecciona un video MP4 de hasta 10 MB.',
    )
  return blob
}

export function uploadManagedVideo(
  source: string,
  expected: ExpectedMediaActor,
): Promise<ManagedVideoAsset> {
  return guardedUpload(expected, async (signal, cancelled) => {
    const blob = await draftVideoBlob(source, signal)
    if (!blob.size || blob.size > MEDIA_VIDEO_MAX_BYTES)
      throw new UserFacingError(
        'media-video',
        'Selecciona un video MP4 de hasta 10 MB.',
      )
    const hash = await fingerprint(blob),
      key = `${expected.userId}:film-video:${hash}`,
      now = Date.now()
    for (const [cacheKey, value] of videoAttempts)
      if (!value.pending && now - value.createdAt > retryLifetime)
        videoAttempts.delete(cacheKey)
    let entry = videoAttempts.get(key)
    if (!entry) {
      if (videoAttempts.size >= maxRetryEntries) {
        const oldest = [...videoAttempts].find(([, value]) => !value.pending)
        if (oldest) videoAttempts.delete(oldest[0])
      }
      entry = { operationId: crypto.randomUUID(), createdAt: now }
      videoAttempts.set(key, entry)
    }
    await assertActor(expected, cancelled)
    if (entry.asset) return entry.asset
    if (entry.pending) return entry.pending
    const origin = mediaApiBaseUrl()
    if (origin === null)
      throw new UserFacingError(
        'media-config',
        'La conexión de videos no está configurada correctamente. Solicita una revisión técnica.',
      )
    const attempt = entry
    const operation = (async () => {
      const body = new FormData()
      body.append('operationId', attempt.operationId)
      body.append('file', blob, 'film.mp4')
      const response = await fetch(`${origin}/api/admin/media/video-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${expected.token}` },
        body,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      })
      await assertActor(expected, cancelled)
      if ([400, 413, 415, 422].includes(response.status))
        throw new UserFacingError(
          'media-video',
          'El video debe ser MP4 H.264, durar de 2 a 60 segundos, pesar hasta 10 MB y medir entre 480 y 4096 px por lado.',
        )
      checkUploadStatus(response.status)
      const value = await responseValue(response)
      if (!value || typeof value !== 'object' || !('asset' in value))
        throw new UserFacingError(
          'media-response',
          'No pudimos confirmar el video guardado. Conserva tu archivo y vuelve a guardar.',
        )
      const asset = parseManagedVideoAsset(value.asset)
      if (
        parseManagedVideoPath(asset.src)?.hash !== hash ||
        asset.byteSize !== blob.size
      )
        throw new UserFacingError(
          'media-response',
          'El video guardado no coincide con el seleccionado. Conserva tu archivo y vuelve a guardar.',
        )
      await assertActor(expected, cancelled)
      attempt.asset = asset
      return asset
    })()
    attempt.pending = operation
    try {
      return await operation
    } finally {
      if (attempt.pending === operation) attempt.pending = undefined
    }
  })
}

/** Replace draft URLs only after every new photograph has been confirmed.
 * A partial failure leaves the caller's complete editable record untouched.
 */
export async function uploadProductMedia(
  record: AdminProduct,
  expected: ExpectedMediaActor,
): Promise<AdminProduct> {
  const sourceGallery = record.detail.gallery.filter((view) =>
    view.image.trim(),
  )
  const olfactory = isPerfume(record.product)
    ? (record.detail.olfactoryImage ?? null)
    : null
  const needsUpload = (source: string | null | undefined) =>
    Boolean(source && /^(data:|blob:)/i.test(source))
  if (
    !sourceGallery.some((view) => needsUpload(view.image)) &&
    !needsUpload(olfactory)
  ) {
    return {
      ...record,
      product: { ...record.product, image: sourceGallery[0]?.image ?? '' },
      detail: {
        ...record.detail,
        gallery: sourceGallery,
        olfactoryImage: olfactory,
      },
    }
  }
  const abort = new AbortController()
  let cancelled = false
  const unbind = authService.subscribe(() => {
    const state = authService.getSnapshot()
    if (
      state.status !== 'authenticated' ||
      state.session?.user.id !== expected.userId ||
      state.session.user.role !== 'admin' ||
      state.session.mfaRequired ||
      state.session.intent !== 'account'
    ) {
      cancelled = true
      abort.abort()
    }
  })
  const wasCancelled = () => cancelled || abort.signal.aborted
  try {
    await assertActor(expected, wasCancelled)
    const verified = await requireSupabaseClient().auth.getUser(expected.token)
    if (verified.error || verified.data.user?.id !== expected.userId)
      sessionError()
    await assertActor(expected, wasCancelled)
    const gallery = []
    for (const view of sourceGallery) {
      let image = view.image
      if (needsUpload(image)) {
        const prepared = await prepareProductMediaVariants(
          image,
          'product-gallery',
          abort.signal,
        )
        image = (
          await transferPhoto(
            prepared,
            'product-gallery',
            expected,
            abort.signal,
            wasCancelled,
          )
        ).src
      }
      gallery.push({ ...view, image })
    }
    let olfactoryImage = olfactory
    if (needsUpload(olfactoryImage)) {
      const prepared = await prepareProductMediaVariants(
        olfactoryImage!,
        'product-olfactory',
        abort.signal,
      )
      olfactoryImage = (
        await transferPhoto(
          prepared,
          'product-olfactory',
          expected,
          abort.signal,
          wasCancelled,
        )
      ).src
    }
    await assertActor(expected, wasCancelled)
    return {
      ...record,
      product: { ...record.product, image: gallery[0]?.image ?? '' },
      detail: { ...record.detail, gallery, olfactoryImage },
    }
  } catch (error) {
    if (wasCancelled()) sessionError()
    if (error instanceof UserFacingError) throw error
    throw new UserFacingError(
      'media-upload',
      'No pudimos terminar de guardar las fotografías. Revisa tu conexión y vuelve a guardar; tu borrador se conserva.',
    )
  } finally {
    unbind()
  }
}
