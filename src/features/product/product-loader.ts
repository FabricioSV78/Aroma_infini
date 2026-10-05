import type { LoaderFunctionArgs } from 'react-router'
import { catalogService } from '../../services/catalog-service'
import { hydrateAdminStore } from '../../services/admin-service'

export async function productLoader({ params }: LoaderFunctionArgs) {
  await hydrateAdminStore()
  try {
    const result = await catalogService.getProduct(params.slug ?? '')
    return result
      ? { kind: 'ready' as const, ...result }
      : { kind: 'missing' as const }
  } catch {
    return { kind: 'error' as const }
  }
}
