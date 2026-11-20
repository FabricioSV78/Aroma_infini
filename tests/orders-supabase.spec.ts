import { adminListFixture } from './admin-list-fixture'
import { randomUUID } from 'node:crypto'
import { installAdminPageBatchGate } from './admin-page-batch-fixture'
import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { AdminOrder } from '../src/types/admin'
import type { OrderHistoryEntry } from '../src/types/order-workflow'
import {
  customerA,
  customerB,
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`,
  token = 'a'.repeat(64)
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
function makeOrder(index: number): AdminOrder {
  return {
    id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    version: 1,
    simulation: true,
    reference: `AI-${index.toString(16).toUpperCase().padStart(32, '0')}`,
    customerId: customerA,
    customerName: 'Ana Torres',
    customerEmail: 'ana@example.invalid',
    contactPhone: '912345678',
    placedAt: new Date(Date.UTC(2026, 9, 29, 12, 0, index)).toISOString(),
    status: 'received',
    paymentStatus: 'pending',
    lines: [
      {
        variantId: '40000000-0000-4000-8000-000000000001',
        name: 'Perfume histórico',
        brand: 'Casa',
        ml: 50,
        quantity: 1,
        unitPriceCents: 10000,
      },
    ],
    promotionCode: null,
    paymentProvider: 'mercado-pago',
    deliveryMethod: 'courier',
    address: {
      department: 'lima',
      province: '1501',
      district: '150101',
      street: 'Avenida de prueba 123',
      reference: '',
    },
    subtotalCents: 10000,
    discountCents: 0,
    shippingCents: 1000,
    totalCents: 11000,
  }
}


interface OrdersFixture {
  orders: AdminOrder[]
  history: OrderHistoryEntry[]
  calls: Array<{ name: string; body: Record<string, unknown> }>
  failWrite: boolean
  partial: boolean
  unavailable: boolean
  failReadsAfterWrite: boolean
  denied: boolean
  holdNextRead: Promise<void> | null
}
const test = authTest.extend<{ ordersNetwork: OrdersFixture }>({
  ordersNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    const state: OrdersFixture = {
      orders: Array.from({ length: 100 }, (_, index) => makeOrder(index + 1)),
      history: [],
      calls: [],
      failWrite: false,
      partial: false,
      unavailable: false,
      failReadsAfterWrite: false,
      denied: false,
      holdNextRead: null,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request(),
        name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        !name.startsWith('admin_') &&
        ![
          'commerce_settings',
          'customer_orders',
          'order_tracking',
          'home_document',
        ].includes(name)
      ) {
        await route.fallback()
        return
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const body = request.postDataJSON() as Record<string, unknown>
      state.calls.push({ name, body })
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers })
      const metadata = {
        features: { complementsEnabled: false },
        featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: null,
        homeVersion: 0,
      }
      if (name.startsWith('admin_'))
        expect(request.headers().authorization).toMatch(/^Bearer ey/)
      if (state.unavailable && ['admin_orders','admin_order_list','admin_customer_list'].includes(name)) {
        await reply(
          { code: 'PGRST000', message: 'Isolated service unavailable' },
          503,
        )
        return
      }
      if (state.denied && ['admin_orders','admin_order_list','admin_customer_list'].includes(name)) {
        await reply(
          { code: '42501', message: 'Isolated revoked membership' },
          403,
        )
        return
      }
      if (['admin_product_list','admin_order_list','admin_customer_list'].includes(name)) {
        const payload=structuredClone(adminListFixture(name,body,{orders:state.orders,history:state.history}))
        if (name==='admin_order_list'&&state.holdNextRead) { const hold=state.holdNextRead;state.holdNextRead=null;await hold }
        await reply(payload);return
      }
      if (name === 'admin_catalog_page') {
        await reply({
          ...metadata,
          products: [],
          brands: [],
          productVersions: {},
          brandVersions: {},
          settingsVersion: 1,
          total: 0,
        })
        return
      }
      if (name === 'catalog_settings') {
        await reply(metadata)
        return
      }
      if (name === 'catalog_home_context') {
        await reply({ ...metadata, brands: [], profiles: [], items: [] })
        return
      }
      if (name === 'catalog_brand_previews') {
        await reply({ brands: [], mediaAssets: [] })
        return
      }
      if (name === 'catalog_brands') {
        await reply([])
        return
      }
      if (name === 'catalog_products') {
        await reply({ items: [], total: 0 })
        return
      }
      if (name === 'commerce_settings') {
        await reply({ shipping: null, shippingVersion: 0 })
        return
      }
      if (name === 'admin_commerce_settings') {
        await reply({
          shipping: null,
          shippingVersion: 0,
          coupons: [],
          couponVersions: {},
        })
        return
      }
      if (name === 'home_document') {
        await reply({ media: null, content: null, version: 0, mediaAssets: [] })
        return
      }
      if (name === 'admin_orders') {
        const start = Number(body.p_offset ?? 0),
          size = Number(body.p_limit ?? 100)
        // Capture the server result before transport latency; a later write
        // cannot rewrite the body of an already completed SQL read.
        const payload = structuredClone({
          orders: state.orders.slice(start, start + size),
          orderHistory: state.history,
          total: state.orders.length,
        })
        const held = state.holdNextRead
        state.holdNextRead = null
        if (held) await held
        await reply(payload)
        return
      }
      if (name === 'admin_set_order_statuses' || name === 'admin_set_order_statuses_page') {
        if (state.failWrite) {
          state.failWrite = false
          await reply(
            { code: 'PGRST000', message: 'Isolated write unavailable' },
            503,
          )
          return
        }
        const changes = body.p_changes as Array<{
            reference: string
            expectedVersion: number
          }>,
          updated: string[] = [],
          errors: Array<{ reference: string; message: string }> = []
        for (const [index, change] of changes.entries()) {
          const order = state.orders.find(
            (order) => order.reference === change.reference,
          )
          if (
            !order ||
            order.version !== change.expectedVersion ||
            (state.partial && index === changes.length - 1)
          ) {
            errors.push({
              reference: change.reference,
              message: 'El pedido cambió en otra sesión.',
            })
            continue
          }
          const old = order.status
          order.status = body.p_status as AdminOrder['status']
          order.version!++
          updated.push(order.reference)
          state.history.push({
            id: randomUUID(),
            reference: order.reference,
            fromStatus: old,
            toStatus: order.status,
            changedAt: new Date().toISOString(),
            operator: { name: 'Ana Torres', id: customerA, verified: true },
            operationId: String(body.p_operation_id),
            source: body.p_source as OrderHistoryEntry['source'],
          })
        }
        if (state.failReadsAfterWrite) state.unavailable = true
        await reply({
          kind: 'updated',
          operationId: body.p_operation_id,
          updated,
          skipped: [],
          errors,
          orders: state.orders.filter((order) =>
            changes.some((change) => change.reference === order.reference),
          ),
          orderHistory: state.history.filter((entry) =>
            changes.some((change) => change.reference === entry.reference),
          ),
          ...(name === 'admin_set_order_statuses_page' ? { page: adminListFixture('admin_order_list', body, { orders: state.orders }) } : {}),
        })
        return
      }
      if (name === 'admin_save_order_delivery') {
        const order = state.orders.find(
          (order) => order.reference === body.p_reference,
        )!
        if (order.version !== body.p_expected_version) {
          await reply({ code: 'PT409', message: 'Isolated stale version' }, 409)
          return
        }
        order.address = body.p_address as AdminOrder['address']
        order.contactPhone = String(body.p_contact_phone)
        order.version!++
        await reply({ order })
        return
      }
      if (name === 'customer_orders') {
        const orders =
          supabaseNetwork.currentUserId === customerA
            ? state.orders.slice(0, 2)
            : []
        await reply(
          orders.map((order) => ({
            ...order,
            userId: customerA,
            address: {
              ...order.address,
              id: order.id,
              label: 'Entrega',
              recipient: order.customerName,
              reference: order.address.reference ?? '',
            },
            payment: {
              provider: order.paymentProvider,
              status: order.paymentStatus,
            },
            lines: order.lines.map((line) => ({
              ...line,
              productSlug: 'perfume-historico',
              image: '/images/cedre-480.webp',
            })),
          })),
        )
        return
      }
      if (name === 'order_tracking') {
        const order = state.orders.find(
          (order) => order.reference === body.p_reference,
        )
        const bearer = request.headers().authorization ?? ''
        const own =
          bearer.startsWith('Bearer ey') &&
          supabaseNetwork.currentUserId === customerA
        await reply(
          order && (body.p_token === token || own)
            ? {
                reference: order.reference,
                placedAt: order.placedAt,
                status: order.status,
                mode: 'guest',
                simulation: true,
              }
            : null,
        )
        return
      }
      await reply(
        { code: 'fixture_unhandled', message: `Unhandled ${name}` },
        500,
      )
      throw Error(`Unhandled isolated orders RPC: ${name}`)
    })
    await runFixture(state)
  },
})
async function admin(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin', { timeout: 15000 })
}

for (const revoked of [false, true]) {
  test(`Los pedidos cargan mil registros con cuatro lecturas acotadas y ${revoked ? 'una denegación no restaura datos privados' : 'publican el snapshot completo'}`, async ({
    page,
    context,
    supabaseNetwork,
    ordersNetwork,
  }) => {
    await admin(page, supabaseNetwork)
    ordersNetwork.orders = Array.from({ length: 1000 }, (_, index) =>
      makeOrder(index + 1),
    )
    const gate = await installAdminPageBatchGate(
      context,
      origin,
      'admin_orders',
    )
    const reading = page.evaluate(async () => {
      const path = '/src/services/order-admin-service.ts'
      const { loadAdminOrders } = (await import(
        path
      )) as typeof import('../src/services/order-admin-service')
      try {
        await loadAdminOrders(true)
        return 'resolved'
      } catch {
        return 'rejected'
      }
    })
    try {
      await expect.poll(() => gate.started.length).toBe(5)
      expect(gate.peak()).toBe(4)
      expect(
        await page.evaluate(async () => {
          const path = '/src/services/admin-service.ts'
          const { adminService } = (await import(
            path
          )) as typeof import('../src/services/admin-service')
          return adminService.getSnapshot().orders.length
        }),
      ).toBe(0)
      if (revoked) gate.deny(200)
      gate.releaseAll()
      expect(await reading).toBe(revoked ? 'rejected' : 'resolved')
      const count = await page.evaluate(async () => {
        const path = '/src/services/admin-service.ts'
        const { adminService } = (await import(
          path
        )) as typeof import('../src/services/admin-service')
        return adminService.getSnapshot().orders.length
      })
      expect(count).toBe(revoked ? 0 : 1000)
      expect([...gate.started].sort((a, b) => a - b)).toEqual(
        Array.from({ length: revoked ? 5 : 10 }, (_, index) => index * 100),
      )
    } finally {
      gate.releaseAll()
      await reading
    }
  })
}

test('Una lectura anterior al guardado no reemplaza el estado ni el historial confirmados del pedido', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  const reference = ordersNetwork.orders[0].reference
  let release!: () => void
  ordersNetwork.holdNextRead = new Promise<void>((resolve) => {
    release = resolve
  })
  const before = ordersNetwork.calls.filter(
    ({ name }) => name === 'admin_orders',
  ).length
  const reading = page.evaluate(async () => {
    const path = '/src/services/order-admin-service.ts'
    const { loadAdminOrders } = (await import(
      path
    )) as typeof import('../src/services/order-admin-service')
    await loadAdminOrders(true)
  })
  try {
    await expect
      .poll(
        () =>
          ordersNetwork.calls.filter(({ name }) => name === 'admin_orders')
            .length,
      )
      .toBe(before + 1)
    await page.evaluate(async (reference) => {
      const path = '/src/services/order-admin-service.ts'
      const { orderAdminService } = (await import(
        path
      )) as typeof import('../src/services/order-admin-service')
      const result = await orderAdminService.bulkSetOrderStatus(
        [reference],
        'preparing',
        undefined,
        undefined,
        { expectedVersions: { [reference]: 1 } },
      )
      if (result.kind !== 'updated' || result.updated.length !== 1)
        throw new Error('The canonical fixture mutation did not succeed')
    }, reference)
    expect(ordersNetwork.orders[0].version).toBe(2)
    release()
    await reading
    const confirmed = await page.evaluate(async (reference) => {
      const path = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      const state = adminService.getSnapshot()
      const order = state.orders.find((item) => item.reference === reference)
      return {
        version: order?.version,
        status: order?.status,
        history: state.orderHistory.filter(
          (item) => item.reference === reference,
        ).length,
      }
    }, reference)
    expect(confirmed).toEqual({ version: 2, status: 'preparing', history: 1 })
  } finally {
    release()
    await reading
  }
})

test('Cien pedidos remotos mantienen paginación y se actualizan con una sola operación masiva', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  await expect(
    page.getByRole('navigation', { name: 'Paginación de pedidos' }),
  ).toContainText('Página 1 de 5')
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: 'Paginación de pedidos' }),
  ).toContainText('Página 2 de 5')
  await page
    .getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' })
    .check()
  await page
    .getByRole('button', { name: 'Seleccionar los 100 pedidos filtrados' })
    .click()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(page.locator('.admin-order-bulk-report')).toContainText(
    '100 actualizados',
  )
  expect(
    ordersNetwork.calls.filter(
      (call) => call.name === 'admin_set_order_statuses_page',
    ),
  ).toHaveLength(1)
  expect(
    ordersNetwork.orders.every(
      (order) =>
        order.status === 'preparing' &&
        order.paymentStatus === 'pending' &&
        order.simulation,
    ),
  ).toBe(true)
  expect(ordersNetwork.history).toHaveLength(100)
  await page.reload()
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  await expect(page.locator('.admin-order-workspace tbody')).toContainText(
    'Modo prueba',
  )
})

test('Un error parcial no cambia el resto de pedidos ni oculta cuáles fallaron', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  ordersNetwork.orders = ordersNetwork.orders.slice(0, 10)
  ordersNetwork.partial = true
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await page
    .getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' })
    .check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(page.locator('.admin-order-bulk-report')).toContainText(
    '9 actualizados',
  )
  await expect(page.locator('.admin-order-bulk-report')).toContainText(
    '1 con errores',
  )
  expect(
    ordersNetwork.orders.filter((order) => order.status === 'received'),
  ).toHaveLength(1)
  expect(ordersNetwork.history).toHaveLength(9)
})

test('El detalle cambia un estado y guarda su administrador real en el historial', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  const selected = ordersNetwork.orders[0]
  await admin(page, supabaseNetwork)
  await page.goto(`/admin/pedidos/${selected.reference}`)
  const publicRevision = await page.evaluate(async () => {
    const path = '/src/services/public-query-cache.ts'
    return (await import(path)).publicQueryCacheGeneration() as number
  })
  await page.getByRole('radio', { name: 'En preparación', exact: true }).check()
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Historial del pedido' }),
  ).toContainText('Ana Torres')
  expect(ordersNetwork.orders[0].status).toBe('preparing')
  expect(await page.evaluate(async () => {
    const path = '/src/services/public-query-cache.ts'
    return (await import(path)).publicQueryCacheGeneration() as number
  })).toBeGreaterThan(publicRevision)
  await expect(page.locator('main')).toContainText(
    'Modo prueba: sin cobro real.',
  )
})

test('El dashboard operativo incluye los pedidos de prueba pendientes y actualiza los contadores después de una escritura confirmada', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  ordersNetwork.orders = ordersNetwork.orders.slice(0, 4)
  await admin(page, supabaseNetwork)
  await expect(
    page.locator('.admin-order-overview').getByRole('link', {
      name: 'Ver 4 pedidos nuevos',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.locator('.admin-order-overview').getByRole('link', {
      name: 'Ver 0 pedidos en preparación',
      exact: true,
    }),
  ).toBeVisible()
  const initialDashboardReads = ordersNetwork.calls.filter(
    (call) =>
      call.name === 'admin_order_list' && call.body.p_mode === 'dashboard',
  )
  expect(initialDashboardReads).toHaveLength(1)
  expect(initialDashboardReads[0].body.p_query).toEqual({
    includeSimulation: true,
  })
  const reference = ordersNetwork.orders[0].reference
  const result = await page.evaluate(async (reference) => {
    const source = '/src/services/order-admin-service.ts'
    const { orderAdminService } = (await import(
      source
    )) as typeof import('../src/services/order-admin-service')
    return orderAdminService.setOrderStatus(reference, 'preparing', {
      expectedVersions: { [reference]: 1 },
    })
  }, reference)
  expect(result.kind).toBe('saved')
  await expect(
    page.locator('.admin-order-overview').getByRole('link', {
      name: 'Ver 1 pedidos en preparación',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.locator('.admin-order-overview').getByRole('link', {
      name: 'Ver 3 pedidos nuevos',
      exact: true,
    }),
  ).toBeVisible()
  expect(
    ordersNetwork.calls.filter(
      (call) =>
        call.name === 'admin_order_list' && call.body.p_mode === 'dashboard',
    ),
  ).toHaveLength(2)
  expect(
    ordersNetwork.calls.filter((call) => call.name === 'admin_orders'),
  ).toHaveLength(0)
  expect(ordersNetwork.orders[0].paymentStatus).toBe('pending')
  expect(ordersNetwork.history).toHaveLength(1)
  await expect(
    page
      .locator('.admin-metric-card')
      .filter({ hasText: 'Pedidos por preparar' })
      .locator('strong'),
  ).toHaveText('4')
})

test('Volver de un pedido en preparación al resumen recupera la agregación actual sin recargar el documento', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  ordersNetwork.orders = ordersNetwork.orders.slice(0, 3)
  await admin(page, supabaseNetwork)
  const reference = ordersNetwork.orders[0].reference
  await page
    .locator('.admin-recent-orders')
    .getByRole('link', { name: `Ver pedido ${reference}`, exact: true })
    .click()
  await page.getByRole('radio', { name: 'En preparación', exact: true }).check()
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Historial del pedido' }),
  ).toContainText('En preparación')
  await page.getByRole('link', { name: 'Resumen', exact: true }).click()
  await expect(page).toHaveURL('/admin')
  await expect(
    page
      .locator('.admin-order-overview')
      .getByRole('link', { name: 'Ver 1 pedidos en preparación', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .locator('.admin-order-overview')
      .getByRole('link', { name: 'Ver 2 pedidos nuevos', exact: true }),
  ).toBeVisible()
  expect(ordersNetwork.orders[0].paymentStatus).toBe('pending')
})

test('Un guardado confirmado no depende de otra lectura y no duplica el historial', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  ordersNetwork.orders = ordersNetwork.orders.slice(0, 10)
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  ordersNetwork.failReadsAfterWrite = true
  await page
    .getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' })
    .check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(page.locator('.admin-order-bulk-report')).toContainText(
    '10 actualizados',
  )
  expect(ordersNetwork.history).toHaveLength(10)
  await expect(page.locator('.admin-order-workspace tbody')).toContainText(
    'En preparación',
  )
})

test('Persistir otro módulo no copia pedidos ni clientes remotos a IndexedDB', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  const reference = ordersNetwork.orders.at(-1)!.reference
  await expect(page.locator('.admin-order-workspace tbody')).toContainText(
    reference,
  )
  const persisted = await page.evaluate(async () => {
    const modulePath = '/src/services/admin-service.ts'
    const { adminService } = await import(modulePath)
    await adminService.retryPersistence()
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('aroma-infini-admin', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction('snapshot', 'readonly')
          .objectStore('snapshot')
          .get('current')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  })
  expect(JSON.stringify(persisted)).not.toContain(reference)
  expect(JSON.stringify(persisted)).not.toContain('ana@example.invalid')
})

test('Una denegación administrativa borra la caché privada y una lectura antigua no puede restaurarla', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  let release!: () => void
  ordersNetwork.holdNextRead = new Promise<void>((resolve) => {
    release = resolve
  })
  const reads = ordersNetwork.calls.filter(
    (call) => call.name === 'admin_orders',
  ).length
  try {
    await page.evaluate(async () => {
      const modulePath = '/src/services/order-admin-service.ts'
      const service = await import(modulePath)
      void service.loadAdminOrders(true).catch(() => {})
    })
    await expect
      .poll(
        () =>
          ordersNetwork.calls.filter((call) => call.name === 'admin_orders')
            .length,
      )
      .toBe(reads + 1)
    ordersNetwork.denied = true
    await page.evaluate(async () => {
      const modulePath = '/src/services/order-admin-service.ts'
      const service = await import(modulePath)
      await service.loadAdminOrders(true).catch(() => {})
    })
    release()
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const modulePath = '/src/services/admin-service.ts'
          const { adminService } = await import(modulePath)
          return adminService.getSnapshot().orders.length
        }),
      )
      .toBe(0)
    await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(0)
  } finally {
    release()
  }
})

test('Mis pedidos se consulta por propietario y nunca muestra los pedidos de otro usuario', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  void ordersNetwork
  await signIn(page)
  await page.goto('/cuenta/pedidos')
  await expect(page.locator('.account-order-list > li')).toHaveCount(2)
  await expect(page.locator('.account-order-list')).toContainText('Modo prueba')
  await page.goto('/cuenta/pagos')
  await expect(page.locator('main')).toContainText('Prueba · sin cobro')
  supabaseNetwork.currentUserId = customerB
  await supabaseNetwork.seedSession(page)
  await page.reload()
  await page.goto('/cuenta/pedidos')
  await expect(page.locator('.account-order-list > li')).toHaveCount(0)
  await expect(page.locator('main')).toContainText('Aún no hay pedidos')
})

test('El seguimiento requiere el enlace privado o propietario y sólo presenta el estado', async ({
  page,
  ordersNetwork,
}) => {
  const reference = ordersNetwork.orders[0].reference
  await page.goto(`/seguir-pedido?codigo=${reference}`)
  await expect(page.locator('.tracking-not-found')).toContainText(
    'enlace privado',
  )
  await page.goto(`/seguir-pedido?codigo=${reference}#acceso=${token}`)
  await expect(page.locator('.tracking-result')).toContainText(
    'Estado: recibido',
  )
  await expect(page.locator('.tracking-result')).not.toContainText(
    'ana@example.invalid',
  )
  const calls = ordersNetwork.calls.filter(
    (call) => call.name === 'order_tracking',
  )
  expect(calls.at(-1)?.body.p_token).toBe(token)
  await expect(page.locator('.tracking-result')).toContainText(
    'Pedido de prueba',
  )
})

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
])
  test(`Pedidos remotos conserva composición y selección en ${width}×${height}`, async ({
    page,
    supabaseNetwork,
    ordersNetwork,
  }) => {
    void ordersNetwork
    await page.setViewportSize({ width, height })
    await admin(page, supabaseNetwork)
    await page.goto('/admin/pedidos')
    await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(
      20,
    )
    const desktopSelection = page.locator(
      '.admin-work-order-table thead input[type="checkbox"]',
    )
    await expect(desktopSelection).toBeVisible()
    await desktopSelection.focus()
    await expect(desktopSelection).toBeFocused()
    await page
      .getByRole('checkbox', { name: /^Seleccionar pedido AI-/ })
      .first()
      .check()
    await page
      .getByRole('button', { name: 'Seleccionar los 100 pedidos filtrados' })
      .click()
    await expect(
      page.getByRole('region', { name: 'Acciones para pedidos seleccionados' }),
    ).toContainText('100 pedidos seleccionados')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await mkdir('artifacts/orders-supabase/screenshots', { recursive: true })
    await page.screenshot({
      path: `artifacts/orders-supabase/screenshots/orders-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })

interface OrderRefreshFrames {
  pending(): number
  flush(): void
  restore(): void
}

type OrderRefreshWindow = typeof window & {
  orderRefreshFrames: OrderRefreshFrames
}

/** Hold only browser frames; application services and SDK HTTP stay real. */
async function holdOrderRefreshFrames(page: Page) {
  await page.evaluate(() => {
    let nextId = 0
    const frames = new Map<number, FrameRequestCallback>()
    const requestFrame = window.requestAnimationFrame
    const cancelFrame = window.cancelAnimationFrame
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId
      frames.set(id, callback)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      frames.delete(id)
    }
    ;(window as OrderRefreshWindow).orderRefreshFrames = {
      pending: () => frames.size,
      flush() {
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback(performance.now()))
      },
      restore() {
        window.requestAnimationFrame = requestFrame
        window.cancelAnimationFrame = cancelFrame
        frames.clear()
      },
    }
  })
}

test.afterEach(async ({ page }, testInfo) => {
  if (!testInfo.title.startsWith('El regreso a la pestaña') || page.isClosed())
    return
  await page.evaluate(() => {
    ;(window as Partial<OrderRefreshWindow>).orderRefreshFrames?.restore()
  })
})

test('El regreso a la pestaña agrupa foco y visibilidad en una lectura y conserva los siguientes refrescos', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  const rows = page.locator('.admin-order-workspace tbody')
  await expect(rows.locator('tr')).toHaveCount(20)
  const readCount = () =>
    ordersNetwork.calls.filter(({ name }) => name === 'admin_order_list').length
  const initialReads = readCount()
  await holdOrderRefreshFrames(page)
  for (const [index, events] of [
    ['focus', 'visibilitychange'],
    ['focus'],
    ['focus'],
  ].entries()) {
    const customerName = `Cliente refrescado ${index + 1}`
    ordersNetwork.orders = ordersNetwork.orders.map((order) => ({
      ...order,
      customerName,
    }))
    await page.evaluate((events) => {
      for (const event of events)
        (event === 'focus' ? window : document).dispatchEvent(new Event(event))
      ;(window as OrderRefreshWindow).orderRefreshFrames.flush()
    }, events)
    await expect(rows).toContainText(customerName)
    expect(readCount()).toBe(initialReads + index + 1)
  }
  // Forced focus refresh must still observe immediate server-side revocation.
  ordersNetwork.denied = true
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    ;(window as OrderRefreshWindow).orderRefreshFrames.flush()
  })
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(0)
  expect(readCount()).toBe(initialReads + 4)
})

test('El resumen revalida al recibir un pedido y al recuperar foco sin duplicar consultas ni conservar acceso revocado', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  ordersNetwork.orders = ordersNetwork.orders.slice(0, 2)
  await admin(page, supabaseNetwork)
  await expect(
    page
      .locator('.admin-order-overview')
      .getByRole('link', { name: 'Ver 2 pedidos nuevos', exact: true }),
  ).toBeVisible()
  const count = () =>
    ordersNetwork.calls.filter(
      (call) =>
        call.name === 'admin_order_list' && call.body.p_mode === 'dashboard',
    ).length
  const before = count()
  await holdOrderRefreshFrames(page)
  try {
    ordersNetwork.orders[0].status = 'preparing'
    ordersNetwork.orders[0].version = 2
    await page.evaluate(async () => {
      const source = '/src/domain/order-events.ts'
      const { notifyAdminOrdersChanged } = (await import(
        source
      )) as typeof import('../src/domain/order-events')
      notifyAdminOrdersChanged()
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      ;(window as OrderRefreshWindow).orderRefreshFrames.flush()
    })
    await expect(
      page
        .locator('.admin-order-overview')
        .getByRole('link', {
          name: 'Ver 1 pedidos en preparación',
          exact: true,
        }),
    ).toBeVisible()
    expect(count()).toBe(before + 1)
    ordersNetwork.denied = true
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      ;(window as OrderRefreshWindow).orderRefreshFrames.flush()
    })
    await expect(page.locator('.admin-order-overview')).toHaveCount(0)
    expect(count()).toBe(before + 2)
  } finally {
    await page.evaluate(() => {
      ;(window as OrderRefreshWindow).orderRefreshFrames.restore()
    })
  }
})

test('Una lectura de foco anterior no reemplaza la página confirmada por la escritura atómica', async ({ page, supabaseNetwork, ordersNetwork }) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  let release!: () => void
  ordersNetwork.holdNextRead = new Promise<void>(resolve => { release = resolve })
  const before = ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length).toBe(before + 1)
  try {
    await page.getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' }).check()
    await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click()
    await expect(page.locator('.admin-order-bulk-report')).toContainText('20 actualizados')
  } finally { release() }
  await expect(page.locator('.admin-order-workspace tbody tr').first()).toContainText('En preparación')
  expect(ordersNetwork.history).toHaveLength(20)
})

test('El regreso a la pestaña cancela la lectura pendiente al ocultarse', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  const initialReads = ordersNetwork.calls.filter(
    ({ name }) => name === 'admin_orders',
  ).length
  await holdOrderRefreshFrames(page)
  const pending = await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    const frames = (window as OrderRefreshWindow).orderRefreshFrames
    const pending = frames.pending()
    frames.flush()
    return pending
  })
  expect(pending).toBe(0)
  expect(
    ordersNetwork.calls.filter(({ name }) => name === 'admin_orders'),
  ).toHaveLength(initialReads)
})

test('El regreso a la pestaña cancela la lectura pendiente al salir sin errores', async ({
  page,
  supabaseNetwork,
  ordersNetwork,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  const initialReads = ordersNetwork.calls.filter(
    ({ name }) => name === 'admin_orders',
  ).length
  await holdOrderRefreshFrames(page)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document
      .querySelector<HTMLAnchorElement>('a[href="/admin/productos"]')!
      .click()
  })
  await expect(page).toHaveURL('/admin/productos')
  await expect(
    page.getByRole('heading', { name: 'Productos', exact: true }),
  ).toBeVisible()
  const pending = await page.evaluate(() => {
    const frames = (window as OrderRefreshWindow).orderRefreshFrames
    const pending = frames.pending()
    frames.flush()
    return pending
  })
  expect(pending).toBe(0)
  expect(
    ordersNetwork.calls.filter(({ name }) => name === 'admin_orders'),
  ).toHaveLength(initialReads)
  expect(errors).toEqual([])
})

test('Paginación remota: seis mil pedidos conservan selección entre páginas sin snapshot completo', async ({ page, supabaseNetwork, ordersNetwork }) => {
  ordersNetwork.orders = Array.from({ length: 6000 }, (_, index) => makeOrder(index + 1))
  await admin(page, supabaseNetwork)
  ordersNetwork.calls.length = 0
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  await expect(page.getByRole('navigation', { name: 'Paginación de pedidos' })).toContainText('Página 1 de 300')
  expect(ordersNetwork.calls.filter(c => c.name === 'admin_orders')).toHaveLength(0)
  expect(ordersNetwork.calls.filter(c => c.name === 'admin_order_list' && c.body.p_mode === 'selection')).toHaveLength(0)
  await page.getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' }).check()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Paginación de pedidos' })).toContainText('Página 2 de 300')
  await expect(page.locator('.admin-order-selection-bar')).toContainText('20 pedidos seleccionados')
  await page.getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' }).check()
  await expect(page.locator('.admin-order-selection-bar')).toContainText('40 pedidos seleccionados')
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click()
  await expect(page.locator('.admin-order-bulk-report')).toContainText('40 actualizados')
  expect(ordersNetwork.history).toHaveLength(40)
  expect(ordersNetwork.calls.filter(c => c.name === 'admin_set_order_statuses_page')).toHaveLength(1)
  await page.setViewportSize({ width: 390, height: 844 })
  // Resizing can finish before Chrome has settled the responsive layout.
  // Observe the real geometry; a persistent overflow still fails this check.
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          viewportWidth: innerWidth,
          horizontalOverflow: Math.max(
            0,
            document.documentElement.scrollWidth - innerWidth - 1,
          ),
        })),
      { message: 'Pedidos sin desbordamiento en pantalla de 390 px' },
    )
    .toEqual({ viewportWidth: 390, horizontalOverflow: 0 })
})

for (const width of [360, 390, 430, 768, 1024]) {
  test(`Pedidos móviles ${width}: selección de página, paginación remota y todos los filtrados comparten una sola operación confirmada`, async ({
    page,
    supabaseNetwork,
    ordersNetwork,
  }) => {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 })
    ordersNetwork.orders = Array.from({ length: 65 }, (_, index) => makeOrder(index + 1))
    await admin(page, supabaseNetwork)
    await page.goto('/admin/pedidos')
    const selected = page.locator('.admin-order-selection-bar')
    const pageSelection = page.getByRole('checkbox', { name: 'Seleccionar pedidos de esta página', exact: true })
    await expect(pageSelection).toHaveCount(1)
    await expect(pageSelection).toBeVisible()
    const target = page.locator('.admin-order-page-selection .admin-order-checkbox-target')
    await expect(target).toContainText('Seleccionar esta página')
    const targetBox = await target.boundingBox()
    expect(targetBox!.height).toBeGreaterThanOrEqual(44)
    expect(targetBox!.width).toBeGreaterThanOrEqual(44)
    await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
    const firstRow = page.locator('.admin-order-workspace tbody tr').first()
    const dates = page.getByRole('button', { name: 'Filtrar por fecha', exact: true })
    if (width < 768) {
      await expect(page.getByLabel('Desde', { exact: true })).not.toBeVisible()
      await dates.click()
      await expect(dates).toHaveAttribute('aria-expanded', 'true')
      await page.getByLabel('Desde', { exact: true }).fill('2026-10-01')
      await dates.click()
      await expect(page.getByLabel('Desde', { exact: true })).toHaveValue('2026-10-01')
      await dates.click()
      await expect(page.getByLabel('Desde', { exact: true })).toBeVisible()
      await page.getByLabel('Desde', { exact: true }).fill('')
      await dates.click()
    } else {
      await expect(dates).not.toBeVisible()
      await expect(page.getByLabel('Desde', { exact: true })).toBeVisible()
    }
    await firstRow.getByRole('checkbox').check()
    await expect(pageSelection).toHaveJSProperty('indeterminate', true)
    await pageSelection.check()
    await expect(selected).toContainText('20 pedidos seleccionados')
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Paginación de pedidos' })).toContainText('Página 2 de 4')
    await expect(selected).toContainText('20 pedidos seleccionados')
    await expect(pageSelection).not.toBeChecked()
    await pageSelection.check()
    await expect(selected).toContainText('40 pedidos seleccionados')
    await page.getByRole('button', { name: 'Anterior', exact: true }).click()
    await expect(pageSelection).toBeChecked()
    await pageSelection.uncheck()
    await expect(selected).toContainText('20 pedidos seleccionados')
    await pageSelection.check()
    await selected.getByRole('button', { name: 'Seleccionar los 65 pedidos filtrados', exact: true }).click()
    await expect(selected).toContainText('65 pedidos seleccionados')
    expect(ordersNetwork.calls.filter(call => call.name === 'admin_order_list' && call.body.p_mode === 'selection')).toHaveLength(1)
    expect(ordersNetwork.calls.filter(call => call.name === 'admin_orders')).toHaveLength(0)
    await selected.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Actualizar 65 pedidos', exact: true })
    await expect(confirmation).toBeVisible()
    await expect(confirmation.getByRole('button', { name: 'Confirmar actualización', exact: true })).toBeInViewport()
    expect(ordersNetwork.calls.filter(call => call.name === 'admin_set_order_statuses_page')).toHaveLength(0)
    await confirmation.getByRole('button', { name: 'Confirmar actualización', exact: true }).click()
    await expect(page.locator('.admin-order-bulk-report')).toContainText('65 actualizados')
    expect(ordersNetwork.calls.filter(call => call.name === 'admin_set_order_statuses_page')).toHaveLength(1)
    expect(ordersNetwork.history).toHaveLength(65)
    expect(new Set(ordersNetwork.history.map(entry => entry.reference)).size).toBe(65)
    await expect(selected).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Estado del pedido', exact: true }).selectOption('preparing')
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Paginación de pedidos' })).toContainText('Página 1 de 4')
    await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
    await expect(selected).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}

test('Una selección de más de cien pedidos conserva datos y explica el límite real del comando', async ({ page, supabaseNetwork, ordersNetwork }) => {
  ordersNetwork.orders = Array.from({ length: 101 }, (_, index) => makeOrder(index + 1))
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await page.getByRole('checkbox', { name: 'Seleccionar pedidos de esta página' }).check()
  await page.getByRole('button', { name: 'Seleccionar los 101 pedidos filtrados' }).click()
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('entre uno y cien pedidos')
  expect(ordersNetwork.history).toHaveLength(0)
  expect(ordersNetwork.calls.filter(c => c.name.startsWith('admin_set_order_statuses'))).toHaveLength(0)
})

test('Paginación remota: clientes solicitan 25 filas y conservan búsqueda y destino de pedidos', async ({ page, supabaseNetwork, ordersNetwork }) => {
  // HTTP/UI scenario only: commercial payments remain disabled in hosted SQL.
  ordersNetwork.orders = Array.from({ length: 2000 }, (_, index) => ({ ...makeOrder(index + 1), simulation: false, customerId: `50000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`, customerName: `Cliente ${String(index).padStart(5, '0')}` }))
  await admin(page, supabaseNetwork)
  ordersNetwork.calls.length = 0
  await page.goto('/admin/clientes')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(25)
  await expect(page.getByRole('navigation', { name: 'Paginación de clientes' })).toContainText('Página 1 de 80')
  expect(ordersNetwork.calls.filter(c => c.name === 'admin_orders')).toHaveLength(0)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Paginación de clientes' })).toContainText('Página 2 de 80')
  await page.getByRole('searchbox').fill('Cliente 01999')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table tbody')).toContainText('Cliente 01999')
  await page.getByRole('link', { name: 'Ver pedidos de Cliente 01999', exact: true }).click()
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(1)
})

test('Lecturas protegidas: SQL comienza sin esperar Auth y solo se comparte mientras está pendiente', async ({ page, supabaseNetwork, ordersNetwork }) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  ordersNetwork.calls.length = 0
  let release!: () => void
  const identityGate = new Promise<void>(resolve => { release = resolve })
  let identityCalls = 0
  await page.route(`${origin}/auth/v1/user`, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    identityCalls++
    await identityGate
    await route.fallback()
  })
  let finished = false
  const reading = page.evaluate(async () => {
    const source = '/src/services/order-admin-service.ts'
    const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
    const results = await Promise.all([readAdminOrderList({}, 1), readAdminOrderList({}, 1)])
    return results.map(result => result.total)
  }).then(value => { finished = true; return value })
  try {
    await expect.poll(() => identityCalls).toBe(1)
    // With the old serial actor(), this cannot happen until identity is released.
    await expect.poll(() => ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length).toBe(1)
    expect(finished).toBe(false)
    release()
    expect(await reading).toEqual([100, 100])
    await page.evaluate(async () => {
      const source = '/src/services/order-admin-service.ts'
      const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
      return readAdminOrderList({}, 1)
    })
    // No completed authorization or page cache: the next read is fresh.
    expect(identityCalls).toBe(2)
    expect(ordersNetwork.calls.filter(c => c.name === 'admin_order_list')).toHaveLength(2)
  } finally {
    release()
    await reading.catch(() => {})
  }
})

test('Lecturas protegidas: una página SQL correcta no se publica si Auth rechaza la identidad', async ({ page, supabaseNetwork, ordersNetwork }) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  ordersNetwork.calls.length = 0
  await page.route(`${origin}/auth/v1/user`, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 401, headers, json: { code: 'bad_jwt', message: 'Isolated rejected identity' } })
  })
  const result = await page.evaluate(async () => {
    const source = '/src/services/order-admin-service.ts'
    const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
    try { return { published: true, total: (await readAdminOrderList({}, 1)).total } }
    catch (error) { return { published: false, code: error instanceof Error && 'code' in error ? error.code : null } }
  })
  expect(ordersNetwork.calls.filter(c => c.name === 'admin_order_list')).toHaveLength(1)
  expect(result).toEqual({ published: false, code: 'orders-session' })
})

test('Lecturas protegidas: un guardado invalida una página anterior sin perder la escritura confirmada', async ({ page, supabaseNetwork, ordersNetwork }) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  ordersNetwork.calls.length = 0
  let release!: () => void
  ordersNetwork.holdNextRead = new Promise<void>(resolve => { release = resolve })
  const reading = page.evaluate(async () => {
    const source = '/src/services/order-admin-service.ts'
    const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
    try { await readAdminOrderList({}, 1); return 'published' }
    catch (error) { return error instanceof Error && 'code' in error ? error.code : 'unknown' }
  })
  try {
    await expect.poll(() => ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length).toBe(1)
    const reference = ordersNetwork.orders[0].reference
    const saved = await page.evaluate(async reference => {
      const source = '/src/services/order-admin-service.ts'
      const { orderAdminService } = await import(source) as typeof import('../src/services/order-admin-service')
      return orderAdminService.bulkSetOrderStatus([reference], 'preparing', undefined, undefined, { expectedVersions: { [reference]: 1 } })
    }, reference)
    expect(saved.kind).toBe('updated')
    release()
    expect(await reading).toBe('superseded-read')
    expect(ordersNetwork.orders[0].version).toBe(2)
    const fresh = await page.evaluate(async reference => {
      const source = '/src/services/order-admin-service.ts'
      const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
      return (await readAdminOrderList({search: reference}, 1)).orders.find(order => order.reference === reference)?.version
    }, reference)
    expect(fresh).toBe(2)
  } finally {
    release()
    await reading.catch(() => {})
  }
})

for (const revoke of ['logout', 'permissions', 'mfa'] as const)
  test(`Lecturas protegidas: ${revoke} mientras llega SQL descarta la página privada`, async ({ page, supabaseNetwork, ordersNetwork }) => {
    await admin(page, supabaseNetwork)
    await page.goto('/admin/pedidos')
    await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
    ordersNetwork.calls.length = 0
    let release!: () => void
    ordersNetwork.holdNextRead = new Promise<void>(resolve => { release = resolve })
    const reading = page.evaluate(async () => {
      const source = '/src/services/order-admin-service.ts'
      const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
      try { await readAdminOrderList({}, 1); return 'published' }
      catch (error) { return error instanceof Error && 'code' in error ? error.code : 'unknown' }
    })
    try {
      await expect.poll(() => ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length).toBe(1)
      if (revoke === 'permissions') supabaseNetwork.adminMembership = false
      if (revoke === 'mfa') await page.route(`${origin}/rest/v1/rpc/current_actor`, async route => {
        if (route.request().method() === 'OPTIONS') return route.fallback()
        await route.fulfill({ headers, json: { user_id: customerA, role: 'admin', aal: 'aal1', requires_mfa: true, trusted_device: false, trusted_until: null } })
      })
      await page.evaluate(async revoke => {
        const source = '/src/services/auth-service.ts'
        const { adminAuthService: authService } = await import(source) as typeof import('../src/services/auth-service')
        if (revoke === 'logout') await authService.signOut()
        else await authService.refresh()
      }, revoke)
      release()
      expect(await reading).toBe('orders-session')
      expect(await page.evaluate(async () => {
        const source = '/src/services/admin-service.ts'
        const { adminService } = await import(source) as typeof import('../src/services/admin-service')
        return adminService.getSnapshot().orders.length
      })).toBe(0)
    } finally {
      release()
      await reading.catch(() => {})
    }
  })

test('Lecturas protegidas: renovar el token del mismo administrador descarta la respuesta sin revocar su acceso', async ({ page, supabaseNetwork, ordersNetwork }) => {
  await admin(page, supabaseNetwork)
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-order-workspace tbody tr')).toHaveCount(20)
  ordersNetwork.calls.length = 0
  let release!: () => void
  ordersNetwork.holdNextRead = new Promise<void>(resolve => { release = resolve })
  const before = await page.evaluate(async () => {
    const source = '/src/services/admin-list-access.ts'
    const { adminListAccess } = await import(source) as typeof import('../src/services/admin-list-access')
    return adminListAccess.getSnapshot()
  })
  const reading = page.evaluate(async () => {
    const source = '/src/services/order-admin-service.ts'
    const { readAdminOrderList } = await import(source) as typeof import('../src/services/order-admin-service')
    try { await readAdminOrderList({}, 1); return 'published' }
    catch (error) { return error instanceof Error && 'code' in error ? error.code : 'unknown' }
  })
  try {
    await expect.poll(() => ordersNetwork.calls.filter(c => c.name === 'admin_order_list').length).toBe(1)
    await page.evaluate(async () => {
      const sdkPath = '/src/services/supabase-client.ts'
      const authPath = '/src/services/auth-service.ts'
      const { requireAdminSupabaseClient: requireSupabaseClient } = await import(sdkPath) as typeof import('../src/services/supabase-client')
      const { adminAuthService: authService } = await import(authPath) as typeof import('../src/services/auth-service')
      const client = requireSupabaseClient()
      const session = (await client.auth.getSession()).data.session!
      const parts = session.access_token.split('.')
      const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      claims.iat += 1
      const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
      await client.auth.setSession({ access_token: `${parts[0]}.${encoded}.${parts[2]}`, refresh_token: session.refresh_token })
      await authService.refresh()
    })
    release()
    expect(await reading).toBe('superseded-read')
    const after = await page.evaluate(async () => {
      const accessPath = '/src/services/admin-list-access.ts'
      const authPath = '/src/services/auth-service.ts'
      const { adminListAccess } = await import(accessPath) as typeof import('../src/services/admin-list-access')
      const { adminAuthService: authService } = await import(authPath) as typeof import('../src/services/auth-service')
      return { revision: adminListAccess.getSnapshot(), role: authService.getSnapshot().session?.user.role, status: authService.getSnapshot().status }
    })
    expect(after).toEqual({ revision: before, role: 'admin', status: 'authenticated' })
  } finally {
    release()
    await reading.catch(() => {})
  }
})
