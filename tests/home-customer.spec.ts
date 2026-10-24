import { expect, test } from '@playwright/test'

const additionalProducts = [
  'Cèdre Lumière',
  'Rose Satin',
  'Thé Sauvage',
  'Bergamote Soleil',
  'Fleur de Soie',
  'Figue Blanche',
  'Santal Épure',
  'Bois de Brume',
]

for (const width of [390, 1440]) {
  test(`Recorrido desde Home a categorías, marcas y selección a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const destinations = [
      {
        section: '#descubrir',
        href: '/tienda?genero=hombre',
        products: ['Bois Clair'],
      },
      {
        section: '#descubrir',
        href: '/tienda?genero=mujer',
        products: ['Pétale Nu'],
      },
      {
        section: '#descubrir',
        href: '/tienda?genero=unisex',
        products: [
          'Vert Silence',
          'Néroli Matin',
          'Iris Velours',
          'Figue Douce',
          'Santal Nuit',
          ...additionalProducts,
        ],
      },
      {
        section: '#marcas',
        href: '/tienda?marca=atelier-01',
        products: [
          'Bois Clair',
          'Néroli Matin',
          'Cèdre Lumière',
          'Bergamote Soleil',
          'Bois de Brume',
        ],
      },
      {
        section: '#marcas',
        href: '/tienda?marca=forme',
        products: ['Pétale Nu', 'Iris Velours', 'Rose Satin', 'Fleur de Soie'],
      },
      {
        section: '#marcas',
        href: '/tienda?marca=studio-sillage',
        products: [
          'Vert Silence',
          'Figue Douce',
          'Thé Sauvage',
          'Figue Blanche',
        ],
      },
      {
        section: '#marcas',
        href: '/tienda?marca=matiere-04',
        products: ['Santal Nuit', 'Santal Épure'],
      },
      {
        section: '.editorial-film',
        href: '/tienda',
        products: [
          'Bois Clair',
          'Pétale Nu',
          'Vert Silence',
          'Néroli Matin',
          'Iris Velours',
          'Figue Douce',
          'Santal Nuit',
          ...additionalProducts,
        ],
      },
      {
        section: '#mas-vendidos',
        href: '/tienda?orden=mas-vendidos',
        products: [
          'Bois Clair',
          'Pétale Nu',
          'Vert Silence',
          'Néroli Matin',
          'Iris Velours',
          'Figue Douce',
          'Santal Nuit',
          ...additionalProducts,
        ],
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
        Math.min(12, destination.products.length),
      )
      const names = await page
        .locator('.product-card h2, .product-card h3')
        .allTextContents()
      for (
        let nextPage = 2;
        nextPage <= Math.ceil(destination.products.length / 12);
        nextPage++
      ) {
        await page
          .getByRole('link', { name: `Página ${nextPage}`, exact: true })
          .click()
        await expect(
          page.getByRole('link', { name: `Página ${nextPage}`, exact: true }),
        ).toHaveAttribute('aria-current', 'page')
        await expect(page.locator('.product-card')).toHaveCount(
          Math.min(12, destination.products.length - (nextPage - 1) * 12),
        )
        names.push(
          ...(await page
            .locator('.product-card h2, .product-card h3')
            .allTextContents()),
        )
      }
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
