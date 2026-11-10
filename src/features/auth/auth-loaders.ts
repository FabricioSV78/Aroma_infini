import { redirect, type LoaderFunctionArgs } from 'react-router'
import { authService } from '../../services/auth-service'
import { authPath, type AuthAudience } from '../../domain/auth-navigation'

export function requireAuthLoader(audience: AuthAudience) {
  return async ({ request }: LoaderFunctionArgs) => {
    await authService.initialize()
    const state = authService.getSnapshot()
    if (
      state.status === 'authenticated' &&
      state.session?.intent === 'account' &&
      (audience === 'customer' ||
        (state.session.user.role === 'admin' &&
          state.session.mfaRequired !== true))
    )
      return null
    const url = new URL(request.url)
    throw redirect(
      authPath(audience, 'login', `${url.pathname}${url.search}${url.hash}`),
    )
  }
}

/** Warm admin navigation can verify access and read protected data together.
 * Cold/expired sessions still establish identity before starting private reads.
 * The destination is committed only after BOTH operations succeed. */
export function adminDataLoader(load: () => Promise<void>) {
  const authorize = requireAuthLoader('admin')
  return async (args: LoaderFunctionArgs) => {
    const state = authService.getSnapshot()
    const verifiedAdmin =
      state.status === 'authenticated' &&
      state.session?.intent === 'account' &&
      state.session.user.role === 'admin' &&
      state.session.mfaRequired !== true &&
      state.session.expiresAt > Date.now()
    if (!verifiedAdmin) {
      await authorize(args)
      await load()
      return null
    }
    const authorization = authorize(args)
    // Observe a read rejection immediately, but preserve an Auth redirect as
    // the authoritative outcome if the parallel permission check fails.
    const loading = load().then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    await authorization
    const failure = await loading
    if (failure) throw failure.error
    return null
  }
}
