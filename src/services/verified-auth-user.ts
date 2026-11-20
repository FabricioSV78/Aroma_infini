import type { UserResponse } from '@supabase/supabase-js'
import { requireSupabaseClient, type SessionAudience } from './supabase-client'

const inFlight = new Map<string, Promise<UserResponse>>()

/** Share only an unfinished remote verification of the exact same credential.
 * A completed result is never cached; callers still enforce owner, role, MFA
 * and session continuity before publishing data or granting access. */
export function verifySupabaseUser(
  token: string,
  audience: SessionAudience = 'customer',
): Promise<UserResponse> {
  const key = `${audience}:${token}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const operation = requireSupabaseClient(audience)
    .auth.getUser(token)
    .finally(() => {
      if (inFlight.get(key) === operation) inFlight.delete(key)
    })
  inFlight.set(key, operation)
  return operation
}
