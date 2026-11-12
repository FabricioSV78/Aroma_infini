import { expect, test } from './test'

test('un diálogo ocupado bloquea Escape y fondo y recupera el foco al terminar', async ({
  page,
}) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await page.evaluate(async () => {
    const fixturePath = '/tests/dialog-interactions.fixture.ts'
    const { mountBusyDialogFixture } = (await import(
      fixturePath
    )) as typeof import('./dialog-interactions.fixture')
    mountBusyDialogFixture()
  })
  const dialog = page.getByRole('dialog', { name: 'Operación en curso' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Cerrar', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Finalizar operación' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Abrir diálogo de prueba' }),
  ).toBeFocused()
})
