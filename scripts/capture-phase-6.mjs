/* global document, HTMLElement, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/phase-6'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const measurements = []

async function captureFromTop(page, path) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await page.screenshot({ path, fullPage: true })
}

try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    })
    const messages = []
    page.on('pageerror', (error) => messages.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        messages.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [{ variantId: 'cedre-50', quantity: 1 }],
        }),
      )
    })

    await page.goto('http://127.0.0.1:5173/checkout')
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.checkout-summary img').evaluateAll(async (images) => {
      await Promise.all(
        images.map(
          (image) =>
            new Promise((resolve) => {
              if (image.complete) resolve()
              else {
                image.addEventListener('load', resolve, { once: true })
                image.addEventListener('error', resolve, { once: true })
              }
            }),
        ),
      )
    })
    await captureFromTop(page, `${output}/datos-${width}.png`)

    await page.getByLabel('Nombre', { exact: true }).fill('María')
    await page.getByLabel('Apellido').fill('Prueba')
    await page.getByLabel('Correo electrónico').fill('maria@ejemplo.invalid')
    await page.getByLabel('Celular').fill('912345678')
    await page.getByRole('button', { name: 'Continuar a entrega' }).click()
    await page.getByLabel('Departamento').fill('Lima')
    await page.getByRole('textbox', { name: 'Provincia' }).fill('Lima')
    await page.getByLabel('Distrito').fill('Miraflores')
    await page
      .getByLabel('Dirección', { exact: true })
      .fill('Avenida de ejemplo 123')
    await page.getByRole('radio', { name: /Motorizado/ }).check()
    await page.getByRole('button', { name: 'Revisar selección' }).click()
    await captureFromTop(page, `${output}/revision-${width}.png`)
    await page.getByText('¿Tienes un código de descuento?').click()
    await page.getByLabel('Código de descuento').fill('DEMO10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await page.getByText('Descuento de demostración aplicado: 10 %.').waitFor()
    await captureFromTop(page, `${output}/revision-codigo-${width}.png`)

    await page
      .getByRole('button', { name: 'Ver confirmación de prueba' })
      .click()
    await page
      .getByRole('heading', { name: 'Compra de prueba completada.' })
      .waitFor()
    await captureFromTop(page, `${output}/confirmacion-${width}.png`)

    measurements.push({
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      brokenImages: await page
        .locator('img')
        .evaluateAll(
          (images) =>
            images.filter((image) => image.complete && image.naturalWidth === 0)
              .length,
        ),
      messages,
    })
    await page.getByRole('link', { name: 'Ver estado del pedido' }).click()
    await captureFromTop(page, `${output}/seguimiento-${width}.png`)
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
    )
      throw new Error(`Desbordamiento horizontal en seguimiento a ${width}px`)
    await page.close()
  }
} finally {
  await browser.close()
}

await writeFile(
  `${output}/measurements.json`,
  JSON.stringify(measurements, null, 2),
)
console.log(measurements)
