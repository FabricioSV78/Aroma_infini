import { expect, test } from '@playwright/test'
import { footerGroups, navigationGroups } from '../src/content/navigation'

test('El footer conserva soporte, seguimiento e información legal', async ({
  page,
}) => {
  await page.goto('/')
  const footer = page.locator('.site-footer')
  const expected = [
    ...footerGroups.flatMap((group) => group.links),
    { label: 'Privacidad', to: '/privacidad' },
    { label: 'Términos y condiciones', to: '/terminos' },
    { label: 'Libro de reclamaciones', to: '/libro-de-reclamaciones' },
  ]

  for (const link of expected) {
    await expect(
      footer.getByRole('link', { name: link.label, exact: true }),
    ).toHaveAttribute('href', link.to)
  }
})

test('El navbar da acceso a las páginas públicas y las anclas existentes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const nav = page.getByRole('navigation', {
    name: 'Navegación principal',
    exact: true,
  })
  const destinations = new Set<string>()
  for (const group of navigationGroups) {
    const trigger = nav.getByRole('button', { name: group.label, exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = page.locator(`#nav-panel-${group.id}`)
    await expect(panel).toBeVisible()
    for (const href of await panel
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')!)))
      destinations.add(href)
    await page.keyboard.press('Tab')
    await expect(panel.locator('a').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
  }
  for (const href of await nav
    .locator(':scope > a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!)))
    destinations.add(href)
  const expected = [
    '/catalogo',
    '/marcas',
    '/#marca-destacada',
    '/#destacados',
    '/nosotros',
    '/contacto',
    '/seguir-pedido',
    '/envios',
  ]
  for (const href of expected) expect(destinations.has(href), href).toBe(true)
  for (const footerOnly of [
    '/devoluciones',
    '/preguntas-frecuentes',
    '/privacidad',
    '/terminos',
    '/libro-de-reclamaciones',
  ])
    expect(destinations.has(footerOnly), footerOnly).toBe(false)
  expect(destinations.has('/#resenas')).toBe(false)
  await expect(page.locator('#resenas')).toHaveCount(0)
  for (const href of destinations) {
    if (href.startsWith('/#'))
      await expect(page.locator(href.slice(1))).toHaveCount(1)
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('El menú desktop cierra fuera, al navegar y al cambiar de breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const trigger = page.locator('#nav-trigger-marcas')
  await trigger.click()
  await expect(page.locator('#nav-panel-marcas')).toBeVisible()
  await page.mouse.click(5, 850)
  await expect(page.locator('#nav-panel-marcas')).toBeHidden()
  await trigger.click()
  await page
    .locator('#nav-panel-marcas')
    .getByRole('link', { name: 'Todas las marcas', exact: true })
    .click()
  await expect(page).toHaveURL(/\/marcas$/)
  await expect(page.locator('main')).toBeFocused()
  await expect(page.locator('#nav-panel-marcas')).toBeHidden()
  await page.goBack()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#nav-panel-marcas')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(
    page.getByRole('dialog', { name: 'Explorar', exact: true }),
  ).not.toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('Móvil: todos los grupos, foco y anclas desde otra página', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/contacto')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  const dialog = page.getByRole('dialog', { name: 'Explorar', exact: true })
  const homeLink = dialog.locator('.mobile-home-link')
  expect((await homeLink.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  for (const group of navigationGroups) {
    const trigger = dialog.getByRole('button', {
      name: group.label,
      exact: true,
    })
    if ((await trigger.getAttribute('aria-expanded')) === 'false')
      await trigger.click()
    for (const link of group.columns.flatMap((column) => column.links)) {
      await expect(
        page
          .locator(`#mobile-group-${group.id}`)
          .getByRole('link', { name: link.label, exact: true }),
      ).toBeVisible()
    }
  }
  const aromaTrigger = dialog.getByRole('button', {
    name: 'Aroma Infini',
    exact: true,
  })
  if ((await aromaTrigger.getAttribute('aria-expanded')) === 'false')
    await aromaTrigger.click()
  for (const destination of [
    '/nosotros',
    '/contacto',
    '/seguir-pedido',
    '/envios',
  ])
    await expect(
      page
        .locator('#mobile-group-aroma-infini')
        .locator(`a[href="${destination}"]`),
    ).toBeVisible()
  const brandsTrigger = dialog.getByRole('button', {
    name: 'Marcas',
    exact: true,
  })
  if ((await brandsTrigger.getAttribute('aria-expanded')) === 'false')
    await brandsTrigger.click()
  await dialog
    .getByRole('link', { name: 'Marca destacada', exact: true })
    .click()
  await expect(page).toHaveURL(/\/#marca-destacada$/)
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#marca-destacada')).toBeFocused()
  await expect
    .poll(async () => (await page.locator('#marca-destacada').boundingBox())!.y)
    .toBeGreaterThanOrEqual(72)
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('Hover desktop permite recorrer el panel y cierra al abandonarlo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.locator('#nav-trigger-marcas').hover()
  const panel = page.locator('#nav-panel-marcas')
  await expect(panel).toBeVisible()
  await panel.getByRole('link', { name: 'FORME', exact: true }).hover()
  await expect(panel).toBeVisible()
  const aroma = page.locator('#nav-trigger-aroma-infini')
  await aroma.hover()
  await expect(panel).toBeHidden()
  const aromaPanel = page.locator('#nav-panel-aroma-infini')
  await expect(aromaPanel).toBeVisible()
  await aromaPanel.getByRole('link', { name: 'Nosotros', exact: true }).click()
  await expect(page).toHaveURL('/nosotros')
})

test('Los accesos del header responden sin mostrar cajas de fondo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/catalogo')
  const actions = page.locator('.header-actions .icon-button')
  await expect(actions).toHaveCount(4)
  for (const action of await actions.all()) {
    await action.hover()
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
})
