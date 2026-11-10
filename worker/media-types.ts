/** Narrow structural contracts implemented by native R2 bindings and runtime tests. */
export interface MediaObject {
  key: string
  size: number
  etag: string
  httpEtag: string
  httpMetadata?: { contentType?: string; cacheControl?: string }
  customMetadata?: Record<string, string>
  body?: ReadableStream<Uint8Array>
}
export interface MediaObjectBody extends MediaObject {
  body: ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}
export interface MediaBucket {
  head(key: string): Promise<MediaObject | null>
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      httpMetadata: { contentType: string; cacheControl: string }
      customMetadata: Record<string, string>
      onlyIf?: { etagDoesNotMatch: string }
    },
  ): Promise<MediaObject | null>
  get(
    key: string,
    options?: { onlyIf?: Headers; range?: { offset: number; length: number } },
  ): Promise<MediaObjectBody | MediaObject | null>
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string }[]
    truncated: boolean
    cursor?: string
  }>
  delete(keys: string | string[]): Promise<void>
}
/** Runtime receives these values from generated Env; tests need no forged Env. */
export interface MediaEnvironment {
  MEDIA_BUCKET: MediaBucket
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_MEDIA_SECRET_KEY: string
  MEDIA_ALLOWED_ORIGINS: string
  MEDIA_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}

export interface VerifiedImage {
  width: number
  height: number
}
