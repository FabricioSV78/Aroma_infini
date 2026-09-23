import { expect, test } from '@playwright/test'

const institutionalRoutes = [
  ['/nosotros', 'Un espacio para descubrir lo que te representa.'],
  ['/contacto', 'Tu elección puede empezar con una conversación.'],
  ['/envios', 'Lo esencial para recibir tu pedido.'],
  ['/devoluciones', 'Cambios y devoluciones.'],
  ['/preguntas-frecuentes', 'Respuestas breves para avanzar con claridad.'],
  ['/privacidad', 'Privacidad.'],
  ['/terminos', 'Términos y condiciones.'],
  ['/libro-de-reclamaciones', 'Libro de reclamaciones.'],
] as const

test('Las rutas institucionales tienen contenido propio y no inventan canales', async ({
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

  await page.goto('/libro-de-reclamaciones')
  await expect(page.getByText('Esta vista no registra reclamos.')).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
})

test('Preguntas frecuentes funciona con teclado y conserva foco visible', async ({
  page,
}) => {
  await page.goto('/preguntas-frecuentes')
  const question = page.getByText('¿Realizan envíos en Perú?')
  await question.focus()
  await expect(question).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText(/La demostración tiene cobertura configurada/),
  ).toBeVisible()
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Institucionales ${width}px: sin overflow, errores ni imágenes rotas`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(width < 768 ? '/nosotros' : '/privacidad')
    await expect(page.locator('main')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await expect
      .poll(() =>
        page
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                !(image instanceof HTMLImageElement) || image.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true)
    expect(errors).toEqual([])
  })
}
