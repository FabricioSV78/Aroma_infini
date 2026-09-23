import { expect, test } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`Recorrido desde Home a categorías, marcas y selección a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const destinations = [
      {
        section: '#descubrir',
        href: '/catalogo?genero=hombre',
        products: ['Bois Clair'],
      },
      {
        section: '#descubrir',
        href: '/catalogo?genero=mujer',
        products: ['Pétale Nu'],
      },
      {
        section: '#descubrir',
        href: '/catalogo?genero=unisex',
        products: ['Ambre Lent', 'Vert Silence'],
      },
      {
        section: '#marcas',
        href: '/catalogo?marca=atelier-01',
        products: ['Bois Clair'],
      },
      {
        section: '#marcas',
        href: '/catalogo?marca=forme',
        products: ['Pétale Nu'],
      },
      {
        section: '#marcas',
        href: '/catalogo?marca=studio-sillage',
        products: ['Vert Silence'],
      },
      {
        section: '#marcas',
        href: '/catalogo?marca=matiere-04',
        products: ['Ambre Lent'],
      },
      {
        section: '#marca-destacada',
        href: '/catalogo?marca=atelier-01',
        products: ['Bois Clair'],
      },
      {
        section: '#destacados',
        href: '/catalogo?seleccion=destacados',
        products: ['Bois Clair', 'Vert Silence'],
      },
      {
        section: '#mas-vendidos',
        href: '/catalogo?orden=mas-vendidos',
        products: ['Ambre Lent', 'Bois Clair', 'Pétale Nu', 'Vert Silence'],
      },
    ]
    for (const destination of destinations) {
      await page.goto('/')
      const link = page
        .locator(destination.section)
        .locator(`a[href="${destination.href}"]`)
        .first()
      await link.click()
      await expect(page).toHaveURL(destination.href)
      await expect(page.locator('main')).toBeFocused()
      await expect(page.locator('.product-card')).toHaveCount(
        destination.products.length,
      )
      const names = await page.locator('.product-card h3').allTextContents()
      expect(names.sort()).toEqual([...destination.products].sort())
      const breadcrumb = page
        .locator('main')
        .getByRole('link', { name: 'Inicio', exact: true })
      await breadcrumb.click()
      await expect(page).toHaveURL('/')
      await expect(page.locator('main')).toBeFocused()
    }
  })
}
