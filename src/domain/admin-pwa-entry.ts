/** Navigation intent only. Private route loaders still verify Auth and MFA. */
export function adminPwaEntryDestination(
  url: URL,
  standalone: boolean,
  reload: boolean,
): string | null {
  if (
    !standalone ||
    reload ||
    !/^\/admin(?:\/|$)/.test(url.pathname) ||
    /^\/admin\/(?:login|recuperar|restablecer)(?:\/|$)/.test(url.pathname)
  )
    return null

  // Consume a notification's destination once. A later ordinary reopening of
  // this same order must start at Summary instead of replaying that launch.
  if (
    url.searchParams.get('adminLaunch') === 'notification' &&
    (url.pathname === '/admin/notificaciones' ||
      /^\/admin\/pedidos\/[A-Za-z0-9-]{1,100}$/.test(url.pathname))
  ) {
    url.searchParams.delete('adminLaunch')
    return `${url.pathname}${url.search}${url.hash}`
  }
  return '/admin/resumen'
}
