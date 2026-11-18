import type { Page } from '@playwright/test'

interface CatalogRefreshCount {
  started: number
  completed: number
  revalidation: string
}

declare global {
  interface Window {
    catalogRefreshCount: () => CatalogRefreshCount
  }
}

/** Count the actual route loader even when its RPC reuses a fresh public DTO. */
export async function installCatalogRefreshCounter(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/app/router.tsx'
    const { getRouter } = (await import(path)) as typeof import('../src/app/router')
    const router = getRouter()
    const route = router.routes
      .flatMap((entry) => entry.children ?? [])
      .find((entry) => entry.path === 'tienda')
    const loader = route?.loader
    if (!route || typeof loader !== 'function')
      throw new Error('The mounted catalog route has no loader')
    let started = 0
    let completed = 0
    route.loader = async (args) => {
      started++
      try {
        return await loader(args)
      } finally {
        completed++
      }
    }
    window.catalogRefreshCount = () => ({
      started,
      completed,
      revalidation: router.state.revalidation,
    })
  })
}

export async function catalogRefreshCount(page: Page) {
  return page.evaluate(() =>
    window.catalogRefreshCount(),
  )
}

/** Let the resulting render and its passive effects commit before counting. */
export async function settleCatalogRefreshRender(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}
