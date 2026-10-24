import type { LoaderFunctionArgs } from 'react-router'
import { redirect } from 'react-router'
import { getStoreFeatures } from '../../services/admin-service'
import {
  catalogService,
  readCatalogQuery,
} from '../../services/catalog-service'
export async function catalogLoader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  if (url.searchParams.get('seleccion') === 'destacados') {
    url.searchParams.delete('seleccion')
    throw redirect(`${url.pathname}${url.search}`)
  }
  try {
    const brands = await catalogService.getBrands()
    if (
      !getStoreFeatures().complementsEnabled &&
      url.searchParams.has('tipo')
    ) {
      url.searchParams.delete('tipo')
      throw redirect(`${url.pathname}${url.search}`)
    }
    const query = readCatalogQuery(new URL(request.url).searchParams, brands)
    const brand = params.slug
      ? brands.find((item) => item.slug === params.slug)
      : undefined
    if (params.slug && !brand) return { kind: 'missing' as const, query }
    const scopedQuery = brand ? { ...query, brands: [brand.slug] } : query
    const result = await catalogService.getCatalog(scopedQuery)
    return { kind: 'ready' as const, query: scopedQuery, brand, ...result }
  } catch (error) {
    if (error instanceof Response) throw error
    return {
      kind: 'error' as const,
      query: readCatalogQuery(new URL(request.url).searchParams, []),
    }
  }
}
export async function brandsLoader() {
  try {
    return {
      kind: 'ready' as const,
      brands: await catalogService.getBrandPreviews(),
    }
  } catch {
    return { kind: 'error' as const }
  }
}
