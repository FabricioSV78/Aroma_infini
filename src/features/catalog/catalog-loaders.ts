import { redirect, type LoaderFunctionArgs } from 'react-router'
import {
  catalogService,
  readCatalogQuery,
} from '../../services/catalog-service'
import { hydrateAdminStore } from '../../services/admin-service'
export async function catalogLoader({ request, params }: LoaderFunctionArgs) {
  await hydrateAdminStore()
  const query = readCatalogQuery(new URL(request.url).searchParams)
  try {
    const brands = await catalogService.getBrands()
    const brand = params.slug
      ? brands.find((item) => item.slug === params.slug)
      : undefined
    if (params.slug && !brand) return { kind: 'missing' as const, query }
    const scopedQuery = brand ? { ...query, brands: [brand.slug] } : query
    const result = await catalogService.getCatalog(scopedQuery)
    return { kind: 'ready' as const, query: scopedQuery, brand, ...result }
  } catch {
    return { kind: 'error' as const, query }
  }
}
export async function brandsLoader() {
  await hydrateAdminStore()
  try {
    return { kind: 'ready' as const, brands: await catalogService.getBrands() }
  } catch {
    return { kind: 'error' as const }
  }
}

export async function brandCatalogRedirectLoader({
  params,
}: LoaderFunctionArgs) {
  await hydrateAdminStore()
  try {
    const brand = (await catalogService.getBrands()).find(
      (item) => item.slug === params.slug,
    )
    if (!brand) return redirect('/marcas')
    return redirect(`/tienda?marca=${encodeURIComponent(brand.slug)}`)
  } catch {
    return redirect('/marcas')
  }
}
