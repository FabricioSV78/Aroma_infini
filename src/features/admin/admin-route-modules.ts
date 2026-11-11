/** Code-only imports shared by the router and sidebar intent hints.
 * These functions never run loaders, mount pages or request private records. */
export const adminRouteModules = {
  dashboard: () => import('./AdminDashboardPage'),
  products: () => import('./AdminProducts'),
  productPhotos: () => import('./AdminProductPhotoPage'),
  families: () => import('./AdminOlfactoryFamilies'),
  notifications: () => import('./AdminNotificationsPage'),
  operations: () => import('./AdminOperations'),
  orders: () => import('./AdminOrdersPage'),
  shipping: () => import('./AdminShippingPage'),
  home: () => import('./AdminHomePage'),
  media: () => import('./AdminMediaLibrary'),
  settings: () => import('./AdminSiteSettings'),
  complaints: () => import('./AdminComplaints'),
} as const

const sidebarModules = {
  '/admin': adminRouteModules.dashboard,
  '/admin/productos': adminRouteModules.products,
  '/admin/marcas': adminRouteModules.operations,
  '/admin/familias-olfativas': adminRouteModules.families,
  '/admin/pedidos': adminRouteModules.orders,
  '/admin/clientes': adminRouteModules.operations,
  '/admin/promociones': adminRouteModules.operations,
  '/admin/home': adminRouteModules.home,
  '/admin/biblioteca': adminRouteModules.media,
  '/admin/envios': adminRouteModules.shipping,
  '/admin/configuracion': adminRouteModules.settings,
  '/admin/notificaciones': adminRouteModules.notifications,
  '/admin/reclamaciones': adminRouteModules.complaints,
} as const

const hinted = new Set<() => Promise<unknown>>()
export function preloadAdminRoute(path: string) {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  if (
    connection?.saveData ||
    ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  )
    return
  const load = sidebarModules[path as keyof typeof sidebarModules]
  if (!load || hinted.has(load)) return
  hinted.add(load)
  void load().catch(() => hinted.delete(load))
}
