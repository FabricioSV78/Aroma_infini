import type {
  AuthAdapter,
  AuthSession,
  AuthSignUpInput,
  AuthState,
} from '../types/auth'
import { authAdapter, adminAuthAdapter } from './auth-adapter'
import { AuthError, authErrorMessage } from './auth-errors'

export function createAuthService(authAdapter: AuthAdapter) {
  let state: AuthState = { status: 'checking', session: null, message: '' }
  const listeners = new Set<() => void>()
  let initialized = false
  let revision = 0
  let request: Promise<void> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let lockedAfterSignOut = false
  let signOutRequest: Promise<void> | undefined
  let explicitOperation = 0
  let verificationError: unknown

  function publish(next: AuthState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  function validSession(value: AuthSession): boolean {
    return Boolean(
      value &&
      value.user &&
      typeof value.user.id === 'string' &&
      value.user.id.trim() &&
      typeof value.user.email === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.user.email) &&
      ['customer', 'admin'].includes(value.user.role) &&
      ['account', 'recovery'].includes(value.intent) &&
      Number.isFinite(value.expiresAt),
    )
  }

  function expire() {
    revision++
    request = undefined
    clearTimeout(expiryTimer)
    publish({
      status: 'expired',
      session: null,
      message: 'Tu sesión terminó. Inicia sesión de nuevo para continuar.',
    })
  }

  function watchExpiry() {
    clearTimeout(expiryTimer)
    if (!state.session) return
    const remaining = state.session.expiresAt - Date.now()
    if (remaining <= 0) {
      expire()
      return
    }
    expiryTimer = setTimeout(
      watchExpiry,
      Math.min(remaining + 1, 2_147_483_647),
    )
  }

  async function refreshSession(): Promise<void> {
    if (lockedAfterSignOut) return
    if (request) return request
    const currentRevision = revision
    verificationError = undefined
    request = (async () => {
      try {
        const session = await authAdapter.getVerifiedSession()
        if (revision !== currentRevision || lockedAfterSignOut) return
        if (!session) {
          clearTimeout(expiryTimer)
          publish({ status: 'anonymous', session: null, message: '' })
        } else if (!validSession(session)) {
          throw new AuthError('credentials')
        } else if (session.expiresAt <= Date.now()) {
          expire()
        } else {
          publish({
            status: 'authenticated',
            session: structuredClone(session),
            message: '',
          })
          watchExpiry()
        }
      } catch (error) {
        if (revision !== currentRevision || lockedAfterSignOut) return
        verificationError = error
        clearTimeout(expiryTimer)
        publish({
          status: 'error',
          session: null,
          message: authErrorMessage(error),
        })
      } finally {
        if (revision === currentRevision) request = undefined
      }
    })()
    return request
  }

  /** INITIAL_SESSION or another SDK/storage event can supersede a verification
   * already awaited by route loaders. Drain the replacement verification before
   * resolving; the obsolete promise cannot establish that Auth is ready. This
   * shares unfinished requests only and never caches an authorization decision. */
  async function settleCurrentSession(): Promise<void> {
    await refreshSession()
    while (!lockedAfterSignOut && request) {
      const current = request
      await current
      if (request === current) break
    }
  }

  const service = {
    get configured() {
      return authAdapter.configured
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async initialize() {
      if (!initialized) {
        initialized = true
        authAdapter.onSessionChange((hint) => {
          if (lockedAfterSignOut || explicitOperation > 0) return
          revision++
          request = undefined
          // Keep a still-valid, verified owner mounted during token renewal/focus.
          // Another owner, logout, or an unknown event clears private UI at once.
          const sameOwner =
            state.status === 'authenticated' &&
            state.session !== null &&
            hint?.userId === state.session.user.id &&
            state.session.expiresAt > Date.now()
          if (!sameOwner) {
            clearTimeout(expiryTimer)
            publish({ status: 'checking', session: null, message: '' })
          }
          void refreshSession()
        })
      }
      await settleCurrentSession()
    },
    refresh: settleCurrentSession,
    async signIn(input: { email: string; password: string }) {
      if (signOutRequest) await signOutRequest.catch(() => undefined)
      lockedAfterSignOut = false
      explicitOperation++
      try {
        await authAdapter.signInWithPassword(input)
        revision++
        request = undefined
        await refreshSession()
        if (
          state.status !== 'authenticated' ||
          state.session?.intent !== 'account'
        )
          throw state.status === 'error' &&
            verificationError instanceof AuthError
            ? verificationError
            : new AuthError(
                state.status === 'error' ? 'service' : 'credentials',
              )
        return state.session
      } finally {
        explicitOperation--
      }
    },
    async signUp(input: AuthSignUpInput) {
      if (signOutRequest) await signOutRequest.catch(() => undefined)
      explicitOperation++
      try {
        await authAdapter.signUp(input)
        // Registration must establish an Auth session, then pass the same remote
        // identity and actor checks as sign-in before private UI can open.
        lockedAfterSignOut = false
        revision++
        request = undefined
        await refreshSession()
        if (
          state.status !== 'authenticated' ||
          state.session?.intent !== 'account'
        )
          throw new AuthError('service')
        return state.session
      } finally {
        explicitOperation--
      }
    },
    async listMfaFactors() {
      if (!authAdapter.listMfaFactors) throw new AuthError('unavailable')
      return authAdapter.listMfaFactors()
    },
    async enrollMfa() {
      if (!authAdapter.enrollMfa) throw new AuthError('unavailable')
      return authAdapter.enrollMfa()
    },
    async verifyMfa(input: { factorId: string; code: string }) {
      if (!authAdapter.verifyMfa) throw new AuthError('unavailable')
      explicitOperation++
      try {
        await authAdapter.verifyMfa(input)
        revision++
        request = undefined
        await refreshSession()
        if (state.session?.user.role !== 'admin' || state.session.mfaRequired)
          throw new AuthError('permission')
      } finally {
        explicitOperation--
      }
    },
    signOut(beforeProviderSignOut?: Promise<unknown>) {
      const cleanup = beforeProviderSignOut?.catch(() => undefined)
      if (signOutRequest) return signOutRequest
      lockedAfterSignOut = true
      revision++
      request = undefined
      clearTimeout(expiryTimer)
      // Local access is revoked immediately, including on provider/network failure.
      explicitOperation++
      signOutRequest = Promise.resolve()
        .then(async () => {
          if (cleanup) {
            let deadline: ReturnType<typeof setTimeout> | undefined
            try {
              // Device opt-out needs the still-valid provider session. Keep the
              // UI anonymous while allowing that narrow cleanup to finish first.
              await Promise.race([
                cleanup,
                new Promise<void>((resolve) => {
                  deadline = setTimeout(resolve, 2500)
                }),
              ])
            } finally {
              clearTimeout(deadline)
            }
          }
          await authAdapter.signOut()
        })
        .finally(() => {
          explicitOperation--
          lockedAfterSignOut = false
          signOutRequest = undefined
        })
      publish({ status: 'anonymous', session: null, message: '' })
      return signOutRequest
    },
  }
  return service
}
export const authService = createAuthService(authAdapter)
export const adminAuthService = createAuthService(adminAuthAdapter)
