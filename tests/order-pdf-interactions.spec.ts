import { expect, test } from '@playwright/test'
import { seedWorkflowOrders, workflowSnapshot } from './order-workflow-fixtures'

const regularFont = '**/ibm-plex-sans-latin-400-normal.woff'

test('la exportación requiere selección y cancelar conserva pedidos y selección', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 3)
  const before = await workflowSnapshot(page)
  await expect(
    page.getByRole('button', { name: 'Exportar PDF', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[1]}`,
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await expect(modal).toContainText('1 pedido seleccionado')
  await modal
    .getByRole('radio', { name: 'Resúmenes de pedidos', exact: true })
    .check()
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', {
      name: `Seleccionar pedido ${references[1]}`,
      exact: true,
    }),
  ).toBeChecked()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  await expect(
    modal.getByRole('radio', { name: 'Fichas de envío', exact: true }),
  ).toBeChecked()
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('un fallo al cargar el PDF conserva la selección y permite reintentar sin modificar pedidos', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 1)
  const before = await workflowSnapshot(page)
  await page.route(regularFont, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await modal
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  await expect(modal.getByRole('alert')).toContainText('tipografía')
  await expect(
    modal.getByRole('button', { name: 'Descargar PDF', exact: true }),
  ).toBeEnabled()
  await page.unroute(regularFont)
  const downloadEvent = page.waitForEvent('download')
  await modal
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(
    /^aroma-infini-fichas-envio-\d{4}-\d{2}-\d{2}\.pdf$/,
  )
  await expect(modal).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    }),
  ).toBeChecked()
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('la generación bloquea dobles envíos, formato y cierre hasta preparar una única descarga', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  const before = await workflowSnapshot(page)
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(regularFont, async (route) => {
    await gate
    await route.continue()
  })
  const downloads: string[] = []
  page.on('download', (download) =>
    downloads.push(download.suggestedFilename()),
  )
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await modal.locator('form').evaluate((form) => {
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
  })
  await expect(
    modal.getByRole('button', { name: 'Generando PDF…', exact: true }),
  ).toBeDisabled()
  await expect(
    modal.getByRole('radio', { name: 'Resúmenes de pedidos', exact: true }),
  ).toBeDisabled()
  await expect(
    modal.getByRole('button', { name: 'Cerrar', exact: true }),
  ).toBeDisabled()
  await expect(
    modal.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  const event = page.waitForEvent('download')
  release()
  await event
  await expect(modal).toHaveCount(0)
  expect(downloads).toHaveLength(1)
  expect(await workflowSnapshot(page)).toEqual(before)
  for (const reference of references)
    await expect(
      page.getByRole('checkbox', {
        name: `Seleccionar pedido ${reference}`,
        exact: true,
      }),
    ).toBeChecked()
})
