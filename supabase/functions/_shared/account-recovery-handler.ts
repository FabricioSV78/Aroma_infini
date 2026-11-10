import { boundedProviderJson } from './bounded-provider-json.ts'

export interface AccountRecoveryConfig {
  supabaseUrl: string
  publishableKey: string
  serviceRoleKey: string
  allowedOrigins: readonly string[]
  rateLimitSecret: string
}

type JsonObject = Record<string, unknown>
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

class RecoveryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly safeMessage: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code)
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const invalidRecovery = () =>
  new RecoveryError(
    400,
    'invalid_recovery',
    'No pudimos verificar el correo y el código de recuperación. Revisa los datos o solicita ayuda.',
  )
const unavailable = () =>
  new RecoveryError(
    503,
    'service_unavailable',
    'No pudimos completar la solicitud. Inténtalo de nuevo.',
  )
const sessionRequired = () =>
  new RecoveryError(
    401,
    'session_required',
    'Inicia sesión de nuevo para gestionar tu código de recuperación.',
  )
const unsupported = () =>
  new RecoveryError(
    403,
    'recovery_not_supported',
    'Esta cuenta debe recuperarse mediante el administrador autorizado de Supabase.',
  )
const unknownOutcome = () =>
  new RecoveryError(
    503,
    'recovery_status_unknown',
    'No pudimos confirmar el resultado. Prueba a iniciar sesión con tu nueva contraseña o solicita ayuda; no repitas el código.',
  )

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}
async function json(
  response: Response,
  signal: AbortSignal,
): Promise<JsonObject | null> {
  try {
    return object(await boundedProviderJson(response, signal))
  } catch {
    return null
  }
}
function providerCode(value: JsonObject | null) {
  // Raw Auth REST responses can include numeric `code` plus `error_code`.
  // Unlike the browser SDK, fetch does not normalize the legacy representation.
  return typeof value?.error_code === 'string'
    ? value.error_code
    : typeof value?.code === 'string'
      ? value.code
      : ''
}
function canonicalCode(value: unknown) {
  if (typeof value !== 'string' || value.length > 160) return null
  const compact = value.replace(/[\s-]/g, '').toUpperCase()
  return /^AI[0-9A-F]{64}$/.test(compact) ? `AI-${compact.slice(2)}` : null
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
function newCode() {
  return `AI-${[...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}
async function limitedBody(
  request: Request,
  signal: AbortSignal,
): Promise<JsonObject> {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw new RecoveryError(
      415,
      'invalid_request',
      'Envía el formulario en formato JSON.',
    )
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    throw new RecoveryError(
      413,
      'invalid_request',
      'El formulario contiene demasiados datos.',
    )
  const reader = request.body?.getReader()
  if (!reader)
    throw new RecoveryError(
      400,
      'invalid_request',
      'Revisa los datos del formulario.',
    )
  const bodyReader = reader
  let length = 0
  const chunks: Uint8Array[] = []
  const read = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      function abort() {
        void bodyReader.cancel().catch(() => undefined)
        reject(unavailable())
      }
      if (signal.aborted) return abort()
      signal.addEventListener('abort', abort, { once: true })
      void bodyReader.read().then(
        (value) => {
          signal.removeEventListener('abort', abort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      )
    })
  try {
    while (true) {
      const item = await read()
      if (item.done) break
      length += item.value.length
      if (length > 8192) {
        void reader.cancel().catch(() => undefined)
        throw new RecoveryError(
          413,
          'invalid_request',
          'El formulario contiene demasiados datos.',
        )
      }
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let position = 0
  for (const chunk of chunks) {
    bytes.set(chunk, position)
    position += chunk.length
  }
  try {
    const value = object(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    )
    if (value) return value
  } catch {
    /* A request body can contain secrets; never serialize it. */
  }
  throw new RecoveryError(
    400,
    'invalid_request',
    'Revisa los datos del formulario.',
  )
}

/** Saved-code recovery only. No SMTP, external delivery, phone proof or Auth lookup API. */
export function createAccountRecoveryHandler(
  config: AccountRecoveryConfig,
  dependencies: {
    fetch?: Fetcher
    requestSignal?: () => AbortSignal
    minimumFailureDelayMs?: number
  } = {},
) {
  const fetcher = dependencies.fetch ?? globalThis.fetch
  return async (request: Request): Promise<Response> => {
    const started = Date.now()
    const origin = request.headers.get('origin') ?? ''
    const allowed = config.allowedOrigins.includes(origin) && Boolean(origin)
    const cors: Record<string, string> = allowed
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
    const respond = (
      status: number,
      value: object,
      extra: Record<string, string> = {},
    ) =>
      Response.json(value, {
        status,
        headers: {
          ...cors,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...extra,
        },
      })
    if (!allowed)
      return respond(403, {
        code: 'origin_not_allowed',
        message: 'Esta solicitud no está permitida.',
      })
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST')
      return respond(
        405,
        {
          code: 'method_not_allowed',
          message: 'Esta acción requiere enviar el formulario.',
        },
        { Allow: 'POST, OPTIONS' },
      )
    const deadline =
      dependencies.requestSignal?.() ?? AbortSignal.timeout(25000)
    let base: URL
    try {
      base = new URL(config.supabaseUrl)
      if (
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        base.pathname !== '/' ||
        !config.publishableKey ||
        !config.serviceRoleKey ||
        config.rateLimitSecret.length < 32 ||
        (base.protocol !== 'https:' &&
          !(
            base.protocol === 'http:' &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
          ))
      )
        throw unavailable()
    } catch {
      return respond(503, {
        code: 'service_unavailable',
        message: 'No pudimos completar la solicitud. Inténtalo de nuevo.',
      })
    }
    const adminHeaders = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    }
    let token = ''
    let temporaryToken = ''
    let action = ''
    let mutationStarted = false
    let recoveryClaim: { userId: string; claimId: string } | null = null
    const call = (route: string, init: RequestInit, cleanup = false) => {
      const headers = new Headers(init.headers)
      if (route.startsWith('/auth/'))
        headers.set('x-supabase-api-version', '2024-01-01')
      return fetcher(new URL(route, base), {
        ...init,
        headers,
        redirect: 'manual',
        signal: cleanup
          ? AbortSignal.timeout(3000)
          : AbortSignal.any([deadline, AbortSignal.timeout(6000)]),
      })
    }
    async function rpc(name: string, body: object, cleanup = false) {
      const response = await call(
        `/rest/v1/rpc/${name}`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Content-Profile': 'api',
            'Accept-Profile': 'api',
          },
          body: JSON.stringify(body),
        },
        cleanup,
      )
      if (!response.ok) throw unavailable()
      try {
        return await boundedProviderJson(response, deadline)
      } catch {
        throw unavailable()
      }
    }
    async function limit(label: string) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(config.rateLimitSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(label),
      )
      const bucket = [...new Uint8Array(signature)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      const result = object(
        await rpc('account_recovery_limit', { p_bucket_hash: bucket }),
      )
      if (!result || typeof result.allowed !== 'boolean') throw unavailable()
      if (!result.allowed) {
        const seconds =
          typeof result.retry_after_seconds === 'number'
            ? Math.min(900, Math.max(1, Math.ceil(result.retry_after_seconds)))
            : 900
        throw new RecoveryError(
          429,
          'rate_limit',
          'Has realizado varios intentos. Espera unos minutos antes de continuar.',
          Number.isFinite(seconds) ? seconds : 900,
        )
      }
    }
    async function verifiedCustomer() {
      if (!token) throw sessionRequired()
      const response = await call('/auth/v1/user', {
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
        },
      })
      if (response.status === 401 || response.status === 403)
        throw sessionRequired()
      const user = await json(response, deadline)
      if (
        !response.ok ||
        !user ||
        typeof user.id !== 'string' ||
        !uuid.test(user.id) ||
        typeof user.email !== 'string' ||
        !emailPattern.test(user.email)
      )
        throw unavailable()
      const actorResponse = await call('/rest/v1/rpc/current_actor', {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'api',
          'Accept-Profile': 'api',
        },
        body: '{}',
      })
      const actor = await json(actorResponse, deadline)
      if (
        !actorResponse.ok ||
        !actor ||
        actor.user_id !== user.id ||
        !['customer', 'admin'].includes(String(actor.role)) ||
        !['aal1', 'aal2'].includes(String(actor.aal)) ||
        typeof actor.requires_mfa !== 'boolean'
      )
        throw sessionRequired()
      if (actor.role === 'admin' || actor.requires_mfa) throw unsupported()
      return { id: user.id, email: user.email }
    }
    try {
      const body = await limitedBody(request, deadline)
      action = typeof body.action === 'string' ? body.action : ''
      const keys =
        action === 'status'
          ? ['action']
          : action === 'issue'
            ? ['action', 'currentPassword']
            : action === 'recover'
              ? ['action', 'email', 'recoveryCode', 'newPassword']
              : []
      if (!keys.length || Object.keys(body).some((key) => !keys.includes(key)))
        throw new RecoveryError(
          400,
          'invalid_request',
          'Revisa los datos del formulario.',
        )
      token =
        request.headers
          .get('authorization')
          ?.match(/^Bearer ([^\s]{1,8192})$/i)?.[1] ?? ''
      if (action === 'status' || action === 'issue') {
        const user = await verifiedCustomer()
        if (action === 'status') {
          const status = object(
            await rpc('account_recovery_status', { p_user_id: user.id }),
          )
          if (
            !status ||
            typeof status.hasCode !== 'boolean' ||
            (status.createdAt !== null && typeof status.createdAt !== 'string')
          )
            throw unavailable()
          return respond(200, status)
        }
        if (
          typeof body.currentPassword !== 'string' ||
          !body.currentPassword ||
          body.currentPassword.length > 1024
        )
          throw new RecoveryError(
            400,
            'invalid_current_password',
            'Escribe tu contraseña actual.',
          )
        await limit(`issue:${user.id}`)
        const proofResponse = await call('/auth/v1/token?grant_type=password', {
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
        const proof = await json(proofResponse, deadline)
        if (proofResponse.status === 429)
          throw new RecoveryError(
            429,
            'rate_limit',
            'Has realizado varios intentos. Espera unos minutos antes de continuar.',
            60,
          )
        if (!proofResponse.ok) {
          if (['invalid_credentials'].includes(providerCode(proof)))
            throw new RecoveryError(
              400,
              'invalid_current_password',
              'La contraseña actual no es correcta.',
            )
          throw unavailable()
        }
        if (typeof proof?.access_token === 'string')
          temporaryToken = proof.access_token
        const proofUser = object(proof?.user)
        if (
          !temporaryToken ||
          proofUser?.id !== user.id ||
          typeof proofUser.email !== 'string' ||
          proofUser.email.toLowerCase() !== user.email.toLowerCase()
        )
          throw sessionRequired()
        const current = await verifiedCustomer()
        if (
          current.id !== user.id ||
          current.email.toLowerCase() !== user.email.toLowerCase()
        )
          throw new RecoveryError(
            409,
            'account_changed',
            'Tu cuenta cambió. Actualiza tus datos antes de continuar.',
          )
        const recoveryCode = newCode()
        const saved = object(
          await rpc('save_account_recovery_code', {
            p_user_id: user.id,
            p_code_hash: await hash(recoveryCode),
            p_claim_id: null,
          }),
        )
        if (!saved || typeof saved.createdAt !== 'string') throw unavailable()
        return respond(200, { recoveryCode, createdAt: saved.createdAt })
      }

      const email =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const recoveryCode = canonicalCode(body.recoveryCode)
      if (!emailPattern.test(email) || email.length > 254 || !recoveryCode)
        throw invalidRecovery()
      if (
        typeof body.newPassword !== 'string' ||
        body.newPassword.length < 12 ||
        body.newPassword.length > 1024 ||
        !/[a-z]/.test(body.newPassword) ||
        !/[A-Z]/.test(body.newPassword) ||
        !/[0-9]/.test(body.newPassword) ||
        !/[\W_]/.test(body.newPassword)
      )
        throw new RecoveryError(
          400,
          'invalid_password',
          'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.',
        )
      await limit(`recover:${email}`)
      const claimId = crypto.randomUUID()
      const claim = object(
        await rpc('claim_account_recovery', {
          p_email: email,
          p_code_hash: await hash(recoveryCode),
          p_claim_id: claimId,
        }),
      )
      if (!claim) throw invalidRecovery()
      if (typeof claim.userId !== 'string' || !uuid.test(claim.userId))
        throw unavailable()
      // The SQL claim excludes administrative accounts and atomically consumes
      // the saved code. No claimed UUID comes from the HTTP request.
      const userId = claim.userId
      recoveryClaim = { userId, claimId }
      const accountResponse = await call(`/auth/v1/admin/users/${userId}`, {
        headers: adminHeaders,
      })
      const accountBody = await json(accountResponse, deadline)
      const account = object(accountBody?.user) ?? accountBody
      if (
        !accountResponse.ok ||
        account?.id !== userId ||
        typeof account.email !== 'string' ||
        account.email.toLowerCase() !== email
      )
        throw invalidRecovery()
      // Re-check the protected membership after claiming: an operator may have
      // promoted this account while the anonymous request was in flight.
      if (!object(await rpc('account_recovery_status', { p_user_id: userId })))
        throw invalidRecovery()
      // A password update via Auth Admin API calls UpdatePassword(tx,nil), which
      // revokes all refresh sessions. No new login/session is created here.
      mutationStarted = true
      const response = await call(`/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ password: body.newPassword }),
      })
      const updatedBody = await json(response, deadline)
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          mutationStarted = false
          await rpc('release_account_recovery_claim', {
            p_user_id: userId,
            p_claim_id: claimId,
          })
          recoveryClaim = null
          if (
            ['weak_password', 'same_password'].includes(
              providerCode(updatedBody),
            )
          )
            throw new RecoveryError(
              400,
              'invalid_password',
              'Elige una contraseña diferente y segura, con al menos 12 caracteres.',
            )
          throw unavailable()
        }
        throw unknownOutcome()
      }
      const updated = object(updatedBody?.user) ?? updatedBody
      if (updated?.id !== userId) throw unknownOutcome()
      const replacement = newCode()
      const saved = object(
        await rpc('save_account_recovery_code', {
          p_user_id: userId,
          p_code_hash: await hash(replacement),
          p_claim_id: claimId,
        }),
      )
      if (!saved || typeof saved.createdAt !== 'string') throw unknownOutcome()
      return respond(200, { success: true, recoveryCode: replacement })
    } catch (error) {
      if (recoveryClaim && !mutationStarted) {
        // No password mutation was issued (or Auth definitively rejected it).
        // A fresh bounded cleanup signal can release this exact nonce even if
        // the original read deadline expired. It cannot restore a replaced code.
        try {
          await rpc(
            'release_account_recovery_claim',
            {
              p_user_id: recoveryClaim.userId,
              p_claim_id: recoveryClaim.claimId,
            },
            true,
          )
        } catch {
          /* Fail closed if the matching claim cannot be restored. */
        }
      }
      const safe =
        error instanceof RecoveryError
          ? error
          : mutationStarted
            ? unknownOutcome()
            : unavailable()
      // Unknown address and wrong/used codes share the same error and minimum
      // response duration. This is a floor, not a constant-time network promise.
      if (action === 'recover' && safe.code === 'invalid_recovery') {
        const remaining =
          (dependencies.minimumFailureDelayMs ?? 350) - (Date.now() - started)
        if (remaining > 0)
          await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      return respond(
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
          : {},
      )
    } finally {
      if (temporaryToken && temporaryToken !== token) {
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
          /* The short-lived proof session is never returned to the browser. */
        }
      }
    }
  }
}
