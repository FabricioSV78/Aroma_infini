import { authService } from './auth-service'
import {
  getSupabasePublicConfig,
  requireSupabaseClient,
} from './supabase-client'

export type AccountEmailChangeErrorCode =
  | 'invalid_current_password'
  | 'invalid_email'
  | 'email_unavailable'
  | 'rate_limit'
  | 'session_required'
  | 'mfa_required'
  | 'permission_denied'
  | 'account_changed'
  | 'service_unavailable'
  | 'change_status_unknown'

export class AccountEmailChangeError extends Error {
  constructor(readonly code: AccountEmailChangeErrorCode) {
    super(code)
    this.name = 'AccountEmailChangeError'
  }
}

interface ChangeAccountEmailInput {
  userId: string
  email: string
  currentPassword: string
  signal?: AbortSignal
}

function isErrorCode(value: unknown): value is AccountEmailChangeErrorCode {
  return (
    typeof value === 'string' &&
    [
      'invalid_current_password',
      'invalid_email',
      'email_unavailable',
      'rate_limit',
      'session_required',
      'mfa_required',
      'permission_denied',
      'account_changed',
      'service_unavailable',
      'change_status_unknown',
    ].includes(value)
  )
}

/**
 * Password reauthentication happens only in the server function. Pin the JWT
 * verified for this request, and never restore or refresh a different owner.
 * The password is never placed in profile data, SDK storage or a URL.
 */
export async function changeAccountEmail({
  userId,
  email: requestedEmail,
  currentPassword,
  signal,
}: ChangeAccountEmailInput): Promise<string> {
  const email = requestedEmail.trim()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AccountEmailChangeError('invalid_email')
  if (!currentPassword || currentPassword.length > 1024)
    throw new AccountEmailChangeError('invalid_current_password')

  const config = getSupabasePublicConfig()
  if (!config) throw new AccountEmailChangeError('service_unavailable')
  const client = requireSupabaseClient()
  const initial = await client.auth.getSession()
  if (initial.error || initial.data.session?.user.id !== userId)
    throw new AccountEmailChangeError('session_required')
  const token = initial.data.session.access_token
  const abort = new AbortController()
  const requestSignal = AbortSignal.any([
    abort.signal,
    AbortSignal.timeout(30000),
    ...(signal ? [signal] : []),
  ])
  const invalidate = () => abort.abort()
  const { data: listener } = client.auth.onAuthStateChange(
    (_event, session) => {
      if (session?.user.id !== userId || session.access_token !== token)
        invalidate()
    },
  )
  const unsubscribe = authService.subscribe(() => {
    const state = authService.getSnapshot()
    if (
      state.status !== 'authenticated' ||
      state.session?.user.id !== userId ||
      state.session.intent !== 'account'
    )
      invalidate()
  })
  let requestStarted = false

  async function assertCurrentOwner() {
    if (abort.signal.aborted || signal?.aborted)
      throw new AccountEmailChangeError('account_changed')
    const current = await client.auth.getSession()
    const state = authService.getSnapshot()
    if (
      current.error ||
      current.data.session?.user.id !== userId ||
      current.data.session.access_token !== token ||
      state.status !== 'authenticated' ||
      state.session?.user.id !== userId ||
      state.session.intent !== 'account' ||
      abort.signal.aborted ||
      signal?.aborted
    )
      throw new AccountEmailChangeError('account_changed')
  }

  async function verifyChangedEmail() {
    // A lost/ambiguous response must not lead to a second blind write. Read the
    // canonical Auth identity and only report success when its email matches.
    const saved = await client.auth.getUser(token)
    await assertCurrentOwner()
    if (
      saved.error ||
      saved.data.user?.id !== userId ||
      saved.data.user.email?.toLowerCase() !== email.toLowerCase()
    ) {
      await authService.refresh()
      await assertCurrentOwner()
      throw new AccountEmailChangeError('change_status_unknown')
    }
    await authService.refresh()
    await assertCurrentOwner()
    return saved.data.user.email
  }

  try {
    const verified = await client.auth.getUser(token)
    if (verified.error || verified.data.user?.id !== userId)
      throw new AccountEmailChangeError('session_required')
    await assertCurrentOwner()
    requestStarted = true
    const response = await fetch(
      new URL('/functions/v1/change-email', config.url),
      {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, currentPassword }),
        signal: requestSignal,
      },
    )
    const payload: unknown = await response.json().catch(() => null)
    await assertCurrentOwner()
    if (!response.ok) {
      const code =
        payload && typeof payload === 'object' && 'code' in payload
          ? payload.code
          : undefined
      const resultCode =
        response.status === 429
          ? 'rate_limit'
          : isErrorCode(code)
            ? code
            : response.status === 401
              ? 'session_required'
              : 'service_unavailable'
      if (resultCode === 'change_status_unknown') return verifyChangedEmail()
      throw new AccountEmailChangeError(resultCode)
    }
    const canonical =
      payload && typeof payload === 'object' && 'email' in payload
        ? payload.email
        : undefined
    if (
      typeof canonical !== 'string' ||
      canonical.toLowerCase() !== email.toLowerCase() ||
      !payload ||
      typeof payload !== 'object' ||
      !('success' in payload) ||
      payload.success !== true
    )
      return verifyChangedEmail()

    // getUser verifies the new canonical email without rotating/committing a
    // session that may have been replaced by another tab during this request.
    return verifyChangedEmail()
  } catch (error) {
    if (error instanceof AccountEmailChangeError) throw error
    if (abort.signal.aborted || signal?.aborted)
      throw new AccountEmailChangeError('account_changed')
    if (requestStarted) return verifyChangedEmail()
    throw new AccountEmailChangeError('service_unavailable')
  } finally {
    listener.subscription.unsubscribe()
    unsubscribe()
  }
}
