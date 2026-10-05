import { test, expect } from '@playwright/test'

test('font selection applies globally, persists and restores', async ({
  page,
}) => {
  await page.goto('/fuente')
  for (const name of ['DM Sans', 'Manrope', 'Work Sans', 'Source Sans 3']) {
    await page.getByRole('radio', { name, exact: true }).check()
    await expect(page.getByRole('radio', { name, exact: true })).toBeChecked()
    await expect(page.locator('body')).toHaveCSS(
      'font-family',
      new RegExp(name),
    )
    expect(
      await page.evaluate(
        (family) => document.fonts.check(`400 16px "${family}"`),
        name,
      ),
    ).toBe(true)
  }
  await page.getByRole('link', { name: 'Explorar la tienda' }).click()
  await expect(page).toHaveURL(/\/tienda/)
  await page.reload()
  await expect(page.locator('body')).toHaveCSS('font-family', /Source Sans 3/)
  await page.goto('/fuente')
  await page.getByRole('button', { name: 'Restaurar fuente original' }).click()
  await expect(
    page.getByRole('radio', { name: 'IBM Plex Sans', exact: true }),
  ).toBeChecked()
  expect(
    await page.evaluate(() => localStorage.getItem('aroma-infini:font')),
  ).toBeNull()
  await page.getByRole('radio', { name: 'IBM Plex Sans', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.getByRole('radio', { name: 'DM Sans', exact: true }),
  ).toBeChecked()
})

for (const width of [320, 390, 768, 1440]) {
  test(`font preview layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/fuente')
    await page.getByRole('radio', { name: 'Manrope', exact: true }).check()
    await expect(
      page.getByRole('radio', { name: 'Manrope', exact: true }),
    ).toBeChecked()
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/font-preview-${width}.png`,
      fullPage: true,
    })
  })
}

test('invalid stored font falls back to original', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('aroma-infini:font', 'invalid'),
  )
  await page.goto('/fuente')
  await expect(
    page.getByRole('radio', { name: 'IBM Plex Sans', exact: true }),
  ).toBeChecked()
  await expect(page.locator('body')).toHaveCSS('font-family', /IBM Plex Sans/)
})
