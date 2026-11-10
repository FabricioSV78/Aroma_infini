export type AuthAudience = 'customer' | 'admin'

/** The access selector changes tasks within the same visual surface. */
export function isCustomerAuthModeSwitch(previous: string, next: string) {
  return (
    (previous === '/iniciar-sesion' && next === '/crear-cuenta') ||
    (previous === '/crear-cuenta' && next === '/iniciar-sesion')
  )
}

function unsafeCharacters(value: string) {
  return [...value].some(
    (character) =>
      character === '\\' ||
      character.charCodeAt(0) <= 32 ||
      character.charCodeAt(0) === 127,
  )
}

/** Only same-site relative destinations, with audience-specific loop prevention. */
export function safeAuthReturn(
  value: string | null | undefined,
  audience: AuthAudience,
): string {
  const fallback = audience === 'admin' ? '/admin' : '/cuenta'
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    unsafeCharacters(value)
  )
    return fallback
  try {
    const url = new URL(value, 'https://aroma.invalid')
    if (url.origin !== 'https://aroma.invalid') return fallback
    const path = decodeURIComponent(url.pathname)
    if (path.startsWith('//') || unsafeCharacters(path)) return fallback
    if (
      /^\/(?:auth|iniciar-sesion|crear-cuenta|recuperar-contrasena|restablecer-contrasena)(?:\/|$)/.test(
        path,
      )
    )
      return fallback
    if (audience === 'admin') {
      if (
        !/^\/admin(?:\/|$)/.test(path) ||
        /^\/admin\/(?:login|recuperar|restablecer)(?:\/|$)/.test(path)
      )
        return fallback
    } else if (/^\/admin(?:\/|$)/.test(path)) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export function authPath(
  audience: AuthAudience,
  view: 'login' | 'register' | 'recover',
  returnTo?: string,
): string {
  const path =
    audience === 'admin'
      ? view === 'recover'
        ? '/admin/recuperar'
        : '/admin/login'
      : view === 'register'
        ? '/crear-cuenta'
        : view === 'recover'
          ? '/recuperar-contrasena'
          : '/iniciar-sesion'
  const target = safeAuthReturn(returnTo, audience)
  return `${path}?${new URLSearchParams({ returnTo: target })}`
}
