import { formatPEN } from '../src/services/currency'

/** Request-local, native-link header for the public first paint. Its classes,
 * SVG paths and dimensions match Header.tsx; React supplies menus, persisted
 * counts and identity-aware destinations when the interactive tree takes over.
 * Never initialize browser stores or render private state on the server. */
const paths = {
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu: 'M3 6h18M3 12h18M3 18h18',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  bag: 'M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
  chevron: 'm8 4 8 8-8 8',
} as const

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

function icon(name: keyof typeof paths) {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"></path></svg>`
}

function action(
  href: string,
  label: string,
  name: keyof typeof paths,
  className = '',
) {
  return `<a class="icon-button ${className}" href="${href}" aria-label="${label}">${icon(name)}</a>`
}

/** Logo must already be resolved against the verified public media manifest.
 * An unavailable/disabled announcement reserves its existing Home geometry
 * without inventing shipping text, thresholds or account counts. */
export function publicInitialHeader({
  home,
  logo,
  announcement,
}: {
  home: boolean
  logo: string
  announcement?: {
    enabled: boolean
    deliveryText: string
    freeShippingLabel: string
    thresholdCents: number
  }
}): string {
  const announcementMarkup = announcement?.enabled
    ? `<div class="announcement"><span>${escape(announcement.deliveryText)}</span>${
        Number.isSafeInteger(announcement.thresholdCents) &&
        announcement.thresholdCents > 0
          ? `<span aria-hidden="true">·</span><span>${escape(announcement.freeShippingLabel)} ${escape(formatPEN(announcement.thresholdCents))}</span>`
          : ''
      }</div>`
    : '<div class="announcement" data-public-announcement aria-hidden="true"></div>'
  const nav = [
    { href: '/tienda', label: 'Tienda' },
    { href: '/marcas', label: 'Marcas' },
    { href: '/nosotros', label: 'Aroma Infini' },
  ]
    .map(
      ({ href, label }) =>
        `<div class="desktop-menu-item"><a class="nav-trigger" href="${href}">${label}${icon('chevron')}</a></div>`,
    )
    .join('')
  return (
    '<a class="skip-link" href="#contenido">Saltar al contenido</a>' +
    (home ? announcementMarkup : '') +
    '<div class="header-sentinel" aria-hidden="true"></div>' +
    `<header class="site-header ${home ? 'site-header--transparent' : 'site-header--solid'}"><div class="header-main">` +
    `<div class="header-leading">${action('/tienda', 'Explorar tienda', 'menu', 'mobile-menu-button')}</div>` +
    `<a class="wordmark" href="/" aria-label="Aroma Infini, inicio"><img class="media-managed-image brand-logo" src="${escape(logo)}" width="774" height="374" alt="" decoding="async"></a>` +
    `<nav class="desktop-nav" aria-label="Navegación principal">${nav}</nav>` +
    '<div class="header-actions">' +
    action('/buscar', 'Buscar perfumes', 'search') +
    action(
      '/favoritos',
      'Favoritos',
      'heart',
      'desktop-access header-commerce-action',
    ) +
    action('/cuenta', 'Mi cuenta', 'user', 'desktop-access') +
    action('/carrito', 'Carrito', 'bag', 'header-commerce-action') +
    '</div></div></header>'
  )
}
