import type { LoaderFunctionArgs } from 'react-router'
import { adminDataLoader } from '../features/auth/auth-loaders'
import {
  loadAdminCatalog,
  loadAdminCatalogContext,
  loadAdminHome,
  loadAdminProductEditor,
  readAdminProductList,
  readAdminInventoryDashboard,
  readAdminOfferList,
} from '../services/catalog-admin-service'
import { loadAdminCommerceSettings } from '../services/commerce-settings-service'
import { loadAdminOrders, loadAdminOrdersByReferences, readAdminOrderList, readAdminCustomerList, readAdminOrdersDashboard } from '../services/order-admin-service'
import { isRemoteCatalog } from '../services/catalog-source'
import { adminListPage, adminOrderListQuery, adminProductListQuery } from '../domain/admin-list-query'

function queryLoader<T>(read: (args: LoaderFunctionArgs) => Promise<T>) {
  return async (args: LoaderFunctionArgs) => {
    let result: T | undefined
    await adminDataLoader(async () => { result = await read(args) })(args)
    return result
  }
}

// Loaded only by an administrative route. Keep the same authorization and
// confirmed-owner snapshot rules; importing code never grants access.
const catalog = adminDataLoader(loadAdminCatalog)
export const adminLoaders = {
  catalog,
  productList: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? queryLoader(({request}) => {
      const params = new URL(request.url).searchParams
      return readAdminProductList(adminProductListQuery(params), adminListPage(params), window.matchMedia('(max-width: 767px)').matches ? 4 : 12)
    })(args) : catalog(args),
  productEditor: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? adminDataLoader(() => loadAdminProductEditor(args.params.id))(args) : catalog(args),
  orderList: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? queryLoader(({request}) => {
      const params = new URL(request.url).searchParams
      return readAdminOrderList(adminOrderListQuery(params), adminListPage(params))
    })(args) : adminDataLoader(loadAdminOrders)(args),
  customers: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? queryLoader(({request}) => {
      const params = new URL(request.url).searchParams
      return readAdminCustomerList((params.get('q') ?? '').slice(0, 200), adminListPage(params))
    })(args) : adminDataLoader(loadAdminOrders)(args),
  catalogList: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? adminDataLoader(loadAdminCatalogContext)(args) : catalog(args),
  offers: (args: LoaderFunctionArgs) => isRemoteCatalog
    ? queryLoader(async () => {
      const vocabularyReady = loadAdminCatalogContext()
      const [, offers] = await Promise.all([vocabularyReady, readAdminOfferList(1, 12, vocabularyReady)])
      return offers
    })(args) : catalog(args),
  home: adminDataLoader(loadAdminHome),
  orders: adminDataLoader(loadAdminOrders),
  dashboard: (args: LoaderFunctionArgs) => isRemoteCatalog ? queryLoader(async () => {
    const [inventory, orders] = await Promise.all([readAdminInventoryDashboard(), readAdminOrdersDashboard()])
    if (inventory.ownerId !== orders.ownerId) throw new Error('La sesión administrativa cambió.')
    return { ...inventory, ...orders }
  })(args) : adminDataLoader(async () => {
    await Promise.all([loadAdminCatalog(), loadAdminOrders()])
  })(args),
  orderDetail: (args: LoaderFunctionArgs) => adminDataLoader(async () => {
    await Promise.all([isRemoteCatalog ? loadAdminOrdersByReferences([args.params.reference!]) : loadAdminOrders(), loadAdminCommerceSettings()])
  })(args),
}
