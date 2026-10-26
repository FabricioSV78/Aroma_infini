import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  seedWorkflowOrders,
  workflowSnapshot,
  workflowViewports,
} from './order-workflow-fixtures'

function stateOption(page: Page, name: string) {
  return page.getByRole('radio', { name, exact: true })
}

test('elegir un estado prepara el cambio sin guardarlo y mantiene precios, pago e inventario', async ({
  page,
}) => {
  const [reference] = await seedWorkflowOrders(page, 1)
  await page.goto(`/admin/pedidos/${reference}`)
  const before = await workflowSnapshot(page)
  await expect(stateOption(page, 'Nuevo')).toBeChecked()
  await expect(stateOption(page, 'En preparación')).toBeEnabled()
  await expect(stateOption(page, 'Enviado')).toBeDisabled()
  await expect(stateOption(page, 'Entregado')).toBeDisabled()
  const save = page.getByRole('button', { name: 'Guardar estado', exact: true })
  await expect(save).toBeDisabled()
  await stateOption(page, 'En preparación').check()
  await expect(save).toBeEnabled()
  expect(await workflowSnapshot(page)).toEqual(before)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(stateOption(page, 'Nuevo')).toBeChecked()
  await expect(save).toBeDisabled()
  expect(await workflowSnapshot(page)).toEqual(before)
  await stateOption(page, 'En preparación').check()
  await save.click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(1)
  const after = await workflowSnapshot(page)
  expect(after.orders[0].status).toBe('preparing')
  expect({ ...after.orders[0], status: before.orders[0].status }).toEqual(
    before.orders[0],
  )
  expect(after.products).toEqual(before.products)
  expect(after.orderHistory[0]).toMatchObject({
    reference,
    fromStatus: 'received',
    toStatus: 'preparing',
    source: 'individual',
  })
  await expect(save).toBeDisabled()
})

test('las opciones respetan pago pendiente y datos de entrega incompletos', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 2, [
    { index: 0, paymentStatus: 'pending' },
    { index: 1, status: 'preparing', incompleteDelivery: true },
  ])
  const before = await workflowSnapshot(page)
  await page.goto(`/admin/pedidos/${references[0]}`)
  await expect(stateOption(page, 'Nuevo')).toBeChecked()
  await expect(stateOption(page, 'En preparación')).toBeDisabled()
  await expect(stateOption(page, 'Enviado')).toBeDisabled()
  await expect(stateOption(page, 'Entregado')).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Guardar estado', exact: true }),
  ).toBeDisabled()
  await page.goto(`/admin/pedidos/${references[1]}`)
  await expect(stateOption(page, 'En preparación')).toBeChecked()
  await expect(stateOption(page, 'Nuevo')).toBeEnabled()
  await expect(stateOption(page, 'Enviado')).toBeDisabled()
  await expect(stateOption(page, 'Entregado')).toBeDisabled()
  expect(await workflowSnapshot(page)).toEqual(before)
})

test('envíos, entregas y retrocesos conservan sus confirmaciones y permiten cancelar', async ({
  page,
}) => {
  const [reference] = await seedWorkflowOrders(page, 1, [
    { index: 0, status: 'preparing' },
  ])
  await page.goto(`/admin/pedidos/${reference}`)
  const before = await workflowSnapshot(page)
  const save = page.getByRole('button', { name: 'Guardar estado', exact: true })
  const confirmation = page.locator('.admin-notice-dialog')
  await stateOption(page, 'Nuevo').check()
  await save.click()
  await expect(confirmation).toContainText('¿Retroceder el estado del pedido?')
  await page.keyboard.press('Escape')
  expect(await workflowSnapshot(page)).toEqual(before)
  await stateOption(page, 'Enviado').check()
  await save.click()
  await expect(confirmation).toContainText('¿Confirmar pedido enviado?')
  await confirmation
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click()
  expect(await workflowSnapshot(page)).toEqual(before)
  await save.click()
  await confirmation
    .getByRole('button', { name: 'Confirmar envío', exact: true })
    .click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orders[0].status)
    .toBe('shipped')
  await stateOption(page, 'Entregado').check()
  await save.click()
  await expect(confirmation).toContainText('¿Confirmar pedido entregado?')
  await page.keyboard.press('Escape')
  expect((await workflowSnapshot(page)).orders[0].status).toBe('shipped')
  await save.click()
  await confirmation
    .getByRole('button', { name: 'Confirmar entrega', exact: true })
    .click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orders[0].status)
    .toBe('delivered')
  expect((await workflowSnapshot(page)).orderHistory).toHaveLength(2)
})

test('las opciones se manejan con flechas y el cambio se guarda con teclado', async ({
  page,
}) => {
  const [reference] = await seedWorkflowOrders(page, 1)
  await page.goto(`/admin/pedidos/${reference}`)
  await stateOption(page, 'Nuevo').focus()
  await page.keyboard.press('ArrowDown')
  await expect(stateOption(page, 'En preparación')).toBeChecked()
  await expect(stateOption(page, 'En preparación')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Deshacer', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  const save = page.getByRole('button', { name: 'Guardar estado', exact: true })
  await expect(save).toBeFocused()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await workflowSnapshot(page)).orders[0].status)
    .toBe('preparing')
  await expect(stateOption(page, 'En preparación')).toBeChecked()
})

test('el panel de estados tiene controles legibles en cinco tamaños de pantalla', async ({
  page,
}) => {
  await mkdir('artifacts/order-status-picker', { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const [reference] = await seedWorkflowOrders(page, 1, [
    { index: 0, status: 'preparing' },
  ])
  for (const viewport of workflowViewports) {
    await page.setViewportSize(viewport)
    await page.goto(`/admin/pedidos/${reference}`)
    await expect(stateOption(page, 'En preparación')).toBeChecked()
    const card = page
      .locator('form')
      .filter({ has: stateOption(page, 'En preparación') })
    await card.scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await expect(card.getByRole('radio')).toHaveCount(4)
    const controls = await card.getByRole('radio').evaluateAll((radios) =>
      radios.map((radio) => {
        const label = radio.closest('label')!
        const box = label.getBoundingClientRect()
        return { left: box.left, right: box.right, height: box.height }
      }),
    )
    expect(
      controls.every(
        (box) =>
          box.height >= 44 && box.left >= 0 && box.right <= viewport.width + 1,
      ),
    ).toBe(true)
    await card.screenshot({
      path: `artifacts/order-status-picker/card-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page.screenshot({
      path: `artifacts/order-status-picker/page-${viewport.name}.png`,
      animations: 'disabled',
    })
  }
})
