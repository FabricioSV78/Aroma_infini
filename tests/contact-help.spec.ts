import { expect, test } from '@playwright/test'
import { buildWhatsAppUrl } from '../src/utils/whatsapp'

const helpName = 'Abrir WhatsApp para recibir ayuda'
const whatsappUrl = 'https://wa.me/51955565209'

test('El enlace de WhatsApp requiere destinatario y consulta válidos', () => {
  expect(
    buildWhatsAppUrl('+51 955-565-209', '  ¿Tienen Bois Clair? & gracias  '),
  ).toBe(
    'https://wa.me/51955565209?text=%C2%BFTienen%20Bois%20Clair%3F%20%26%20gracias',
  )
  expect(buildWhatsAppUrl('51955565209')).toBe(whatsappUrl)
  expect(buildWhatsAppUrl('51955565209', '  ')).toBeNull()
  expect(buildWhatsAppUrl(null, 'Hola')).toBeNull()
  expect(buildWhatsAppUrl('número pendiente', 'Hola')).toBeNull()
})

test('La ayuda abre directamente WhatsApp sin mostrar un diálogo', async ({
  page,
}) => {
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'Prueba' }),
    )
  await page.goto('/tienda')
  const help = page.getByRole('link', { name: helpName })
  await expect(help).toHaveAttribute('href', whatsappUrl)
  await expect(help).toHaveAttribute('target', '_blank')
  await expect(help).toHaveAttribute('rel', /noopener/)
  await expect(help).toHaveAttribute('rel', /noreferrer/)
  await expect(help).not.toHaveAttribute('aria-haspopup', 'dialog')
  await expect(page.locator('#help')).toHaveCount(0)

  const popupPromise = page.waitForEvent('popup')
  await help.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(whatsappUrl)
  await popup.close()
  await expect(page).toHaveURL('/tienda')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('La ayuda de checkout enlaza a WhatsApp sin interrumpir la compra', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/checkout?demo=1')
  const help = page.getByRole('link', { name: helpName })
  await expect(help).toBeVisible()
  await expect(help).toHaveAttribute('href', whatsappUrl)
  await expect(help).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`La ayuda es accesible sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ['/', '/tienda', '/producto/bois-clair', '/contacto']) {
      await page.goto(route)
      const help = page.getByRole('link', { name: helpName })
      await expect(help).toBeVisible()
      await expect(help).toHaveAttribute('href', whatsappUrl)
      await help.scrollIntoViewIfNeeded()
      const geometry = await help.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {
          width: box.width,
          height: box.height,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          position: getComputedStyle(element).position,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(geometry.position, route).toBe(width < 1200 ? 'relative' : 'fixed')
      expect(geometry.width, route).toBeGreaterThanOrEqual(44)
      expect(geometry.height, route).toBeGreaterThanOrEqual(44)
      expect(geometry.left, route).toBeGreaterThanOrEqual(0)
      expect(geometry.top, route).toBeGreaterThanOrEqual(0)
      expect(geometry.right, route).toBeLessThanOrEqual(width)
      expect(geometry.bottom, route).toBeLessThanOrEqual(844)
      expect(geometry.overflow, route).toBe(false)
    }
  })
}

test('El enlace queda separado de avisos y enlaces del pie', async ({
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
