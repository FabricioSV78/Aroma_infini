import { AuthError, type AuthErrorCode } from './auth-errors'

/** Only stable provider codes are mapped; SDK messages and bodies stay private. */
export function mapSupabaseAuthError(
  error: unknown,
  fallback: AuthErrorCode = 'credentials',
): AuthError {
  if (error instanceof AuthError) return error
  if (!error || typeof error !== 'object') return new AuthError(fallback)
  const code = 'code' in error ? error.code : undefined
  const status = 'status' in error ? error.status : undefined
  const name = 'name' in error ? error.name : undefined
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_sms_send_rate_limit'
  )
    return new AuthError('rate-limit')
  if (
    (typeof status === 'number' && status >= 500) ||
    code === 'email_address_not_authorized' ||
    code === 'email_not_confirmed' ||
    code === 'email_provider_disabled' ||
    code === 'signup_disabled' ||
    code === 'provider_disabled' ||
    code === 'unexpected_failure' ||
    code === 'hook_timeout' ||
    code === 'hook_timeout_after_retry'
  )
    return new AuthError('service')
  if (code === 'weak_password' || code === 'same_password')
    return new AuthError('password')
  if (code === 'email_address_invalid') return new AuthError('email')
  if (
    code === 'mfa_verification_failed' ||
    code === 'mfa_challenge_expired' ||
    code === 'mfa_factor_not_found' ||
    code === 'mfa_verification_rejected'
  )
    return new AuthError('mfa')
  if (
    code === 'otp_expired' ||
    code === 'flow_state_expired' ||
    code === 'flow_state_not_found' ||
    code === 'bad_code_verifier' ||
    code === 'validation_failed'
  )
    return new AuthError(fallback === 'recovery' ? 'recovery' : fallback)
  if (
    name === 'AuthRetryableFetchError' ||
    name === 'TypeError' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    status === 0
  )
    return new AuthError('network')
  if (code === '42501') return new AuthError('permission')
  return new AuthError(fallback)
}
