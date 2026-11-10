import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { ManagedVideoAsset } from '../src/domain/media'
import type {
  MediaBucket,
  MediaEnvironment,
  MediaObject,
  MediaObjectBody,
} from '../worker/media-types'

interface StoredObject extends MediaObject {
  bytes: ArrayBuffer
}

/** In-memory binding boundary only; no Cloudflare account or bucket is used. */
export class MemoryMediaBucket implements MediaBucket {
  readonly objects = new Map<string, StoredObject>()
  readonly writes: string[] = []
  readonly reads: string[] = []
  readonly bodyReads: string[] = []
  readonly heads: string[] = []
  readonly removed: string[] = []
  failPut = false
  failGet = false
  missingHead = false
  incorrectHeadSize = false

  async head(key: string): Promise<MediaObject | null> {
    this.heads.push(key)
    if (this.missingHead) return null
    const stored = this.objects.get(key)
    if (!stored) return null
    const { bytes: ignoredBytes, ...metadata } = stored
    void ignoredBytes
    return this.incorrectHeadSize
      ? { ...metadata, size: metadata.size + 1 }
      : metadata
  }

  async put(
    key: string,
    data: ArrayBuffer,
    options: {
      httpMetadata: { contentType: string; cacheControl: string }
      customMetadata: Record<string, string>
      onlyIf?: { etagDoesNotMatch: string }
    },
  ): Promise<MediaObject | null> {
    if (this.failPut) throw new Error('Isolated R2 unavailable')
    if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key))
      return null
    this.writes.push(key)
    const etag = createHash('sha256').update(new Uint8Array(data)).digest('hex')
    const object: StoredObject = {
      key,
      size: data.byteLength,
      etag,
      httpEtag: `"${etag}"`,
      httpMetadata: { ...options.httpMetadata },
      customMetadata: { ...options.customMetadata },
      bytes: data.slice(0),
    }
    this.objects.set(key, object)
    const { bytes: ignoredBytes, ...metadata } = object
    void ignoredBytes
    return metadata
  }

  async get(
    key: string,
    options?: { onlyIf?: Headers; range?: { offset: number; length: number } },
  ): Promise<MediaObjectBody | MediaObject | null> {
    this.reads.push(key)
    if (this.failGet) throw new Error('Isolated R2 unavailable')
    const stored = this.objects.get(key)
    if (!stored) return null
    const { bytes, ...metadata } = stored
    const condition = options?.onlyIf?.get('If-None-Match')
    const match = options?.onlyIf?.get('If-Match')
    if (match && match !== stored.httpEtag) return metadata
    if (
      condition &&
      (condition.trim() === '*' ||
        condition
          .split(',')
          .some((tag) => tag.trim().replace(/^W\//, '') === stored.httpEtag))
    )
      return metadata
    this.bodyReads.push(key)
    const selected = options?.range
      ? bytes.slice(
          options.range.offset,
          options.range.offset + options.range.length,
        )
      : bytes
    return {
      ...metadata,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(selected.slice(0)))
          controller.close()
        },
      }),
      arrayBuffer: async () => selected.slice(0),
    }
  }

  async list({
    prefix,
    cursor,
    limit = 1000,
  }: {
    prefix: string
    cursor?: string
    limit?: number
  }) {
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
    const offset = cursor ? Number.parseInt(cursor, 10) : 0
    const selected = keys.slice(offset, offset + limit)
    const truncated = offset + selected.length < keys.length
    return {
      objects: selected.map((key) => ({ key })),
      truncated,
      ...(truncated ? { cursor: String(offset + selected.length) } : {}),
    }
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.removed.push(key)
      this.objects.delete(key)
    }
  }
}

export const mediaTestOrigin = 'https://aroma-media.example'
export const mediaTestSupabase = 'https://test-media.supabase.co'
export const mediaTestActor = '10000000-0000-4000-8000-000000000001'
export const mediaTestToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJpc29sYXRlZCJ9.isolated-test-signature'

const preparedFiles = new Map<number, Promise<ArrayBuffer>>()

/** Valid images, generated only by the already-installed development Sharp. */
export function webpFixture(width: number): Promise<ArrayBuffer> {
  let prepared = preparedFiles.get(width)
  if (!prepared) {
    prepared = sharp({
      create: {
        width,
        height: Math.round((width * 5) / 4),
        channels: 3,
        background: { r: 218, g: 210, b: 190 },
      },
    })
      .webp({ quality: 82 })
      .toBuffer()
      .then((value) => new Uint8Array(value).buffer)
    preparedFiles.set(width, prepared)
  }
  return prepared
}

export async function decodeFixture(bytes: ArrayBuffer) {
  const image = sharp(new Uint8Array(bytes), { failOn: 'error' })
  const result = await image.raw().toBuffer({ resolveWithObject: true })
  return { width: result.info.width, height: result.info.height }
}

export async function uploadRequest({
  operationId = randomUUID(),
  purpose = 'product-gallery',
  widths = [480, 960, 1600],
  authorization = `Bearer ${mediaTestToken}`,
  origin = mediaTestOrigin,
  files,
}: {
  operationId?: string
  purpose?: string
  widths?: number[]
  authorization?: string | null
  origin?: string | null
  files?: File[]
} = {}) {
  const form = new FormData()
  form.set('operationId', operationId)
  form.set('purpose', purpose)
  const images =
    files ??
    (await Promise.all(
      widths.map(
        async (width) =>
          new File([await webpFixture(width)], `${width}.webp`, {
            type: 'image/webp',
          }),
      ),
    ))
  for (const file of images) form.append('files', file)
  return new Request(`${mediaTestOrigin}/api/admin/media/upload`, {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(origin ? { origin } : {}),
    },
    body: form,
  })
}

export interface ManagedMediaAsset {
  id: string
  src: string
  width: number
  height: number
  variants: Array<{ src: string; width: number; height: number }>
}

export interface VerifiedMetadata {
  width: number
  height: number
  mimeType: string
  byteSize: number
  sha256: string
  objectKey: string
  variants: Array<{
    width: number
    height: number
    mimeType: string
    byteSize: number
    sha256: string
    objectKey: string
  }>
}

interface MediaReservation {
  id: string
  status: 'pending' | 'ready'
  operationId: string
  purpose: string
  asset: ManagedMediaAsset | ManagedVideoAsset | null
}

interface RpcCall {
  name: string
  authorization: string | null
  body: Record<string, unknown>
}

export function mediaWorkerHarness() {
  const bucket = new MemoryMediaBucket()
  const reservations = new Map<string, MediaReservation>()
  const metadata = new Map<string, VerifiedMetadata>()
  const videoMetadata = new Map<
    string,
    {
      width: number
      height: number
      durationMs: number
      byteSize: number
      sha256: string
    }
  >()
  const calls: RpcCall[] = []
  const state = {
    authValid: true,
    role: 'admin',
    aal: 'aal2',
    actorId: mediaTestActor,
    authCalls: 0,
    actorCalls: 0,
    revokeAfterWrite: false,
    actorUnavailable: false,
    sqlRateLimited: false,
    bindingRateAllowed: true,
    reserveUnavailable: false,
    completeUnavailable: false,
    completionUncertain: false,
    publicUnavailable: false,
    privateResponse: false,
    gcClaims: [] as unknown[],
    gcFinalizations: [] as Record<string, unknown>[],
  }
  const environment: MediaEnvironment = {
    MEDIA_BUCKET: bucket,
    SUPABASE_URL: mediaTestSupabase,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_media-isolated',
    SUPABASE_MEDIA_SECRET_KEY: 'sb_secret_server-only-isolated',
    MEDIA_ALLOWED_ORIGINS: mediaTestOrigin,
    MEDIA_RATE_LIMITER: {
      async limit() {
        return { success: state.bindingRateAllowed }
      },
    },
  }
  function reply(data: unknown, status = 200) {
    return Response.json(data, { status })
  }
  const upstream: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== mediaTestSupabase)
      throw new Error(
        'Unexpected upstream origin; no real network is permitted',
      )
    if (url.pathname === '/auth/v1/user') {
      state.authCalls++
      if (
        !state.authValid ||
        request.headers.get('authorization') !== `Bearer ${mediaTestToken}`
      )
        return reply({ code: 'bad_jwt' }, 401)
      return reply({ id: mediaTestActor, email: 'isolated@example.invalid' })
    }
    const name = url.pathname.split('/').at(-1) ?? ''
    const body =
      request.method === 'POST'
        ? ((await request.json()) as Record<string, unknown>)
        : {}
    calls.push({
      name,
      body,
      authorization: request.headers.get('authorization'),
    })
    if (name === 'current_actor') {
      state.actorCalls++
      if (state.actorUnavailable) return reply({ code: 'upstream' }, 503)
      return reply({
        user_id: state.actorId,
        role:
          state.revokeAfterWrite && bucket.writes.length
            ? 'customer'
            : state.role,
        aal: state.aal,
        requires_mfa: state.aal !== 'aal2',
      })
    }
    if (name === 'media_upload_reserve') {
      if (state.sqlRateLimited) return reply({ code: 'PT429' }, 429)
      if (state.reserveUnavailable) return reply({ code: 'upstream' }, 503)
      const operationId = String(body.p_operation_id)
      const purpose = String(body.p_purpose)
      let reservation = reservations.get(operationId)
      if (reservation && reservation.purpose !== purpose)
        return reply({ code: 'PT409' }, 409)
      if (!reservation) {
        reservation = {
          id: randomUUID(),
          status: 'pending',
          operationId,
          purpose,
          asset: null,
        }
        reservations.set(operationId, reservation)
      }
      return reply(reservation)
    }
    if (name === 'media_upload_status')
      return reply(reservations.get(String(body.p_operation_id)) ?? null)
    if (
      name === 'media_upload_prepare_video' ||
      name === 'media_upload_complete_video'
    ) {
      if (
        request.headers.get('apikey') !==
          environment.SUPABASE_MEDIA_SECRET_KEY ||
        body.p_actor_id !== mediaTestActor
      )
        return reply({ code: '42501' }, 403)
      const reservation = [...reservations.values()].find(
        (item) => item.id === body.p_asset_id,
      )
      if (!reservation || reservation.purpose !== 'film-video')
        return reply({ code: '42501' }, 403)
      const next = body.p_manifest as {
        width: number
        height: number
        durationMs: number
        byteSize: number
        sha256: string
      }
      const previous = videoMetadata.get(reservation.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(next))
        return reply({ code: 'PT409' }, 409)
      if (name === 'media_upload_prepare_video') {
        videoMetadata.set(reservation.id, next)
        return reply({ id: reservation.id, status: reservation.status })
      }
      if (!previous || state.completeUnavailable)
        return reply({ code: 'upstream' }, 503)
      const asset: ManagedVideoAsset = {
        id: reservation.id,
        src: `/media/public/dynamic/${reservation.id}/${next.sha256}/video.mp4`,
        width: next.width,
        height: next.height,
        durationMs: next.durationMs,
        byteSize: next.byteSize,
        mimeType: 'video/mp4',
      }
      reservation.status = 'ready'
      reservation.asset = asset
      if (state.completionUncertain)
        throw new Error('Connection lost after commit')
      return reply(asset)
    }
    if (name === 'media_upload_prepare') {
      if (
        request.headers.get('apikey') !== environment.SUPABASE_MEDIA_SECRET_KEY
      )
        return reply({ code: '42501' }, 403)
      const reservation = [...reservations.values()].find(
        (item) => item.id === body.p_asset_id,
      )
      if (!reservation || body.p_actor_id !== mediaTestActor)
        return reply({ code: '42501' }, 403)
      const next = body.p_metadata as VerifiedMetadata
      const previous = metadata.get(reservation.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(next))
        return reply({ code: 'PT409' }, 409)
      metadata.set(reservation.id, next)
      return reply({ id: reservation.id, status: reservation.status })
    }
    if (name === 'media_upload_complete') {
      if (
        request.headers.get('apikey') !== environment.SUPABASE_MEDIA_SECRET_KEY
      )
        return reply({ code: '42501' }, 403)
      if (state.completeUnavailable) return reply({ code: 'upstream' }, 503)
      const reservation = [...reservations.values()].find(
        (item) => item.id === body.p_asset_id,
      )
      if (!reservation || body.p_actor_id !== mediaTestActor)
        return reply({ code: '42501' }, 403)
      const confirmed = body.p_metadata as VerifiedMetadata
      metadata.set(reservation.id, confirmed)
      const asset: ManagedMediaAsset = {
        id: reservation.id,
        src: `/media/${confirmed.objectKey}`,
        width: confirmed.width,
        height: confirmed.height,
        variants: confirmed.variants.map((image) => ({
          src: `/media/${image.objectKey}`,
          width: image.width,
          height: image.height,
        })),
      }
      reservation.status = 'ready'
      reservation.asset = asset
      if (state.completionUncertain)
        throw new Error('Connection lost after commit')
      return reply(asset)
    }
    if (name === 'media_public_asset') {
      if (state.publicUnavailable) return reply({ code: 'upstream' }, 503)
      if (state.privateResponse) return reply(null)
      const reservation = [...reservations.values()].find(
        (item) => item.id === body.p_asset_id,
      )
      return reply(reservation?.status === 'ready' ? reservation.asset : null)
    }
    if (name === 'media_gc_claim') return reply(state.gcClaims)
    if (name === 'media_gc_finalize') {
      state.gcFinalizations.push(body)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected isolated RPC: ${name}`)
  }
  return { bucket, reservations, metadata, calls, state, environment, upstream }
}
