/** Remembering an administrator never changes the Supabase JWT assurance. */
export interface AdminDeviceEnvironment {
  APP_ENVIRONMENT?: string
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  ADMIN_AUTH_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}

interface Dependencies {
  fetch?: typeof fetch
  now?: () => number
}

const prefix = '/api/admin/auth/'
const cookieName = '__Host-aroma-admin-device'
const duration = 60 * 24 * 60 * 60
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const hexToken = /^[a-f0-9]{64}$/

class DeviceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function unavailable() {
  return new DeviceError(
    503,
    'unavailable',
    'No pudimos verificar los dispositivos. Vuelve a intentarlo.',
  )
}

function invalid() {
  return new DeviceError(
    400,
    'validation',
    'Revisa la solicitud e inténtalo de nuevo.',
  )
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

/** Both client and provider bodies are bounded, including undeclared streams. */
async function readJson(
  input: Request | Response,
  maximum: number,
  signal: AbortSignal,
) {
  const declared = input.headers.get('Content-Length')
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maximum)
  )
    throw invalid()
  const reader = input.body?.getReader()
  if (!reader) throw invalid()
  const bodyReader = reader
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const next = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          function abort() {
            void bodyReader.cancel().catch(() => {})
            reject(unavailable())
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
      size += next.value.byteLength
      if (size > maximum) throw invalid()
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
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

function base(env: AdminDeviceEnvironment) {
  if (
    !['development', 'staging', 'production'].includes(
      env.APP_ENVIRONMENT ?? '',
    ) ||
    !/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.SUPABASE_URL) ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    throw unavailable()
  return env.SUPABASE_URL.replace(/\/$/, '')
}

function trustedActor(current: Record<string, unknown>) {
  return (
    current.aal === 'aal2' ||
    (current.aal === 'aal1' &&
      current.trusted_device === true &&
      current.requires_mfa === false)
  )
}

function cookie(request: Request) {
  const values = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.split('=', 1)[0] === cookieName)
  if (values.length !== 1) return null
  const value = values[0].slice(cookieName.length + 1)
  return hexToken.test(value) ? value : null
}

function clearCookie(result: Response) {
  result.headers.set(
    'Set-Cookie',
    `${cookieName}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Strict`,
  )
  return result
}

/** Store a short coarse label, never the full identifying User-Agent string. */
function label(request: Request) {
  const agent = (request.headers.get('User-Agent') ?? '').slice(0, 1024)
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /(?:Chrome|CriOS)\//.test(agent)
      ? 'Chrome'
      : /(?:Firefox|FxiOS)\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Navegador'
  const system = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : ''
  return system ? `${browser} · ${system}` : browser
}

export function createAdminDeviceHandler(dependencies: Dependencies = {}) {
  const transport = dependencies.fetch ?? ((input, init) => fetch(input, init))
  const now = dependencies.now ?? Date.now

  async function requestJson(
    env: AdminDeviceEnvironment,
    path: string,
    token: string,
    body?: unknown,
  ) {
    const signal = AbortSignal.timeout(15000)
    const result = await transport(`${base(env)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'api',
        'Accept-Profile': 'api',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      redirect: 'manual',
    })
    let data: unknown
    try {
      data = await readJson(result, 65536, signal)
    } catch {
      throw unavailable()
    }
    if (!result.ok) {
      const code = object(data).code
      if (result.status === 401)
        throw new DeviceError(
          401,
          'session',
          'Tu sesión terminó. Inicia sesión de nuevo.',
        )
      if (result.status === 403 || code === '42501')
        throw new DeviceError(
          403,
          'permission',
          'Completa la verificación administrativa para continuar.',
        )
      if (result.status === 429 || code === 'PT429')
        throw new DeviceError(
          429,
          'rate-limit',
          'Espera un momento antes de volver a intentarlo.',
        )
      if (result.status === 400 || code === '22023') throw invalid()
      throw unavailable()
    }
    return data
  }

  function rpc(
    env: AdminDeviceEnvironment,
    name: string,
    token: string,
    body: unknown = {},
  ) {
    return requestJson(env, `/rest/v1/rpc/${name}`, token, body)
  }

  async function actor(request: Request, env: AdminDeviceEnvironment) {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization))
      throw new DeviceError(
        401,
        'session',
        'Inicia sesión para verificar este dispositivo.',
      )
    const token = authorization.slice(7)
    const [verified, authorized] = await Promise.allSettled([
      requestJson(env, '/auth/v1/user', token),
      rpc(env, 'current_actor', token),
    ])
    if (verified.status === 'rejected') throw verified.reason
    if (authorized.status === 'rejected') throw authorized.reason
    const user = object(verified.value),
      current = object(authorized.value)
    if (
      typeof user.id !== 'string' ||
      !uuid.test(user.id) ||
      current.user_id !== user.id ||
      current.role !== 'admin' ||
      !['aal1', 'aal2'].includes(String(current.aal))
    )
      throw new DeviceError(
        403,
        'permission',
        'Necesitas una cuenta administrativa activa.',
      )
    return { token, userId: user.id, current }
  }

  async function limit(env: AdminDeviceEnvironment, key: string) {
    if (
      env.ADMIN_AUTH_RATE_LIMITER &&
      !(await env.ADMIN_AUTH_RATE_LIMITER.limit({ key })).success
    )
      throw new DeviceError(
        429,
        'rate-limit',
        'Espera un momento antes de volver a intentarlo.',
      )
  }

  function expiry(value: unknown) {
    const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= now() ||
      timestamp > now() + (duration + 60) * 1000
    )
      throw unavailable()
    return value as string
  }

  return async (
    request: Request,
    env: AdminDeviceEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(prefix)) return null
    try {
      const register = url.pathname === `${prefix}device/register`
      const resume = url.pathname === `${prefix}device/resume`
      const list = url.pathname === `${prefix}devices`
      const revokeId = url.pathname.startsWith(`${prefix}devices/`)
        ? url.pathname.slice(`${prefix}devices/`.length)
        : ''
      if (!register && !resume && !list && !uuid.test(revokeId))
        return response(
          { code: 'missing', message: 'No encontramos esta operación.' },
          404,
        )
      const expected = list ? 'GET' : register || resume ? 'POST' : 'DELETE'
      const origin = request.headers.get('Origin')
      const sameOrigin =
        origin === url.origin ||
        (expected === 'GET' &&
          origin === null &&
          request.headers.get('Sec-Fetch-Site') === 'same-origin')
      if (
        url.protocol !== 'https:' ||
        !sameOrigin ||
        request.headers.get('X-Aroma-Admin-Device') !== '1'
      )
        throw new DeviceError(
          403,
          'origin',
          'Abre el panel desde su dirección segura para verificar este dispositivo.',
        )
      if (request.method !== expected)
        return response(
          {
            code: 'method',
            message: 'Usa las opciones del panel administrativo.',
          },
          405,
        )
      if (url.search) throw invalid()
      base(env)
      await limit(
        env,
        `admin-auth:ip:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`,
      )
      if (register || resume) {
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            request.headers.get('Content-Type') ?? '',
          )
        )
          throw invalid()
        const body = await readJson(
          request,
          256,
          AbortSignal.timeout(15000),
        ).catch(() => {
          throw invalid()
        })
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).length
        )
          throw invalid()
      } else if (request.body !== null) throw invalid()
      const current = await actor(request, env)
      await limit(env, `admin-auth:user:${current.userId}`)
      if (register) {
        // A remembered AAL1 grant can never create another trusted device.
        if (
          current.current.aal !== 'aal2' ||
          current.current.requires_mfa !== false
        )
          throw new DeviceError(
            403,
            'permission',
            'Confirma el código de tu aplicación para recordar este dispositivo.',
          )
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        const token = [...bytes]
          .map((part) => part.toString(16).padStart(2, '0'))
          .join('')
        const hash = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(token),
            ),
          ),
        ]
          .map((part) => part.toString(16).padStart(2, '0'))
          .join('')
        const saved = object(
          await rpc(env, 'admin_device_register', current.token, {
            p_token_hash: hash,
            p_label: label(request),
          }),
        )
        if (typeof saved.id !== 'string' || !uuid.test(saved.id))
          throw unavailable()
        const expiresAt = expiry(saved.expires_at)
        const result = response({ id: saved.id, expires_at: expiresAt })
        result.headers.set(
          'Set-Cookie',
          `${cookieName}=${token}; Max-Age=${duration}; Expires=${new Date(expiresAt).toUTCString()}; Path=/; Secure; HttpOnly; SameSite=Strict`,
        )
        return result
      }
      if (resume) {
        const token = cookie(request)
        if (!token)
          return clearCookie(response({ trusted: false, expires_at: null }))
        const saved = object(
          await rpc(env, 'admin_device_resume', current.token, {
            p_token: token,
          }),
        )
        if (saved.trusted === false && saved.expires_at === null)
          return clearCookie(response({ trusted: false, expires_at: null }))
        if (saved.trusted !== true) throw unavailable()
        return response({ trusted: true, expires_at: expiry(saved.expires_at) })
      }
      if (!trustedActor(current.current))
        throw new DeviceError(
          403,
          'permission',
          'Completa la verificación administrativa para continuar.',
        )
      if (list) {
        const result = object(
          await rpc(env, 'admin_device_list', current.token),
        )
        if (!Array.isArray(result.items) || result.items.length > 100)
          throw unavailable()
        const items = result.items.map((value) => {
          const item = object(value)
          if (
            typeof item.id !== 'string' ||
            !uuid.test(item.id) ||
            typeof item.label !== 'string' ||
            item.label.length > 80 ||
            typeof item.created_at !== 'string' ||
            !Number.isFinite(Date.parse(item.created_at)) ||
            typeof item.expires_at !== 'string' ||
            !Number.isFinite(Date.parse(item.expires_at)) ||
            !(
              item.last_used_at === null ||
              (typeof item.last_used_at === 'string' &&
                Number.isFinite(Date.parse(item.last_used_at)))
            ) ||
            typeof item.current !== 'boolean'
          )
            throw unavailable()
          return {
            id: item.id,
            label: item.label,
            created_at: item.created_at,
            expires_at: item.expires_at,
            last_used_at: item.last_used_at,
            current: item.current,
          }
        })
        return response({ items })
      }
      const result = object(
        await rpc(env, 'admin_device_revoke', current.token, {
          p_device_id: revokeId,
        }),
      )
      if (
        typeof result.revoked !== 'boolean' ||
        typeof result.current !== 'boolean'
      )
        throw unavailable()
      const revoked = response({ revoked: result.revoked })
      return result.revoked && result.current ? clearCookie(revoked) : revoked
    } catch (error) {
      const issue = error instanceof DeviceError ? error : unavailable()
      return response(
        { code: issue.code, message: issue.message },
        issue.status,
      )
    }
  }
}
