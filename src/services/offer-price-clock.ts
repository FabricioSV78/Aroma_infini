import { createContext, useContext } from 'react'

/** Notifies mounted price views when a scheduled offer starts or ends. */
export const OfferPriceClockContext = createContext(0)

export function useOfferPriceRevision() {
  return useContext(OfferPriceClockContext)
}
