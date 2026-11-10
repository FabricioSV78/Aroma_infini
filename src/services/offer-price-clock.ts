import { createContext, useContext, useSyncExternalStore } from 'react'
import { storefrontRepository } from './storefront-repository'

/** Notifies mounted price views when a scheduled offer starts or ends. */
export const OfferPriceClockContext = createContext(0)

/** The public cache includes only confirmed, publishable DTOs. */
export function useStorefrontSnapshot() {
  return useSyncExternalStore(
    storefrontRepository.subscribe,
    storefrontRepository.peekSnapshot,
    storefrontRepository.peekSnapshot,
  )
}

export function useOfferPriceRevision() {
  // Cart and checkout resolve their lines again whenever the public cache
  // changes, even if their route or browser-local selection did not change.
  useStorefrontSnapshot()
  return useContext(OfferPriceClockContext)
}
