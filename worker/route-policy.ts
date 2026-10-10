import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }

const publicPaths = new Set(indexablePaths)
const appPaths = new Set([
  '/fuente',
  '/buscar',
  '/favoritos',
  '/carrito',
  '/checkout',
  '/checkout/confirmacion',
  '/seguir-pedido',
  '/nosotros',
  '/contacto',
  '/envios',
  '/devoluciones',
  '/privacidad',
  '/terminos',
  '/libro-de-reclamaciones',
  '/cuenta',
  '/cuenta/datos',
  '/cuenta/direcciones',
  '/cuenta/favoritos',
  '/cuenta/pedidos',
  '/cuenta/pagos',
  '/admin',
  '/admin/productos',
  '/admin/productos/nuevo',
  '/admin/marcas',
  '/admin/pedidos',
  '/admin/clientes',
  '/admin/promociones',
  '/admin/envios',
  '/admin/home',
])

export type RouteKind = 'public' | 'app' | 'candidate' | 'missing'

export function classifyRoute(pathname: string): RouteKind {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (publicPaths.has(path)) return 'public'
  if (appPaths.has(path)) return 'app'
  if (/^\/(?:marcas|producto)\/[^/]+$/.test(path)) return 'candidate'
  if (/^\/cuenta\/pedidos\/[^/]+$/.test(path)) return 'app'
  if (/^\/admin\/(?:productos|pedidos)\/[^/]+$/.test(path)) return 'app'
  return 'missing'
}

export function brandPathForLegacyQuery(search: string) {
  const params = new URLSearchParams(search)
  const brands = params.getAll('marca')
  if (brands.length !== 1 || [...params.keys()].some((key) => key !== 'marca'))
    return null
  const path = `/marcas/${brands[0]}`
  return publicPaths.has(path) ? path : null
}
