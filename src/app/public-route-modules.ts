/** Public code only: these functions do not execute loaders or fetch records. */
export const publicRouteModules = {
  home: async () => {
    const module = await import('../features/home/HomePage')
    return { Component: module.HomePage }
  },
  catalog: async () => {
    const module = await import('../features/catalog/CatalogPage')
    return { Component: module.CatalogPage }
  },
  product: async () => {
    const module = await import('../features/product/ProductPage')
    return { Component: module.ProductPage }
  },
  brands: async () => {
    const module = await import('../features/catalog/BrandsPage')
    return { Component: module.BrandsPage }
  },
  cart: async () => {
    const module = await import('../features/cart/CartPage')
    return { Component: module.CartPage }
  },
  checkout: async () => {
    const module = await import('../features/checkout/CheckoutPage')
    return { Component: module.CheckoutPage }
  },
}

const hinted = new Set<() => Promise<unknown>>()
export function preloadPublicRoute(path: string) {
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
  const load =
    path === '/'
      ? publicRouteModules.home
      : /^\/(tienda|buscar)$/.test(path) ||
          /^\/marcas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
        ? publicRouteModules.catalog
        : /^\/producto\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
          ? publicRouteModules.product
          : path === '/marcas'
            ? publicRouteModules.brands
            : path === '/carrito'
              ? publicRouteModules.cart
              : path === '/checkout'
                ? publicRouteModules.checkout
                : undefined
  if (!load || hinted.has(load)) return
  hinted.add(load)
  void load().catch(() => hinted.delete(load))
}
