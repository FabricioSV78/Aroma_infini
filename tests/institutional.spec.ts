import { expect, test } from '@playwright/test'

const institutionalRoutes = [
  ['/nosotros', 'El perfume se descubre a tu manera.'],
  ['/contacto', '¿En qué podemos ayudarte?'],
  ['/envios', 'Tu pedido, de principio a fin.'],
  ['/devoluciones', 'Cambios y devoluciones.'],
  ['/privacidad', 'Privacidad.'],
  ['/terminos', 'Términos y condiciones.'],
  ['/libro-de-reclamaciones', 'Libro de reclamaciones.'],
] as const

test('Las rutas institucionales tienen contenido propio y contacto funcional', async ({
  page,
}) => {
  for (const [path, heading] of institutionalRoutes) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page.getByText('Página en preparación')).toHaveCount(0)
    await expect(page.locator('main')).toBeVisible()
  }

  await page.goto('/contacto')
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0)
  await expect(page.locator('main h2')).toHaveCount(2)
  const whatsappLink = page.getByRole('link', {
    name: 'Escribir por WhatsApp',
  })
  await expect(whatsappLink).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/[1-9]\d{7,14}$/,
  )
  await expect(whatsappLink).toHaveAttribute('target', '_blank')

  for (const path of [
    '/tienda',
    '/seguir-pedido',
    '/envios',
  ]) {
    await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1)
  }

  await page.goto('/nosotros')
  await expect(page.locator('main h2')).toHaveCount(1)
  await expect(page.locator('.institutional-about-principles li')).toHaveCount(
    3,
  )
  await expect(
    page.locator('.institutional-about-visual img'),
  ).toHaveJSProperty('complete', true)
  await expect(page.locator('main a[href="/tienda"]')).toHaveCount(1)

  await page.goto('/libro-de-reclamaciones')
  await expect(page.getByRole('link', { name: 'Escríbenos' })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
})

for (const width of [390, 1440]) {
  test(`Nosotros y contacto ${width}px: fuente y títulos moderados`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })

    for (const path of ['/nosotros', '/contacto']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page.locator('main h2').first()).toBeVisible()
      await page.evaluate(() => document.fonts.ready.then(() => true))

      const typography = await page.evaluate(() => {
        const h1 = document.querySelector<HTMLElement>('main h1')
        const h2 = document.querySelector<HTMLElement>('main h2')
        if (!h1 || !h2) return null
        const bodyStyle = getComputedStyle(document.body)
        const h1Style = getComputedStyle(h1)
        const h2Style = getComputedStyle(h2)
        return {
          bodyFont: bodyStyle.fontFamily,
          h1Font: h1Style.fontFamily,
          h2Font: h2Style.fontFamily,
          h1Size: parseFloat(h1Style.fontSize),
          h2Size: parseFloat(h2Style.fontSize),
          fontLoaded: document.fonts.check('400 16px "IBM Plex Sans"'),
        }
      })

      expect(typography, path).not.toBeNull()
      expect(typography!.fontLoaded, path).toBe(true)
      expect(typography!.h1Font, path).toBe(typography!.bodyFont)
      expect(typography!.h2Font, path).toBe(typography!.bodyFont)
      expect(typography!.h1Size, path).toBeLessThanOrEqual(52)
      expect(typography!.h1Size, path).toBeGreaterThanOrEqual(32)
      expect(typography!.h2Size, path).toBeLessThanOrEqual(34)
      expect(typography!.h2Size, path).toBeLessThan(typography!.h1Size)
    }
  })
}

test('La sección de preguntas frecuentes ya no aparece en la navegación ni en contacto', async ({
  page,
}) => {
  await page.goto('/contacto')
  await expect(page.locator('a[href="/preguntas-frecuentes"]')).toHaveCount(0)
  await expect(page.getByText('Preguntas frecuentes')).toHaveCount(0)

  await page.goto('/preguntas-frecuentes')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Página no encontrada',
  )
})

for (const width of [
  320, 360, 375, 390, 430, 640, 768, 1024, 1280, 1440, 1920,
]) {
  test(`Nosotros y contacto ${width}px: sin overflow, errores ni imágenes rotas`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })

    for (const path of ['/nosotros', '/contacto']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('main h1')).toHaveCount(1)

      const geometry = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('.site-header')
        const breadcrumb = document.querySelector<HTMLElement>(
          'nav[aria-label="Ruta de navegación"]',
        )
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          spacing:
            header && breadcrumb
              ? breadcrumb.getBoundingClientRect().top -
                header.getBoundingClientRect().bottom
              : Number.NaN,
        }
      })
      expect(geometry.overflow, path).toBe(false)
      expect(geometry.spacing, path).toBeCloseTo(24, 0)

      await expect
        .poll(() =>
          page
            .locator('img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  !(image instanceof HTMLImageElement) ||
                  image.naturalWidth > 0,
              ),
            ),
        )
        .toBe(true)

      if (path === '/nosotros') {
        const imageSource = await page
          .locator('.institutional-about-visual img')
          .evaluate((image) => (image as HTMLImageElement).currentSrc)
        expect(imageSource.includes('-mobile-'), path).toBe(width < 768)
      }
    }
    expect(errors).toEqual([])
  })
}
