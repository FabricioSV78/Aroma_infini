async function adminModule<T>(load: () => Promise<T>): Promise<T> {
  // Preserve the original base-before-page cascade even when React Router
  // resolves parent and child lazy routes concurrently.
  await import('../../styles/admin-workspace.css')
  return load()
}

/** Code-only imports shared by the router and sidebar intent hints.
 * These functions never run loaders, mount pages or request private records. */
export const adminRouteModules = {
  dashboard: () => adminModule(() => import('./AdminDashboardPage')),
  products: () => adminModule(() => import('./AdminProductsPage')),
  productForm: () => adminModule(() => import('./AdminProductFormPage')),
  productPhotos: () => adminModule(() => import('./AdminProductPhotoPage')),
  families: () => adminModule(() => import('./AdminOlfactoryFamilies')),
  notifications: () => adminModule(() => import('./AdminNotificationsPage')),
  brands: () => adminModule(() => import('./AdminBrandsPage')),
  orderDetail: () => adminModule(() => import('./AdminOrderDetailPage')),
  customers: () => adminModule(() => import('./AdminCustomersPage')),
  promotions: () => adminModule(() => import('./AdminPromotionsPage')),
  orders: () => adminModule(() => import('./AdminOrdersPage')),
  shipping: () => adminModule(() => import('./AdminShippingPage')),
  home: () => adminModule(() => import('./AdminHomePage')),
  settings: () => adminModule(() => import('./AdminSiteSettings')),
  complaints: () => adminModule(() => import('./AdminComplaints')),
} as const

const sidebarModules = {
  '/admin': adminRouteModules.dashboard,
  '/admin/productos': adminRouteModules.products,
  '/admin/marcas': adminRouteModules.brands,
  '/admin/familias-olfativas': adminRouteModules.families,
  '/admin/pedidos': adminRouteModules.orders,
  '/admin/clientes': adminRouteModules.customers,
  '/admin/promociones': adminRouteModules.promotions,
  '/admin/home': adminRouteModules.home,
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
