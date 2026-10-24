import { expect, test, type Page } from '@playwright/test'
import type { AdminState } from '../src/services/admin-service'
import { persistedAdminState } from './product-import-fixtures'
import { seedWorkflowOrders } from './order-workflow-fixtures'

type StorageControl = Window & {
  __uiAdminWrites?: number
  __uiReleaseAdminWrite?: () => void
}

async function snapshot(page: Page): Promise<AdminState> {
  return page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return structuredClone(adminService.getSnapshot())
  })
}

/** Holds or fails the actual IndexedDB adapter, without faking a business save. */
async function interceptWrite(page: Page, mode: 'fail-once' | 'hold') {
  await page.evaluate(async (mode) => {
    const adminPath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      adminPath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      persistencePath
    )) as typeof import('../src/services/admin-persistence')
    await adminService.flush()
    const originalWrite = localAdminStateRepository.write
    await originalWrite(structuredClone(adminService.getSnapshot()))
    const controls = window as StorageControl
    controls.__uiAdminWrites = 0
    localAdminStateRepository.write = async (state) => {
      controls.__uiAdminWrites = (controls.__uiAdminWrites ?? 0) + 1
      if (controls.__uiAdminWrites === 1) {
        if (mode === 'fail-once')
          throw new DOMException(
            'Fallo de almacenamiento controlado.',
            'QuotaExceededError',
          )
        await new Promise<void>((resolve) => {
          controls.__uiReleaseAdminWrite = resolve
        })
      }
      await originalWrite(state)
    }
  }, mode)
}

const scenarios = [
  {
    name: 'producto',
    path: '/admin/productos/cedre',
    editor: '.admin-editor',
    submit: 'Guardar producto',
    prepare: async (page: Page) => {
      await page
        .getByLabel('Nombre', { exact: true })
        .fill('Bois Clair Estados')
    },
  },
  {
    name: 'marca',
    path: '/admin/marcas',
    editor: '.admin-compact-form',
    submit: 'Guardar marca',
    prepare: async (page: Page) => {
      await page
        .getByRole('button', { name: 'Nueva marca', exact: true })
        .click()
      await page
        .getByLabel('Nombre', { exact: true })
        .fill('Casa Prueba Estados')
    },
  },
  {
    name: 'cupón',
    path: '/admin/promociones',
    editor: '.admin-promotion-form',
    submit: 'Guardar promoción',
    prepare: async (page: Page) => {
      await page
        .getByRole('button', { name: 'Nueva promoción', exact: true })
        .click()
      await page.getByLabel('Código', { exact: true }).fill('ESTADOS15')
    },
  },
  {
    name: 'oferta',
    path: '/admin/promociones?vista=ofertas',
    editor: '.admin-offers-editor',
    submit: 'Guardar oferta',
    prepare: async (page: Page) => {
      await page
        .getByRole('button', { name: 'Crear oferta de producto', exact: true })
        .click()
      const editor = page.locator('.admin-offers-editor')
      await editor.getByLabel('Producto').selectOption('cedre')
      await editor.getByLabel('Descuento (%)', { exact: true }).fill('15')
    },
  },
] as const

for (const scenario of scenarios) {
  test(`${scenario.name}: un fallo conserva el editor y reintentar no repite la mutación`, async ({
    page,
  }) => {
    await page.goto(scenario.path)
    await scenario.prepare(page)
    await interceptWrite(page, 'fail-once')
    const before = await snapshot(page)
    await page
      .getByRole('button', { name: scenario.submit, exact: true })
      .click()
    const feedback = page.locator('.admin-notice-dialog')
    await expect(feedback).toContainText('No se pudieron guardar los cambios')
    await expect(page.locator(scenario.editor)).toHaveAttribute('inert', '')
    const retry = feedback.getByRole('button', {
      name: 'Reintentar guardado',
      exact: true,
    })
    await expect(retry).toBeFocused()
    const changed = await snapshot(page)
    expect(changed.revision).toBe(before.revision + 1)
    expect((await persistedAdminState(page)).revision).toBe(before.revision)
    // Programmatic repeats also reach the handler: the synchronous ref must guard them.
    await page.locator(scenario.editor).evaluate((form: HTMLFormElement) => {
      form.requestSubmit()
      form.requestSubmit()
    })
    expect((await snapshot(page)).revision).toBe(changed.revision)
    await retry.click()
    await expect(page.locator(scenario.editor)).toHaveCount(0)
    await expect(page.locator('.admin-save-feedback')).toHaveCount(0)
    expect(await persistedAdminState(page)).toEqual(changed)
    expect(
      await page.evaluate(() => (window as StorageControl).__uiAdminWrites),
    ).toBe(2)
    await page.reload()
    const reloaded = await snapshot(page)
    if (scenario.name === 'producto') {
      // Legacy fixture photos regenerate their descriptive alt on hydration.
      // Stored commercial data and image order must remain intact.
      expect(reloaded.revision).toBe(changed.revision)
      const actual = reloaded.products.find(
        (record) => record.product.id === 'cedre',
      )!
      const expected = changed.products.find(
        (record) => record.product.id === 'cedre',
      )!
      expect(actual.product).toEqual(expected.product)
      expect(actual.detail.gallery.map((view) => view.image)).toEqual(
        expected.detail.gallery.map((view) => view.image),
      )
      expect(actual.detail.description).toBe(expected.detail.description)
    } else expect(reloaded).toEqual(changed)
  })
}

test('una oferta comunica la escritura pendiente y bloquea envíos repetidos antes del éxito', async ({
  page,
}) => {
  const scenario = scenarios.find((item) => item.name === 'oferta')!
  await page.goto(scenario.path)
  await scenario.prepare(page)
  await interceptWrite(page, 'hold')
  const before = await snapshot(page)
  await page.locator(scenario.editor).evaluate((form: HTMLFormElement) => {
    form.requestSubmit()
    form.requestSubmit()
    form.requestSubmit()
  })
  await expect(page.locator(scenario.editor)).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(
    page.locator('.admin-save-feedback').getByRole('status'),
  ).toContainText('Guardando en este navegador')
  await expect(
    page.getByText('Oferta de Bois Clair guardada.', { exact: true }),
  ).toHaveCount(0)
  expect((await snapshot(page)).revision).toBe(before.revision + 1)
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await page.evaluate(() =>
    (window as StorageControl).__uiReleaseAdminWrite?.(),
  )
  await expect(
    page.getByText('Oferta de Bois Clair guardada.', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => (window as StorageControl).__uiAdminWrites),
  ).toBe(1)
})

test('publicar o desactivar espera persistencia y el reintento no vuelve a alternar la visibilidad', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await interceptWrite(page, 'fail-once')
  const before = await snapshot(page)
  await page
    .getByRole('button', { name: 'Desactivar Bois Clair', exact: true })
    .click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Desactivar producto' })
    .click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'No se pudieron guardar los cambios',
  )
  await expect(
    page.getByText('Bois Clair desactivado.', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Activar Bois Clair', exact: true }),
  ).toBeDisabled()
  expect((await snapshot(page)).revision).toBe(before.revision + 1)
  await page
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(
    page.getByText('Bois Clair desactivado.', { exact: true }),
  ).toBeVisible()
  const after = await snapshot(page)
  expect(after.revision).toBe(before.revision + 1)
  expect(
    after.products.find((record) => record.product.id === 'cedre')?.active,
  ).toBe(false)
  expect(await persistedAdminState(page)).toEqual(after)
  await expect(
    page.getByRole('button', { name: 'Activar Bois Clair', exact: true }),
  ).toBeEnabled()
})

for (const area of ['home', 'shipping'] as const) {
  test(`${area}: los campos quedan protegidos durante el guardado y el reintento conserva el borrador`, async ({
    page,
  }) => {
    const home = area === 'home'
    await page.goto(home ? '/admin/home' : '/admin/envios')
    if (home) {
      await page
        .getByRole('button', { name: 'Franja superior', exact: true })
        .click()
      await page
        .getByRole('textbox', { name: /^Mensaje de entrega/ })
        .fill('Envíos de prueba en Lima y Callao')
    } else {
      await page
        .getByLabel('Envío gratis desde (S/)', { exact: true })
        .fill('425')
    }
    await interceptWrite(page, 'fail-once')
    const before = await snapshot(page)
    await page
      .getByRole('button', {
        name: home ? 'Guardar cambios del Home' : 'Guardar configuración',
        exact: true,
      })
      .click()
    await expect(page.locator('.admin-editor-content')).toHaveAttribute(
      'inert',
      '',
    )
    const retry = page.getByRole('button', {
      name: 'Reintentar guardado',
      exact: true,
    })
    await expect(retry).toBeVisible()
    const changed = await snapshot(page)
    expect(changed.revision).toBe(before.revision + 1)
    expect((await persistedAdminState(page)).revision).toBe(before.revision)
    await retry.click()
    await expect(page.locator('.admin-editor-content')).not.toHaveAttribute(
      'inert',
    )
    await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
    expect(await persistedAdminState(page)).toEqual(changed)
    expect((await snapshot(page)).revision).toBe(changed.revision)
    await page.reload()
    if (home) {
      await page
        .getByRole('button', { name: 'Franja superior', exact: true })
        .click()
      await expect(
        page.getByRole('textbox', { name: /^Mensaje de entrega/ }),
      ).toHaveValue('Envíos de prueba en Lima y Callao')
    } else {
      await expect(
        page.getByLabel('Envío gratis desde (S/)', { exact: true }),
      ).toHaveValue('425')
    }
  })
}

test('clientes sin coincidencias ofrece limpiar búsqueda y no simula una carga', async ({
  page,
}) => {
  await page.goto('/admin/clientes')
  await page.getByRole('searchbox').fill('cliente-imposible-987654321')
  const empty = page.locator('.ui-empty-state')
  await expect(empty.getByRole('heading')).toHaveText('No encontramos clientes')
  await expect(page.locator('.ui-spinner')).toHaveCount(0)
  await empty
    .getByRole('button', { name: 'Limpiar búsqueda', exact: true })
    .click()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(empty).toHaveCount(0)
})

test('datos de entrega conserva el formulario ante un fallo y reintenta sólo la escritura', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 1)
  await page.goto(`/admin/pedidos/${references[0]}`)
  await page
    .getByRole('button', { name: 'Editar datos de entrega', exact: true })
    .click()
  const editor = page.locator('.admin-delivery-editor')
  await editor
    .getByLabel('Dirección exacta', { exact: true })
    .fill('Calle de prueba 456')
  await interceptWrite(page, 'fail-once')
  const before = await snapshot(page)
  await editor
    .getByRole('button', { name: 'Guardar datos de entrega', exact: true })
    .click()
  await expect(editor).toHaveAttribute('inert', '')
  await expect(
    page.getByRole('button', { name: 'Cerrar edición', exact: true }),
  ).toBeDisabled()
  const changed = await snapshot(page)
  expect(changed.revision).toBe(before.revision + 1)
  expect(changed.orders[0].address.street).toBe('Calle de prueba 456')
  expect(changed.orderHistory).toEqual(before.orderHistory)
  await page
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(editor).toHaveCount(0)
  await expect(
    page.getByText('Datos de entrega guardados.', { exact: true }),
  ).toBeVisible()
  expect(await persistedAdminState(page)).toEqual(changed)
  expect((await snapshot(page)).revision).toBe(changed.revision)
})
