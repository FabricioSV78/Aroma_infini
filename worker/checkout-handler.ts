import { permitsCheckoutSimulation } from '../src/domain/runtime-policy'

interface CheckoutEnvironment {
  APP_ENVIRONMENT?: string
  CHECKOUT_SIMULATION_ORIGIN?: string
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_COMMERCE_SECRET_KEY?: string
  CHECKOUT_SIMULATION_ENABLED?: string
  MEDIA_ALLOWED_ORIGINS: string
  CHECKOUT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}
class CheckoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
function result(value: unknown, status = 200) {
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
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new CheckoutError(
      415,
      'format',
      'Envía los datos del pedido en el formato indicado.',
    )
  if (Number(request.headers.get('content-length') || 0) > 32768)
    throw new CheckoutError(
      413,
      'size',
      'El pedido supera el tamaño permitido.',
    )
  const reader = request.body?.getReader()
  if (!reader)
    throw new CheckoutError(400, 'validation', 'Revisa los datos del pedido.')
  const chunks: Uint8Array[] = []
  let length = 0
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
  let stop: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    stop = () =>
      reject(
        new CheckoutError(
          408,
          'timeout',
          'La solicitud tardó demasiado. Conserva los datos y vuelve a intentar.',
        ),
      )
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
  let complete = false
  try {
    while (true) {
      const next = await Promise.race([reader.read(), aborted])
      if (next.done) {
        complete = true
        break
      }
      length += next.value.byteLength
      if (length > 32768) {
        throw new CheckoutError(
          413,
          'size',
          'El pedido supera el tamaño permitido.',
        )
      }
      chunks.push(next.value)
    }
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
    // A hostile/incomplete upload must not hold the response open, including
    // when its stream's cancellation callback never settles.
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    )
  } catch {
    throw new CheckoutError(400, 'validation', 'Revisa los datos del pedido.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CheckoutError(400, 'validation', 'Revisa los datos del pedido.')
  return value as Record<string, unknown>
}

/** Bound upstream JSON too; provider bodies are not an unbounded buffer. */
async function readProviderJson(
  response: Response,
  signal: AbortSignal,
  maximum: number,
): Promise<unknown> {
  const failure = () =>
    new CheckoutError(
      503,
      'service',
      'No pudimos verificar la respuesta. Conserva los datos y vuelve a intentar.',
    )
  const reader = response.body?.getReader()
  let stop: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(failure())
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
  // Always attach a rejection handler, even if a declared-length check fails
  // before the first read races the cancellation signal.
  void aborted.catch(() => {})
  let complete = false
  try {
    const declared = response.headers.get('content-length')
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
      if (!complete) void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}

/** Explicit simulation boundary: never confirms a real payment or consumes stock. */
export function createCheckoutHandler(transport: typeof fetch = fetch) {
  return async (
    request: Request,
    env: CheckoutEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/checkout/')) return null
    let allowedOrigin: string | null = null
    try {
      if (url.pathname !== '/api/checkout/simulate')
        return result(
          { code: 'missing', message: 'No encontramos esta operación.' },
          404,
        )
      const origin = request.headers.get('origin')
      const allowed = new Set([
        url.origin,
        ...(env.MEDIA_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
      ])
      if (origin && !allowed.has(origin))
        throw new CheckoutError(
          403,
          'origin',
          'Esta solicitud no está permitida.',
        )
      allowedOrigin = origin
      if (request.method === 'OPTIONS') {
        const response = result(null, 200)
        response.headers.set(
          'Access-Control-Allow-Origin',
          origin || url.origin,
        )
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization',
        )
        response.headers.set('Vary', 'Origin')
        return response
      }
      if (request.method !== 'POST')
        throw new CheckoutError(
          405,
          'method',
          'Usa el formulario del checkout.',
        )
      if (
        !permitsCheckoutSimulation(
          env.APP_ENVIRONMENT,
          url.origin,
          env.CHECKOUT_SIMULATION_ORIGIN,
          env.CHECKOUT_SIMULATION_ENABLED,
          env.SUPABASE_URL,
        ) ||
        !env.SUPABASE_COMMERCE_SECRET_KEY ||
        !env.CHECKOUT_RATE_LIMITER
      )
        throw new CheckoutError(
          503,
          'unavailable',
          'El pago en línea no está disponible en este momento.',
        )
      const base = new URL(env.SUPABASE_URL)
      if (
        base.protocol !== 'https:' ||
        base.pathname !== '/' ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        !env.SUPABASE_PUBLISHABLE_KEY
      )
        throw new CheckoutError(
          503,
          'unavailable',
          'El checkout de prueba todavía no está disponible.',
        )
      const address = request.headers.get('CF-Connecting-IP') || 'local'
      if (
        !(await env.CHECKOUT_RATE_LIMITER.limit({ key: `checkout:${address}` }))
          .success
      )
        throw new CheckoutError(
          429,
          'rate-limit',
          'Espera un momento antes de registrar otro pedido de prueba.',
        )
      let userId: string | null = null
      const authorization = request.headers.get('Authorization')
      if (authorization) {
        if (!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(authorization))
          throw new CheckoutError(
            401,
            'session',
            'Vuelve a iniciar sesión antes de continuar.',
          )
        const authSignal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(15000),
        ])
        const verified = await transport(`${base.origin}/auth/v1/user`, {
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            Authorization: authorization,
          },
          signal: authSignal,
          redirect: 'manual',
        })
        const data = await readProviderJson(verified, authSignal, 128 * 1024)
        if (
          !verified.ok ||
          !data ||
          typeof data !== 'object' ||
          !('id' in data) ||
          typeof data.id !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(data.id)
        )
          throw new CheckoutError(
            401,
            'session',
            'Vuelve a iniciar sesión antes de continuar.',
          )
        userId = data.id
      }
      const body = await readJson(request)
      if (
        Object.keys(body).sort().join(',') !==
          'checkout,operationId,trackingToken' ||
        typeof body.operationId !== 'string' ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
          body.operationId,
        ) ||
        typeof body.trackingToken !== 'string' ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(body.trackingToken)
      )
        throw new CheckoutError(
          400,
          'validation',
          'Revisa los datos del pedido.',
        )
      const secret = env.SUPABASE_COMMERCE_SECRET_KEY
      const headers: Record<string, string> = {
        apikey: secret,
        'Content-Type': 'application/json',
        'Content-Profile': 'api',
        'Accept-Profile': 'api',
      }
      if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`
      const confirmationSignal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(20000),
      ])
      const confirmed = await transport(
        `${base.origin}/rest/v1/rpc/create_simulated_order`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            p_operation_id: body.operationId,
            p_tracking_token: body.trackingToken,
            p_checkout: body.checkout,
            p_user_id: userId,
          }),
          signal: confirmationSignal,
          redirect: 'manual',
        },
      )
      const value = await readProviderJson(
        confirmed,
        confirmationSignal,
        512 * 1024,
      )
      if (!confirmed.ok) {
        const code =
          value && typeof value === 'object' && 'code' in value
            ? value.code
            : null
        if (code === 'PT409')
          throw new CheckoutError(
            409,
            'conflict',
            'Los precios, la entrega o esta operación cambiaron. Revisa el resumen antes de continuar.',
          )
        if (code === 'PT429')
          throw new CheckoutError(
            429,
            'rate-limit',
            'Espera un momento antes de volver a intentar.',
          )
        if (confirmed.status === 400 || code === '22023' || code === 'PT422')
          throw new CheckoutError(
            400,
            'validation',
            'No pudimos confirmar el pedido. Revisa disponibilidad, entrega y código de descuento.',
          )
        throw new CheckoutError(
          503,
          'service',
          'No pudimos confirmar el pedido. Conserva los datos y vuelve a intentar.',
        )
      }
      if (!value || typeof value !== 'object' || !('order' in value))
        throw new CheckoutError(
          503,
          'service',
          'No pudimos verificar la confirmación del pedido.',
        )
      const response = result(value)
      if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
        response.headers.set('Vary', 'Origin')
      }
      return response
    } catch (error) {
      const failure =
        error instanceof CheckoutError
          ? error
          : new CheckoutError(
              503,
              'service',
              'No pudimos confirmar el pedido. Conserva los datos y vuelve a intentar.',
            )
      const response = result(
        { code: failure.code, message: failure.message },
        failure.status,
      )
      if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
        response.headers.set('Vary', 'Origin')
      }
      return response
    }
  }
}
