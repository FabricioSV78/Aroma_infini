import { expect, test, type Page } from '@playwright/test'

async function openQuiz(page: Page) {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: '¿Qué aroma te atrae más?' }),
  ).toBeVisible()
  return page.getByRole('dialog', { name: 'Encuentra tu perfume ideal' })
}
async function choose(page: Page, name: string | RegExp, last = false) {
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole(last ? 'radio' : 'checkbox', {
      name,
      exact: typeof name === 'string',
    })
    .check()
  await dialog
    .getByRole('button', {
      name: last ? 'Ver mis perfumes' : 'Continuar',
      exact: true,
    })
    .click()
}

test('La primera elección del Home inicia el cuestionario y conserva el aroma', async ({
  page,
}) => {
  await page.goto('/')
  const section = page.locator('#encuentra-tu-perfume')
  await expect(section.locator('.finder-entry-question > span')).toHaveText(
    '1/4 · Tu primera elección',
  )
  await expect(
    section.getByRole('heading', { name: '¿Qué aroma te atrae?' }),
  ).toBeVisible()
  const choice = section.getByRole('button', {
    name: 'Elegir Floral y añadir otros aromas',
  })
  await choice.click()
  const dialog = page.getByRole('dialog', {
    name: 'Encuentra tu perfume ideal',
  })
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '1')
  await expect(
    dialog.getByRole('heading', { name: '¿Qué aroma te atrae más?' }),
  ).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: /Floral/ })).toBeChecked()
  await dialog.getByRole('checkbox', { name: /Amaderado/ }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '2')
  await dialog.getByRole('button', { name: 'Anterior' }).click()
  await expect(dialog.getByRole('checkbox', { name: /Floral/ })).toBeChecked()
  await expect(
    dialog.getByRole('checkbox', { name: /Amaderado/ }),
  ).toBeChecked()
  await dialog.getByRole('checkbox', { name: /Amaderado/ }).uncheck()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await choose(page, 'Diario')
  await choose(page, 'Suave')
  await choose(page, 'Hasta S/ 500', true)
  await expect(dialog.getByRole('heading', { name: 'Pétale Nu' })).toBeVisible()
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({
    path: 'artifacts/fragrance-finder/petale-result.png',
  })
  await page.keyboard.press('Escape')
  await expect(choice).toBeFocused()
})

test('El cliente combina varios aromas, momentos e intensidades y puede cambiar su selección', async ({
  page,
}) => {
  const dialog = await openQuiz(page)
  const amaderado = dialog.getByRole('checkbox', { name: /Amaderado/ })
  const floral = dialog.getByRole('checkbox', { name: /Floral/ })
  await amaderado.check()
  await floral.check()
  await expect(amaderado).toBeChecked()
  await expect(floral).toBeChecked()
  await expect(dialog.getByText('2 seleccionadas')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: 'artifacts/fragrance-finder/multiple-options-mobile.png',
  })
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({
    path: 'artifacts/fragrance-finder/multiple-options-desktop.png',
  })
  await dialog.getByRole('checkbox', { name: 'Sin preferencia' }).check()
  await expect(amaderado).not.toBeChecked()
  await expect(floral).not.toBeChecked()
  await amaderado.check()
  await floral.check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()

  await dialog.getByRole('checkbox', { name: 'Diario' }).check()
  await dialog.getByRole('checkbox', { name: 'Noche' }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Suave' }).check()
  await dialog.getByRole('checkbox', { name: 'Moderada' }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('radio', { name: 'Sin límite de presupuesto' }).check()
  await dialog.getByRole('button', { name: 'Ver mis perfumes' }).click()

  await expect(
    dialog.getByRole('heading', { name: 'Perfumes que encajan contigo' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Bois Clair' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Bois de Brume' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Cèdre Lumière' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cambiar respuestas' }).click()
  await expect(amaderado).toBeChecked()
  await expect(floral).toBeChecked()
})

test('Keyboard, progress, previous answers, restart and direct product navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const dialog = await openQuiz(page)
  await expect(
    page.locator(
      '[data-home-section="bestsellers"] + [data-home-section="perfume-finder"] + [data-home-section="brands"]',
    ),
  ).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  const first = dialog.getByRole('checkbox', { name: /Amaderado/ })
  await first.focus()
  await page.keyboard.press('Space')
  await expect(first).toBeChecked()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '2')
  await dialog.getByRole('button', { name: 'Anterior' }).click()
  await expect(first).toBeChecked()
  await dialog.getByRole('button', { name: 'Reiniciar', exact: true }).click()
  await expect(first).not.toBeChecked()
  await choose(page, /Amaderado/)
  await choose(page, 'Diario')
  await choose(page, 'Moderada')
  await choose(page, 'Hasta S/ 400', true)
  await expect(
    dialog.getByRole('heading', { name: 'Perfumes que encajan contigo' }),
  ).toBeFocused()
  await expect(
    dialog.getByRole('heading', { name: 'Bois Clair' }),
  ).toBeVisible()
  await expect(dialog.getByText('50 ml · Disponible')).toHaveCount(3)
  const link = dialog
    .getByRole('link', { name: 'Ver perfume', exact: true })
    .first()
  await expect(link).toHaveAttribute('href', /\/producto\//)
  await link.click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bois Clair' }),
  ).toBeVisible()
})

test('Escape restores focus and the modal contains keyboard navigation', async ({
  page,
}) => {
  const dialog = await openQuiz(page)
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true })
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Reiniciar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Encontrar mi perfume', exact: true }),
  ).toBeFocused()
})

test('No preferences, no matches and partial matches are explained honestly', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const dialog = await openQuiz(page)
  await choose(page, 'Sin preferencia')
  await choose(page, 'Sin preferencia')
  await choose(page, 'Sin preferencia')
  await choose(page, 'Sin límite de presupuesto', true)
  await expect(
    dialog.getByRole('heading', { name: 'Danos una pista para empezar' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: 'Ver perfume', exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cambiar respuestas' }).click()
  await choose(page, /Floral/)
  await choose(page, 'Noche')
  await choose(page, 'Intensa')
  await choose(page, 'Hasta S/ 400', true)
  await expect(
    dialog.getByRole('heading', {
      name: 'Todavía no encontramos esa combinación',
    }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cambiar respuestas' }).click()
  await choose(page, /Floral/)
  await choose(page, 'Noche')
  await choose(page, 'Intensa')
  await choose(page, 'Hasta S/ 500', true)
  await expect(
    dialog.getByRole('heading', { name: 'Cerca de lo que buscas' }),
  ).toBeVisible()
  await expect(dialog.getByText('Ten en cuenta', { exact: true })).toHaveCount(
    0,
  )
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({
    path: 'artifacts/fragrance-finder/partial-result-desktop.png',
  })
  await dialog.getByRole('button', { name: 'Cambiar respuestas' }).click()
  await choose(page, 'Sin preferencia')
  await choose(page, 'Sin preferencia')
  await choose(page, 'Sin preferencia')
  await choose(page, 'Hasta S/ 500', true)
  await expect(
    dialog.getByRole('heading', { name: 'Dentro de tu presupuesto' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: 'Ver perfume', exact: true }),
  ).toHaveCount(3)
  await page.screenshot({
    path: 'artifacts/fragrance-finder/budget-result-desktop.png',
  })
})

test('Catalog error is recoverable and empty stock has a useful state', async ({
  page,
}) => {
  let broken = true
  await page.route(
    /\/src\/services\/fragrance-finder-service\.ts(?:\?.*)?$/,
    async (route) => {
      if (broken)
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'export const fragranceFinderService = {getOptions: async () => {throw new Error("offline")}, recommend: async () => {throw new Error("offline")}}',
        })
      else
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'export const fragranceFinderService = {getOptions: async () => ({families:[],occasions:[],intensities:[],availableCount:0})}',
        })
    },
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Tus respuestas se conservan',
  )
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(
    page.getByRole('heading', { name: 'No pudimos consultar el catálogo' }),
  ).toBeFocused()
  broken = false
  await page.reload()
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'No hay perfumes disponibles ahora' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Explorar todos los perfumes' }),
  ).toBeVisible()
})

test('The quiz works with touch input', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173')
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .tap()
  await page.getByRole('checkbox', { name: /Floral/ }).tap()
  await page.getByRole('button', { name: 'Continuar', exact: true }).tap()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).tap()
  await context.close()
})

test('Delayed data exposes a loading state before an empty catalog', async ({
  page,
}) => {
  await page.route(
    /\/src\/services\/fragrance-finder-service\.ts(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export const fragranceFinderService = { getOptions: () => new Promise(resolve => setTimeout(() => resolve({families:[],occasions:[],intensities:[],availableCount:0}), 800)) }',
      }),
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText(
    'Preparando tu recorrido',
  )
  await expect(
    page.getByRole('heading', { name: 'No hay perfumes disponibles ahora' }),
  ).toBeVisible()
})

for (const [device, width, height] of [
  ['desktop', 1920, 1080],
  ['laptop', 1366, 768],
  ['tablet', 820, 1180],
  ['tablet-narrow', 720, 1024],
  ['mobile', 390, 844],
  ['mobile-small', 320, 568],
] as const) {
  test(`Visual and interaction check: ${device}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const section = page.locator('#encuentra-tu-perfume')
    await section.scrollIntoViewIfNeeded()
    await section
      .locator('img')
      .evaluateAll(async (images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      )
    await page.evaluate(() => document.fonts.ready)
    await section.screenshot({
      path: `artifacts/fragrance-finder/${device}-home.png`,
    })
    await page
      .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('checkbox', { name: /Amaderado/ }).waitFor()
    await dialog
      .locator('img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      )
    await page.screenshot({
      path: `artifacts/fragrance-finder/${device}-question.png`,
    })
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await choose(page, /Amaderado/)
    await choose(page, 'Diario')
    await choose(page, 'Moderada')
    await choose(page, 'Hasta S/ 400', true)
    await expect(
      dialog.getByRole('heading', { name: 'Bois Clair' }),
    ).toBeVisible()
    await dialog
      .locator('img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      )
    await page.screenshot({
      path: `artifacts/fragrance-finder/${device}-result.png`,
    })
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await dialog
      .getByRole('link', { name: 'Ver perfume', exact: true })
      .first()
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bois Clair' }),
    ).toBeVisible()
  })
}
