import {
  parseComplaintInput,
  parseComplaintReceipt,
} from '../src/domain/complaints'

interface ComplaintEnvironment {
  SUPABASE_URL: string
  SUPABASE_COMMERCE_SECRET_KEY?: string
  MEDIA_ALLOWED_ORIGINS: string
  CHECKOUT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}
class ComplaintError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
function result(value: unknown, status: number) {
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
async function json(
  response: Response,
  signal: AbortSignal,
  maximum = 32768,
): Promise<unknown> {
  const reader = response.body?.getReader()
  const timeout = () =>
    new ComplaintError(
      408,
      'request-timeout',
      'El formulario tardó demasiado en enviarse. Conserva tus datos y vuelve a intentar.',
    )
  try {
    const declared = response.headers.get('Content-Length')
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > maximum)
    )
      throw new ComplaintError(
        413,
        'size',
        'El formulario supera el tamaño permitido.',
      )
    if (!reader)
      throw new ComplaintError(400, 'validation', 'Revisa el formulario.')
    const bodyReader = reader
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const next = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          function abort() {
            // A custom cancellation callback must not delay the HTTP response.
            void bodyReader.cancel().catch(() => {})
            reject(timeout())
          }
          if (signal.aborted) return abort()
          signal.addEventListener('abort', abort, { once: true })
          void bodyReader.read().then(
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
      if (next.done) break
      length += next.value.byteLength
      if (length > maximum)
        throw new ComplaintError(
          413,
          'size',
          'El formulario supera el tamaño permitido.',
        )
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
  } finally {
    if (reader) {
      void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
export function createComplaintsHandler(
  transport: typeof fetch = fetch,
  dependencies: { requestSignal?: () => AbortSignal } = {},
) {
  return async (
    request: Request,
    env: ComplaintEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/complaints')) return null
    let allowedOrigin: string | null = null
    try {
      if (url.pathname !== '/api/complaints')
        return result(
          { code: 'missing', message: 'No encontramos esta operación.' },
          404,
        )
      const origin = request.headers.get('Origin')
      const allowed = new Set([
        url.origin,
        ...(env.MEDIA_ALLOWED_ORIGINS || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ])
      if (origin && !allowed.has(origin))
        throw new ComplaintError(
          403,
          'origin',
          'Esta solicitud no está permitida.',
        )
      allowedOrigin = origin
      if (request.method === 'OPTIONS') {
        const response = new Response(null, {
          status: 204,
          headers: {
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': origin || url.origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            Vary: 'Origin',
          },
        })
        return response
      }
      if (request.method !== 'POST')
        throw new ComplaintError(
          405,
          'method',
          'Utiliza el formulario del Libro de reclamaciones.',
        )
      if (
        !env.SUPABASE_COMMERCE_SECRET_KEY ||
        !env.CHECKOUT_RATE_LIMITER ||
        !/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.SUPABASE_URL)
      )
        throw new ComplaintError(
          503,
          'unavailable',
          'No pudimos registrar tu solicitud. Conserva tus datos y vuelve a intentar.',
        )
      if (
        !(
          await env.CHECKOUT_RATE_LIMITER.limit({
            key: `complaint:${request.headers.get('CF-Connecting-IP') || 'local'}`,
          })
        ).success
      )
        throw new ComplaintError(
          429,
          'rate-limit',
          'Espera un momento antes de registrar otra solicitud.',
        )
      if (
        !/^application\/json\b/i.test(request.headers.get('Content-Type') || '')
      )
        throw new ComplaintError(
          415,
          'format',
          'Utiliza el formulario del Libro de reclamaciones.',
        )
      let raw: unknown
      const deadline = AbortSignal.any([
        request.signal,
        dependencies.requestSignal?.() ?? AbortSignal.timeout(25000),
      ])
      try {
        raw = await json(
          new Response(request.body, { headers: request.headers }),
          deadline,
        )
      } catch (error) {
        if (error instanceof ComplaintError) throw error
        throw new ComplaintError(
          400,
          'validation',
          'Revisa los campos del formulario.',
        )
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ComplaintError(
          400,
          'validation',
          'Revisa los campos del formulario.',
        )
      const body = raw as Record<string, unknown>
      if (
        Object.keys(body).sort().join(',') !==
          'input,operationId,receiptSecret,website' ||
        typeof body.operationId !== 'string' ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
          body.operationId,
        ) ||
        typeof body.receiptSecret !== 'string' ||
        !/^[a-f0-9]{64}$/.test(body.receiptSecret) ||
        body.website !== ''
      )
        throw new ComplaintError(
          400,
          'validation',
          'Revisa los campos del formulario.',
        )
      let input
      try {
        input = parseComplaintInput(body.input)
      } catch {
        throw new ComplaintError(
          400,
          'validation',
          'Revisa los campos del formulario.',
        )
      }
      const secret = env.SUPABASE_COMMERCE_SECRET_KEY
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const signature = await crypto.subtle.sign(
        'HMAC',
        hmacKey,
        new TextEncoder().encode(
          `complaint:${request.headers.get('CF-Connecting-IP') || 'local'}`,
        ),
      )
      const identifier = [...new Uint8Array(signature)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      const headers: Record<string, string> = {
        apikey: secret,
        'Content-Type': 'application/json',
        'Content-Profile': 'api',
        'Accept-Profile': 'api',
      }
      if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`
      const response = await transport(
        `${new URL(env.SUPABASE_URL).origin}/rest/v1/rpc/create_complaint`,
        {
          method: 'POST',
          redirect: 'manual',
          headers,
          body: JSON.stringify({
            p_operation_id: body.operationId,
            p_receipt_secret: body.receiptSecret,
            p_input: input,
            p_client_hash: identifier,
          }),
          signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)]),
        },
      )
      let data: unknown
      try {
        data = await json(response, deadline, 65536)
      } catch {
        throw new ComplaintError(
          503,
          'unavailable',
          'No pudimos confirmar el registro. Conserva tus datos y vuelve a intentar.',
        )
      }
      if (!response.ok) {
        const code =
          data && typeof data === 'object' && 'code' in data ? data.code : ''
        if (code === 'PT409')
          throw new ComplaintError(
            409,
            'conflict',
            'Esta solicitud tiene otros datos. Conserva el formulario y revisa el registro.',
          )
        if (code === 'PT429')
          throw new ComplaintError(
            429,
            'rate-limit',
            'Espera antes de registrar otra solicitud.',
          )
        if (code === '22023')
          throw new ComplaintError(
            400,
            'validation',
            'Revisa los campos del formulario.',
          )
        throw new ComplaintError(
          503,
          'unavailable',
          'No pudimos confirmar el registro. Conserva tus datos y vuelve a intentar.',
        )
      }
      const receipt = parseComplaintReceipt(data)
      const answer = result(receipt, 201)
      if (allowedOrigin) {
        answer.headers.set('Access-Control-Allow-Origin', allowedOrigin)
        answer.headers.set('Vary', 'Origin')
      }
      return answer
    } catch (error) {
      const known = error instanceof ComplaintError
      const answer = result(
        {
          code: known ? error.code : 'unavailable',
          message: known
            ? error.message
            : 'No pudimos confirmar el registro. Conserva tus datos y vuelve a intentar.',
        },
        known ? error.status : 503,
      )
      if (allowedOrigin) {
        answer.headers.set('Access-Control-Allow-Origin', allowedOrigin)
        answer.headers.set('Vary', 'Origin')
      }
      return answer
    }
  }
}
