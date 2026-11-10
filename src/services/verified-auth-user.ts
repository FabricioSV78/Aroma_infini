import type { UserResponse } from '@supabase/supabase-js'
import { requireSupabaseClient } from './supabase-client'

const inFlight = new Map<string, Promise<UserResponse>>()

/** Share only an unfinished remote verification of the exact same credential.
 * A completed result is never cached; callers still enforce owner, role, MFA
 * and session continuity before publishing data or granting access. */
export function verifySupabaseUser(token: string): Promise<UserResponse> {
  const pending = inFlight.get(token)
  if (pending) return pending
  const operation = requireSupabaseClient()
    .auth.getUser(token)
    .finally(() => {
      if (inFlight.get(token) === operation) inFlight.delete(token)
    })
  inFlight.set(token, operation)
  return operation
}
