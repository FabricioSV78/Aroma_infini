import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { AuthError } from './auth-errors'

interface SupabasePublicConfig {
  url: string
  publishableKey: string
}

function readPublicConfig(): SupabasePublicConfig | null {
  const address = import.meta.env?.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!address || !key) return null
  try {
    const url = new URL(address)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' &&
        !(import.meta.env.DEV && local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null
    if (key.startsWith('eyJ')) {
      // A legacy anon key is public. A service-role JWT is never a browser key.
      const payload = key.split('.')[1]
      const decoded: unknown = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      )
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        !('role' in decoded) ||
        decoded.role !== 'anon'
      )
        return null
    } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null
    return { url: url.origin, publishableKey: key }
  } catch {
    return null
  }
}

const config = readPublicConfig()
export const isSupabaseConfigured = Boolean(config)
export const legacySupabaseStorageKey = config
  ? `sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`
  : ''
export const supabaseStorageKey = legacySupabaseStorageKey.replace(
  /-auth-token$/,
  '-customer-auth-token',
)
export const adminSupabaseStorageKey = legacySupabaseStorageKey.replace(
  /-auth-token$/,
  '-admin-auth-token',
)
export type SessionAudience = 'customer' | 'admin'

interface SessionCommitGuard {
  userId: string
  previousToken: string
  nextToken: string
  invalidated: boolean
}

let sessionCommitGuard: SessionCommitGuard | null = null

function storedSession(value: string | null) {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const token = 'access_token' in parsed ? parsed.access_token : undefined
    const user = 'user' in parsed ? parsed.user : undefined
    if (
      typeof token !== 'string' ||
      !user ||
      typeof user !== 'object' ||
      !('id' in user) ||
      typeof user.id !== 'string'
    )
      return null
    return { token, userId: user.id }
  } catch {
    return null
  }
}

// Delegate each SDK to its own audience key. The consistency guard applies
// exclusively to committing an administrative MFA upgrade.
const authStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem(key: string, value: string) {
    const guard = sessionCommitGuard
    if (key === adminSupabaseStorageKey && guard) {
      const current = storedSession(window.localStorage.getItem(key))
      const next = storedSession(value)
      if (
        guard.invalidated ||
        current?.token !== guard.previousToken ||
        current.userId !== guard.userId ||
        next?.token !== guard.nextToken ||
        next.userId !== guard.userId
      )
        throw new AuthError('session')
    }
    window.localStorage.setItem(key, value)
  },
  removeItem(key: string) {
    if (key === adminSupabaseStorageKey && sessionCommitGuard)
      sessionCommitGuard.invalidated = true
    window.localStorage.removeItem(key)
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      sessionCommitGuard &&
      (event.key === adminSupabaseStorageKey || event.key === null)
    )
      sessionCommitGuard.invalidated = true
  })
}

const clients: Partial<
  Record<SessionAudience, SupabaseClient<Database, 'api'>>
> = {}
const clientRequests: Partial<Record<SessionAudience, Promise<void>>> = {}
let legacyRequest: Promise<void> | undefined

/** One-time, remotely verified classification of the former shared session.
 * Keep the original intact. A digest tombstone prevents reimport after logout;
 * neither that marker nor browser storage can authorize an account. */
async function importLegacySession() {
  if (!config || typeof window === 'undefined') return
  const raw = localStorage.getItem(legacySupabaseStorageKey)
  if (!raw) return
  const digest = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
  const marker = `${legacySupabaseStorageKey}-classified`
  if (localStorage.getItem(marker) === digest) return
  const session = storedSession(raw)
  if (!session) return
  const value = JSON.parse(raw) as { expires_at?: number }
  if (!value.expires_at || value.expires_at * 1000 <= Date.now()) return
  const headers = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${session.token}`,
  }
  const [userResponse, actorResponse] = await Promise.all([
    fetch(`${config.url}/auth/v1/user`, {
      headers,
      signal: AbortSignal.timeout(15000),
    }),
    fetch(`${config.url}/rest/v1/rpc/current_actor`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Profile': 'api',
        'Accept-Profile': 'api',
      },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    }),
  ])
  if (!userResponse.ok || !actorResponse.ok) return
  const user: unknown = await userResponse.json(),
    actor: unknown = await actorResponse.json()
  if (
    !user ||
    typeof user !== 'object' ||
    !('id' in user) ||
    user.id !== session.userId ||
    !actor ||
    typeof actor !== 'object' ||
    !('user_id' in actor) ||
    actor.user_id !== session.userId ||
    !('role' in actor) ||
    !['customer', 'admin'].includes(String(actor.role))
  )
    return
  const target =
    actor.role === 'admin' ? adminSupabaseStorageKey : supabaseStorageKey
  // No await between comparison and write. Cross-tab callers use the same lock.
  if (localStorage.getItem(legacySupabaseStorageKey) !== raw) return
  if (!localStorage.getItem(target)) localStorage.setItem(target, raw)
  localStorage.setItem(marker, digest)
}
function migrateLegacySession() {
  if (!legacyRequest) {
    const task = async () => {
      if (navigator.locks)
        await navigator.locks.request(
          `${legacySupabaseStorageKey}-classification`,
          importLegacySession,
        )
      else await importLegacySession()
    }
    legacyRequest = task()
      .catch(() => {
        /* Each audience still verifies remotely; a failed transition grants no access. */
      })
      .finally(() => {
        legacyRequest = undefined
      })
  }
  return legacyRequest
}

/** Load the unchanged SDK independently of the public React module graph.
 * All callers share this initialization, never a session/authorization result. */
export function initializeSupabaseClient(
  audience: SessionAudience = 'customer',
): Promise<void> {
  if (clients[audience] || !config || typeof window === 'undefined')
    return Promise.resolve()
  if (clientRequests[audience]) return clientRequests[audience]
  const configuration = config
  const operation = Promise.all([
    import('@supabase/supabase-js'),
    migrateLegacySession(),
  ]).then(([{ createClient }]) => {
    clients[audience] = createClient<Database, 'api'>(
      configuration.url,
      configuration.publishableKey,
      {
        db: { schema: 'api' },
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
          storageKey:
            audience === 'admin' ? adminSupabaseStorageKey : supabaseStorageKey,
          storage: authStorage,
          debug: false,
        },
        global: {
          fetch: (input, init) => {
            const timeout = AbortSignal.timeout(15000)
            return fetch(input, {
              ...init,
              signal: init?.signal
                ? AbortSignal.any([init.signal, timeout])
                : timeout,
            })
          },
        },
      },
    )
  })
  clientRequests[audience] = operation
  void operation.catch(() => {
    if (clientRequests[audience] === operation) delete clientRequests[audience]
  })
  return operation
}

/** A public RPC may be requested before background Auth has initialized. */
export async function requireReadySupabaseClient(
  audience: SessionAudience = 'customer',
) {
  await initializeSupabaseClient(audience)
  return requireSupabaseClient(audience)
}

export function getSupabaseClient(audience: SessionAudience = 'customer') {
  return clients[audience] ?? null
}

export function requireSupabaseClient(audience: SessionAudience = 'customer') {
  const client = clients[audience]
  if (!client) throw new AuthError('unavailable')
  return client
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  return config ? { ...config } : null
}

export const initializeAdminSupabaseClient = () =>
  initializeSupabaseClient('admin')
export const getAdminSupabaseClient = () => getSupabaseClient('admin')
export const requireAdminSupabaseClient = () => requireSupabaseClient('admin')
export const requireReadyAdminSupabaseClient = () =>
  requireReadySupabaseClient('admin')

/**
 * A delayed MFA response must not replace a session changed by another tab.
 * The SDK still owns token persistence/refresh and setSession's navigator lock.
 * This is a fail-closed storage consistency check, not a distributed DB lock.
 */
export async function commitSupabaseMfaSession<T>(
  expected: { userId: string; previousToken: string; nextToken: string },
  commit: () => Promise<T>,
): Promise<T> {
  const current = storedSession(
    window.localStorage.getItem(adminSupabaseStorageKey),
  )
  if (
    sessionCommitGuard ||
    current?.token !== expected.previousToken ||
    current.userId !== expected.userId
  )
    throw new AuthError('session')
  const guard = { ...expected, invalidated: false }
  sessionCommitGuard = guard
  try {
    return await commit()
  } finally {
    if (sessionCommitGuard === guard) sessionCommitGuard = null
  }
}
