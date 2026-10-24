import type { Page } from '@playwright/test'

/** Local browser fixture only: never creates a commercial product remotely. */
export async function seedAccessory(page: Page) {
  await page.goto('/admin/productos')
  return page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, createAdminProductDetail, hydrateAdminStore } =
      await import(module)
    await hydrateAdminStore()
    const product = {
      id: 'accessory-test',
      slug: 'complemento-de-prueba',
      name: 'Complemento de prueba',
      productType: 'complemento',
      brandId: '',
      family: '',
      image: '/images/complementos-provisional.svg',
      variants: [
        {
          id: 'accessory-black',
          ml: null,
          label: 'Negro',
          priceCents: 8000,
          stock: 4,
        },
        {
          id: 'accessory-gold',
          ml: null,
          label: 'Dorado',
          priceCents: 10000,
          stock: 2,
        },
      ],
      discount: {
        active: true,
        type: 'percent',
        value: 10,
        startsAt: '',
        endsAt: '',
      },
    }
    const detail = createAdminProductDetail(
      product,
      'Producto provisional exclusivo de las pruebas; no es una oferta comercial.',
    )
    detail.gallery = [
      {
        image: product.image,
        alt: 'Ilustración provisional de prueba',
        framing: 'full',
      },
    ]
    const result = adminService.saveProduct({
      product,
      detail,
      gender: null,
      active: true,
      popularity: 999,
      newest: 1,
      lowStockThreshold: 2,
    })
    await adminService.flush()
    return result.kind
  })
}

/** Explicit opt-in for tests that exercise the accessory storefront. */
export async function setComplementsEnabled(page: Page, enabled: boolean) {
  await page.goto('/admin/home')
  return page.evaluate(async (complementsEnabled) => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(module)
    await hydrateAdminStore()
    const result = adminService.saveStoreFeatures({ complementsEnabled })
    await adminService.flush()
    return result.kind
  }, enabled)
}
