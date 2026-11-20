import { adminListAccess } from './admin-list-access'
import { adminAuthService as authService } from './auth-service'
import { UserFacingError } from '../domain/user-facing-error'
import { requireAdminSupabaseClient as requireSupabaseClient } from './supabase-client'
import { verifySupabaseUser } from './verified-auth-user'

export interface AdminReadActor {
  userId: string
  token: string
  accessRevision: number
}

interface ReadResult<T> {
  actor: AdminReadActor
  value: T
}

function sessionError(): never {
  adminListAccess.invalidate()
  throw new UserFacingError(
    'session',
    'Tu sesión administrativa cambió. Vuelve a iniciar sesión antes de continuar.',
  )
}

function verifiedOwner() {
  const state = authService.getSnapshot()
  if (
    state.status !== 'authenticated' ||
    state.session?.user.role !== 'admin' ||
    state.session.intent !== 'account' ||
    state.session.mfaRequired ||
    state.session.expiresAt <= Date.now()
  ) sessionError()
  return state.session.user.id
}

/** Start an already-protected SQL read alongside remote identity verification.
 * Nothing is returned to consumers before both checks finish. Only unfinished
 * operations for the exact credential, access revision, query and write epoch
 * can be shared; no completed result or authorization decision is cached. */
export function createAdminProtectedReads() {
  let generation = 0
  const pending = new Map<string, Promise<ReadResult<unknown>>>()

  function invalidate() {
    generation++
    pending.clear()
  }

  async function read<T>(
    key: string,
    load: (actor: AdminReadActor) => PromiseLike<T>,
  ): Promise<ReadResult<T>> {
    const started = generation
    const accessRevision = adminListAccess.getSnapshot()
    const userId = verifiedOwner()
    const client = requireSupabaseClient()
    const session = await client.auth.getSession()
    if (
      session.error ||
      session.data.session?.user.id !== userId ||
      !session.data.session.access_token
    ) sessionError()
    const actor = { userId, token: session.data.session.access_token, accessRevision }

    async function assertCurrent() {
      const current = await client.auth.getSession()
      if (
        verifiedOwner() !== actor.userId ||
        actor.accessRevision !== adminListAccess.getSnapshot() ||
        current.error ||
        current.data.session?.user.id !== actor.userId
      ) sessionError()
      // A renewal of the same verified owner or a write supersedes this read;
      // neither event is evidence that the administrator lost permission.
      if (started !== generation || current.data.session.access_token !== actor.token)
        throw new UserFacingError(
          'superseded-read',
          'La información cambió mientras se consultaba. Vuelve a cargar el listado.',
        )
    }

    await assertCurrent()
    const requestKey = JSON.stringify([actor.userId, actor.token, actor.accessRevision, started, key])
    const shared = pending.get(requestKey)
    if (shared) return shared as Promise<ReadResult<T>>

    const operation = (async () => {
      // SQL still authenticates/authorizes its captured credential itself. The
      // caller must only fetch here; parse/publish shared state after read().
      const verification = verifySupabaseUser(actor.token, 'admin')
      const response = Promise.resolve().then(() => load(actor))
      const [identity, result] = await Promise.allSettled([verification, response])
      await assertCurrent()
      if (
        identity.status === 'rejected' ||
        identity.value.error ||
        identity.value.data.user?.id !== actor.userId
      ) sessionError()
      if (result.status === 'rejected') throw result.reason
      return { actor, value: result.value }
    })().finally(() => {
      if (pending.get(requestKey) === operation) pending.delete(requestKey)
    })
    pending.set(requestKey, operation)
    return operation
  }

  return { read, invalidate }
}
