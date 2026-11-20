import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { FragranceQuiz } from '../src/features/fragrance-finder/FragranceQuiz'
import { OfferPriceClockContext } from '../src/services/offer-price-clock'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import { getFinderOptions } from '../src/services/fragrance-matching'
import type { FinderResult } from '../src/types/fragrance-finder'

let update: (() => void) | undefined
let pending:
  | { resolve: (result: FinderResult) => void; reject: (error: Error) => void }
  | undefined
let calls = 0
function result(price: number): FinderResult {
  const snapshot = localStorefrontRepository.peekSnapshot()
  const record = snapshot.products.find(
    (record) => record.product.productType === 'perfume',
  )!
  const product = structuredClone(record.product)
  product.name = 'Perfume de prueba de reloj'
  const variant = {
    ...product.variants[0],
    priceCents: 39000,
    finalPriceCents: price,
  }
  product.variants = [variant]
  return {
    kind: 'matches',
    matches: [
      {
        product,
        brand: snapshot.brands.find((brand) => brand.id === product.brandId),
        variant,
        reasons: [],
        differences: [],
        score: 10,
        complete: true,
      },
    ],
  }
}
export function mountFinderPriceFixture() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let revision = 0
  calls = 0
  const content = localStorefrontRepository.peekSnapshot().content.finder
  const service = {
    async getOptions() {
      return getFinderOptions(localStorefrontRepository.peekSnapshot())
    },
    recommend() {
      calls++
      if (calls === 1) return Promise.resolve(result(10000))
      return new Promise<FinderResult>((resolve, reject) => {
        pending = { resolve, reject }
      })
    },
  }
  const render = () =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          OfferPriceClockContext.Provider,
          { value: revision },
          createElement(FragranceQuiz, {
            content,
            service,
            onClose: () => root.unmount(),
          }),
        ),
      ),
    )
  update = () => {
    revision++
    render()
  }
  render()
}
export function refreshFinderClock() {
  update?.()
}
export function completeFinderRefresh(fail = false) {
  if (!pending) throw new Error('No pending finder read')
  const operation = pending
  pending = undefined
  if (fail) operation.reject(new Error('Isolated finder refresh unavailable'))
  else operation.resolve(result(20000))
}
export function finderReadCount() {
  return calls
}
