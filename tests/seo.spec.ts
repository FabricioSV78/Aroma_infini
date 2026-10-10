import { expect, test } from '@playwright/test'
import { resolveSeoPage } from '../src/seo/seo-config'
import { catalogService } from '../src/services/catalog-service'

test('Una foto local de administración no se anuncia como imagen pública para compartir', async () => {
  const record = await catalogService.getProduct('petale-nu')
  expect(record).toBeDefined()
  if (!record) return
  const config = resolveSeoPage('/producto/petale-nu', '', {
    kind: 'ready',
    product: {
      ...record.product,
      image: 'data:image/webp;base64,AA==',
    },
    detail: record.detail,
    brand: record.brand,
  })
  expect(config.imagePath).toBeUndefined()
  expect(config.product?.imagePath).toBeUndefined()

  const remoteConfig = resolveSeoPage('/producto/petale-nu', '', {
    kind: 'ready',
    product: {
      ...record.product,
      image: 'https://cdn.example.com/petale.webp',
    },
    detail: record.detail,
    brand: record.brand,
  })
  expect(remoteConfig.imagePath).toBe('https://cdn.example.com/petale.webp')

  const brandConfig = resolveSeoPage('/marcas/forme', '', {
    kind: 'ready',
    brand: record.brand,
    items: [record.product],
  })
  expect(brandConfig.imagePath).toBe('/images/petale-960.webp')
})
import { brands, products } from '../src/mocks/home'
import { getProductDetail } from '../src/mocks/product-details'

test('La política SEO distingue páginas públicas, facetas y recorridos privados', () => {
  expect(resolveSeoPage('/', '').indexable).toBe(true)
  expect(resolveSeoPage('/tienda', '').indexable).toBe(true)
  expect(resolveSeoPage('/tienda', '?genero=unisex').indexable).toBe(false)
  expect(resolveSeoPage('/tienda', '?marca=forme', { brands })).toMatchObject({
    indexable: false,
    canonicalPath: '/marcas/forme',
  })
  expect(
    resolveSeoPage('/marcas/forme', '', { brand: brands[1] }),
  ).toMatchObject({ indexable: true, canonicalPath: '/marcas/forme' })
  expect(
    resolveSeoPage('/producto/petale-nu', '', {
      product: products[1],
      detail: getProductDetail(products[1]),
      brand: brands[1],
    }).type,
  ).toBe('product')
  expect(
    resolveSeoPage('/producto/petale-nu', '?presentacion=50', {
      product: products[1],
      detail: getProductDetail(products[1]),
      brand: brands[1],
    }).indexable,
  ).toBe(false)
  expect(resolveSeoPage('/buscar', '?q=petale').indexable).toBe(false)
  expect(resolveSeoPage('/checkout', '').follow).toBe(false)
  expect(resolveSeoPage('/ruta-inexistente', '').canonicalPath).toBeNull()
})

test('Home publica metadatos únicos y datos estructurados seguros', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Aroma Infini | Perfumería de autor en Perú')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /propuesta peruana de perfumería de autor/,
  )
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173/',
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /hero-v2-lumiere-desktop-1536\.webp$/,
  )
  const schema = await page
    .locator('script[type="application/ld+json"]')
    .textContent()
  expect(schema).toContain('Organization')
  expect(schema).toContain('WebSite')
  expect(schema).not.toContain('Product')
})

test('Tienda, ficha y utilidades actualizan SEO sin duplicar etiquetas', async ({
  page,
}) => {
  await page.goto('/tienda?genero=unisex&orden=precio-asc')
  await expect(page).toHaveTitle('Perfumes de autor | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173/tienda',
  )
  await page.goto('/producto/petale-nu')
  await expect(page).toHaveTitle('Pétale Nu de Forme | Aroma Infini')
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    'content',
    'product',
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  const schema = await page
    .locator('script[type="application/ld+json"]')
    .textContent()
  expect(schema).toContain('BreadcrumbList')
  expect(schema).not.toContain('"@type":"Product"')

  await page.goto('/checkout')
  await expect(page).toHaveTitle('Tu selección | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
  )
})

test('La página de marca tiene canonical limpio y una marca inválida queda fuera del índice', async ({
  page,
}) => {
  await page.goto('/marcas/forme')
  await expect(page).toHaveTitle('Forme: perfumes | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173/marcas/forme',
  )
  await page.goto('/marcas/inexistente')
  await expect(page).toHaveTitle('Página no encontrada | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
})
