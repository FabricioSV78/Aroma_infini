import { randomUUID } from 'node:crypto'
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
      if (state.unavailable && name === 'admin_orders') {
        await reply(
          { code: 'PGRST000', message: 'Isolated service unavailable' },
          503,
        )
        return
      }
      if (state.denied && name === 'admin_orders') {
        await reply(
          { code: '42501', message: 'Isolated revoked membership' },
          403,
        )
        return
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
        const held = state.holdNextRead
        state.holdNextRead = null
        if (held) await held
        const start = Number(body.p_offset ?? 0),
          size = Number(body.p_limit ?? 100)
        await reply({
          orders: state.orders.slice(start, start + size),
          orderHistory: state.history,
          total: state.orders.length,
        })
        return
      }
      if (name === 'admin_set_order_statuses') {
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
      (call) => call.name === 'admin_set_order_statuses',
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
  await page.getByRole('radio', { name: 'En preparación', exact: true }).check()
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Historial del pedido' }),
  ).toContainText('Ana Torres')
  expect(ordersNetwork.orders[0].status).toBe('preparing')
  await expect(page.locator('main')).toContainText(
    'no representa un cobro real',
  )
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
    if (width < 1200) {
      await expect(desktopSelection).toBeHidden()
      const skippedHiddenControl = await desktopSelection.evaluate(
        (element) => {
          ;(element as HTMLInputElement).focus()
          return document.activeElement !== element
        },
      )
      expect(skippedHiddenControl).toBe(true)
    } else await expect(desktopSelection).toBeVisible()
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
