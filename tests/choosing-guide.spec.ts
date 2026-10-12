import { expect, test } from '@playwright/test'
import { adminService } from '../src/services/admin-service'
import { homeService } from '../src/services/home-service'
import { choosingGuideEnabled } from '../src/content/choosing-guide'

test.afterEach(() => adminService.reset())

test('La guía refleja los cambios del panel y excluye productos retirados', async () => {
  const initial = (await homeService.getHome()).choosingGuideExample
  expect(initial).not.toBeNull()
  const record = adminService
    .getSnapshot()
    .products.find(({ product }) => product.slug === initial?.slug)!

  expect(
    adminService.saveProduct({
      ...record,
      product: { ...record.product, family: 'Perfil actualizado' },
      detail: {
        ...record.detail,
        intensity: 'Intensa',
        intensityLevel: 3,
        occasion: 'Momento actualizado',
      },
    }).kind,
  ).toBe('saved')
  expect((await homeService.getHome()).choosingGuideExample).toMatchObject({
    slug: record.product.slug,
    family: 'Perfil actualizado',
    intensity: 'Intensa',
    occasion: 'Momento actualizado',
  })

  expect(adminService.setProductActive(record.product.id, false).kind).toBe(
    'saved',
  )
  expect((await homeService.getHome()).choosingGuideExample?.slug).not.toBe(
    record.product.slug,
  )
})

test('Un catálogo sin perfiles completos no genera un ejemplo ficticio', async () => {
  for (const record of adminService.getSnapshot().products) {
    expect(
      adminService.saveProduct({
        ...record,
        detail: { ...record.detail, occasion: 'Por definir' },
      }).kind,
    ).toBe('saved')
  }
  expect((await homeService.getHome()).choosingGuideExample).toBeNull()
  for (const record of adminService.getSnapshot().products) {
    expect(adminService.setProductActive(record.product.id, false).kind).toBe(
      'saved',
    )
  }
  const home = await homeService.getHome()
  expect(home.bestsellers).toEqual([])
  expect(home.choosingGuideExample).toBeNull()
})

test('La guía se recorre con teclado y su ejemplo coincide con la ficha', async ({
  page,
}) => {
  test.skip(!choosingGuideEnabled, 'La guía está temporalmente oculta en el Home.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const guide = page.locator('#claves-para-elegir')
  await expect(
    page.locator(
      '[data-home-section="bestsellers"] + [data-home-section="choosing-guide"] + [data-home-section="brands"]',
    ),
  ).toHaveCount(1)

  const tabs = guide.getByRole('tab')
  const values: string[] = []
  for (let index = 0; index < 3; index++) {
    await tabs.nth(index).click()
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
    await expect(guide.getByRole('tabpanel')).toHaveCount(1)
    values.push(await guide.getByRole('tabpanel').locator('dd').innerText())
  }

  await tabs.first().focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tabs.last()).toBeFocused()
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(guide.getByRole('tabpanel')).toContainText(values[1])
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(guide.getByRole('tabpanel')).toBeFocused()

  const example = guide.getByRole('link', { name: /Ver ficha de/ })
  const target = await example.getAttribute('href')
  await example.click()
  await expect(page).toHaveURL(target!)
  await page
    .getByRole('button', { name: 'Familia olfativa', exact: true })
    .click()
  const profile = page.locator('.olfactory-profile-content')
  await expect(profile.getByRole('heading', { name: values[0] })).toBeVisible()
  await expect(profile.getByText(values[1], { exact: true })).toBeVisible()
  await expect(profile.getByText(values[2], { exact: true })).toBeVisible()
})

test('La acción de la guía móvil continúa al catálogo sin filtros añadidos', async ({
  page,
}) => {
  test.skip(!choosingGuideEnabled, 'La guía está temporalmente oculta en el Home.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const guide = page.locator('#claves-para-elegir')
  await guide.getByRole('tab', { name: 'Intensidad' }).click()
  await expect(guide.getByRole('tabpanel')).toContainText(
    'Decide qué presencia buscas',
  )
  await guide.getByRole('link', { name: 'Explorar perfumes' }).click()
  await expect(page).toHaveURL('/tienda')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
