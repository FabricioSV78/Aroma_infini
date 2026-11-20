import { expect, test } from './test'

test('el reloj renueva las recomendaciones cotizadas sin mover el foco ni ocultar resultados y conserva los errores', async ({
  page,
}) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await page.evaluate(async () => {
    const path = '/tests/finder-price-refresh.fixture.ts'
    const fixture = (await import(
      path
    )) as typeof import('./finder-price-refresh.fixture')
    fixture.mountFinderPriceFixture()
  })
  const dialog = page.getByRole('dialog', {
    name: 'Encuentra tu perfume ideal',
  })
  for (let step = 0; step < 4; step++) {
    await dialog
      .getByRole(step === 3 ? 'radio' : 'checkbox')
      .last()
      .check()
    await dialog
      .getByRole('button', {
        name: step === 3 ? 'Ver mis perfumes' : 'Continuar',
        exact: true,
      })
      .click()
  }
  const price = dialog.locator('.finder-price')
  await expect(price).toContainText('100')
  const link = dialog.getByRole('link', { name: 'Ver perfume', exact: true })
  await link.focus()
  await page.evaluate(async () => {
    const path = '/tests/finder-price-refresh.fixture.ts'
    const fixture = (await import(
      path
    )) as typeof import('./finder-price-refresh.fixture')
    fixture.refreshFinderClock()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/tests/finder-price-refresh.fixture.ts'
        return (
          (await import(
            path
          )) as typeof import('./finder-price-refresh.fixture')
        ).finderReadCount()
      }),
    )
    .toBe(2)
  await expect(price).toContainText('100')
  await expect(link).toBeFocused()
  await page.evaluate(async () => {
    const path = '/tests/finder-price-refresh.fixture.ts'
    ;(
      (await import(path)) as typeof import('./finder-price-refresh.fixture')
    ).completeFinderRefresh()
  })
  await expect(price).toContainText('200')
  await expect(link).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/tests/finder-price-refresh.fixture.ts'
        return (
          (await import(
            path
          )) as typeof import('./finder-price-refresh.fixture')
        ).finderReadCount()
      }),
    )
    .toBe(2)
  await page.evaluate(async () => {
    const path = '/tests/finder-price-refresh.fixture.ts'
    ;(
      (await import(path)) as typeof import('./finder-price-refresh.fixture')
    ).refreshFinderClock()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/tests/finder-price-refresh.fixture.ts'
        return (
          (await import(
            path
          )) as typeof import('./finder-price-refresh.fixture')
        ).finderReadCount()
      }),
    )
    .toBe(3)
  await page.evaluate(async () => {
    const path = '/tests/finder-price-refresh.fixture.ts'
    ;(
      (await import(path)) as typeof import('./finder-price-refresh.fixture')
    ).completeFinderRefresh(true)
  })
  await expect(dialog.locator('.finder-results')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /intentar/i })).toBeVisible()
})
