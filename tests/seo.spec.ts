import { expect, test } from '@playwright/test'
import { resolveSeoPage } from '../src/seo/seo-config'

test('La política SEO distingue páginas públicas, facetas y recorridos privados', () => {
  expect(resolveSeoPage('/', '').indexable).toBe(true)
  expect(resolveSeoPage('/catalogo', '').indexable).toBe(true)
  expect(resolveSeoPage('/catalogo', '?genero=unisex').indexable).toBe(false)
  expect(resolveSeoPage('/catalogo', '?marca=forme')).toMatchObject({
    indexable: true,
    canonicalPath: '/catalogo?marca=forme',
  })
  expect(resolveSeoPage('/producto/petale-nu', '').type).toBe('product')
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

test('Catálogo, ficha y utilidades actualizan SEO sin duplicar etiquetas', async ({
  page,
}) => {
  await page.goto('/catalogo?genero=unisex&orden=precio-asc')
  await expect(page).toHaveTitle('Perfumes de autor | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173/catalogo',
  )
  await page.goto('/producto/petale-nu')
  await expect(page).toHaveTitle('Pétale Nu de FORME | Aroma Infini')
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
  await expect(page).toHaveTitle('Checkout de demostración | Aroma Infini')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
  )
})
