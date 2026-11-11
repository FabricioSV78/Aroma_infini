import type { AuthSession } from '../types/auth'
import { AuthError } from './auth-errors'
import { requireSupabaseClient } from './supabase-client'

export interface AdminDeviceActor {
  userId: string
  token: string
}

export interface AdminTrustedDevice {
  id: string
  label: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  current: boolean
}

let resumeAttempt: { token: string; task: Promise<boolean> } | null = null
let registrationNotice: { userId: string; message: string } | null = null

export function resetAdminDeviceRequests() {
  resumeAttempt = null
  registrationNotice = null
}

export function consumeAdminDeviceNotice(userId: string) {
  const notice = registrationNotice
  registrationNotice = null
  return notice?.userId === userId ? notice.message : null
}

export async function assertAdminDeviceActorCurrent(actor: AdminDeviceActor) {
  const result = await requireSupabaseClient().auth.getSession()
  if (
    result.error ||
    result.data.session?.user.id !== actor.userId ||
    result.data.session.access_token !== actor.token
  )
    throw new AuthError('session')
}

async function request(
  actor: AdminDeviceActor,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
): Promise<Record<string, unknown>> {
  if (window.location.protocol !== 'https:') throw new AuthError('unavailable')
  await assertAdminDeviceActorCurrent(actor)
  // A relative URL is intentional: a trust cookie never goes to a configured
  // cross-origin API, and no browser-readable copy of it is created.
  const response = await fetch(`/api/admin/auth/${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Authorization: `Bearer ${actor.token}`,
      'X-Aroma-Admin-Device': '1',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(15000),
  })
  await assertAdminDeviceActorCurrent(actor)
  if (!response.ok)
    throw new AuthError(
      response.status === 401
        ? 'session'
        : response.status === 403
          ? 'permission'
          : response.status === 404
            ? 'unavailable'
            : 'network',
    )
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError('service')
  await assertAdminDeviceActorCurrent(actor)
  return value as Record<string, unknown>
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new AuthError('service')
  return value
}

export function resumeAdminDevice(actor: AdminDeviceActor): Promise<boolean> {
  if (resumeAttempt?.token === actor.token) return resumeAttempt.task
  const task = request(actor, 'device/resume', 'POST').then((result) => {
    if (typeof result.trusted !== 'boolean') throw new AuthError('service')
    if (
      result.trusted &&
      Date.parse(timestamp(result.expires_at)) <= Date.now()
    )
      throw new AuthError('service')
    return result.trusted
  })
  // Only one attempt per captured SDK token; subsequent actor RPCs remain the
  // authority, including after revocation. This cache grants no permission.
  resumeAttempt = { token: actor.token, task }
  return task
}

/** Called only after a real TOTP upgrade was committed and remotely verified. */
export async function rememberAdminDevice(actor: AdminDeviceActor) {
  try {
    const result = await request(actor, 'device/register', 'POST')
    if (typeof result.id !== 'string') throw new AuthError('service')
    if (Date.parse(timestamp(result.expires_at)) <= Date.now())
      throw new AuthError('service')
  } catch {
    // An unavailable trust endpoint must not undo a successfully verified TOTP.
    // Still discard an obsolete reply if logout/account/token changed meanwhile.
    await assertAdminDeviceActorCurrent(actor)
    registrationNotice = {
      userId: actor.userId,
      message:
        'Acceso verificado. No pudimos recordar este dispositivo; en el próximo inicio se pedirá el código de tu aplicación.',
    }
  }
}

async function actorFor(session: AuthSession): Promise<AdminDeviceActor> {
  if (
    session.user.role !== 'admin' ||
    session.mfaRequired ||
    session.intent !== 'account'
  )
    throw new AuthError('permission')
  const result = await requireSupabaseClient().auth.getSession()
  if (result.error || result.data.session?.user.id !== session.user.id)
    throw new AuthError('session')
  return { userId: session.user.id, token: result.data.session.access_token }
}

export async function listAdminDevices(
  session: AuthSession,
): Promise<AdminTrustedDevice[]> {
  const result = await request(await actorFor(session), 'devices', 'GET')
  if (!Array.isArray(result.items)) throw new AuthError('service')
  return result.items.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new AuthError('service')
    const item = value as Record<string, unknown>
    if (
      typeof item.id !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.current !== 'boolean'
    )
      throw new AuthError('service')
    return {
      id: item.id,
      label: item.label,
      current: item.current,
      createdAt: timestamp(item.created_at),
      expiresAt: timestamp(item.expires_at),
      lastUsedAt: timestamp(item.last_used_at),
    }
  })
}

export async function revokeAdminDevice(session: AuthSession, id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new AuthError('validation')
  const result = await request(
    await actorFor(session),
    `devices/${encodeURIComponent(id)}`,
    'DELETE',
  )
  if (typeof result.revoked !== 'boolean') throw new AuthError('service')
  return result.revoked
}
