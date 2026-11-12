import type { BrowserContext } from '@playwright/test'

/** Hold real SDK responses after a first page without replacing the transport. */
export async function installAdminPageBatchGate(
  context: BrowserContext,
  origin: string,
  name: 'admin_catalog_page' | 'admin_orders',
) {
  const started: number[] = []
  const pending = new Map<number, () => void>()
  const denied = new Set<number>()
  let active = 0
  let peak = 0
  let released = false
  await context.route(`${origin}/rest/v1/rpc/${name}`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fallback()
      return
    }
    const offset = Number(route.request().postDataJSON().p_offset ?? 0)
    started.push(offset)
    if (offset > 0 && !released) {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => pending.set(offset, resolve))
      pending.delete(offset)
      active--
    }
    if (denied.has(offset)) {
      await route.fulfill({
        status: 403,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        },
        json: { code: '42501', message: 'Isolated revoked administrator' },
      })
      return
    }
    await route.fallback()
  })
  return {
    started,
    peak: () => peak,
    deny: (offset: number) => denied.add(offset),
    release: (offset: number) => pending.get(offset)?.(),
    releaseAll() {
      released = true
      pending.forEach((resolve) => resolve())
    },
  }
}
