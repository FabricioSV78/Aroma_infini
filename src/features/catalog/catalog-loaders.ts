import type { LoaderFunctionArgs } from 'react-router'
import {
  catalogService,
  readCatalogQuery,
} from '../../services/catalog-service'
export async function catalogLoader({ request, params }: LoaderFunctionArgs) {
  try {
    const brands = await catalogService.getBrands()
    const query = readCatalogQuery(new URL(request.url).searchParams, brands)
    const brand = params.slug
      ? brands.find((item) => item.slug === params.slug)
      : undefined
    if (params.slug && !brand) return { kind: 'missing' as const, query }
    const scopedQuery = brand ? { ...query, brands: [brand.slug] } : query
    const result = await catalogService.getCatalog(scopedQuery)
    return { kind: 'ready' as const, query: scopedQuery, brand, ...result }
  } catch {
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
