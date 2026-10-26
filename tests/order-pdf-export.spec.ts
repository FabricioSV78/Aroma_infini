import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createCanvas } from '@napi-rs/canvas'
import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { seedWorkflowOrders, workflowSnapshot } from './order-workflow-fixtures'

const outputDirectory = 'artifacts/order-pdf-export'
type DocumentType = 'shipping' | 'summary'

function plainText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

async function seedDocumentOrders(
  page: Page,
  count: number,
  longSummary = false,
) {
  const references = await seedWorkflowOrders(page, count + 1, [
    { index: count, placedAt: '2026-01-01T15:00:00.000Z' },
  ])
  await page.evaluate(
    async ({ references, longSummary }) => {
      const servicePath = '/src/services/admin-service.ts'
      const repositoryPath = '/src/services/admin-persistence.ts'
      const { adminService } = (await import(
        servicePath
      )) as typeof import('../src/services/admin-service')
      const { writeAdminState } = (await import(
        repositoryPath
      )) as typeof import('../src/services/admin-persistence')
      await adminService.flush()
      const snapshot = structuredClone(adminService.getSnapshot())
      snapshot.orders = snapshot.orders.map((order, index) => {
        const lines =
          longSummary && index === 0
            ? Array.from({ length: 85 }, (_, lineIndex) => ({
                variantId: `long-${lineIndex}`,
                name: `Fragancia extensa ${String(lineIndex + 1).padStart(3, '0')} · colección de maderas, flores y cítricos de la perfumería`,
                brand: 'Aroma de prueba',
                ml: lineIndex % 2 === 0 ? 50 : 100,
                quantity: (lineIndex % 3) + 1,
                unitPriceCents: 35100,
                originalUnitPriceCents: 39000,
              }))
            : [
                {
                  variantId: `first-${index}`,
                  brand: 'Atelier 01',
                  name: `Ñandú Cítrico ${index + 1}`,
                  ml: 50,
                  quantity: 2,
                  unitPriceCents: 35100,
                  originalUnitPriceCents: 39000,
                },
                {
                  variantId: `second-${index}`,
                  brand: 'Forme',
                  name: 'Pétale Nu',
                  ml: 100,
                  quantity: 1,
                  unitPriceCents: 53100,
                  originalUnitPriceCents: 59000,
                },
                {
                  variantId: `accessory-${index}`,
                  brand: 'Aroma Infini',
                  name: 'Atomizador portátil',
                  ml: null,
                  variantLabel: 'Estuche verde',
                  quantity: 1,
                  unitPriceCents: 1500,
                },
              ]
        const subtotalCents = lines.reduce(
          (sum, line) => sum + line.quantity * line.unitPriceCents,
          0,
        )
        return {
          ...order,
          customerName:
            index === 0
              ? 'Comprador Carlos Pérez'
              : `Cliente auténtico Muñoz ${index + 1}`,
          customerEmail: `comprador${index + 1}@example.invalid`,
          contactPhone: '999888777',
          alternateRecipient:
            index === 0
              ? { name: 'María Muñoz Castañeda', dni: '12345678' }
              : null,
          deliveryMethod:
            index % 2 === 0 ? ('courier' as const) : ('motorizado' as const),
          address: {
            department: 'lima',
            province: '1501',
            district: '150122',
            street:
              index === 0
                ? 'Avenida Los Próceres de la Independencia 1234, interior 567, edificio Los Castaños, urbanización Jardines de las Flores, departamento 12-B'
                : `Calle Los Olivos ${index + 1}`,
            reference:
              index === 0
                ? 'Frente al parque Niño Jesús; ingreso por la puerta de seguridad junto al café. Llamar al llegar.'
                : '',
          },
          reference: references[index],
          lines,
          subtotalCents,
          discountCents: 3000,
          shippingCents: 1500,
          totalCents: subtotalCents - 3000 + 1500,
          promotionCode: 'PRUEBA30',
        }
      })
      await writeAdminState(snapshot)
    },
    { references, longSummary },
  )
  await page.goto('/admin/pedidos?desde=2026-10-01')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(
    Math.min(20, count),
  )
  return references
}

async function selectFiltered(page: Page, count: number) {
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  if (count > 20)
    await page
      .getByRole('button', {
        name: `Seleccionar los ${count} pedidos filtrados`,
        exact: true,
      })
      .click()
  await expect(page.locator('.admin-order-selection-bar')).toContainText(
    String(count),
  )
}

async function exportDownload(
  page: Page,
  type: DocumentType,
  filename: string,
) {
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('radio', {
      name: type === 'shipping' ? 'Fichas de envío' : 'Resúmenes de pedidos',
      exact: true,
    })
    .check()
  const downloadEvent = page.waitForEvent('download')
  await dialog
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\d{4}-\d{2}-\d{2}.*\.pdf$/)
  const path = `${outputDirectory}/${filename}.pdf`
  await download.saveAs(path)
  expect(await download.failure()).toBeNull()
  return new Uint8Array(await readFile(path))
}

async function inspectPdf(bytes: Uint8Array, filename: string, render = false) {
  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
  })
  const pdf = await loadingTask.promise
  const texts: string[] = []
  const sizes: { width: number; height: number }[] = []
  const renderPages = new Set([1, Math.ceil(pdf.numPages / 2), pdf.numPages])
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index)
    const viewport = page.getViewport({ scale: 1 })
    sizes.push({ width: viewport.width, height: viewport.height })
    const content = await page.getTextContent()
    const items = content.items.filter(
      (
        item,
      ): item is Exclude<(typeof content.items)[number], { type: string }> =>
        'str' in item,
    )
    texts.push(plainText(items.map((item) => item.str).join(' ')))
    expect(items.length, `${filename}: página ${index} vacía`).toBeGreaterThan(
      0,
    )
    for (const item of items) {
      if (!item.str.trim()) continue
      const [a, b, c, d, x, y] = item.transform
      const baseline = Math.hypot(a, b)
      const vertical = Math.hypot(c, d)
      const dx = (a / baseline) * item.width
      const dy = (b / baseline) * item.width
      const hx = (c / vertical) * item.height
      const hy = (d / vertical) * item.height
      const corners = [
        { x, y },
        { x: x + dx, y: y + dy },
        { x: x + hx, y: y + hy },
        { x: x + dx + hx, y: y + dy + hy },
      ]
      expect(
        Math.min(...corners.map((point) => point.x)),
        `${filename} p${index} izquierda: ${item.str}`,
      ).toBeGreaterThanOrEqual(-0.5)
      expect(
        Math.max(...corners.map((point) => point.x)),
        `${filename} p${index} derecha: ${item.str}`,
      ).toBeLessThanOrEqual(viewport.width + 1)
      expect(
        Math.min(...corners.map((point) => point.y)),
        `${filename} p${index} abajo: ${item.str}`,
      ).toBeGreaterThanOrEqual(-0.5)
      expect(
        Math.max(...corners.map((point) => point.y)),
        `${filename} p${index} arriba: ${item.str}`,
      ).toBeLessThanOrEqual(viewport.height + 1)
    }
    if (render && renderPages.has(index)) {
      const scale = filename.startsWith('shipping') ? 2 : 1.3
      const printViewport = page.getViewport({ scale })
      const canvas = createCanvas(
        Math.ceil(printViewport.width),
        Math.ceil(printViewport.height),
      )
      await page.render({
        canvasContext: canvas.getContext('2d') as never,
        canvas: canvas as never,
        viewport: printViewport,
      }).promise
      await writeFile(
        `${outputDirectory}/${filename}-page-${index}.png`,
        canvas.toBuffer('image/png'),
      )
    }
  }
  await loadingTask.destroy()
  return { pages: texts.length, texts, sizes }
}

for (const count of [1, 3, 5, 10, 50, 100]) {
  for (const type of ['shipping', 'summary'] as const) {
    test(`${type}: exporta exactamente ${count} pedidos filtrados en un PDF sin modificar datos`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await mkdir(outputDirectory, { recursive: true })
      const references = await seedDocumentOrders(page, count)
      const before = await workflowSnapshot(page)
      await selectFiltered(page, count)
      const bytes = await exportDownload(page, type, `${type}-${count}`)
      const inspected = await inspectPdf(
        bytes,
        `${type}-${count}`,
        count === 1 || count === 3 || count === 100,
      )
      expect(inspected.pages).toBe(Math.ceil(count / 2))
      const text = inspected.texts.join(' ')
      for (const reference of references.slice(0, count))
        expect(text).toContain(reference)
      expect(text).not.toContain(references[count])
      expect(text).toContain('María Muñoz Castañeda')
      expect(text).toMatch(/aroma infini/i)
      for (const [index, pageText] of inspected.texts.entries()) {
        const pageReferences = [...new Set(pageText.match(/AI-TEST-\d{4}/g))]
        expect(pageReferences).toEqual(
          references.slice(index * 2, Math.min(count, index * 2 + 2)),
        )
      }
      for (const size of inspected.sizes) {
        expect(size.width).toBeCloseTo(595.28, 0)
        expect(size.height).toBeCloseTo(841.89, 0)
      }
      if (type === 'shipping') {
        expect(inspected.texts[0]).not.toContain('Comprador Carlos Pérez')
        expect(inspected.texts[0]).not.toContain('@example.invalid')
        expect(text).toContain('999888777')
        expect(text).toContain('Próceres')
        expect(text).toContain('Niño Jesús')
      } else {
        expect(text).toContain('Ñandú Cítrico')
        expect(text).toContain('50 ml')
        expect(text).toContain('100 ml')
        expect(text).toContain('Estuche verde')
        expect(text).toContain('Pagado')
        expect(text).toContain('1,248')
        expect(text).toContain('1,233')
      }
      expect(await workflowSnapshot(page)).toEqual(before)
    })
  }
}

test('selecciones entre páginas excluyen pedidos no marcados y los resúmenes extensos conservan todos los productos', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await mkdir(outputDirectory, { recursive: true })
  const references = await seedDocumentOrders(page, 50, true)
  const before = await workflowSnapshot(page)
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    })
    .check()
  await page
    .getByRole('navigation', { name: 'Paginación de pedidos', exact: true })
    .getByRole('button', { name: 'Siguiente', exact: true })
    .click()
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[20]}`,
      exact: true,
    })
    .check()
  const bytes = await exportDownload(
    page,
    'summary',
    'summary-long-multiple-pages',
  )
  const inspected = await inspectPdf(bytes, 'summary-long-multiple-pages', true)
  expect(inspected.pages).toBeGreaterThan(2)
  const text = inspected.texts.join(' ')
  expect(text).toContain(references[0])
  expect(text).toContain(references[20])
  for (let index = 0; index < references.length; index += 1)
    if (index !== 0 && index !== 20)
      expect(text).not.toContain(references[index])
  for (let index = 1; index <= 85; index += 1)
    expect(text).toContain(
      `Fragancia extensa ${String(index).padStart(3, '0')}`,
    )
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('las fichas advierten qué dirección falta y solo excluyen casos inválidos con autorización explícita', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await mkdir(outputDirectory, { recursive: true })
  const references = await seedWorkflowOrders(page, 3, [
    { index: 1, incompleteDelivery: true },
  ])
  const before = await workflowSnapshot(page)
  await selectFiltered(page, 3)
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await expect(dialog).toContainText(references[1])
  const downloadButton = dialog.getByRole('button', {
    name: 'Descargar PDF',
    exact: true,
  })
  await expect(downloadButton).toBeDisabled()
  await dialog
    .getByRole('checkbox', {
      name: 'Exportar solo los pedidos válidos',
      exact: true,
    })
    .check()
  const event = page.waitForEvent('download')
  await downloadButton.click()
  const download = await event
  await download.saveAs(`${outputDirectory}/shipping-valid-only.pdf`)
  const bytes = new Uint8Array(
    await readFile(`${outputDirectory}/shipping-valid-only.pdf`),
  )
  const inspected = await inspectPdf(bytes, 'shipping-valid-only', true)
  expect(inspected.pages).toBe(1)
  const text = inspected.texts.join(' ')
  expect(text).toContain(references[0])
  expect(text).toContain(references[2])
  expect(text).not.toContain(references[1])
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('un error al cargar la tipografía conserva la selección y permite volver a descargar', async ({
  page,
}) => {
  await mkdir(outputDirectory, { recursive: true })
  await seedWorkflowOrders(page, 1)
  const before = await workflowSnapshot(page)
  await selectFiltered(page, 1)
  let failing = true
  await page.route(
    (url) => url.pathname.endsWith('ibm-plex-sans-latin-400-normal.woff'),
    async (route) => {
      if (failing)
        await route.fulfill({ status: 503, body: 'Controlled font failure' })
      else await route.continue()
    },
  )
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await dialog
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText(
    /tipografía|generar el PDF/,
  )
  await expect(dialog).toBeVisible()
  await expect(page.locator('.admin-order-selection-bar')).toContainText(
    '1 pedido seleccionado',
  )
  await expect(
    dialog.getByRole('radio', { name: 'Fichas de envío', exact: true }),
  ).toBeChecked()
  expect(await workflowSnapshot(page)).toEqual(before)
  failing = false
  const event = page.waitForEvent('download')
  await dialog
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  const download = await event
  await download.saveAs(`${outputDirectory}/shipping-retried.pdf`)
  const inspected = await inspectPdf(
    new Uint8Array(await readFile(`${outputDirectory}/shipping-retried.pdf`)),
    'shipping-retried',
  )
  expect(inspected.pages).toBe(1)
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('generar un PDF bloquea acciones y dos envíos inmediatos producen una sola descarga', async ({
  page,
}) => {
  await seedWorkflowOrders(page, 1)
  const before = await workflowSnapshot(page)
  await selectFiltered(page, 1)
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let fontRequests = 0
  let downloads = 0
  page.on('download', () => {
    downloads += 1
  })
  await page.route(
    (url) => url.pathname.endsWith('ibm-plex-sans-latin-400-normal.woff'),
    async (route) => {
      fontRequests += 1
      await gate
      await route.continue()
    },
  )
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await dialog.locator('form').evaluate((form) => {
    for (let count = 0; count < 2; count += 1)
      form.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true }),
      )
  })
  await expect(
    dialog.getByRole('button', { name: 'Generando PDF…', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('radio', { name: 'Resúmenes de pedidos', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  expect(await workflowSnapshot(page)).toEqual(before)
  const event = page.waitForEvent('download')
  release()
  await event
  await expect(dialog).not.toBeVisible()
  expect(fontRequests).toBe(1)
  expect(downloads).toBe(1)
  expect(await workflowSnapshot(page)).toEqual(before)
})
