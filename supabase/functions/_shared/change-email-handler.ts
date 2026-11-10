import { boundedProviderJson } from './bounded-provider-json.ts'

export interface ChangeEmailConfig {
  supabaseUrl: string
  publishableKey: string
  serviceRoleKey: string
  allowedOrigins: readonly string[]
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>
type JsonObject = Record<string, unknown>

class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly safeMessage: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code)
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function unavailable() {
  return new ActionError(
    503,
    'service_unavailable',
    'No pudimos completar el cambio. Inténtalo de nuevo.',
  )
}

async function responseJson(
  response: Response,
  signal: AbortSignal,
): Promise<JsonObject | null> {
  try {
    return object(await boundedProviderJson(response, signal))
  } catch {
    return null
  }
}

async function boundedBody(
  request: Request,
  signal: AbortSignal,
): Promise<JsonObject> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new ActionError(
      415,
      'invalid_request',
      'Envía los datos del formulario en formato JSON.',
    )
  const reader = request.body?.getReader()
  if (!reader)
    throw new ActionError(
      400,
      'invalid_request',
      'Revisa los datos del formulario.',
    )
  const chunks: Uint8Array[] = []
  let length = 0
  function readChunk(): Promise<ReadableStreamReadResult<Uint8Array>> {
    return new Promise((resolve, reject) => {
      function abortRead() {
        // Cancel the pending read even when a client never finishes its body.
        // Do not await an untrusted stream's cancel callback.
        void reader!.cancel().catch(() => undefined)
        reject(
          new ActionError(
            408,
            'request_timeout',
            'El formulario tardó demasiado en enviarse. Inténtalo de nuevo.',
          ),
        )
      }
      if (signal.aborted) {
        abortRead()
        return
      }
      signal.addEventListener('abort', abortRead, { once: true })
      void reader!.read().then(
        (chunk) => {
          signal.removeEventListener('abort', abortRead)
          resolve(chunk)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', abortRead)
          reject(error)
        },
      )
    })
  }
  try {
    while (true) {
      const chunk = await readChunk()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > 8192) {
        void reader.cancel().catch(() => undefined)
        throw new ActionError(
          413,
          'invalid_request',
          'El formulario contiene demasiados datos.',
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: JsonObject | null = null
  try {
    value = object(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    )
  } catch {
    // Request bodies may contain credentials. Never include them in errors.
  }
  if (
    !value ||
    Object.keys(value).some(
      (key) => !['email', 'currentPassword'].includes(key),
    )
  )
    throw new ActionError(
      400,
      'invalid_request',
      'Revisa los datos del formulario.',
    )
  return value
}

interface VerifiedUser {
  id: string
  email: string
}

interface VerifiedActor {
  role: 'customer' | 'admin'
}

/** Self-service email change only. No arbitrary target UUID or Auth attributes. */
export function createChangeEmailHandler(
  config: ChangeEmailConfig,
  dependencies: { fetch?: Fetcher; requestSignal?: () => AbortSignal } = {},
) {
  const fetcher = dependencies.fetch ?? globalThis.fetch
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    const allowedOrigin =
      config.allowedOrigins.includes(origin) && origin !== ''
    const cors: Record<string, string> = allowedOrigin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers':
            'authorization, apikey, content-type, x-client-info',
          'Access-Control-Expose-Headers': 'Retry-After',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        }
      : { Vary: 'Origin' }
    function json(
      status: number,
      value: object,
      extraHeaders?: Record<string, string>,
    ) {
      return Response.json(value, {
        status,
        headers: { ...cors, 'Cache-Control': 'no-store', ...extraHeaders },
      })
    }
    if (!allowedOrigin)
      return json(403, {
        code: 'origin_not_allowed',
        message: 'Esta solicitud no está permitida.',
      })
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST')
      return json(
        405,
        {
          code: 'method_not_allowed',
          message: 'Esta acción requiere enviar el formulario.',
        },
        { Allow: 'POST, OPTIONS' },
      )

    let originalToken = ''
    let temporaryToken = ''
    let mutationStarted = false
    const deadline =
      dependencies.requestSignal?.() ?? AbortSignal.timeout(20000)
    let upstream: URL
    try {
      upstream = new URL(config.supabaseUrl)
      if (
        !['https:', 'http:'].includes(upstream.protocol) ||
        (upstream.protocol === 'http:' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname)) ||
        upstream.username ||
        upstream.password ||
        upstream.search ||
        upstream.hash ||
        !['', '/'].includes(upstream.pathname) ||
        !config.publishableKey ||
        !config.serviceRoleKey
      )
        throw unavailable()
    } catch {
      return json(503, {
        code: 'service_unavailable',
        message: 'No pudimos completar el cambio. Inténtalo de nuevo.',
      })
    }
    async function call(route: string, init: RequestInit, cleanup = false) {
      return fetcher(new URL(route, upstream), {
        ...init,
        redirect: 'manual',
        signal: cleanup
          ? AbortSignal.timeout(3000)
          : AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      })
    }
    const userHeaders = () => ({
      apikey: config.publishableKey,
      Authorization: `Bearer ${originalToken}`,
    })
    const adminHeaders = () => ({
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    })
    async function verifyUser(): Promise<VerifiedUser> {
      const response = await call('/auth/v1/user', { headers: userHeaders() })
      const value = await responseJson(response, deadline)
      if (response.status === 401 || response.status === 403)
        throw new ActionError(
          401,
          'session_required',
          'Inicia sesión de nuevo para cambiar tu correo.',
        )
      if (
        !response.ok ||
        !value ||
        typeof value.id !== 'string' ||
        !uuidPattern.test(value.id) ||
        typeof value.email !== 'string' ||
        !value.email
      )
        throw unavailable()
      return { id: value.id, email: value.email }
    }
    async function verifyActor(userId: string): Promise<VerifiedActor> {
      const response = await call('/rest/v1/rpc/current_actor', {
        method: 'POST',
        headers: {
          ...userHeaders(),
          'Content-Type': 'application/json',
          'Content-Profile': 'api',
          'Accept-Profile': 'api',
        },
        body: '{}',
      })
      const actor = await responseJson(response, deadline)
      if (
        !response.ok ||
        !actor ||
        actor.user_id !== userId ||
        !['customer', 'admin'].includes(String(actor.role)) ||
        !['aal1', 'aal2'].includes(String(actor.aal)) ||
        typeof actor.requires_mfa !== 'boolean'
      )
        throw new ActionError(
          403,
          'permission_denied',
          'No pudimos verificar el permiso para esta acción.',
        )
      if (
        actor.role === 'admin' &&
        (actor.aal !== 'aal2' || actor.requires_mfa)
      )
        throw new ActionError(
          403,
          'mfa_required',
          'Completa la verificación en dos pasos antes de cambiar tu correo.',
        )
      return { role: actor.role as VerifiedActor['role'] }
    }
    try {
      const bearer = request.headers
        .get('authorization')
        ?.match(/^Bearer ([^\s]+)$/i)?.[1]
      if (!bearer || bearer.length > 8192)
        throw new ActionError(
          401,
          'session_required',
          'Inicia sesión de nuevo para cambiar tu correo.',
        )
      originalToken = bearer
      const body = await boundedBody(request, deadline)
      const email =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email || email.length > 254 || !emailPattern.test(email))
        throw new ActionError(
          400,
          'invalid_email',
          'Escribe un correo electrónico válido.',
        )
      if (
        typeof body.currentPassword !== 'string' ||
        !body.currentPassword ||
        body.currentPassword.length > 1024
      )
        throw new ActionError(
          400,
          'invalid_current_password',
          'Escribe tu contraseña actual.',
        )
      const user = await verifyUser()
      const actor = await verifyActor(user.id)
      if (email === user.email.toLowerCase())
        throw new ActionError(
          400,
          'email_unchanged',
          'Escribe un correo diferente al actual.',
        )

      // Only the server credential can consume this atomic, per-user limit.
      const rateResponse = await call(
        '/rest/v1/rpc/consume_email_change_attempt',
        {
          method: 'POST',
          headers: {
            ...adminHeaders(),
            'Content-Profile': 'api',
            'Accept-Profile': 'api',
          },
          body: JSON.stringify({ p_user_id: user.id }),
        },
      )
      const rate = await responseJson(rateResponse, deadline)
      if (!rateResponse.ok || !rate || typeof rate.allowed !== 'boolean')
        throw unavailable()
      if (!rate.allowed) {
        const seconds =
          typeof rate.retry_after_seconds === 'number' &&
          Number.isFinite(rate.retry_after_seconds)
            ? Math.min(900, Math.max(1, Math.ceil(rate.retry_after_seconds)))
            : 900
        throw new ActionError(
          429,
          'rate_limit',
          'Has realizado varios intentos. Espera un momento antes de volver a intentar.',
          seconds,
        )
      }

      // Use a separate password grant. It must never replace the caller's
      // browser session, original bearer, assurance level or target identity.
      const loginResponse = await call('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          password: body.currentPassword,
        }),
      })
      const login = await responseJson(loginResponse, deadline)
      if (!loginResponse.ok) {
        if (loginResponse.status === 429)
          throw new ActionError(
            429,
            'rate_limit',
            'Has realizado varios intentos. Espera un momento antes de volver a intentar.',
            60,
          )
        if (
          login?.code === 'invalid_credentials' ||
          login?.error_code === 'invalid_credentials'
        )
          throw new ActionError(
            400,
            'invalid_current_password',
            'La contraseña actual no es correcta.',
          )
        throw unavailable()
      }
      if (typeof login?.access_token === 'string')
        temporaryToken = login.access_token
      const loginUser = object(login?.user)
      if (
        !temporaryToken ||
        loginUser?.id !== user.id ||
        typeof loginUser.email !== 'string' ||
        loginUser.email.toLowerCase() !== user.email.toLowerCase()
      )
        throw new ActionError(
          403,
          'permission_denied',
          'No pudimos verificar el permiso para esta acción.',
        )

      // A role revocation, email change or identity switch during password
      // verification must not redirect this sensitive write to another user.
      const current = await verifyUser()
      const currentActor = await verifyActor(user.id)
      if (
        current.id !== user.id ||
        current.email.toLowerCase() !== user.email.toLowerCase() ||
        currentActor.role !== actor.role
      )
        throw new ActionError(
          409,
          'account_changed',
          'Tu cuenta cambió durante la solicitud. Actualiza tus datos antes de volver a intentar.',
        )

      mutationStarted = true
      const updateResponse = await call(`/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ email, email_confirm: true }),
      })
      const updated = await responseJson(updateResponse, deadline)
      if (!updateResponse.ok) {
        // A server error may occur after committing Auth changes (for example,
        // while sending an optional security notification). Never claim rollback.
        if (updateResponse.status >= 500)
          throw new ActionError(
            503,
            'change_status_unknown',
            'Comprueba el correo de tu cuenta antes de intentarlo de nuevo.',
          )
        mutationStarted = false
        if (
          updateResponse.status === 409 ||
          [
            'email_exists',
            'email_address_exists',
            'user_already_exists',
          ].includes(String(updated?.code ?? updated?.error_code))
        )
          throw new ActionError(
            409,
            'email_unavailable',
            'No se puede utilizar ese correo. Prueba con otro.',
          )
        throw unavailable()
      }
      const changed = object(updated?.user) ?? updated
      if (
        changed?.id !== user.id ||
        typeof changed.email !== 'string' ||
        changed.email.toLowerCase() !== email
      )
        throw new ActionError(
          503,
          'change_status_unknown',
          'Comprueba el correo de tu cuenta antes de intentarlo de nuevo.',
        )
      return json(200, { success: true, email: changed.email })
    } catch (error) {
      const safe =
        error instanceof ActionError
          ? error
          : mutationStarted
            ? new ActionError(
                503,
                'change_status_unknown',
                'Comprueba el correo de tu cuenta antes de intentarlo de nuevo.',
              )
            : unavailable()
      return json(
        safe.status,
        {
          code: safe.code,
          message: safe.safeMessage,
          ...(safe.retryAfterSeconds
            ? { retryAfterSeconds: safe.retryAfterSeconds }
            : {}),
        },
        safe.retryAfterSeconds
          ? { 'Retry-After': String(safe.retryAfterSeconds) }
          : undefined,
      )
    } finally {
      if (temporaryToken && temporaryToken !== originalToken) {
        // Explicit local scope is crucial: global logout would revoke the
        // original browser session and other devices belonging to this user.
        try {
          await call(
            '/auth/v1/logout?scope=local',
            {
              method: 'POST',
              headers: {
                apikey: config.publishableKey,
                Authorization: `Bearer ${temporaryToken}`,
              },
            },
            true,
          )
        } catch {
          // The discarded grant is never returned or stored outside this request.
        }
      }
    }
  }
}
