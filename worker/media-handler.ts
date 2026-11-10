import type { MediaEnvironment, VerifiedImage } from './media-types'
import { webpDimensions } from './media-webp-header'
import { inspectMp4 } from './media-mp4'
import {
  MEDIA_UPLOAD_MAX_BYTES,
  MEDIA_VARIANT_MAX_BYTES,
  MEDIA_MAX_VARIANTS,
  MEDIA_VIDEO_MAX_BYTES,
  isImageMediaPurpose,
  validPreparedImageDimensions,
  parseManagedVideoAsset,
} from '../src/domain/media'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const imagePath =
  /^\/media\/(public\/dynamic\/([0-9a-f-]{36})\/[a-f0-9]{64}\/[0-9]{2,4}\.webp)$/
const videoPath =
  /^\/media\/(public\/dynamic\/([0-9a-f-]{36})\/[a-f0-9]{64}\/video\.mp4)$/
const maximumBody = MEDIA_UPLOAD_MAX_BYTES + 65536
const maximumFile = MEDIA_VARIANT_MAX_BYTES
class MediaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MediaError(
      502,
      'service',
      'No pudimos verificar la respuesta del almacenamiento.',
    )
  return value as Record<string, unknown>
}
function answer(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

/** Provider JSON is bounded independently of upload bytes and fetch headers. */
async function readProviderJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const maximum = 512 * 1024
  const failure = () =>
    new MediaError(
      503,
      'storage',
      'No pudimos verificar la respuesta del almacenamiento. Conserva tus archivos y vuelve a intentarlo.',
    )
  const reader = response.body?.getReader()
  let stop: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(failure())
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
  void aborted.catch(() => {})
  let complete = false
  try {
    const declared = response.headers.get('Content-Length')
    if (
      !reader ||
      (declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > maximum))
    )
      throw failure()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const next = await Promise.race([reader.read(), aborted])
      if (next.done) {
        complete = true
        break
      }
      length += next.value.byteLength
      if (length > maximum) throw failure()
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    )
  } catch {
    throw failure()
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
    if (reader) {
      // Never wait for an incomplete stream's cancellation callback.
      if (!complete) void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
async function readBounded(
  request: Request,
  limit = maximumBody,
  requestSignal?: AbortSignal,
): Promise<ArrayBuffer> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new MediaError(413, 'size', 'La carga supera el tamaño permitido.')
  if (!request.body)
    throw new MediaError(400, 'file', 'Selecciona una fotografía.')
  const reader = request.body.getReader()
  // Match the browser's two-minute upload budget, including video uploads on
  // slow connections. This is independent of the existing byte-size limits.
  const signal = AbortSignal.any([
    request.signal,
    requestSignal ?? AbortSignal.timeout(120000),
  ])
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          function abort() {
            void reader.cancel().catch(() => {})
            reject(
              new MediaError(
                408,
                'timeout',
                'La carga tardó demasiado. Conserva tus archivos y vuelve a intentarlo.',
              ),
            )
          }
          if (signal.aborted) return abort()
          signal.addEventListener('abort', abort, { once: true })
          void reader.read().then(
            (value) => {
              signal.removeEventListener('abort', abort)
              resolve(value)
            },
            (error: unknown) => {
              signal.removeEventListener('abort', abort)
              reject(error)
            },
          )
        },
      )
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) {
        void reader.cancel().catch(() => {})
        throw new MediaError(
          413,
          'size',
          'La carga supera el tamaño permitido.',
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

interface Dependencies {
  fetch?: typeof fetch
  decodeWebp(bytes: ArrayBuffer): Promise<VerifiedImage>
  requestSignal?: () => AbortSignal
}
/** No privileged client or mutable request state is shared between requests. */
export function createMediaHandler(dependencies: Dependencies) {
  const transport = dependencies.fetch ?? fetch
  async function jsonRequest(
    url: string,
    headers: HeadersInit,
    body?: unknown,
  ) {
    const deadline = AbortSignal.timeout(15000)
    const response = await transport(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: deadline,
      redirect: 'manual',
    })
    const value: unknown = await readProviderJson(response, deadline).catch(
      (error: unknown) => {
        if (response.ok) throw error
        return null
      },
    )
    if (!response.ok) {
      const code =
        value && typeof value === 'object' && 'code' in value ? value.code : ''
      if (response.status === 401)
        throw new MediaError(
          401,
          'session',
          'Tu sesión terminó. Inicia sesión de nuevo antes de subir fotografías.',
        )
      if (response.status === 403 || code === '42501')
        throw new MediaError(
          403,
          'permission',
          'Inicia sesión con una cuenta administrativa y completa la verificación en dos pasos.',
        )
      if (response.status === 429 || code === 'PT429')
        throw new MediaError(
          429,
          'rate-limit',
          'Realizaste varias cargas seguidas. Espera un momento y vuelve a intentarlo.',
        )
      if (code === 'PT409')
        throw new MediaError(
          409,
          'conflict',
          'Esta operación ya tiene otro contenido o dejó de estar disponible. Vuelve a revisar las fotografías.',
        )
      if (response.status === 400)
        throw new MediaError(
          400,
          'validation',
          'No pudimos registrar la fotografía. Revisa sus dimensiones y vuelve a intentarlo.',
        )
      throw new MediaError(
        503,
        'storage',
        'No pudimos confirmar el almacenamiento. Conserva tus fotografías y vuelve a intentarlo.',
      )
    }
    return value
  }
  function config(env: MediaEnvironment) {
    const url = new URL(env.SUPABASE_URL)
    if (
      url.protocol !== 'https:' ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.SUPABASE_MEDIA_SECRET_KEY
    )
      throw new MediaError(
        503,
        'configuration',
        'El almacenamiento de fotografías aún no está configurado.',
      )
    return url.origin
  }
  async function rpc(
    env: MediaEnvironment,
    name: string,
    body: unknown,
    token?: string,
  ) {
    const publicCall = token === 'public'
    const secret = token
      ? env.SUPABASE_PUBLISHABLE_KEY
      : env.SUPABASE_MEDIA_SECRET_KEY
    const headers: Record<string, string> = {
      apikey: secret,
      'Content-Type': 'application/json',
      'Content-Profile': 'api',
      'Accept-Profile': 'api',
    }
    if (token && !publicCall) headers.Authorization = `Bearer ${token}`
    else if (secret.startsWith('eyJ'))
      headers.Authorization = `Bearer ${secret}`
    return jsonRequest(`${config(env)}/rest/v1/rpc/${name}`, headers, body)
  }
  async function actor(request: Request, env: MediaEnvironment) {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!/^Bearer ey[A-Za-z0-9_.-]+$/.test(authorization))
      throw new MediaError(
        401,
        'session',
        'Inicia sesión antes de subir fotografías.',
      )
    const token = authorization.slice(7)
    const user = object(
      await jsonRequest(`${config(env)}/auth/v1/user`, {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      }),
    )
    const current = object(await rpc(env, 'current_actor', {}, token))
    const userId =
      typeof user.id === 'string' && uuid.test(user.id) ? user.id : ''
    if (
      !userId ||
      current.user_id !== userId ||
      current.role !== 'admin' ||
      current.aal !== 'aal2'
    )
      throw new MediaError(
        403,
        'permission',
        'Necesitas permisos administrativos y verificación en dos pasos.',
      )
    return { userId, token }
  }
  async function upload(request: Request, env: MediaEnvironment) {
    if (request.method !== 'POST')
      return new Response(null, {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' },
      })
    const current = await actor(request, env)
    if (
      env.MEDIA_RATE_LIMITER &&
      !(await env.MEDIA_RATE_LIMITER.limit({ key: `actor:${current.userId}` }))
        .success
    )
      throw new MediaError(
        429,
        'rate-limit',
        'Espera un momento antes de subir más fotografías.',
      )
    const contentType = request.headers.get('Content-Type') ?? ''
    if (!contentType.startsWith('multipart/form-data;'))
      throw new MediaError(
        415,
        'format',
        'Selecciona archivos de imagen válidos.',
      )
    const bytes = await readBounded(
      request,
      maximumBody,
      dependencies.requestSignal?.(),
    )
    const form = await new Request('https://local.invalid/', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: bytes,
    })
      .formData()
      .catch(() => {
        throw new MediaError(
          400,
          'file',
          'La carga está incompleta. Vuelve a intentarlo.',
        )
      })
    const operationId = form.get('operationId'),
      purpose = form.get('purpose')
    const files = form.getAll('files')
    if (
      typeof operationId !== 'string' ||
      !uuid.test(operationId) ||
      !isImageMediaPurpose(purpose) ||
      files.length < 1 ||
      files.length > MEDIA_MAX_VARIANTS ||
      [...form.keys()].some(
        (key) => !['operationId', 'purpose', 'files'].includes(key),
      )
    )
      throw new MediaError(
        400,
        'file',
        'Revisa los archivos seleccionados y vuelve a intentarlo.',
      )
    // Reservation applies a durable database admission limit before decoding.
    const reservation = object(
      await rpc(
        env,
        'media_upload_reserve',
        { p_operation_id: operationId, p_purpose: purpose },
        current.token,
      ),
    )
    const assetId = reservation.id
    if (typeof assetId !== 'string' || !uuid.test(assetId))
      throw new MediaError(502, 'service', 'No pudimos reservar la fotografía.')
    const images: Array<{
      width: number
      height: number
      bytes: ArrayBuffer
      sha256: string
    }> = []
    for (const value of files) {
      if (typeof value === 'string' || value.type !== 'image/webp')
        throw new MediaError(
          415,
          'format',
          'Las fotografías deben prepararse en WebP antes de subirlas.',
        )
      if (!value.size || value.size > maximumFile)
        throw new MediaError(
          413,
          'size',
          'Cada fotografía preparada debe pesar 4 MB o menos.',
        )
      const binary = await value.arrayBuffer()
      let dimensions: VerifiedImage
      try {
        const header = webpDimensions(binary)
        if (
          !validPreparedImageDimensions(
            header.width,
            header.height,
            purpose,
            false,
          )
        )
          throw new Error('Image placement dimensions exceed limits')
        dimensions = await dependencies.decodeWebp(binary)
        if (
          dimensions.width !== header.width ||
          dimensions.height !== header.height ||
          !validPreparedImageDimensions(
            dimensions.width,
            dimensions.height,
            purpose,
            false,
          )
        )
          throw new Error('Dimensions mismatch')
      } catch {
        throw new MediaError(
          422,
          'image',
          'No pudimos abrir esta fotografía. Usa una imagen válida con la proporción y las dimensiones indicadas para esta ubicación.',
        )
      }
      if (images.some((image) => image.width === dimensions.width))
        throw new MediaError(
          400,
          'variants',
          'La carga contiene tamaños repetidos.',
        )
      images.push({
        ...dimensions,
        bytes: binary,
        sha256: await digest(binary),
      })
    }
    images.sort((a, b) => b.width - a.width)
    const master = images[0]
    if (
      !validPreparedImageDimensions(master.width, master.height, purpose) ||
      images.some(
        (image) =>
          (image.width !== master.width && ![480, 960].includes(image.width)) ||
          Math.abs(
            image.height - (image.width * master.height) / master.width,
          ) > 1,
      )
    )
      throw new MediaError(
        422,
        'dimensions',
        'La fotografía no tiene resolución suficiente o contiene un tamaño no permitido.',
      )
    const prefix = `public/dynamic/${assetId}/${master.sha256}/`
    const metadata = images.map((image) => ({
      width: image.width,
      height: image.height,
      mimeType: 'image/webp',
      byteSize: image.bytes.byteLength,
      sha256: image.sha256,
      objectKey: `${prefix}${image.width}.webp`,
    }))
    // A prepared manifest binds the operation before any object write. A retry
    // with different bytes cannot produce extra hash directories for this asset.
    await rpc(env, 'media_upload_prepare', {
      p_asset_id: assetId,
      p_actor_id: current.userId,
      p_metadata: { ...metadata[0], variants: metadata },
    })
    for (let index = 0; index < images.length; index++) {
      const image = images[index],
        description = metadata[index]
      const existing = await env.MEDIA_BUCKET.head(description.objectKey)
      if (existing) {
        if (
          existing.size !== description.byteSize ||
          existing.customMetadata?.sha256 !== description.sha256
        )
          throw new MediaError(
            409,
            'conflict',
            'El archivo almacenado no coincide con esta carga.',
          )
      } else {
        await env.MEDIA_BUCKET.put(description.objectKey, image.bytes, {
          onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: { sha256: description.sha256, assetId },
        })
      }
      const verified = await env.MEDIA_BUCKET.head(description.objectKey)
      if (
        !verified ||
        verified.size !== description.byteSize ||
        verified.customMetadata?.sha256 !== description.sha256 ||
        verified.httpMetadata?.contentType !== 'image/webp'
      )
        throw new MediaError(
          503,
          'storage',
          'No pudimos verificar la fotografía guardada. Vuelve a intentarlo.',
        )
    }
    // Re-check the real actor after decoding/storage and immediately before the
    // server-only confirmation; a revoked membership cannot complete an upload.
    await actor(request, env)
    const asset = await rpc(env, 'media_upload_complete', {
      p_asset_id: assetId,
      p_actor_id: current.userId,
      p_metadata: { ...metadata[0], variants: metadata },
    })
    return answer({ asset })
  }

  async function uploadVideo(request: Request, env: MediaEnvironment) {
    if (request.method !== 'POST')
      return new Response(null, {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' },
      })
    const current = await actor(request, env)
    if (
      env.MEDIA_RATE_LIMITER &&
      !(await env.MEDIA_RATE_LIMITER.limit({ key: `actor:${current.userId}` }))
        .success
    )
      throw new MediaError(
        429,
        'rate-limit',
        'Espera un momento antes de subir otro video.',
      )
    const contentType = request.headers.get('Content-Type') ?? ''
    if (!contentType.startsWith('multipart/form-data;'))
      throw new MediaError(415, 'format', 'Selecciona un video MP4 válido.')
    const binary = await readBounded(
      request,
      MEDIA_VIDEO_MAX_BYTES + 65536,
      dependencies.requestSignal?.(),
    )
    const form = await new Request('https://local.invalid/', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: binary,
    })
      .formData()
      .catch(() => {
        throw new MediaError(
          400,
          'file',
          'La carga está incompleta. Selecciona el video de nuevo.',
        )
      })
    const operationId = form.get('operationId'),
      files = form.getAll('file')
    if (
      typeof operationId !== 'string' ||
      !uuid.test(operationId) ||
      files.length !== 1 ||
      [...form.keys()].some((key) => !['operationId', 'file'].includes(key))
    )
      throw new MediaError(400, 'file', 'Selecciona un solo video.')
    const file = files[0]
    if (
      typeof file === 'string' ||
      !file.size ||
      file.size > MEDIA_VIDEO_MAX_BYTES
    )
      throw new MediaError(413, 'size', 'El video debe pesar 10 MB o menos.')
    const reservation = object(
      await rpc(
        env,
        'media_upload_reserve',
        { p_operation_id: operationId, p_purpose: 'film-video' },
        current.token,
      ),
    )
    const assetId = reservation.id
    if (typeof assetId !== 'string' || !uuid.test(assetId))
      throw new MediaError(502, 'service', 'No pudimos reservar el video.')
    const bytes = await file.arrayBuffer()
    let dimensions: ReturnType<typeof inspectMp4>
    try {
      dimensions = inspectMp4(bytes)
    } catch {
      throw new MediaError(
        422,
        'video',
        'Usa un MP4 H.264 válido de 2 a 60 segundos, con lados de 480 a 4096 px y sin referencias externas.',
      )
    }
    const hash = await digest(bytes)
    const key = `public/dynamic/${assetId}/${hash}/video.mp4`
    const manifest = { ...dimensions, sha256: hash, byteSize: bytes.byteLength }
    await rpc(env, 'media_upload_prepare_video', {
      p_asset_id: assetId,
      p_actor_id: current.userId,
      p_manifest: manifest,
    })
    const existing = await env.MEDIA_BUCKET.head(key)
    if (existing) {
      if (
        existing.size !== bytes.byteLength ||
        existing.customMetadata?.sha256 !== hash ||
        existing.httpMetadata?.contentType !== 'video/mp4'
      )
        throw new MediaError(
          409,
          'conflict',
          'El archivo almacenado no coincide con esta carga.',
        )
    } else
      await env.MEDIA_BUCKET.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000, immutable',
        },
        customMetadata: { sha256: hash, assetId },
      })
    const verified = await env.MEDIA_BUCKET.head(key)
    if (
      !verified ||
      verified.size !== bytes.byteLength ||
      verified.customMetadata?.sha256 !== hash ||
      verified.httpMetadata?.contentType !== 'video/mp4'
    )
      throw new MediaError(
        503,
        'storage',
        'No pudimos verificar el video guardado. Conserva el archivo y vuelve a guardar.',
      )
    await actor(request, env)
    const asset = await rpc(env, 'media_upload_complete_video', {
      p_asset_id: assetId,
      p_actor_id: current.userId,
      p_manifest: manifest,
    })
    return answer({ asset })
  }

  async function serveVideo(
    request: Request,
    env: MediaEnvironment,
    key: string,
    supplied: unknown,
  ) {
    const asset = parseManagedVideoAsset(supplied)
    if (asset.src !== `/media/${key}`) return answer({ code: 'missing' }, 404)
    const requestedIfRange = request.headers.get('If-Range')
    const rangeHeader =
      request.method === 'GET' &&
      (!requestedIfRange || /^"[^"\r\n]+"$/.test(requestedIfRange))
        ? request.headers.get('Range')
        : null
    let range: { offset: number; length: number } | undefined
    let invalidRange = false
    // RFC 9110: unknown range units are ignored; unit names are case-insensitive.
    if (rangeHeader && /^bytes=/i.test(rangeHeader)) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader)
      const start = match?.[1] ? Number(match[1]) : null,
        end = match?.[2] ? Number(match[2]) : null
      if (
        !match ||
        (start === null && end === null) ||
        (start !== null &&
          (!Number.isSafeInteger(start) || start >= asset.byteSize)) ||
        (end !== null && !Number.isSafeInteger(end)) ||
        (start !== null && end !== null && end < start) ||
        (start === null && (!end || end < 1))
      ) {
        // Evaluate cache preconditions first: a matching If-None-Match still
        // returns 304 even when the supplied byte range is unsatisfiable.
        invalidRange = true
      } else {
        const offset = start ?? Math.max(0, asset.byteSize - end!)
        range = {
          offset,
          length:
            (start === null
              ? asset.byteSize - 1
              : Math.min(end ?? asset.byteSize - 1, asset.byteSize - 1)) -
            offset +
            1,
        }
      }
    }
    const noneMatch = request.headers.get('If-None-Match'),
      ifRange = range || invalidRange ? requestedIfRange : null
    const conditional = new Headers()
    if (noneMatch) conditional.set('If-None-Match', noneMatch)
    // An If-Range date/weak validator cannot establish identity: send full 200.
    if (ifRange && !/^"[^"\r\n]+"$/.test(ifRange)) range = undefined
    else if (ifRange) conditional.set('If-Match', ifRange)
    let stored =
      request.method === 'HEAD'
        ? await env.MEDIA_BUCKET.head(key)
        : await env.MEDIA_BUCKET.get(key, {
            ...(range ? { range } : {}),
            ...(noneMatch || conditional.has('If-Match')
              ? { onlyIf: conditional }
              : {}),
          })
    // A stale If-Range validator requires the complete current representation.
    // This uncommon mismatch needs a second GET; ordinary/ranged GET has one.
    if (
      stored &&
      request.method === 'GET' &&
      ifRange &&
      (range || invalidRange) &&
      stored.httpEtag !== ifRange
    ) {
      if (stored.body) await stored.body.cancel()
      range = undefined
      invalidRange = false
      stored = await env.MEDIA_BUCKET.get(
        key,
        noneMatch
          ? { onlyIf: new Headers({ 'If-None-Match': noneMatch }) }
          : undefined,
      )
    }
    if (
      !stored ||
      stored.httpMetadata?.contentType !== 'video/mp4' ||
      stored.size !== asset.byteSize
    ) {
      if (stored?.body) await stored.body.cancel()
      return answer({ code: 'missing' }, 404)
    }
    const headers = new Headers({
      'Content-Type': 'video/mp4',
      'Content-Length': String(range?.length ?? stored.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: stored.httpEtag,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    })
    if (request.method === 'HEAD')
      return new Response(null, {
        status: noneMatch === stored.httpEtag ? 304 : 200,
        headers,
      })
    if (!stored.body) {
      if (noneMatch) {
        headers.set('Content-Length', String(stored.size))
        return new Response(null, { status: 304, headers })
      }
      return answer({ code: 'missing' }, 404)
    }
    if (invalidRange) {
      await stored.body.cancel()
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${asset.byteSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      })
    }
    if (range)
      headers.set(
        'Content-Range',
        `bytes ${range.offset}-${range.offset + range.length - 1}/${stored.size}`,
      )
    return new Response(stored.body, { status: range ? 206 : 200, headers })
  }

  async function serve(request: Request, env: MediaEnvironment) {
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })
    const pathname = new URL(request.url).pathname
    const match = pathname.match(imagePath) ?? pathname.match(videoPath)
    if (!match || !uuid.test(match[2])) return answer({ code: 'missing' }, 404)
    const key = match[1],
      assetId = match[2]
    const publicAsset = await rpc(
      env,
      'media_public_asset',
      { p_asset_id: assetId },
      'public',
    )
    if (!publicAsset) return answer({ code: 'missing' }, 404)
    if (videoPath.test(pathname))
      return serveVideo(request, env, key, publicAsset)
    const asset = object(publicAsset)
    const variants = Array.isArray(asset.variants) ? asset.variants : []
    if (
      ![asset.src, ...variants.map((variant) => object(variant).src)].includes(
        pathname,
      )
    )
      return answer({ code: 'missing' }, 404)
    // get() includes metadata: another head() would add a sequential R2 read.
    // Keep the SQL ready/manifest check above even for conditional requests.
    const condition = request.headers.get('If-None-Match')
    const stored =
      request.method === 'HEAD'
        ? await env.MEDIA_BUCKET.head(key)
        : await env.MEDIA_BUCKET.get(
            key,
            condition
              ? { onlyIf: new Headers({ 'If-None-Match': condition }) }
              : undefined,
          )
    if (!stored || stored.httpMetadata?.contentType !== 'image/webp') {
      if (stored?.body) await stored.body.cancel()
      return answer({ code: 'missing' }, 404)
    }
    const headers = new Headers({
      'Content-Type': 'image/webp',
      'Content-Length': String(stored.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: stored.httpEtag,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    })
    if (request.method === 'HEAD')
      return new Response(null, {
        status: condition === stored.httpEtag ? 304 : 200,
        headers,
      })
    // R2 omits the stream when the conditional GET's ETag still matches.
    if (!stored.body)
      return condition
        ? new Response(null, { status: 304, headers })
        : answer({ code: 'missing' }, 404)
    return new Response(stored.body, { headers })
  }
  return async (
    request: Request,
    env: MediaEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (
      !url.pathname.startsWith('/api/admin/media/') &&
      !url.pathname.startsWith('/media/')
    )
      return null
    let origin: string | null = null
    try {
      if (!env.MEDIA_BUCKET || !env.SUPABASE_MEDIA_SECRET_KEY)
        throw new MediaError(
          503,
          'configuration',
          'El almacenamiento de fotografías aún no está configurado.',
        )
      if (url.pathname.startsWith('/media/')) return await serve(request, env)
      origin = request.headers.get('Origin')
      const allowed = (env.MEDIA_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      if (origin && origin !== url.origin && !allowed.includes(origin))
        throw new MediaError(
          403,
          'origin',
          'La solicitud no procede de una dirección autorizada.',
        )
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: origin
            ? {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '600',
                Vary: 'Origin',
              }
            : {},
        })
      if (
        !['/api/admin/media/upload', '/api/admin/media/video-upload'].includes(
          url.pathname,
        )
      )
        return answer({ code: 'missing' }, 404)
      const response = url.pathname.endsWith('/video-upload')
        ? await uploadVideo(request, env)
        : await upload(request, env)
      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Vary', 'Origin')
      }
      return response
    } catch (error) {
      const issue =
        error instanceof MediaError
          ? error
          : new MediaError(
              503,
              'storage',
              'No pudimos completar la carga. Conserva tus fotografías y vuelve a intentarlo.',
            )
      const response = answer(
        { code: issue.code, message: issue.message },
        issue.status,
      )
      if (
        origin &&
        (origin === url.origin ||
          (env.MEDIA_ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((value) => value.trim())
            .includes(origin))
      )
        response.headers.set('Access-Control-Allow-Origin', origin)
      return response
    }
  }
}

/** Only claimed UUID prefixes are ever listed/deleted; never a deployment prune. */
export async function cleanupMedia(
  env: MediaEnvironment,
  transport: typeof fetch = fetch,
) {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_MEDIA_SECRET_KEY,
    'Content-Type': 'application/json',
    'Content-Profile': 'api',
    'Accept-Profile': 'api',
  }
  if (env.SUPABASE_MEDIA_SECRET_KEY.startsWith('eyJ'))
    headers.Authorization = `Bearer ${env.SUPABASE_MEDIA_SECRET_KEY}`
  async function command(name: string, body: unknown) {
    const deadline = AbortSignal.timeout(15000)
    const response = await transport(
      `${env.SUPABASE_URL}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: deadline,
        redirect: 'manual',
      },
    )
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new Error('Media cleanup could not be confirmed')
    }
    // PostgREST correctly answers 204 for the void finalization RPC.
    // Finalization succeeded; attempting JSON decoding would abort the batch.
    if (response.status === 204) return null
    return readProviderJson(response, deadline)
  }
  const entries = await command('media_gc_claim', { p_limit: 10 })
  if (!Array.isArray(entries)) throw new Error('Invalid media cleanup claims')
  for (const value of entries) {
    const claim = object(value)
    if (
      typeof claim.id !== 'string' ||
      !uuid.test(claim.id) ||
      typeof claim.claimId !== 'string' ||
      !uuid.test(claim.claimId) ||
      claim.prefix !== `public/dynamic/${claim.id}/`
    )
      throw new Error('Unsafe media cleanup scope')
    let cursor: string | undefined
    do {
      const page = await env.MEDIA_BUCKET.list({
        prefix: claim.prefix,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      })
      const keys = page.objects.map((entry) => entry.key)
      if (keys.some((key) => !key.startsWith(String(claim.prefix))))
        throw new Error('Unsafe media cleanup key')
      if (keys.length) await env.MEDIA_BUCKET.delete(keys)
      cursor = page.truncated ? page.cursor : undefined
      if (page.truncated && !cursor)
        throw new Error('Invalid media cleanup pagination')
    } while (cursor)
    await command('media_gc_finalize', {
      p_asset_id: claim.id,
      p_claim_id: claim.claimId,
    })
  }
}
