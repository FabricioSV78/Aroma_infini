/** Staging diagnostics for fixed anonymous reads. No URLs, payloads, sessions,
 * API keys or application row identifiers enter the log or response headers. */
export function publicReadTiming(
  environment: string | undefined,
  operation: string,
) {
  const enabled = environment === 'staging'
  const requestId = enabled ? crypto.randomUUID() : undefined
  let started = 0
  let received = 0
  let upstreamId: string | undefined
  let upstreamRay: string | undefined
  let status: number | undefined
  let proxyMs: number | undefined
  let upstreamMs: number | undefined
  let envoyMs: number | undefined
  let upstreamAttempts: number | undefined
  let ended: number | undefined
  const phases: Record<string, number> = {}
  let finished = false
  function numeric(headers: Headers, name: string) {
    const value = headers.get(name)
    return value && /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 60000
      ? Number(value)
      : undefined
  }
  return {
    requestId,
    async fetch(transport: typeof fetch, url: string, init: RequestInit) {
      if (!enabled) return transport(url, init)
      started = performance.now()
      const headers = new Headers(init.headers)
      headers.set('X-Client-Info', `aroma-public-read/${requestId}`)
      const trace = requestId!.replaceAll('-', '')
      headers.set('traceparent', `00-${trace}-${trace.slice(0, 16)}-01`)
      const response = await transport(url, { ...init, headers })
      received = performance.now()
      status = response.status
      const id = response.headers.get('sb-request-id')
      if (id && /^[a-f0-9-]{36}$/i.test(id)) upstreamId = id
      const ray = response.headers.get('cf-ray')
      if (ray && /^[a-f0-9]{16,32}-[a-z]{3}$/i.test(ray)) upstreamRay = ray
      proxyMs = numeric(response.headers, 'x-kong-proxy-latency')
      upstreamMs = numeric(response.headers, 'x-kong-upstream-latency')
      envoyMs = numeric(response.headers, 'x-envoy-upstream-service-time')
      upstreamAttempts = numeric(response.headers, 'x-envoy-attempt-count')
      // Only documented scalar PostgREST phases; never forward arbitrary
      // descriptions, SQL, object names or provider-controlled header text.
      const serverTiming = response.headers.get('Server-Timing') ?? ''
      if (serverTiming.length <= 2048) {
        for (const metric of serverTiming.split(',')) {
          const parsed = metric
            .trim()
            .match(
              /^(jwt|parse|plan|transaction|response);\s*dur=(\d+(?:\.\d+)?)$/,
            )
          if (parsed && Number(parsed[2]) <= 60000 && !(parsed[1] in phases))
            phases[parsed[1]] = Number(parsed[2])
        }
      }
      return response
    },
    finish(outcome: 'ok' | 'error') {
      if (!enabled || finished) return
      finished = true
      ended = performance.now()
      console.info('aroma.public-read', {
        requestId,
        operation,
        outcome,
        status,
        upstreamId,
        upstreamRay,
        headersMs: received ? received - started : undefined,
        bodyMs: received ? ended - received : undefined,
        totalMs: ended - started,
        proxyMs,
        upstreamMs,
        envoyMs,
        upstreamAttempts,
        postgrest: phases,
      })
    },
    headers() {
      const headers = new Headers()
      if (!requestId) return headers
      headers.set('X-Aroma-Request-Id', requestId)
      if (upstreamId) headers.set('X-Aroma-Upstream-Id', upstreamId)
      const timings = []
      if (received)
        timings.push(`manifest_headers;dur=${(received - started).toFixed(1)}`)
      if (received && ended !== undefined)
        timings.push(`manifest_body;dur=${(ended - received).toFixed(1)}`)
      if (proxyMs !== undefined)
        timings.push(`gateway_proxy;dur=${proxyMs.toFixed(1)}`)
      // This is the gateway's upstream duration, NOT PostgreSQL execution time.
      if (upstreamMs !== undefined)
        timings.push(`gateway_upstream;dur=${upstreamMs.toFixed(1)}`)
      if (envoyMs !== undefined)
        timings.push(`envoy_upstream;dur=${envoyMs.toFixed(1)}`)
      for (const [phase, duration] of Object.entries(phases))
        timings.push(`pgrst_${phase};dur=${duration.toFixed(1)}`)
      if (timings.length) headers.set('Server-Timing', timings.join(', '))
      return headers
    },
  }
}
