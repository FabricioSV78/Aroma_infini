import { expect, test, type Locator } from '@playwright/test'

async function paint(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      border: style.borderColor,
      color: style.color,
      opacity: style.opacity,
      transform: style.transform,
      filter: style.filter,
    }
  })
}

async function expectVisibleFocus(control: Locator) {
  await expect(control).toBeFocused()
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const style = getComputedStyle(element)
        return (
          style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
        )
      }),
    )
    .toBe(true)
}

test('los botones públicos responden al hover y al pulsar sin cambiar de tamaño', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tienda')
  const apply = page.locator('.catalog-sidebar .button--primary')
  await apply.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const initial = await paint(apply)
  const size = await apply.boundingBox()
  await apply.hover()
  await expect.poll(() => paint(apply)).not.toEqual(initial)
  expect(await apply.boundingBox()).toEqual(size)
  await page.mouse.down()
  await expect
    .poll(async () => (await paint(apply)).filter)
    .toBe('brightness(0.94)')
  await page.mouse.up()
  await expect.poll(async () => (await paint(apply)).filter).toBe('none')
  await expect(page.locator('.catalog-results')).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await page.keyboard.press('Tab')
  await apply.focus()
  await expectVisibleFocus(apply)
})

test('quitar un filtro tiene feedback y mantiene funcional la selección', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tienda?marca=atelier-01')
  const chip = page.locator('.catalog-chips button:not(.catalog-clear)').first()
  await chip.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const initial = await paint(chip)
  await chip.hover()
  await expect.poll(() => paint(chip)).not.toEqual(initial)
  await chip.focus()
  await expectVisibleFocus(chip)
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/marca=/)
})

test('favoritos mantiene el corazón relleno al pasar el puntero y permite desmarcar por teclado', async ({
  page,
}) => {
  await page.goto('/tienda')
  const favorite = page.locator('.product-favorite').first()
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  const selectedFill = await favorite
    .locator('svg')
    .evaluate((svg) => getComputedStyle(svg).fill)
  expect(selectedFill).not.toBe('none')
  await favorite.hover()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  expect(
    await favorite.locator('svg').evaluate((svg) => getComputedStyle(svg).fill),
  ).not.toBe('none')
  await page.keyboard.press('Tab')
  await favorite.focus()
  await expectVisibleFocus(favorite)
  await page.keyboard.press('Space')
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
})

test('las opciones seleccionadas del Home se distinguen del hover y Guardar deshabilitado conserva su estado', async ({
  page,
}) => {
  await page.goto('/admin/home')
  const current = page.getByRole('button', {
    name: 'Carrusel principal',
    exact: true,
  })
  const alternative = page.getByRole('button', { name: 'Marcas', exact: true })
  const save = page.getByRole('button', {
    name: 'Guardar cambios del Home',
    exact: true,
  })
  await expect(current).toHaveAttribute('aria-pressed', 'true')
  const selected = await paint(current)
  await alternative.hover()
  await expect
    .poll(async () => (await paint(alternative)).background)
    .not.toBe('rgba(0, 0, 0, 0)')
  expect((await paint(alternative)).background).not.toBe(selected.background)
  await current.hover()
  await expect.poll(() => paint(current)).toEqual(selected)
  await expect(save).toBeDisabled()
  await save.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const disabled = await paint(save)
  await save.hover({ force: true })
  await expect.poll(() => paint(save)).toEqual(disabled)
  await save.evaluate((element) => {
    ;(element as HTMLButtonElement).focus()
  })
  await expect(save).not.toBeFocused()
})

test('las acciones de tabla comunican el hover sin hacer interactiva toda la fila', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/productos')
  const row = page.locator('.admin-table tbody tr').first()
  await row.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const staticPaint = await paint(row)
  await row.hover()
  await expect.poll(() => paint(row)).toEqual(staticPaint)
  const edit = row.getByRole('link', { name: /^Editar / })
  await edit.hover()
  await expect
    .poll(() =>
      edit.evaluate(
        (element) => getComputedStyle(element).textDecorationThickness,
      ),
    )
    .toBe('2px')
  await edit.focus()
  await expectVisibleFocus(edit)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/admin\/productos\/.+/)
})

test('subir fotos y reordenar imágenes conservan foco visible y respetan los botones deshabilitados', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const fileControl = page
    .locator('.admin-product-upload-item .admin-home-file-button')
    .first()
  const fileInput = fileControl.locator('input[type="file"]')
  await fileInput.focus()
  await expectVisibleFocus(fileControl.locator('input'))
  await expect
    .poll(() =>
      fileControl.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .toBe('solid')
  const firstPrevious = page
    .locator('.admin-product-photo-order')
    .first()
    .getByRole('button')
    .first()
  await expect(firstPrevious).toBeDisabled()
  await firstPrevious.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const disabled = await paint(firstPrevious)
  await firstPrevious.hover({ force: true })
  await expect.poll(() => paint(firstPrevious)).toEqual(disabled)
})

test('los enlaces de categorías, marcas y acordeones conservan un foco de teclado visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const category = page.locator('.category-grid > a').first()
  await category.focus()
  await expectVisibleFocus(category)
  await page.goto('/marcas')
  const brand = page.locator('.brands-directory > a').first()
  await brand.focus()
  await expectVisibleFocus(brand)
  await page.goto('/tienda')
  const summary = page.locator(
    '.catalog-sidebar [data-filter-group="family"] > summary',
  )
  await summary.focus()
  await expectVisibleFocus(summary)
  await page.keyboard.press('Enter')
  await expect(summary.locator('..')).not.toHaveAttribute('open', '')
})

test('móvil táctil: la selección permanece visible sin depender del hover', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/admin/home')
  expect(
    await page.evaluate(
      () => matchMedia('(hover: hover) and (pointer: fine)').matches,
    ),
  ).toBe(false)
  const alternative = page.getByRole('button', { name: 'Marcas', exact: true })
  await expect(alternative).toHaveAttribute('aria-pressed', 'false')
  await alternative.tap()
  await expect(alternative).toHaveAttribute('aria-pressed', 'true')
  const selected = await paint(alternative)
  expect(selected.background).not.toBe('rgba(0, 0, 0, 0)')
  const inactive = page.getByRole('button', {
    name: 'Carrusel principal',
    exact: true,
  })
  expect((await paint(inactive)).background).not.toBe(selected.background)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await context.close()
})

test('movimiento reducido: estados inmediatos y dimensiones estables en los controles', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/home')
  const button = page.getByRole('button', { name: 'Marcas', exact: true })
  const before = await button.boundingBox()
  await button.hover()
  const durations = await button.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  )
  expect(
    durations.split(',').every((duration) => parseFloat(duration) <= 0.01),
  ).toBe(true)
  expect(await button.boundingBox()).toEqual(before)
})
