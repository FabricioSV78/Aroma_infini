import { expect, test } from '@playwright/test'
import { buildWhatsAppUrl } from '../src/utils/whatsapp'

test('El enlace de WhatsApp requiere destinatario y consulta válidos', () => {
  expect(
    buildWhatsAppUrl('+51 955-565-209', '  ¿Tienen Bois Clair? & gracias  '),
  ).toBe(
    'https://wa.me/51955565209?text=%C2%BFTienen%20Bois%20Clair%3F%20%26%20gracias',
  )
  expect(buildWhatsAppUrl('51955565209')).toBe('https://wa.me/51955565209')
  expect(buildWhatsAppUrl('51955565209', '  ')).toBeNull()
  expect(buildWhatsAppUrl(null, 'Hola')).toBeNull()
  expect(buildWhatsAppUrl('número pendiente', 'Hola')).toBeNull()
})

test('La ayuda permite redactar, conserva el borrador y se cierra con Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')

  const trigger = page.getByRole('button', { name: 'Abrir ayuda y contacto' })
  await trigger.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', {
    name: '¿En qué podemos ayudarte?',
  })
  const question = dialog.getByRole('textbox', { name: 'Tu consulta' })
  const submit = dialog.getByRole('button', { name: 'Enviar por WhatsApp' })
  await expect(dialog).toBeVisible()
  await expect(question).toBeFocused()
  await expect(submit).toBeDisabled()
  await expect(
    dialog.getByText(
      'Escribe tu duda y continúa la conversación por WhatsApp.',
    ),
  ).toHaveCount(0)
  await expect(
    dialog.getByText('WhatsApp abrirá tu mensaje listo para enviarlo.'),
  ).toHaveCount(0)
  expect(
    await page
      .locator('.help-button')
      .evaluate((button) => getComputedStyle(button).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('.help-button')).toHaveAttribute(
    'aria-expanded',
    'true',
  )

  await question.fill('¿Tienen Bois Clair?')
  await expect(submit).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Abrir ayuda y contacto' }),
  ).toBeFocused()

  await page.getByRole('button', { name: 'Abrir ayuda y contacto' }).click()
  await expect(question).toHaveValue('¿Tienen Bois Clair?')
  await dialog.getByRole('button', { name: 'Cerrar ayuda' }).click()
  await expect(dialog).toHaveCount(0)
})

test('La consulta abre WhatsApp con destinatario y texto codificado', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & { openedHelpUrl?: string }
    browserWindow.open = (url) => {
      browserWindow.openedHelpUrl = String(url)
      return null
    }
  })
  await page.goto('/contacto')
  await page.getByRole('button', { name: 'Abrir ayuda y contacto' }).click()
  const dialog = page.getByRole('dialog', {
    name: '¿En qué podemos ayudarte?',
  })
  await dialog
    .getByRole('textbox', { name: 'Tu consulta' })
    .fill('  ¿Tienen Bois Clair? & gracias  ')
  await dialog.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { openedHelpUrl?: string }).openedHelpUrl,
      ),
    )
    .toBe(
      'https://wa.me/51955565209?text=%C2%BFTienen%20Bois%20Clair%3F%20%26%20gracias',
    )
  await expect(
    dialog.getByRole('textbox', { name: 'Tu consulta' }),
  ).toHaveValue('  ¿Tienen Bois Clair? & gracias  ')
})

test('La ayuda abre en checkout y su enlace adicional lleva a contacto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/checkout?demo=1')
  const trigger = page.getByRole('button', { name: 'Abrir ayuda y contacto' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  const dialog = page.getByRole('dialog', {
    name: '¿En qué podemos ayudarte?',
  })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('link', { name: 'Más opciones de ayuda' }).click()
  await expect(page).toHaveURL('/contacto')
  await expect(dialog).toHaveCount(0)
})

test('El panel cabe en una pantalla baja y se cierra al pulsar fuera', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/tienda')
  await page.getByRole('button', { name: 'Abrir ayuda y contacto' }).click()
  const dialog = page.getByRole('dialog', {
    name: '¿En qué podemos ayudarte?',
  })
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(568)
  await expect(
    dialog.getByRole('button', { name: 'Enviar por WhatsApp' }),
  ).toBeVisible()
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toHaveCount(0)
})

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`La ayuda flota sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const route of [
      '/',
      '/tienda',
      '/producto/bois-clair',
      '/contacto',
    ]) {
      await page.goto(route)
      const help = page.getByRole('button', { name: 'Abrir ayuda y contacto' })
      await expect(help).toBeVisible()
      const geometry = await help.evaluate((button) => {
        const box = button.getBoundingClientRect()
        return {
          width: box.width,
          height: box.height,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          position: getComputedStyle(button).position,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(geometry.position, route).toBe('fixed')
      expect(geometry.width, route).toBeGreaterThanOrEqual(44)
      expect(geometry.height, route).toBeGreaterThanOrEqual(44)
      expect(geometry.left, route).toBeGreaterThanOrEqual(0)
      expect(geometry.top, route).toBeGreaterThanOrEqual(0)
      expect(geometry.right, route).toBeLessThanOrEqual(width)
      expect(geometry.bottom, route).toBeLessThanOrEqual(844)
      expect(geometry.overflow, route).toBe(false)

      await help.click()
      const panel = page.getByRole('dialog', {
        name: '¿En qué podemos ayudarte?',
      })
      const panelBox = await panel.boundingBox()
      expect(panelBox, route).not.toBeNull()
      if (!panelBox) continue
      expect(panelBox.x, route).toBeGreaterThanOrEqual(0)
      expect(panelBox.y, route).toBeGreaterThanOrEqual(0)
      expect(panelBox.x + panelBox.width, route).toBeLessThanOrEqual(width)
      expect(panelBox.y + panelBox.height, route).toBeLessThanOrEqual(844)
    }
  })
}

test('El botón queda separado de avisos y enlaces del pie', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/producto/bois-clair')
    await page.getByRole('button', { name: 'Añadir al carrito' }).click()
    const notice = page.locator('.cart-notice')
    await expect(notice).toBeVisible()
    const noticeBox = await notice.boundingBox()
    const helpBox = await page.locator('.help-button').boundingBox()
    expect(noticeBox).not.toBeNull()
    expect(helpBox).not.toBeNull()
    if (noticeBox && helpBox) {
      const separated =
        noticeBox.x + noticeBox.width <= helpBox.x ||
        noticeBox.y + noticeBox.height <= helpBox.y
      expect(separated, `${width}px: aviso y ayuda`).toBe(true)
    }

    await page.goto('/tienda')
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    )
    const overlappingLinks = await page.evaluate(() => {
      const help = document
        .querySelector('.help-button')
        ?.getBoundingClientRect()
      if (!help) return []
      return [...document.querySelectorAll('.site-footer a')]
        .filter((link) => {
          const box = link.getBoundingClientRect()
          return (
            box.left < help.right &&
            box.right > help.left &&
            box.top < help.bottom &&
            box.bottom > help.top
          )
        })
        .map((link) => link.textContent?.trim())
    })
    expect(overlappingLinks, `${width}px: enlaces del pie`).toHaveLength(0)
  }
})
