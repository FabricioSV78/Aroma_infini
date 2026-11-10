import { authService } from './auth-service'
import {
  getSupabasePublicConfig,
  requireSupabaseClient,
} from './supabase-client'

export type AccountRecoveryErrorCode =
  | 'invalid_password'
  | 'invalid_current_password'
  | 'invalid_request'
  | 'invalid_recovery'
  | 'rate_limit'
  | 'session_required'
  | 'recovery_not_supported'
  | 'account_changed'
  | 'service_unavailable'
  | 'recovery_status_unknown'

export class AccountRecoveryError extends Error {
  constructor(readonly code: AccountRecoveryErrorCode) {
    super(code)
    this.name = 'AccountRecoveryError'
  }
}

export interface RecoveryCodeStatus {
  hasCode: boolean
  createdAt: string | null
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Strip presentation separators only; the server independently validates it. */
export function normalizeRecoveryCode(value: string) {
  const compact = value.trim().replace(/[\s-]/g, '').toUpperCase()
  return compact.startsWith('AI') ? `AI-${compact.slice(2)}` : compact
}

export function isRecoveryCode(value: string) {
  return /^AI-[0-9A-F]{64}$/.test(normalizeRecoveryCode(value))
}

function errorCode(payload: unknown, status: number): AccountRecoveryErrorCode {
  if (status === 429) return 'rate_limit'
  if (status === 401) return 'session_required'
  const code = object(payload)?.code
  return typeof code === 'string' &&
    [
      'invalid_password',
      'invalid_current_password',
      'invalid_request',
      'invalid_recovery',
      'rate_limit',
      'session_required',
      'recovery_not_supported',
      'account_changed',
      'service_unavailable',
      'recovery_status_unknown',
    ].includes(code)
    ? (code as AccountRecoveryErrorCode)
    : 'service_unavailable'
}

async function publicRequest(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const config = getSupabasePublicConfig()
  if (!config) throw new AccountRecoveryError('service_unavailable')
  let started = false
  try {
    started = true
    const response = await fetch(
      new URL('/functions/v1/account-recovery', config.url),
      {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          AbortSignal.timeout(30000),
          ...(signal ? [signal] : []),
        ]),
      },
    )
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok)
      throw new AccountRecoveryError(errorCode(payload, response.status))
    const result = object(payload)
    if (!result) throw new AccountRecoveryError('recovery_status_unknown')
    return result
  } catch (error) {
    if (error instanceof AccountRecoveryError) throw error
    throw new AccountRecoveryError(
      started ? 'recovery_status_unknown' : 'service_unavailable',
    )
  }
}

async function ownerRequest(
  userId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const config = getSupabasePublicConfig()
  if (!config) throw new AccountRecoveryError('service_unavailable')
  const client = requireSupabaseClient()
  const initial = await client.auth.getSession()
  const session = initial.data.session
  if (initial.error || session?.user.id !== userId)
    throw new AccountRecoveryError('session_required')
  const token = session.access_token
  const controller = new AbortController()
  const invalidate = () => controller.abort()
  const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
    if (next?.user.id !== userId || next.access_token !== token) invalidate()
  })
  const unsubscribe = authService.subscribe(() => {
    const state = authService.getSnapshot()
    if (
      state.status !== 'authenticated' ||
      state.session?.user.id !== userId ||
      state.session.intent !== 'account'
    )
      invalidate()
  })
  let started = false
  async function assertOwner() {
    if (controller.signal.aborted || signal?.aborted)
      throw new AccountRecoveryError('session_required')
    const current = await client.auth.getSession()
    const state = authService.getSnapshot()
    if (
      current.error ||
      current.data.session?.user.id !== userId ||
      current.data.session.access_token !== token ||
      state.status !== 'authenticated' ||
      state.session?.user.id !== userId ||
      state.session.intent !== 'account'
    )
      throw new AccountRecoveryError('session_required')
  }
  try {
    const verified = await client.auth.getUser(token)
    await assertOwner()
    if (verified.error || verified.data.user?.id !== userId)
      throw new AccountRecoveryError('session_required')
    started = true
    const response = await fetch(
      new URL('/functions/v1/account-recovery', config.url),
      {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
          ...(signal ? [signal] : []),
        ]),
      },
    )
    const payload: unknown = await response.json().catch(() => null)
    await assertOwner()
    if (!response.ok)
      throw new AccountRecoveryError(errorCode(payload, response.status))
    const result = object(payload)
    if (!result) throw new AccountRecoveryError('recovery_status_unknown')
    return result
  } catch (error) {
    if (error instanceof AccountRecoveryError) throw error
    if (controller.signal.aborted || signal?.aborted)
      throw new AccountRecoveryError('session_required')
    throw new AccountRecoveryError(
      started && body.action === 'issue'
        ? 'recovery_status_unknown'
        : 'service_unavailable',
    )
  } finally {
    listener.subscription.unsubscribe()
    unsubscribe()
  }
}

export const accountRecovery = {
  async status(
    userId: string,
    signal?: AbortSignal,
  ): Promise<RecoveryCodeStatus> {
    const result = await ownerRequest(userId, { action: 'status' }, signal)
    if (
      typeof result.hasCode !== 'boolean' ||
      (result.createdAt !== null && typeof result.createdAt !== 'string')
    )
      throw new AccountRecoveryError('service_unavailable')
    return { hasCode: result.hasCode, createdAt: result.createdAt }
  },
  async issue(userId: string, currentPassword: string, signal?: AbortSignal) {
    if (!currentPassword || currentPassword.length > 1024)
      throw new AccountRecoveryError('invalid_current_password')
    const result = await ownerRequest(
      userId,
      { action: 'issue', currentPassword },
      signal,
    )
    if (
      typeof result.recoveryCode !== 'string' ||
      !isRecoveryCode(result.recoveryCode)
    )
      throw new AccountRecoveryError('recovery_status_unknown')
    return normalizeRecoveryCode(result.recoveryCode)
  },
  async recover(input: {
    email: string
    recoveryCode: string
    newPassword: string
    signal?: AbortSignal
  }) {
    const { email, recoveryCode, newPassword, signal } = input
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)
      throw new AccountRecoveryError('invalid_request')
    if (!isRecoveryCode(recoveryCode))
      throw new AccountRecoveryError('invalid_recovery')
    const result = await publicRequest(
      {
        action: 'recover',
        email: email.trim(),
        recoveryCode: normalizeRecoveryCode(recoveryCode),
        newPassword,
      },
      signal,
    )
    if (
      result.success !== true ||
      typeof result.recoveryCode !== 'string' ||
      !isRecoveryCode(result.recoveryCode)
    )
      throw new AccountRecoveryError('recovery_status_unknown')
    return normalizeRecoveryCode(result.recoveryCode)
  },
}
