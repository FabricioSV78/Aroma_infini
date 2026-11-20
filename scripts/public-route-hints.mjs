import { DESKTOP_VIDEO_QUERY as DESKTOP_LAYOUT_QUERY } from '../src/domain/media-playback.ts'

function routeGroup(route) {
  if (route === '/') return '/'
  if (
    /^\/(?:tienda|buscar)\/?$/.test(route) ||
    /^\/marcas\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(route)
  ) return '/tienda'
  if (
    /^\/producto\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(route) || route === '/producto'
  ) return '/producto'
  return undefined
}

/** This weight is outside the first mobile viewport on the three measured
 * storefront routes. Keep its face and desktop preload; mobile CSS still loads
 * it normally when a rendered section actually needs it. */
export function selectPublicFontPreloads(html, route) {
  const critical = routeGroup(route) !== undefined
  return html.replace(
    /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")(?=[^>]*\bhref="\/(?:fonts\/lato-latin-300-normal|assets\/lato-latin-300-normal-[A-Za-z0-9_-]+)\.woff2")[^>]*>/g,
    (link) => {
      if (critical) {
        if (link.includes('data-public-font="light"')) return link
        return link.replace(/\/?>$/, ` media="${DESKTOP_LAYOUT_QUERY}" data-public-font="light">`)
      }
      return link.includes('data-public-font="light"')
        ? link.replace(/\smedia="[^"]*"/g, '').replace(/\sdata-public-font="light"/g, '')
        : link
    },
  )
}

/** Resolve the exact current build's static route graph, never hardcoded hashes.
 * Hints contain code/styles only and never execute a loader or fetch records. */
export function publicRouteHints(manifest, html, route = '/') {
  const group = routeGroup(route)
  if (!group) return ''
  const entry = {
      '/': 'src/features/home/HomePage.tsx',
      '/tienda': 'src/features/catalog/CatalogPage.tsx',
      '/producto': 'src/features/product/ProductPage.tsx',
    }[group],
    visited = new Set(),
    scripts = [],
    styles = []
  const asset = (value) => {
    if (
      typeof value !== 'string' ||
      !/^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(value)
    )
      throw Error('Invalid public route asset')
    return '/' + value
  }
  const visit = (key) => {
    if (visited.has(key)) return
    if (visited.size >= 100) throw Error('Oversized public route graph')
    visited.add(key)
    const chunk = manifest[key]
    if (
      !chunk ||
      typeof chunk !== 'object' ||
      !Array.isArray(chunk.imports ?? []) ||
      !Array.isArray(chunk.css ?? [])
    )
      throw Error('Missing public route chunk')
    for (const child of chunk.imports ?? []) visit(child)
    scripts.push(asset(chunk.file))
    styles.push(...(chunk.css ?? []).map(asset))
  }
  visit(entry)
  const existing = new Set(
    [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((m) => m[1]),
  )
  return (
    [...new Set(scripts)]
      .filter((p) => !existing.has(p))
      .map(
        (p) =>
          `<link rel="modulepreload" crossorigin href="${p}" data-public-route="${group}">`,
      )
      .join('') +
    [...new Set(styles)]
      .filter((p) => !existing.has(p))
      .map(
        (p) =>
          `<link rel="stylesheet" crossorigin href="${p}" data-public-route="${group}">`,
      )
      .join('')
  )
}
export function stripPublicRouteHints(html, route) {
  const group = routeGroup(route)
  return html.replace(
    /<link\b[^>]*\bdata-public-route="([^"]*)"[^>]*>/g,
    (link, markedGroup) => markedGroup === group ? link : '',
  )
}

/** The private fallback shell needs Auth at startup. The Worker removes this
 * code-only hint when that shell serves a public route. No session is embedded. */
export function authRouteHint(manifest) {
  const sdk = manifest['node_modules/@supabase/supabase-js/dist/index.mjs']
  if (!sdk?.isDynamicEntry || !/^assets\/[A-Za-z0-9_.-]+\.js$/.test(sdk.file))
    throw Error('Missing or unsafe deferred Auth SDK asset')
  return `<link rel="modulepreload" crossorigin href="/${sdk.file}" data-auth-route>`
}
