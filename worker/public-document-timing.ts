const operations = new Set([
  'catalog_home_context', 'catalog_browse', 'site_settings',
  'home_document', 'site_media_document', 'public_media_aliases',
  'catalog_product_context', 'catalog_brands',
])
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
interface PublicRead {
  operation: string
  clientId: string
  pending: boolean
  upstreamId?: string
  headersMs?: number
}

/** Request-local staging diagnostics only. Snapshotting never awaits a read or
 * consumes its body. A pending clientId already exists in the gateway's
 * X-Client-Info/traceparent; no payload or credential enters the header. */
export function publicDocumentTiming(environment: string, backend: string, transport: typeof fetch) {
  if (environment !== 'staging') return { fetch: transport, header: () => null }
  const reads: PublicRead[] = []
  const tracked: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const operation = url.pathname.slice('/rest/v1/rpc/'.length)
    const clientId = headers.get('X-Client-Info')?.match(/^aroma-public-read\/([a-f0-9-]{36})$/i)?.[1]
    if (reads.length >= 8 || url.origin !== backend.replace(/\/$/, '') ||
        !url.pathname.startsWith('/rest/v1/rpc/') || !operations.has(operation) ||
        (init?.method ?? (input instanceof Request ? input.method : 'GET')) !== 'POST' ||
        headers.has('Authorization') || !clientId || !uuid.test(clientId))
      return transport(input, init)
    const read: PublicRead = { operation, clientId, pending: true }
    reads.push(read)
    const start = performance.now()
    try {
      const response = await transport(input, init)
      const id = response.headers.get('sb-request-id')
      if (id && uuid.test(id)) read.upstreamId = id
      read.headersMs = Math.round((performance.now() - start) * 10) / 10
      return response
    } finally { read.pending = false }
  }
  return { fetch: tracked, header: () => reads.length ? JSON.stringify(reads) : null }
}
