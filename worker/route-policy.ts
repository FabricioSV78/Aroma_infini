import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }

const publicPaths = new Set(indexablePaths)
const appPaths = new Set([
  '/iniciar-sesion',
  '/crear-cuenta',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/auth/callback',
  '/admin/login',
  '/admin/recuperar',
  '/admin/restablecer',
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
  '/admin/familias-olfativas',
  '/admin/pedidos',
  '/admin/clientes',
  '/admin/promociones',
  '/admin/envios',
  '/admin/home',
  '/admin/configuracion',
  '/admin/notificaciones',
  '/admin/reclamaciones',
])

export type RouteKind = 'public' | 'app' | 'candidate' | 'missing'

export function classifyRoute(pathname: string): RouteKind {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (publicPaths.has(path)) return 'public'
  if (appPaths.has(path)) return 'app'
  if (/^\/(?:marcas|producto)\/[^/]+$/.test(path)) return 'candidate'
  if (/^\/cuenta\/pedidos\/[^/]+$/.test(path)) return 'app'
  if (/^\/admin\/(?:productos|pedidos)\/[^/]+$/.test(path)) return 'app'
  if (/^\/admin\/productos\/[^/]+\/fotos$/.test(path)) return 'app'
  return 'missing'
}
