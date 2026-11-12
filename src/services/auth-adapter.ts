import type { Factor } from '@supabase/supabase-js'
import type { AuthAdapter, AuthSession, AuthSessionChange } from '../types/auth'
import { AuthError, type AuthErrorCode } from './auth-errors'
import { mapSupabaseAuthError } from './supabase-auth-errors'
import { verifySupabaseUser } from './verified-auth-user'
import {
  rememberAdminDevice,
  resetAdminDeviceRequests,
  resumeAdminDevice,
} from './admin-device-service'
import {
  commitSupabaseMfaSession,
  getSupabaseClient,
  getSupabasePublicConfig,
  isSupabaseConfigured,
  requireSupabaseClient,
  supabaseStorageKey,
} from './supabase-client'

let pendingEnrollment: {
  userId: string
  data: { id: string; qrCode: string; secret: string }
} | null = null
// An obsolete PASSWORD_RECOVERY event must not become an ordinary session.
let rejectedRecoveryToken: string | null = null

async function safe<T>(
  task: () => Promise<T>,
  fallback: AuthErrorCode = 'credentials',
): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw mapSupabaseAuthError(error, fallback)
  }
}

function isMissingSession(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? error.code : undefined
  return (
    ('name' in error && error.name === 'AuthSessionMissingError') ||
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    code === 'bad_jwt' ||
    code === 'user_not_found'
  )
}

async function getVerifiedSession(): Promise<AuthSession | null> {
  if (!getSupabaseClient()) return null
  return safe(async () => {
    const client = requireSupabaseClient()
    const cached = await client.auth.getSession()
    if (cached.error) {
      if (isMissingSession(cached.error)) return null
      throw cached.error
    }
    if (!cached.data.session) return null
    if (cached.data.session.access_token === rejectedRecoveryToken)
      throw new AuthError('session')
    // getSession supplies credentials to the SDK; getUser verifies them remotely.
    const captured = cached.data.session
    const actorToken = captured.access_token
    const readActor = () =>
      client
        .rpc('current_actor')
        .setHeader('Authorization', `Bearer ${actorToken}`)
    // Both authorities receive the same captured credential. Drain both reads,
    // then retain Auth's error priority before interpreting any actor response.
    const [verification, initialActor] = await Promise.allSettled([
      verifySupabaseUser(actorToken),
      readActor(),
    ])
    if (verification.status === 'rejected') {
      if (isMissingSession(verification.reason)) return null
      throw verification.reason
    }
    const verified = verification.value
    if (verified.error) {
      if (isMissingSession(verified.error)) return null
      throw verified.error
    }
    const user = verified.data.user
    if (!user || !user.email) throw new AuthError('session')
    const current = await client.auth.getSession()
    if (current.error) throw current.error
    const session = current.data.session
    if (
      !session ||
      session.user.id !== user.id ||
      session.user.id !== captured.user.id ||
      session.access_token !== captured.access_token ||
      !session.expires_at ||
      session.expires_at * 1000 <= Date.now()
    )
      return null
    function parseActor(result: Awaited<ReturnType<typeof readActor>>) {
      if (result.error) throw mapSupabaseAuthError(result.error, 'service')
      const actor = result.data
      if (
        !actor ||
        typeof actor !== 'object' ||
        Array.isArray(actor) ||
        actor.user_id !== user.id ||
        !['customer', 'admin'].includes(String(actor.role)) ||
        !['aal1', 'aal2'].includes(String(actor.aal)) ||
        typeof actor.requires_mfa !== 'boolean' ||
        (actor.trusted_device === true &&
          (typeof actor.trusted_until !== 'string' ||
            !Number.isFinite(Date.parse(actor.trusted_until)) ||
            Date.parse(actor.trusted_until) <= Date.now()))
      )
        throw new AuthError('service')
      return actor
    }
    async function currentActor() {
      return parseActor(await readActor())
    }
    if (initialActor.status === 'rejected') throw initialActor.reason
    let actor = parseActor(initialActor.value)
    if (
      actor.role === 'admin' &&
      actor.aal !== 'aal2' &&
      actor.trusted_device !== true
    ) {
      let resumed = false
      try {
        resumed = await resumeAdminDevice({
          userId: user.id,
          token: session.access_token,
        })
      } catch {
        // Older deployments or a missing cookie preserve ordinary TOTP login.
        // The identity/token checks below still discard delayed replies.
      }
      if (resumed) actor = await currentActor()
    }
    // Do not publish a reply to an operation begun under another SDK identity.
    const after = await client.auth.getSession()
    if (after.error) throw after.error
    if (
      after.data.session?.user.id !== user.id ||
      after.data.session.access_token !== session.access_token ||
      !after.data.session.expires_at ||
      after.data.session.expires_at * 1000 <= Date.now()
    )
      return null
    const firstName = user.user_metadata?.firstName
    return {
      user: {
        id: user.id,
        email: user.email,
        ...(typeof firstName === 'string'
          ? { displayName: firstName.slice(0, 80) }
          : {}),
        role: actor.role === 'admin' ? 'admin' : 'customer',
      },
      expiresAt:
        actor.role === 'admin' &&
        actor.aal !== 'aal2' &&
        actor.trusted_device === true &&
        typeof actor.trusted_until === 'string'
          ? Math.min(session.expires_at * 1000, Date.parse(actor.trusted_until))
          : session.expires_at * 1000,
      intent: 'account',
      assurance: actor.aal === 'aal2' ? 'aal2' : 'aal1',
      mfaRequired:
        actor.role === 'admin' &&
        (actor.requires_mfa === true ||
          (actor.aal !== 'aal2' && actor.trusted_device !== true)),
      trustedDevice: actor.trusted_device === true,
      ...(actor.trusted_device === true &&
      typeof actor.trusted_until === 'string'
        ? { trustedUntil: actor.trusted_until }
        : {}),
    }
  })
}

interface AdminActor {
  session: AuthSession
  token: string
}

async function assertAdminActorCurrent(actor: AdminActor) {
  const current = await requireSupabaseClient().auth.getSession()
  if (current.error) throw current.error
  if (
    current.data.session?.user.id !== actor.session.user.id ||
    current.data.session.access_token !== actor.token
  )
    throw new AuthError('session')
}

async function requireAdminActor(): Promise<AdminActor> {
  const original = await requireSupabaseClient().auth.getSession()
  if (original.error) throw original.error
  if (!original.data.session) throw new AuthError('session')
  const session = await getVerifiedSession()
  if (!session || session.intent !== 'account' || session.user.role !== 'admin')
    throw new AuthError('permission')
  const actor = { session, token: original.data.session.access_token }
  await assertAdminActorCurrent(actor)
  return actor
}

async function listActorFactors(actor: AdminActor): Promise<Factor[]> {
  await assertAdminActorCurrent(actor)
  const result = await requireSupabaseClient().auth.getUser(actor.token)
  if (result.error) throw result.error
  if (result.data.user.id !== actor.session.user.id)
    throw new AuthError('session')
  await assertAdminActorCurrent(actor)
  return (result.data.user.factors ?? []).filter(
    (factor) => factor.factor_type === 'totp',
  )
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError('service')
  return value as Record<string, unknown>
}

async function requestMfa(
  actor: AdminActor,
  route: string,
  method: 'POST' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await assertAdminActorCurrent(actor)
  const config = getSupabasePublicConfig()
  if (!config) throw new AuthError('unavailable')
  const response = await fetch(`${config.url}/auth/v1/factors${route}`, {
    method,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${actor.token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  const result: unknown = response.status === 204 ? {} : await response.json()
  await assertAdminActorCurrent(actor)
  if (!response.ok) {
    if (response.status === 401) throw new AuthError('session')
    if (response.status === 403) throw new AuthError('permission')
    throw mapSupabaseAuthError(
      { ...jsonObject(result), status: response.status },
      'mfa',
    )
  }
  return jsonObject(result)
}

export const authAdapter: AuthAdapter = {
  configured: isSupabaseConfigured,
  getVerifiedSession,
  signInWithPassword(input) {
    return safe(async () => {
      resetAdminDeviceRequests()
      const result =
        await requireSupabaseClient().auth.signInWithPassword(input)
      if (result.error) throw result.error
      rejectedRecoveryToken = null
      pendingEnrollment = null
    })
  },
  signUp(input) {
    return safe(async () => {
      const result = await requireSupabaseClient().auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          // Must match the reviewed Auth profile bootstrap trigger.
          data: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone.trim(),
          },
        },
      })
      if (result.error) throw result.error
      if (!result.data.session) throw new AuthError('service')
      rejectedRecoveryToken = null
    })
  },
  signOut() {
    return safe(async () => {
      resetAdminDeviceRequests()
      rejectedRecoveryToken = null
      pendingEnrollment = null
      const client = getSupabaseClient()
      if (!client) return
      // SDK 2.118 also removes its local session when remote logout fails.
      // Keep its returned error: callers must not claim remote revocation then.
      const result = await client.auth.signOut({ scope: 'local' })
      if (result.error) throw result.error
    })
  },
  onSessionChange(listener) {
    const client = getSupabaseClient()
    if (!client) return () => undefined
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const notify = (hint?: AuthSessionChange) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        listener(hint)
      }, 0)
      timers.add(timer)
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        rejectedRecoveryToken = session.access_token
        pendingEnrollment = null
        notify({ userId: null })
        return
      }
      if (event === 'SIGNED_OUT') {
        resetAdminDeviceRequests()
        rejectedRecoveryToken = null
        pendingEnrollment = null
      }
      // No SDK/network calls inside a synchronous auth callback.
      // This identity is only a continuity hint for already-verified UI.
      // getVerifiedSession still rechecks Auth and the actor RPC before access.
      notify({ userId: session?.user.id ?? null })
    })
    const storageListener = (event: StorageEvent) => {
      if (event.key === supabaseStorageKey || event.key === null) notify()
    }
    window.addEventListener('storage', storageListener)
    return () => {
      data.subscription.unsubscribe()
      timers.forEach(clearTimeout)
      window.removeEventListener('storage', storageListener)
    }
  },
  listMfaFactors() {
    return safe(async () => {
      const actor = await requireAdminActor()
      const factors = await listActorFactors(actor)
      return factors.map((factor) => ({
        id: factor.id,
        status: factor.status,
        ...(factor.friendly_name ? { friendlyName: factor.friendly_name } : {}),
      }))
    }, 'mfa')
  },
  enrollMfa() {
    return safe(async () => {
      const actor = await requireAdminActor()
      const { session } = actor
      if (!session.mfaRequired) throw new AuthError('permission')
      if (pendingEnrollment?.userId === session.user.id)
        return pendingEnrollment.data
      const factors = await listActorFactors(actor)
      if (factors.some((factor) => factor.status === 'verified'))
        throw new AuthError('mfa')
      // Only replace unfinished setups created with this application's label.
      // Existing verified authenticators are never removed by enrollment.
      for (const factor of factors.filter(
        (item) =>
          item.factor_type === 'totp' &&
          item.status === 'unverified' &&
          item.friendly_name === 'Aroma Infini',
      )) {
        await requestMfa(actor, `/${encodeURIComponent(factor.id)}`, 'DELETE')
      }
      const result = await requestMfa(actor, '', 'POST', {
        factor_type: 'totp',
        friendly_name: 'Aroma Infini',
        issuer: 'Aroma Infini',
      })
      const totp = jsonObject(result.totp)
      if (
        typeof result.id !== 'string' ||
        typeof totp.qr_code !== 'string' ||
        typeof totp.secret !== 'string'
      )
        throw new AuthError('service')
      const data = {
        id: result.id,
        qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(totp.qr_code)}`,
        secret: totp.secret,
      }
      // QR and secret live only in memory for the current enrollment screen.
      pendingEnrollment = { userId: session.user.id, data }
      return data
    }, 'mfa')
  },
  verifyMfa({ factorId, code }) {
    return safe(async () => {
      const actor = await requireAdminActor()
      if (!/^\d{6}$/.test(code)) throw new AuthError('mfa')
      const client = requireSupabaseClient()
      const factors = await listActorFactors(actor)
      if (!factors.some((factor) => factor.id === factorId))
        throw new AuthError('mfa')
      const factorRoute = `/${encodeURIComponent(factorId)}`
      const challenge = await requestMfa(
        actor,
        `${factorRoute}/challenge`,
        'POST',
        { factorId },
      )
      if (typeof challenge.id !== 'string') throw new AuthError('service')
      const result = await requestMfa(actor, `${factorRoute}/verify`, 'POST', {
        challenge_id: challenge.id,
        code,
      })
      if (
        typeof result.access_token !== 'string' ||
        typeof result.refresh_token !== 'string'
      )
        throw new AuthError('service')
      const user = await client.auth.getUser(result.access_token)
      if (user.error) throw user.error
      if (user.data.user.id !== actor.session.user.id)
        throw new AuthError('session')
      await assertAdminActorCurrent(actor)
      const committed = await commitSupabaseMfaSession(
        {
          userId: actor.session.user.id,
          previousToken: actor.token,
          nextToken: result.access_token,
        },
        () =>
          client.auth.setSession({
            access_token: result.access_token as string,
            refresh_token: result.refresh_token as string,
          }),
      )
      if (committed.error) throw committed.error
      const verified = await getVerifiedSession()
      if (
        !verified ||
        verified.user.id !== actor.session.user.id ||
        verified.user.role !== 'admin' ||
        verified.mfaRequired ||
        verified.assurance !== 'aal2'
      )
        throw new AuthError('permission')
      pendingEnrollment = null
      await rememberAdminDevice({
        userId: verified.user.id,
        token: result.access_token,
      })
    }, 'mfa')
  },
}
