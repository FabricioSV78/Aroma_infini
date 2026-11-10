import { sendWebPush, validPushEndpoint } from './web-push'

/** Server bindings only. A private VAPID key is never returned to a browser. */
export interface AdminPushEnvironment {
  APP_ENVIRONMENT?: string
  PUSH_ENVIRONMENT?: string
  ADMIN_PUSH_ENABLED?: string
  MEDIA_ALLOWED_ORIGINS?: string
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_PUSH_SECRET_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  ADMIN_PUSH_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}

interface Subscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
interface PushPayload {
  id: string
  kind: 'new_order' | 'test'
  title: string
  body: string
  url: string
  tag: string
}
type Sender = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  vapid: { publicKey: string; privateKey: string; subject: string },
  payload: PushPayload,
) => Promise<{ status: number; retryAfter?: number }>
interface Dependencies {
  fetch?: typeof fetch
  send?: Sender
  requestSignal?: () => AbortSignal
}
interface Delivery {
  deliveryId: string
  leaseId: string
  eventId: string
  kind: 'new_order' | 'test'
  orderReference: string | null
  subscription: Subscription
}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const reference = /^[a-z0-9][a-z0-9-]{0,79}$/i
class PushError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
function invalid() {
  return new PushError(
    400,
    'validation',
    'Revisa los datos e inténtalo de nuevo.',
  )
}
function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',')
}
function controlCharacters(value: string) {
  return [...value].some(
    (letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127,
  )
}
async function readJson(
  input: Request | Response,
  maximum = 16384,
  signal: AbortSignal = AbortSignal.timeout(15000),
): Promise<unknown> {
  const declared = input.headers.get('Content-Length')
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maximum)
  )
    throw new PushError(413, 'size', 'La solicitud supera el tamaño permitido.')
  const reader = input.body?.getReader()
  if (!reader) throw invalid()
  const bodyReader = reader
  try {
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const next = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          function abort() {
            void bodyReader.cancel().catch(() => {})
            reject(
              new PushError(
                408,
                'timeout',
                'La solicitud tardó demasiado. Vuelve a intentarlo.',
              ),
            )
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
        throw new PushError(
          413,
          'size',
          'La solicitud supera el tamaño permitido.',
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
    ) as unknown
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
function base(env: AdminPushEnvironment) {
  if (
    !/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.SUPABASE_URL) ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    throw new PushError(
      503,
      'configuration',
      'Las notificaciones aún no están disponibles.',
    )
  return env.SUPABASE_URL.replace(/\/$/, '')
}
function environment(env: AdminPushEnvironment) {
  if (
    !['development', 'staging', 'production'].includes(
      env.PUSH_ENVIRONMENT ?? '',
    ) ||
    env.PUSH_ENVIRONMENT !== env.APP_ENVIRONMENT
  )
    throw new PushError(
      503,
      'configuration',
      'Las notificaciones aún no están disponibles.',
    )
  return env.PUSH_ENVIRONMENT!
}
function keyBytes(value: unknown, length: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    if (decoded.length !== length) return null
    const bytes = Uint8Array.from(decoded, (letter) => letter.charCodeAt(0))
    const canonical = btoa(String.fromCharCode(...bytes))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    return canonical === value ? bytes : null
  } catch {
    return null
  }
}
function configured(env: AdminPushEnvironment) {
  return (
    env.ADMIN_PUSH_ENABLED === 'true' &&
    Boolean(env.SUPABASE_PUSH_SECRET_KEY) &&
    Boolean(keyBytes(env.VAPID_PUBLIC_KEY, 65)) &&
    Boolean(keyBytes(env.VAPID_PRIVATE_KEY, 32)) &&
    /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s]+$/.test(
      env.VAPID_SUBJECT ?? '',
    )
  )
}

/** Provider destinations only, including an opaque path/query. Never follow redirects. */
export function allowedPushEndpoint(value: unknown): value is string {
  return typeof value === 'string' && validPushEndpoint(value)
}
async function subscription(value: unknown): Promise<Subscription> {
  const raw = object(value),
    keys = object(raw.keys)
  const p256dh = keyBytes(keys.p256dh, 65)
  if (
    !exactKeys(raw, ['endpoint', 'keys']) ||
    !exactKeys(keys, ['p256dh', 'auth']) ||
    !allowedPushEndpoint(raw.endpoint) ||
    !p256dh ||
    p256dh[0] !== 4 ||
    !keyBytes(keys.auth, 16)
  )
    throw invalid()
  try {
    await crypto.subtle.importKey(
      'raw',
      p256dh,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    )
  } catch {
    throw invalid()
  }
  return {
    endpoint: raw.endpoint,
    keys: { p256dh: keys.p256dh as string, auth: keys.auth as string },
  }
}
async function requestJson(
  transport: typeof fetch,
  url: string,
  headers: HeadersInit,
  body?: unknown,
) {
  const deadline = AbortSignal.timeout(15000)
  const result = await transport(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: deadline,
    redirect: 'manual',
  })
  const data =
    result.status === 204
      ? null
      : await readJson(result, 131072, deadline).catch(() => null)
  if (!result.ok) {
    const code = object(data).code
    console.warn(
      JSON.stringify({
        event: 'admin_push_backend_rejected',
        operation: new URL(url).pathname.split('/').at(-1),
        status: result.status,
        code:
          typeof code === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(code)
            ? code
            : 'unknown',
      }),
    )
    if (result.status === 401)
      throw new PushError(
        401,
        'session',
        'Tu sesión terminó. Inicia sesión de nuevo.',
      )
    if (result.status === 403 || code === '42501')
      throw new PushError(
        403,
        'permission',
        'Necesitas acceso administrativo y verificación en dos pasos.',
      )
    if (result.status === 429 || code === 'PT429')
      throw new PushError(
        429,
        'rate-limit',
        'Espera un momento antes de volver a intentarlo.',
      )
    if (result.status === 409 || code === 'PT409' || code === '23505')
      throw new PushError(
        409,
        'conflict',
        'Este dispositivo ya está asociado. Actualiza la página e inténtalo de nuevo.',
      )
    if (result.status === 400 || code === '22023') throw invalid()
    throw new PushError(
      503,
      'unavailable',
      'No pudimos completar la operación. Inténtalo de nuevo.',
    )
  }
  return data
}
function rpc(
  env: AdminPushEnvironment,
  transport: typeof fetch,
  name: string,
  body: unknown,
  token?: string,
) {
  const key = token
    ? env.SUPABASE_PUBLISHABLE_KEY
    : env.SUPABASE_PUSH_SECRET_KEY
  if (!key)
    throw new PushError(
      503,
      'configuration',
      'Las notificaciones aún no están disponibles.',
    )
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    'Content-Profile': 'api',
    'Accept-Profile': 'api',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  else if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  return requestJson(
    transport,
    `${base(env)}/rest/v1/rpc/${name}`,
    headers,
    body,
  )
}
async function actor(
  request: Request,
  env: AdminPushEnvironment,
  transport: typeof fetch,
) {
  const authorization = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization))
    throw new PushError(
      401,
      'session',
      'Inicia sesión para administrar las notificaciones.',
    )
  const token = authorization.slice(7)
  // Both read-only checks use the captured bearer. Wait for both bounded
  // requests before continuing, including failures, so no I/O outlives this
  // authorization step and no privileged RPC can run on a partial result.
  const [verified, authorized] = await Promise.allSettled([
    requestJson(transport, `${base(env)}/auth/v1/user`, {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
    }),
    rpc(env, transport, 'current_actor', {}, token),
  ])
  // Preserve the original Auth error (for example HTTP 401) if both fail.
  if (verified.status === 'rejected') throw verified.reason
  if (authorized.status === 'rejected') throw authorized.reason
  const user = object(verified.value)
  const current = object(authorized.value)
  if (
    typeof user.id !== 'string' ||
    !uuid.test(user.id) ||
    current.user_id !== user.id ||
    current.role !== 'admin' ||
    current.aal !== 'aal2'
  )
    throw new PushError(
      403,
      'permission',
      'Necesitas acceso administrativo y verificación en dos pasos.',
    )
  return { token, userId: user.id }
}
function device(value: unknown) {
  if (value === null) return null
  const raw = object(value)
  if (
    typeof raw.enabled !== 'boolean' ||
    typeof raw.label !== 'string' ||
    raw.label.length > 80
  )
    throw new PushError(
      503,
      'unavailable',
      'No pudimos consultar este dispositivo.',
    )
  return { enabled: raw.enabled, label: raw.label }
}
function notifications(value: unknown) {
  const raw = object(value)
  if (
    !Array.isArray(raw.items) ||
    raw.items.length > 50 ||
    !Number.isInteger(raw.unreadCount) ||
    Number(raw.unreadCount) < 0
  )
    throw new PushError(
      503,
      'unavailable',
      'No pudimos consultar las notificaciones.',
    )
  const items = raw.items.map((value) => {
    const item = object(value)
    if (
      typeof item.id !== 'string' ||
      !uuid.test(item.id) ||
      item.kind !== 'new_order' ||
      typeof item.orderReference !== 'string' ||
      !reference.test(item.orderReference) ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      typeof item.read !== 'boolean'
    )
      throw new PushError(
        503,
        'unavailable',
        'No pudimos consultar las notificaciones.',
      )
    return {
      id: item.id,
      kind: 'new_order',
      orderReference: item.orderReference,
      createdAt: item.createdAt,
      read: item.read,
    }
  })
  return { items, unreadCount: Number(raw.unreadCount) }
}

export function createAdminPushHandler(dependencies: Dependencies = {}) {
  const transport = dependencies.fetch ?? ((input, init) => fetch(input, init))
  return async (
    request: Request,
    env: AdminPushEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (
      !url.pathname.startsWith('/api/admin/push/') &&
      !url.pathname.startsWith('/api/admin/notifications')
    )
      return null
    let origin: string | null = null
    const allowed = new Set([
      url.origin,
      ...(env.MEDIA_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ])
    const respond = (result: Response) => {
      if (origin && allowed.has(origin)) {
        result.headers.set('Access-Control-Allow-Origin', origin)
        result.headers.set('Vary', 'Origin')
      }
      return result
    }
    try {
      origin = request.headers.get('Origin')
      if (origin && !allowed.has(origin))
        throw new PushError(403, 'origin', 'Esta solicitud no está permitida.')
      const getRoutes = ['/api/admin/push/status', '/api/admin/notifications']
      const postRoutes = [
        '/api/admin/push/subscriptions',
        '/api/admin/push/unsubscribe',
        '/api/admin/push/test',
        '/api/admin/notifications/read',
      ]
      if (
        !getRoutes.includes(url.pathname) &&
        !postRoutes.includes(url.pathname)
      )
        return respond(
          response(
            { code: 'missing', message: 'No encontramos esta operación.' },
            404,
          ),
        )
      if (request.method === 'OPTIONS')
        return respond(
          new Response(null, {
            status: 204,
            headers: {
              'Cache-Control': 'no-store',
              'Access-Control-Allow-Methods': getRoutes.includes(url.pathname)
                ? 'GET, OPTIONS'
                : 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Authorization, Content-Type',
              'Access-Control-Max-Age': '600',
            },
          }),
        )
      const expected = getRoutes.includes(url.pathname) ? 'GET' : 'POST'
      if (request.method !== expected)
        throw new PushError(
          405,
          'method',
          'Usa las opciones del panel administrativo.',
        )
      const pushEnvironment = environment(env)
      const current = await actor(request, env, transport)
      if (
        env.ADMIN_PUSH_RATE_LIMITER &&
        !(
          await env.ADMIN_PUSH_RATE_LIMITER.limit({
            key: `admin-push:${current.userId}`,
          })
        ).success
      )
        throw new PushError(
          429,
          'rate-limit',
          'Espera un momento antes de volver a intentarlo.',
        )
      if (url.pathname === '/api/admin/notifications') {
        if (
          [...url.searchParams.keys()].some((key) => key !== 'limit') ||
          url.searchParams.getAll('limit').length > 1
        )
          throw invalid()
        const limit = url.searchParams.get('limit') ?? '20'
        if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50)
          throw invalid()
        return respond(
          response(
            notifications(
              await rpc(
                env,
                transport,
                'admin_notifications',
                { p_limit: Number(limit) },
                current.token,
              ),
            ),
          ),
        )
      }
      if (url.pathname === '/api/admin/push/status') {
        const deviceId = url.searchParams.get('deviceId')
        if (
          !deviceId ||
          !uuid.test(deviceId) ||
          [...url.searchParams.keys()].some((key) => key !== 'deviceId') ||
          url.searchParams.getAll('deviceId').length !== 1
        )
          throw invalid()
        const status = object(
          await rpc(
            env,
            transport,
            'admin_push_device',
            { p_environment: pushEnvironment, p_device_id: deviceId },
            current.token,
          ),
        )
        return respond(
          response({
            configured: configured(env),
            publicKey: configured(env) ? env.VAPID_PUBLIC_KEY : null,
            currentDevice: device(status.device),
          }),
        )
      }
      if (url.search) throw invalid()
      if (
        !/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')
      )
        throw new PushError(
          415,
          'format',
          'Usa las opciones del panel administrativo.',
        )
      let parsed: unknown
      try {
        parsed = await readJson(
          request,
          16384,
          AbortSignal.any([
            request.signal,
            dependencies.requestSignal?.() ?? AbortSignal.timeout(10000),
          ]),
        )
      } catch (error) {
        if (error instanceof PushError) throw error
        throw invalid()
      }
      const body = object(parsed)
      if (url.pathname === '/api/admin/notifications/read') {
        if (!(
          (exactKeys(body, ['all']) && body.all === true) ||
          (exactKeys(body, ['ids']) &&
            Array.isArray(body.ids) &&
            body.ids.length > 0 &&
            body.ids.length <= 100 &&
            body.ids.every((id) => typeof id === 'string' && uuid.test(id)))
        ))
          throw invalid()
        const result = object(
          await rpc(
            env,
            transport,
            'admin_read_notifications',
            {
              p_ids: body.all ? null : [...new Set(body.ids as string[])],
              p_all: body.all === true,
            },
            current.token,
          ),
        )
        if (
          !Number.isInteger(result.updated) ||
          Number(result.updated) < 0 ||
          !Number.isInteger(result.unreadCount) ||
          Number(result.unreadCount) < 0
        )
          throw new PushError(
            503,
            'unavailable',
            'No pudimos actualizar las notificaciones.',
          )
        return respond(
          response({
            updated: result.updated,
            unreadCount: result.unreadCount,
          }),
        )
      }
      if (typeof body.deviceId !== 'string' || !uuid.test(body.deviceId))
        throw invalid()
      const common = {
        p_environment: pushEnvironment,
        p_device_id: body.deviceId,
      }
      if (url.pathname.endsWith('/subscriptions')) {
        if (!configured(env))
          throw new PushError(
            503,
            'configuration',
            'Las notificaciones push aún no están configuradas.',
          )
        if (
          !exactKeys(body, ['deviceId', 'deviceLabel', 'subscription']) ||
          typeof body.deviceLabel !== 'string' ||
          !body.deviceLabel.trim() ||
          body.deviceLabel.trim().length > 80 ||
          controlCharacters(body.deviceLabel)
        )
          throw invalid()
        const valid = await subscription(body.subscription)
        const result = object(
          await rpc(
            env,
            transport,
            'admin_push_subscribe',
            {
              ...common,
              p_device_label: body.deviceLabel.trim(),
              p_subscription: valid,
            },
            current.token,
          ),
        )
        return respond(response({ currentDevice: device(result.device) }, 201))
      }
      if (!exactKeys(body, ['deviceId'])) throw invalid()
      if (url.pathname.endsWith('/unsubscribe')) {
        const result = object(
          await rpc(
            env,
            transport,
            'admin_push_unsubscribe',
            common,
            current.token,
          ),
        )
        return respond(response({ currentDevice: device(result.device) }))
      }
      if (!configured(env))
        throw new PushError(
          503,
          'configuration',
          'Las notificaciones push aún no están configuradas.',
        )
      const queued = object(
        await rpc(env, transport, 'admin_push_test', common, current.token),
      )
      if (
        queued.queued !== true ||
        typeof queued.deliveryId !== 'string' ||
        !uuid.test(queued.deliveryId)
      )
        throw new PushError(
          503,
          'unavailable',
          'No pudimos programar la prueba.',
        )
      let accepted = false
      try {
        const sent = await dispatchAdminPush(
          env,
          dependencies,
          queued.deliveryId,
        )
        accepted = sent.accepted > 0
      } catch {
        /* The durable outbox remains eligible for its bounded cron retry. */
      }
      return respond(response({ queued: true, accepted }, 202))
    } catch (error) {
      if (!(error instanceof PushError))
        console.warn(
          JSON.stringify({
            event: 'admin_push_unexpected',
            name: error instanceof Error ? error.name : 'unknown',
          }),
        )
      const issue =
        error instanceof PushError
          ? error
          : new PushError(
              503,
              'unavailable',
              'No pudimos completar la operación. Inténtalo de nuevo.',
            )
      return respond(
        response({ code: issue.code, message: issue.message }, issue.status),
      )
    }
  }
}

async function parseDelivery(value: unknown): Promise<Delivery> {
  const raw = object(value)
  if (
    typeof raw.deliveryId !== 'string' ||
    !uuid.test(raw.deliveryId) ||
    typeof raw.leaseId !== 'string' ||
    !uuid.test(raw.leaseId) ||
    typeof raw.eventId !== 'string' ||
    !uuid.test(raw.eventId) ||
    !['test', 'new_order'].includes(String(raw.kind)) ||
    (raw.kind === 'new_order' &&
      (typeof raw.orderReference !== 'string' ||
        !reference.test(raw.orderReference))) ||
    (raw.kind === 'test' && raw.orderReference !== null)
  )
    throw new Error('Invalid push delivery claim')
  return {
    deliveryId: raw.deliveryId,
    leaseId: raw.leaseId,
    eventId: raw.eventId,
    kind: raw.kind as Delivery['kind'],
    orderReference: raw.orderReference as string | null,
    subscription: await subscription({
      endpoint: raw.endpoint,
      keys: { p256dh: raw.p256dh, auth: raw.auth },
    }),
  }
}
/** Only scheduled code and an authenticated, targeted test may call this dispatcher. */
export async function dispatchAdminPush(
  env: AdminPushEnvironment,
  dependencies: Dependencies = {},
  targetDeliveryId?: string,
) {
  environment(env)
  if (!configured(env)) return { claimed: 0, accepted: 0 }
  if (targetDeliveryId && !uuid.test(targetDeliveryId))
    throw new Error('Invalid test delivery identifier')
  const transport = dependencies.fetch ?? ((input, init) => fetch(input, init))
  const send: Sender =
    dependencies.send ??
    ((item, keys, payload) => sendWebPush(item, keys, payload, transport))
  const result = object(
    await rpc(env, transport, 'claim_admin_push', {
      p_environment: environment(env),
      p_limit: targetDeliveryId ? 1 : 10,
      p_delivery_id: targetDeliveryId ?? null,
    }),
  )
  if (
    !Array.isArray(result.deliveries) ||
    result.deliveries.length > (targetDeliveryId ? 1 : 10)
  )
    throw new Error('Invalid push claims')
  const seen = new Set<string>()
  let accepted = 0
  async function deliver(value: unknown) {
    const raw = object(value)
    if (
      typeof raw.deliveryId !== 'string' ||
      !uuid.test(raw.deliveryId) ||
      typeof raw.leaseId !== 'string' ||
      !uuid.test(raw.leaseId) ||
      seen.has(raw.deliveryId) ||
      (targetDeliveryId && raw.deliveryId !== targetDeliveryId)
    )
      throw new Error('Invalid push claim scope')
    seen.add(raw.deliveryId)
    let outcome: 'accepted' | 'retry' | 'expired' | 'failed'
    let retryAfter: number | null = null
    let httpStatus: number | null = null,
      errorCode: string | null = null
    try {
      const claim = await parseDelivery(value)
      const check = object(
        await rpc(env, transport, 'check_admin_push_delivery', {
          p_delivery_id: claim.deliveryId,
          p_lease_id: claim.leaseId,
        }),
      )
      if (check.allowed !== true) {
        outcome = 'failed'
        errorCode = 'not-eligible'
      } else {
        const test = claim.kind === 'test'
        const payload: PushPayload = {
          id: claim.eventId,
          kind: claim.kind,
          title: test ? 'Prueba de notificaciones' : 'Nuevo pedido',
          body: test
            ? 'Esta es una prueba de Aroma Infini Admin.'
            : 'Hay un pedido confirmado listo para revisar.',
          url: test
            ? '/admin/notificaciones'
            : `/admin/pedidos/${encodeURIComponent(claim.orderReference!)}`,
          tag: `ai-admin-${claim.eventId}`,
        }
        const sent = await send(
          { endpoint: claim.subscription.endpoint, ...claim.subscription.keys },
          {
            publicKey: env.VAPID_PUBLIC_KEY!,
            privateKey: env.VAPID_PRIVATE_KEY!,
            subject: env.VAPID_SUBJECT!,
          },
          payload,
        )
        if (
          !Number.isInteger(sent.status) ||
          sent.status < 100 ||
          sent.status > 599
        )
          throw new Error('Invalid provider status')
        httpStatus = sent.status
        if (Number.isInteger(sent.retryAfter) && sent.retryAfter! > 0)
          retryAfter = Math.min(sent.retryAfter!, 3600)
        if (sent.status >= 200 && sent.status < 300) {
          outcome = 'accepted'
          accepted++
        } else if (sent.status === 404 || sent.status === 410) {
          outcome = 'expired'
          errorCode = 'subscription-expired'
        } else if (
          [408, 425, 429].includes(sent.status) ||
          sent.status >= 500
        ) {
          outcome = 'retry'
          errorCode = 'provider-temporary'
        } else {
          outcome = 'failed'
          errorCode = 'provider-rejected'
        }
      }
    } catch (error) {
      // Input defects are terminal. Transport failures retain the leased outbox item.
      outcome =
        error instanceof PushError && error.code === 'validation'
          ? 'failed'
          : 'retry'
      errorCode = outcome === 'failed' ? 'invalid-subscription' : 'transport'
    }
    await rpc(env, transport, 'finish_admin_push', {
      p_delivery_id: raw.deliveryId,
      p_lease_id: raw.leaseId,
      p_result: outcome,
      p_http_status: httpStatus,
      p_error_code: errorCode,
      p_retry_after: retryAfter,
    })
  }
  // Two requests at a time and at most ten claims keep each scheduled run bounded.
  for (let offset = 0; offset < result.deliveries.length; offset += 2) {
    const outcomes = await Promise.allSettled(
      result.deliveries.slice(offset, offset + 2).map(deliver),
    )
    if (outcomes.some((item) => item.status === 'rejected'))
      console.warn(
        JSON.stringify({
          event: 'admin_push_finalize_pending',
          count: outcomes.filter((item) => item.status === 'rejected').length,
        }),
      )
  }
  return { claimed: result.deliveries.length, accepted }
}
