import { readCart } from './cart-storage'
import { readFavorites } from './favorites-storage'
import { isRemoteCatalog } from './catalog-source'
import {
  readStorefrontMetadata,
  storefrontRepository,
} from './storefront-repository'
import { readRemoteProductsByIds } from './remote-catalog-queries'
import { customerFavoritesService } from './customer-favorites-service'
import { authService } from './auth-service'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function loadSelectionProducts(
  kind: 'cart' | 'favorites',
  selectedIds?: string[],
) {
  if (!isRemoteCatalog) {
    await storefrontRepository.readSnapshot()
    return
  }
  const metadataReady = readStorefrontMetadata()
  const selectionReady = (async () => {
    let ids = selectedIds
    if (!ids) {
      // The favorites store owns its read error and retry state. Keep the page
      // mounted instead of turning a private-list failure into a route failure.
      if (kind === 'favorites')
        await customerFavoritesService.load().catch(() => {})
      const auth = authService.getSnapshot()
      const ownerId =
        auth.status === 'authenticated' && auth.session?.intent === 'account'
          ? auth.session.user.id
          : null
      if (kind === 'favorites' && ownerId) {
        const current = customerFavoritesService.getSnapshot()
        ids = current.ownerId === ownerId ? [...current.productIds] : []
      }
      try {
        ids ??=
          kind === 'cart'
            ? readCart().map((item) => item.variantId)
            : readFavorites()
      } catch {
        ids = []
      }
    }
    const unique = [...new Set(ids)]
      .filter((value) => uuid.test(value))
      .slice(0, 500)
    for (let offset = 0; offset < unique.length; offset += 100) {
      const selected = unique.slice(offset, offset + 100)
      await readRemoteProductsByIds(
        kind === 'favorites' ? selected : [],
        kind === 'cart' ? selected : [],
      )
    }
  })()
  await Promise.all([metadataReady, selectionReady])
}
