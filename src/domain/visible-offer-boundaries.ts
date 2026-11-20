import type { ProductDiscount } from '../types/catalog'

// Only future public timestamps of currently mounted result cards live here.
// No products, prices, stock, identities or authorization decisions are cached.
const scopes = new Map<symbol, readonly number[]>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function registerVisibleOfferBoundaries(
  discounts: readonly (ProductDiscount | null | undefined)[],
  now = Date.now(),
) {
  const values = [
    ...new Set(
      discounts.flatMap((discount) =>
        discount?.active
          ? [discount.startsAt, discount.endsAt]
              .filter(Boolean)
              .map((value) => Date.parse(value))
              .filter((value) => Number.isFinite(value) && value > now)
          : [],
      ),
    ),
  ]
  if (!values.length) return () => {}
  const scope = Symbol('visible-offer-boundaries')
  scopes.set(scope, values)
  notify()
  return () => {
    if (scopes.delete(scope)) notify()
  }
}

export function nextVisibleOfferBoundary(now = Date.now()): number | undefined {
  let next: number | undefined
  for (const values of scopes.values())
    for (const value of values)
      if (value > now && (next === undefined || value < next)) next = value
  return next
}

export function subscribeVisibleOfferBoundaries(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
