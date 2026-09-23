import { createBrowserRouter } from 'react-router'
import { StoreLayout } from '../components/layout/StoreLayout'
import { HomePage } from '../features/home/HomePage'
import { PendingPage } from '../pages/PendingPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { homeService } from '../services/home-service'
import { CatalogPage } from '../features/catalog/CatalogPage'
import { BrandsPage } from '../features/catalog/BrandsPage'
import { ProductPage } from '../features/product/ProductPage'
import { productLoader } from '../features/product/product-loader'
import { FavoritesPage } from '../features/favorites/FavoritesPage'
import { CartPage } from '../features/cart/CartPage'
import { CheckoutPage } from '../features/checkout/CheckoutPage'
import { CheckoutConfirmationPage } from '../features/checkout/CheckoutConfirmationPage'
import { OrderTrackingPage } from '../features/checkout/OrderTrackingPage'
import {
  brandCatalogRedirectLoader,
  catalogLoader,
  brandsLoader,
} from '../features/catalog/catalog-loaders'

export const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: (
      <p className="container" role="status">
        Preparando la selección…
      </p>
    ),
    children: [
      {
        index: true,
        loader: () => homeService.getHome(),
        Component: HomePage,
        hydrateFallbackElement: (
          <p className="container">Preparando la selección…</p>
        ),
      },
      { path: 'catalogo', loader: catalogLoader, Component: CatalogPage },
      { path: 'buscar', loader: catalogLoader, Component: CatalogPage },
      { path: 'marcas', loader: brandsLoader, Component: BrandsPage },
      { path: 'marcas/:slug', loader: brandCatalogRedirectLoader },
      {
        path: 'producto/:slug',
        loader: productLoader,
        Component: ProductPage,
      },
      { path: 'favoritos', Component: FavoritesPage },
      { path: 'carrito', Component: CartPage },
      { path: 'checkout', Component: CheckoutPage },
      { path: 'checkout/confirmacion', Component: CheckoutConfirmationPage },
      { path: 'seguir-pedido', Component: OrderTrackingPage },
      {
        path: 'nosotros',
        lazy: async () => {
          const module =
            await import('../features/institutional/InstitutionalPages')
          return { Component: module.AboutPage }
        },
      },
      {
        path: 'contacto',
        lazy: async () => {
          const module =
            await import('../features/institutional/InstitutionalPages')
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
        path: 'preguntas-frecuentes',
        lazy: async () => {
          const module =
            await import('../features/institutional/InstitutionalPages')
          return { Component: module.FaqPage }
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
            await import('../features/institutional/InstitutionalPages')
          return { Component: module.ComplaintsBookPage }
        },
      },
      {
        path: 'cuenta',
        lazy: async () => {
          const module = await import('../features/account/AccountLayout')
          return { Component: module.AccountLayout }
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
        ],
      },
      { path: '*', Component: PendingPage },
    ],
  },
  {
    path: 'admin',
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: (
      <p className="admin-demo-banner" role="status">
        Preparando el panel de demostración…
      </p>
    ),
    lazy: async () => {
      const module = await import('../features/admin/AdminLayout')
      return { Component: module.AdminLayout }
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const module = await import('../features/admin/AdminDashboardPage')
          return { Component: module.AdminDashboardPage }
        },
      },
      {
        path: 'productos',
        lazy: async () => {
          const module = await import('../features/admin/AdminProducts')
          return { Component: module.AdminProductsPage }
        },
      },
      {
        path: 'productos/nuevo',
        lazy: async () => {
          const module = await import('../features/admin/AdminProducts')
          return { Component: module.AdminProductFormPage }
        },
      },
      {
        path: 'productos/:id',
        lazy: async () => {
          const module = await import('../features/admin/AdminProducts')
          return { Component: module.AdminProductFormPage }
        },
      },
      {
        path: 'marcas',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminBrandsPage }
        },
      },
      {
        path: 'pedidos',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminOrdersPage }
        },
      },
      {
        path: 'pedidos/:reference',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminOrderDetailPage }
        },
      },
      {
        path: 'clientes',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminCustomersPage }
        },
      },
      {
        path: 'promociones',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminPromotionsPage }
        },
      },
      {
        path: 'envios',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminShippingPage }
        },
      },
      {
        path: 'home',
        lazy: async () => {
          const module = await import('../features/admin/AdminOperations')
          return { Component: module.AdminHomePage }
        },
      },
    ],
  },
])
