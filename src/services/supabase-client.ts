import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
export const supabaseStorageKey = config
  ? `sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`
  : ''

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

// Delegate the SDK's SupportedStorage to its existing browser key. No second
// token store is created. The guard is scoped only to committing an MFA upgrade.
const authStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem(key: string, value: string) {
    const guard = sessionCommitGuard
    if (key === supabaseStorageKey && guard) {
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
    if (key === supabaseStorageKey && sessionCommitGuard)
      sessionCommitGuard.invalidated = true
    window.localStorage.removeItem(key)
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      sessionCommitGuard &&
      (event.key === supabaseStorageKey || event.key === null)
    )
      sessionCommitGuard.invalidated = true
  })
}

let client: SupabaseClient<Database, 'api'> | null = null
if (config && typeof window !== 'undefined') {
  client = createClient<Database, 'api'>(config.url, config.publishableKey, {
    db: { schema: 'api' },
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: supabaseStorageKey,
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
  })
}

export function getSupabaseClient() {
  return client
}

export function requireSupabaseClient() {
  if (!client) throw new AuthError('unavailable')
  return client
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  return config ? { ...config } : null
}

/**
 * A delayed MFA response must not replace a session changed by another tab.
 * The SDK still owns token persistence/refresh and setSession's navigator lock.
 * This is a fail-closed storage consistency check, not a distributed DB lock.
 */
export async function commitSupabaseMfaSession<T>(
  expected: { userId: string; previousToken: string; nextToken: string },
  commit: () => Promise<T>,
): Promise<T> {
  const current = storedSession(window.localStorage.getItem(supabaseStorageKey))
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
