import {
  MEDIA_SVG_MAX_BYTES,
  parseManagedSvgAsset,
  parseManagedSvgPath,
  type ManagedSvgAsset,
} from '../domain/media'
import { guardedUpload, type ExpectedMediaActor } from './media-upload'
import { mediaApiBaseUrl } from './asset-source'
import { UserFacingError } from './admin-messages'

interface Attempt {
  operationId: string
  at: number
  asset?: ManagedSvgAsset
  pending?: Promise<ManagedSvgAsset>
}
const attempts = new Map<string, Attempt>()

async function receipt(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing SVG receipt')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > 8192) throw new Error('Oversized SVG receipt')
      chunks.push(next.value)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as unknown
}

/** The server accepts a restricted static SVG dialect and verifies its receipt.
 * No SVG markup is injected into the document or used as an inline preview. */
export function uploadManagedSvg(
  blob: Blob,
  actor: ExpectedMediaActor,
): Promise<ManagedSvgAsset> {
  return guardedUpload(actor, async (signal, cancelled) => {
    if (
      blob.type !== 'image/svg+xml' ||
      !blob.size ||
      blob.size > MEDIA_SVG_MAX_BYTES
    )
      throw new UserFacingError(
        'svg-file',
        'El logotipo debe ser SVG estático de hasta 512 KB.',
      )
    const bytes = await blob.arrayBuffer()
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    ]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
    const key = `${actor.userId}:${hash}`
    const now = Date.now()
    for (const [id, entry] of attempts)
      if (!entry.pending && now - entry.at > 600_000) attempts.delete(id)
    let entry = attempts.get(key)
    if (!entry) {
      if (attempts.size >= 100)
        throw new UserFacingError(
          'svg-limit',
          'Espera un momento antes de subir más logotipos.',
        )
      entry = { operationId: crypto.randomUUID(), at: now }
      attempts.set(key, entry)
    }
    if (entry.asset) return entry.asset
    if (entry.pending) return entry.pending
    const saved = entry
    const pending = (async () => {
      const origin = mediaApiBaseUrl()
      if (origin === null)
        throw new UserFacingError(
          'svg-config',
          'La biblioteca no está configurada correctamente.',
        )
      const body = new FormData()
      body.append('operationId', saved.operationId)
      body.append(
        'file',
        new Blob([bytes], { type: 'image/svg+xml' }),
        'logo.svg',
      )
      const response = await fetch(`${origin}/api/admin/media/svg-upload`, {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${actor.token}` },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      })
      if (cancelled()) throw new Error('Session changed')
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new UserFacingError(
          'svg-upload',
          response.status === 422
            ? 'El SVG contiene elementos no permitidos. Exporta un logotipo vectorial estático sin scripts ni enlaces.'
            : response.status === 429
              ? 'Espera un momento antes de volver a subir el logotipo.'
              : 'No pudimos guardar el logotipo. Conserva el archivo y vuelve a intentarlo.',
        )
      }
      const value = await receipt(response)
      if (!value || typeof value !== 'object' || !('asset' in value))
        throw new Error('Missing SVG receipt')
      const asset = parseManagedSvgAsset(value.asset)
      if (
        parseManagedSvgPath(asset.src)?.hash !== hash ||
        asset.byteSize !== blob.size
      )
        throw new Error('SVG receipt mismatch')
      await actor.assertCurrent?.()
      saved.asset = asset
      return asset
    })()
    saved.pending = pending
    try {
      return await pending
    } finally {
      if (saved.pending === pending) saved.pending = undefined
    }
  })
}
