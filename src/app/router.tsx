import {
  createBrowserRouter,
  redirect,
  type LoaderFunctionArgs,
} from 'react-router'
import { StoreLayout } from '../components/layout/StoreLayout'
import { PendingPage } from '../pages/PendingPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { homeService } from '../services/home-service'
import { productLoader } from '../features/product/product-loader'
import { PageLoadingState } from '../components/ui/PageLoadingState'
import {
  adminDataLoader,
  requireAuthLoader,
} from '../features/auth/auth-loaders'
import { loadAdminCommerceSettings } from '../services/commerce-settings-service'
import { RequireAuth } from '../features/auth/RequireAuth'
import { loadSelectionProducts } from '../services/selection-catalog-service'
import { adminRouteModules } from '../features/admin/admin-route-modules'
import { publicRouteModules } from './public-route-modules'
import { isProductionEnvironment } from '../services/runtime-environment'
import {
  catalogLoader,
  brandsLoader,
} from '../features/catalog/catalog-loaders'

const loadCatalogPage = publicRouteModules.catalog

function adminLoader(
  key: keyof typeof import('./admin-route-loaders').adminLoaders,
) {
  return async (args: LoaderFunctionArgs) =>
    (await import('./admin-route-loaders')).adminLoaders[key](args)
}
// Shipping configuration is already part of the public runtime. Keep this
// shared loader synchronous at dispatch; only the catalog module is deferred.
const authorizeAndLoadCommerce = adminDataLoader(loadAdminCommerceSettings)
const adminPromotionsLoader = (args: LoaderFunctionArgs) =>
  new URL(args.request.url).searchParams.get('vista') === 'ofertas'
    ? adminLoader('offers')(args)
    : authorizeAndLoadCommerce(args)

let router: ReturnType<typeof createBrowserRouter> | undefined

/** Route code can preload from HTML without starting loaders before hydration. */
export function getRouter() {
  return (router ??= createBrowserRouter([
    {
      element: <StoreLayout />,
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: (
        <PageLoadingState pathname={window.location.pathname} />
      ),
      children: [
        ...(
          [
            'iniciar-sesion',
            'crear-cuenta',
            'recuperar-contrasena',
            'restablecer-contrasena',
          ] as const
        ).map((path, index) => ({
          path,
          lazy: async () => {
            if (index >= 2) {
              const { OfflineRecoveryPage } =
                await import('../features/auth/OfflineRecoveryPage')
              return { Component: OfflineRecoveryPage }
            }
            const { AuthPage } = await import('../features/auth/AuthPage')
            const view = (['login', 'register'] as const)[index]
            return { Component: () => <AuthPage view={view} /> }
          },
        })),
        {
          path: 'auth/callback',
          lazy: async () => {
            const { AuthCallbackPage } =
              await import('../features/auth/AuthPage')
            return { Component: AuthCallbackPage }
          },
        },
        {
          path: 'fuente',
          loader: () => (isProductionEnvironment ? redirect('/') : null),
          lazy: async () => {
            const module = await import('../pages/FontPreviewPage')
            return { Component: module.FontPreviewPage }
          },
        },
        {
          index: true,
          loader: () => homeService.getHome(),
          lazy: publicRouteModules.home,
        },
        { path: 'tienda', loader: catalogLoader, lazy: loadCatalogPage },
        {
          path: 'catalogo',
          loader: ({ request }) => {
            const url = new URL(request.url)
            return redirect(`/tienda${url.search}${url.hash}`)
          },
        },
        { path: 'buscar', loader: catalogLoader, lazy: loadCatalogPage },
        {
          path: 'marcas',
          loader: brandsLoader,
          lazy: publicRouteModules.brands,
        },
        { path: 'marcas/:slug', loader: catalogLoader, lazy: loadCatalogPage },
        {
          path: 'producto/:slug',
          loader: productLoader,
          lazy: publicRouteModules.product,
        },
        {
          path: 'favoritos',
          loader: () => loadSelectionProducts('favorites').then(() => null),
          lazy: async () => {
            const module = await import('../features/favorites/FavoritesPage')
            return { Component: module.FavoritesPage }
          },
        },
        {
          path: 'carrito',
          loader: () => loadSelectionProducts('cart').then(() => null),
          lazy: publicRouteModules.cart,
        },
        {
          path: 'checkout',
          loader: () => loadSelectionProducts('cart').then(() => null),
          lazy: publicRouteModules.checkout,
        },
        {
          path: 'checkout/confirmacion',
          lazy: async () => {
            const module =
              await import('../features/checkout/CheckoutConfirmationPage')
            return { Component: module.CheckoutConfirmationPage }
          },
        },
        {
          path: 'seguir-pedido',
          lazy: async () => {
            const module =
              await import('../features/checkout/OrderTrackingPage')
            return { Component: module.OrderTrackingPage }
          },
        },
        {
          path: 'nosotros',
          lazy: async () => {
            const module = await import('../features/institutional/AboutPage')
            return { Component: module.AboutPage }
          },
        },
        {
          path: 'contacto',
          lazy: async () => {
            const module = await import('../features/institutional/ContactPage')
            return { Component: module.ContactPage }
          },
        },
        {
          path: 'envios',
          lazy: async () => {
            const module =
              await import('../features/institutional/InstitutionalPages')
            return { Component: module.ShippingPage }
          },
        },
        {
          path: 'devoluciones',
          lazy: async () => {
            const module =
              await import('../features/institutional/InstitutionalPages')
            return { Component: module.ReturnsPage }
          },
        },
        {
          path: 'privacidad',
          lazy: async () => {
            const module =
              await import('../features/institutional/InstitutionalPages')
            return { Component: module.PrivacyPage }
          },
        },
        {
          path: 'terminos',
          lazy: async () => {
            const module =
              await import('../features/institutional/InstitutionalPages')
            return { Component: module.TermsPage }
          },
        },
        {
          path: 'libro-de-reclamaciones',
          lazy: async () => {
            const module =
              await import('../features/institutional/ComplaintsPage')
            return { Component: module.ComplaintsPage }
          },
        },
        {
          path: 'cuenta',
          loader: requireAuthLoader('customer'),
          lazy: async () => {
            const module = await import('../features/account/AccountLayout')
            return {
              Component: () => (
                <RequireAuth audience="customer">
                  <module.AccountLayout />
                </RequireAuth>
              ),
            }
          },
          children: [
            {
              index: true,
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountOverviewPage }
              },
            },
            {
              path: 'datos',
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountDataPage }
              },
            },
            {
              path: 'direcciones',
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountAddressesPage }
              },
            },
            {
              path: 'pedidos',
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountOrdersPage }
              },
            },
            {
              path: 'pedidos/:reference',
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountOrderDetailPage }
              },
            },
            {
              path: 'pagos',
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountPaymentsPage }
              },
            },
            {
              path: 'favoritos',
              loader: () => loadSelectionProducts('favorites').then(() => null),
              lazy: async () => {
                const module = await import('../features/account/AccountPages')
                return { Component: module.AccountFavoritesPage }
              },
            },
          ],
        },
        { path: '*', Component: PendingPage },
      ],
    },
    ...(['admin/login', 'admin/recuperar', 'admin/restablecer'] as const).map(
      (path, index) => ({
        path,
        errorElement: <RouteErrorPage />,
        hydrateFallbackElement: (
          <PageLoadingState pathname={window.location.pathname} />
        ),
        lazy: async () => {
          if (index > 0) {
            const { OfflineRecoveryPage } =
              await import('../features/auth/OfflineRecoveryPage')
            return { Component: () => <OfflineRecoveryPage audience="admin" /> }
          }
          const { AuthPage } = await import('../features/auth/AuthPage')
          return {
            Component: () => <AuthPage audience="admin" view="login" />,
          }
        },
      }),
    ),
    {
      path: 'admin',
      // Authenticate the shell without downloading unrelated private datasets.
      // Each workspace loads the complete records it actually consumes below.
      loader: requireAuthLoader('admin'),
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: (
        <PageLoadingState pathname={window.location.pathname} />
      ),
      lazy: async () => {
        const module = await import('../features/admin/AdminLayout')
        return {
          Component: () => (
            <RequireAuth audience="admin">
              <module.AdminLayout />
            </RequireAuth>
          ),
        }
      },
      children: [
        {
          index: true,
          loader: adminLoader('dashboard'),
          lazy: async () => {
            const module = await adminRouteModules.dashboard()
            return { Component: module.AdminDashboardPage }
          },
        },
        {
          // A launch URL inside the installed /admin/ scope, without a redirect.
          path: 'resumen',
          loader: adminLoader('dashboard'),
          lazy: async () => {
            const module = await adminRouteModules.dashboard()
            return { Component: module.AdminDashboardPage }
          },
        },
        {
          path: 'productos',
          loader: adminLoader('productList'),
          lazy: async () => {
            const module = await adminRouteModules.products()
            return { Component: module.AdminProductsPage }
          },
        },
        {
          path: 'productos/nuevo',
          loader: adminLoader('productEditor'),
          lazy: async () => {
            const module = await adminRouteModules.productForm()
            return { Component: module.AdminProductFormPage }
          },
        },
        {
          path: 'productos/:id/fotos',
          loader: adminLoader('productEditor'),
          lazy: async () => {
            const module = await adminRouteModules.productPhotos()
            return { Component: module.AdminProductPhotoPage }
          },
        },
        {
          path: 'productos/:id',
          loader: adminLoader('productEditor'),
          lazy: async () => {
            const module = await adminRouteModules.productForm()
            return { Component: module.AdminProductFormPage }
          },
        },
        {
          path: 'familias-olfativas',
          loader: adminLoader('catalogList'),
          lazy: async () => {
            const module = await adminRouteModules.families()
            return { Component: module.AdminOlfactoryFamilies }
          },
        },
        {
          path: 'notificaciones',
          lazy: async () => {
            const module = await adminRouteModules.notifications()
            return { Component: module.AdminNotificationsPage }
          },
        },
        {
          path: 'marcas',
          loader: adminLoader('catalogList'),
          lazy: async () => {
            const module = await adminRouteModules.brands()
            return { Component: module.AdminBrandsPage }
          },
        },
        {
          path: 'pedidos',
          loader: adminLoader('orderList'),
          lazy: async () => {
            const module = await adminRouteModules.orders()
            return { Component: module.AdminOrdersPage }
          },
        },
        {
          path: 'pedidos/:reference',
          loader: adminLoader('orderDetail'),
          lazy: async () => {
            const module = await adminRouteModules.orderDetail()
            return { Component: module.AdminOrderDetailPage }
          },
        },
        {
          path: 'clientes',
          loader: adminLoader('customers'),
          lazy: async () => {
            const module = await adminRouteModules.customers()
            return { Component: module.AdminCustomersPage }
          },
        },
        {
          path: 'promociones',
          loader: adminPromotionsLoader,
          lazy: async () => {
            const module = await adminRouteModules.promotions()
            return { Component: module.AdminPromotionsPage }
          },
        },
        {
          path: 'envios',
          loader: authorizeAndLoadCommerce,
          lazy: async () => {
            const module = await adminRouteModules.shipping()
            return { Component: module.AdminShippingPage }
          },
        },
        {
          path: 'home',
          loader: adminLoader('home'),
          lazy: async () => {
            const module = await adminRouteModules.home()
            return { Component: module.AdminHomePage }
          },
        },
        {
          path: 'configuracion',
          lazy: async () => {
            const module = await adminRouteModules.settings()
            return { Component: module.AdminSiteSettings }
          },
        },
        {
          path: 'reclamaciones',
          lazy: async () => {
            const module = await adminRouteModules.complaints()
            return { Component: module.AdminComplaints }
          },
        },
      ],
    },
  ]))
}
