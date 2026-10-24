import { expect, test } from '@playwright/test'

const routes = [
  { path: '/contacto', title: 'Contacto', slug: 'contact' },
  { path: '/seguir-pedido', title: 'Seguir pedido', slug: 'tracking' },
  { path: '/envios', title: 'Envíos y entregas', slug: 'shipping' },
] as const

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

for (const viewport of viewports) {
  test(`Páginas de servicio alineadas y legibles · ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text())
    })
    const headingSizes: number[] = []
    const headingLefts: number[] = []

    for (const route of routes) {
      await page.goto(route.path)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await expect(page.locator('main h1')).toHaveText(route.title)
      await expect(
        page.locator(
          'main nav[aria-label="Ruta de navegación"] [aria-current="page"]',
        ),
      ).toHaveText(route.title)

      const geometry = await page.evaluate(() => {
        const heading = document.querySelector<HTMLElement>('main h1')
        const breadcrumb = document.querySelector<HTMLElement>(
          'main nav[aria-label="Ruta de navegación"]',
        )
        const footerContainer = document.querySelector<HTMLElement>(
          '.site-footer .container',
        )
        const section = document.querySelector<HTMLElement>(
          'main .contact-layout, main .tracking-entry, main .delivery-heading',
        )
        if (!heading || !breadcrumb || !footerContainer || !section) return null
        const h = heading.getBoundingClientRect()
        const b = breadcrumb.getBoundingClientRect()
        const f = footerContainer.getBoundingClientRect()
        const s = section.getBoundingClientRect()
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          headingWithinViewport: h.left >= -1 && h.right <= innerWidth + 1,
          breadcrumbBeforeHeading: b.bottom <= h.top,
          headingLeft: h.left,
          breadcrumbLeft: b.left,
          sectionLeft: s.left,
          containerLeft: f.left,
          headingSize: parseFloat(getComputedStyle(heading).fontSize),
          headingWeight: getComputedStyle(heading).fontWeight,
        }
      })
      expect(geometry, route.path).not.toBeNull()
      expect(geometry!.overflow, route.path).toBe(false)
      expect(geometry!.headingWithinViewport, route.path).toBe(true)
      expect(geometry!.breadcrumbBeforeHeading, route.path).toBe(true)
      expect(geometry!.headingSize, route.path).toBeGreaterThanOrEqual(35)
      expect(geometry!.headingSize, route.path).toBeLessThanOrEqual(55)
      expect(geometry!.headingWeight, route.path).toBe('600')
      expect(
        Math.abs(geometry!.headingLeft - geometry!.containerLeft),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(geometry!.breadcrumbLeft - geometry!.containerLeft),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(geometry!.sectionLeft - geometry!.containerLeft),
      ).toBeLessThanOrEqual(1)
      headingSizes.push(geometry!.headingSize)
      headingLefts.push(geometry!.headingLeft)

      if (route.slug === 'contact') {
        const description = await page
          .locator('.contact-copy > p:not(.eyebrow)')
          .first()
          .boundingBox()
        const action = await page
          .locator('.contact-actions .button')
          .boundingBox()
        expect(description).not.toBeNull()
        expect(action).not.toBeNull()
        expect(action!.y).toBeGreaterThan(description!.y + description!.height)
        expect(action!.y - description!.y - description!.height).toBeLessThan(
          40,
        )
      }

      if (route.slug === 'tracking') {
        const description = await page
          .locator('.tracking-heading > p:last-child')
          .boundingBox()
        const form = await page.locator('.tracking-search').boundingBox()
        expect(description).not.toBeNull()
        expect(form).not.toBeNull()
        expect(form!.y).toBeGreaterThan(description!.y + description!.height)
      }

      if (route.slug === 'shipping') {
        const coverage = await page.locator('.delivery-coverage').boundingBox()
        const modalities = await page
          .locator('.delivery-table thead')
          .first()
          .boundingBox()
        const rates = await page.locator('.delivery-options').boundingBox()
        const next = await page.locator('.delivery-help').boundingBox()
        expect(coverage).not.toBeNull()
        expect(modalities).not.toBeNull()
        expect(rates).not.toBeNull()
        expect(next).not.toBeNull()
        expect(modalities!.y).toBeGreaterThan(coverage!.y + coverage!.height)
        expect(next!.y).toBeGreaterThan(rates!.y + rates!.height)
      }

      await page.screenshot({
        path: `artifacts/service-composition/after/${route.slug}-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
    expect(
      Math.max(...headingSizes) - Math.min(...headingSizes),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.max(...headingLefts) - Math.min(...headingLefts),
    ).toBeLessThanOrEqual(1)
    expect(pageErrors).toEqual([])
  })
}

test('Acciones y nombres coinciden entre páginas, menú y footer', async ({
  page,
}) => {
  await page.goto('/contacto')
  await expect(
    page.getByRole('link', { name: 'Escribir por WhatsApp' }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\//)
  await expect(page.locator('main a[href="/seguir-pedido"]')).toHaveText(
    /Seguir pedido/,
  )
  await expect(page.locator('main a[href="/envios"]')).toHaveText(
    /Envíos y entregas/,
  )

  await page.goto('/seguir-pedido')
  const trackingInput = page.getByLabel('Código de pedido')
  await trackingInput.focus()
  await trackingInput.press('Tab')
  await expect(page.getByRole('button', { name: 'Consultar' })).toBeFocused()
  await trackingInput.fill('AI-INEXISTENTE')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByRole('status').last()).toContainText(
    'No encontramos ese pedido en este navegador',
  )

  await page.goto('/envios')
  await expect(page.locator('.delivery-coverage')).toContainText(
    'Lima y Callao',
  )
  await expect(page.locator('.delivery-free')).toContainText('S/ 450')
  await expect(
    page.locator('.delivery-help a[href="/seguir-pedido"]'),
  ).toHaveText(/Seguir pedido/)

  for (const label of ['Contacto', 'Seguir pedido', 'Envíos y entregas']) {
    await expect(
      page.locator('.site-footer').getByRole('link', { name: label }),
    ).toHaveCount(1)
  }

  await page.setViewportSize({ width: 1366, height: 768 })
  await page.locator('#nav-trigger-aroma-infini').click()
  for (const label of ['Contacto', 'Seguir pedido', 'Envíos y entregas']) {
    await expect(
      page
        .locator('#nav-panel-aroma-infini')
        .getByRole('link', { name: label }),
    ).toBeVisible()
  }

  await page.screenshot({
    path: 'artifacts/three-pages/after/navigation-desktop-1366.png',
    animations: 'disabled',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page
    .locator('#mobile-navigation')
    .getByRole('button', { name: 'Aroma Infini' })
    .click()
  for (const label of ['Contacto', 'Seguir pedido', 'Envíos y entregas']) {
    await expect(
      page
        .locator('#mobile-group-aroma-infini')
        .getByRole('link', { name: label }),
    ).toBeVisible()
  }
  await page.screenshot({
    path: 'artifacts/three-pages/after/navigation-mobile-390.png',
    animations: 'disabled',
  })
})

for (const viewport of [viewports[0], viewports[4]]) {
  test(`Seguimiento encontrado y no encontrado · ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      localStorage.setItem(
        'aroma-infini:order-tracking:v1',
        JSON.stringify([
          {
            reference: 'AI-0000000000000001',
            placedAt: '2026-10-21T10:00:00.000Z',
            status: 'preparing',
            mode: 'guest',
          },
        ]),
      )
    })
    await page.goto('/seguir-pedido?codigo=AI-0000000000000001')
    await expect(page.locator('.tracking-result')).toContainText(
      'en preparación',
    )
    await page.screenshot({
      path: `artifacts/three-pages/after/tracking-found-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })

    await page.getByLabel('Código de pedido').fill('AI-0000000000000000')
    await page.getByRole('button', { name: 'Consultar' }).click()
    await expect(page.locator('.tracking-not-found')).toBeVisible()
    await page.screenshot({
      path: `artifacts/three-pages/after/tracking-not-found-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
}
