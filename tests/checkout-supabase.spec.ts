import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import type { Page } from '@playwright/test'
import {
  publicBrandPreviewsFixture,
  publicHomeCatalogFixture,
} from './public-home-catalog-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { AdminOrder, AdminProduct } from '../src/types/admin'
import type { OrderHistoryEntry } from '../src/types/order-workflow'
import type { MockOrder } from '../src/services/checkout-service'
import {
  customerA,
  customerB,
  test as authTest,
  expect,
  fixtureProject,
  signIn,
} from './supabase-auth-fixture'
const origin = `https://${fixtureProject}.supabase.co`,
  variantId = '50000000-0000-4000-8000-000000000001',
  productId = '60000000-0000-4000-8000-000000000001',
  brandId = '70000000-0000-4000-8000-000000000001'
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
const line = {
  variantId,
  name: 'Perfume de prueba remoto',
  brand: 'Casa de prueba',
  productSlug: 'perfume-de-prueba',
  image: '/images/petale-960.webp',
  ml: 50,
  quantity: 1,
  unitPriceCents: 12000,
}
const record: AdminProduct = {
  active: true,
  gender: 'unisex',
  popularity: 1,
  newest: 1,
  lowStockThreshold: 2,
  product: {
    id: productId,
    sku: '10000',
    name: line.name,
    slug: line.productSlug,
    brandId,
    productType: 'perfume',
    family: 'Floral',
    olfactoryFamilies: ['floral'],
    image: line.image,
    discount: null,
    variants: [
      {
        id: variantId,
        sku: '1000',
        ml: 50,
        priceCents: 12000,
        stock: 5,
        active: true,
      },
    ],
  },
  detail: {
    shortDescription: 'Prueba aislada.',
    description: 'Prueba aislada de checkout.',
    olfactoryImage: line.image,
    notes: { top: [], heart: [], base: [] },
    intensity: 'Suave',
    intensityLevel: 1,
    occasion: 'Diario',
    season: 'Todo el año',
    gallery: [{ image: line.image, alt: line.name, framing: 'full' }],
    recommendationIds: [],
  },
}
const shipping = {
  freeThresholdCents: 45000,
  provinceShippingEnabled: false,
  nationalCourierFeeCents: 2000,
  nationalEstimate: '2 a 4 días',
  zones: [
    {
      id: 'lima',
      name: 'Lima',
      department: 'lima',
      province: '1501',
      district: null,
      courierFeeCents: 1000,
      motorizadoFeeCents: 1500,
      estimate: '1 a 2 días',
      active: true,
    },
  ],
}
interface Network {
  writes: Record<string, unknown>[]
  quotes: Record<string, unknown>[]
  failWrite: boolean
  conflict: boolean
  failQuote: boolean
  lostResponse: boolean
  price: number
  configured: boolean
  order: AdminOrder | null
  ownerId: string | null
  trackingToken: string
  history: OrderHistoryEntry[]
  statusWrites: Record<string, unknown>[]
  beforeResponse?: () => Promise<void>
  beforeQuoteResponse?: () => Promise<void>
}
const test = authTest.extend<{ checkoutNetwork: Network }>({
  checkoutNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    const state: Network = {
      writes: [],
      quotes: [],
      failWrite: false,
      conflict: false,
      failQuote: false,
      lostResponse: false,
      price: 12000,
      configured: true,
      order: null,
      ownerId: null,
      trackingToken: '',
      history: [],
      statusWrites: [],
    }
    const orders = new Map<
      string,
      { order: MockOrder & { paymentStatus: 'pending' } }
    >()
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request(),
        name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        !name.startsWith('admin_') &&
        ![
          'checkout_quote',
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
      const body = request.postDataJSON() as Record<string, unknown>,
        reply = (json: unknown, status = 200) =>
          route.fulfill({ json, status, headers })
      const metadata = {
        features: { complementsEnabled: false },
        featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: null,
        homeVersion: 0,
        shipping: state.configured ? shipping : null,
        shippingVersion: state.configured ? 1 : 0,
      }
      if (name === 'catalog_settings') await reply(metadata)
      else if (name === 'catalog_home_context')
        await reply(
          publicHomeCatalogFixture(
            {
              ...metadata,
              brands: [
                { id: brandId, name: line.brand, slug: 'casa-de-prueba' },
              ],
            },
            [record],
          ),
        )
      else if (name === 'catalog_brand_previews')
        await reply(
          publicBrandPreviewsFixture(
            [{ id: brandId, name: line.brand, slug: 'casa-de-prueba' }],
            [record],
          ),
        )
      else if (name === 'commerce_settings')
        await reply({
          shipping: metadata.shipping,
          shippingVersion: metadata.shippingVersion,
        })
      else if (name === 'catalog_brands')
        await reply([
          {
            id: brandId,
            name: line.brand,
            slug: 'casa-de-prueba',
            active: true,
          },
        ])
      else if (name === 'customer_orders') {
        const order = state.order
        await reply(
          order && state.ownerId === supabaseNetwork.currentUserId
            ? [
                {
                  ...order,
                  userId: state.ownerId,
                  address: {
                    ...order.address,
                    id: order.id,
                    label: 'Entrega',
                    recipient: order.customerName,
                  },
                  payment: {
                    provider: order.paymentProvider,
                    status: order.paymentStatus,
                  },
                },
              ]
            : [],
        )
      } else if (name === 'home_document') {
        await reply({ media: null, content: null, version: 0, mediaAssets: [] })
      } else if (name === 'admin_catalog_page') {
        await reply({
          ...metadata,
          products: [record],
          brands: [
            {
              id: brandId,
              name: line.brand,
              slug: 'casa-de-prueba',
              active: true,
            },
          ],
          productVersions: { [productId]: 1 },
          brandVersions: { [brandId]: 1 },
          settingsVersion: 1,
          total: 1,
        })
      } else if (name === 'admin_commerce_settings') {
        await reply({
          shipping: metadata.shipping,
          shippingVersion: metadata.shippingVersion,
          coupons: [],
          couponVersions: {},
        })
      } else if (name === 'admin_orders') {
        expect(request.headers().authorization).toMatch(/^Bearer ey/)
        await reply({
          orders: state.order ? [state.order] : [],
          orderHistory: state.history,
          total: state.order ? 1 : 0,
        })
      } else if (name === 'admin_set_order_statuses') {
        expect(request.headers().authorization).toMatch(/^Bearer ey/)
        state.statusWrites.push(body)
        const changes = body.p_changes as Array<{
          reference: string
          expectedVersion: number
        }>
        const order = state.order
        if (
          !order ||
          changes.length !== 1 ||
          changes[0].reference !== order.reference ||
          changes[0].expectedVersion !== order.version
        ) {
          await reply({ code: 'PT409', message: 'Isolated stale order' }, 409)
          return
        }
        const previous = order.status
        order.status = body.p_status as AdminOrder['status']
        order.version!++
        state.history.push({
          id: randomUUID(),
          reference: order.reference,
          fromStatus: previous,
          toStatus: order.status,
          changedAt: new Date().toISOString(),
          operationId: String(body.p_operation_id),
          source: body.p_source as OrderHistoryEntry['source'],
          operator: {
            id: supabaseNetwork.currentUserId,
            name: 'Beatriz Rojas',
            verified: true,
          },
        })
        await reply({
          kind: 'updated',
          operationId: body.p_operation_id,
          updated: [order.reference],
          skipped: [],
          errors: [],
          orders: [order],
          orderHistory: state.history,
        })
      } else if (name === 'order_tracking') {
        const order = state.order
        const owned =
          request.headers().authorization?.startsWith('Bearer ey') &&
          state.ownerId === supabaseNetwork.currentUserId
        await reply(
          order &&
            order.reference === body.p_reference &&
            (owned || body.p_token === state.trackingToken)
            ? {
                reference: order.reference,
                placedAt: order.placedAt,
                status: order.status,
                mode: state.ownerId ? 'demo-account' : 'guest',
                simulation: true,
              }
            : null,
        )
      } else if (
        name === 'catalog_products' ||
        name === 'catalog_products_by_ids'
      )
        await reply({ items: [record], total: 1 })
      else if (name === 'checkout_quote') {
        state.quotes.push(body)
        await state.beforeQuoteResponse?.()
        if (state.failQuote) {
          await reply({ code: 'PGRST000' }, 503)
          return
        }
        const destination = Boolean(
            body.p_department && body.p_province && body.p_district,
          ),
          available = state.configured && destination
        const code = String(body.p_code || '')
            .trim()
            .toUpperCase(),
          valid = code === 'AHORRA',
          discount = valid ? 1000 : 0
        await reply({
          lines: [{ ...line, unitPriceCents: state.price }],
          subtotalCents: state.price,
          productDiscountCents: 0,
          discountCents: discount,
          shipping: available
            ? {
                kind: 'quoted',
                region: 'capital',
                feeCents: 1000,
                estimate: '1 a 2 días',
                free: false,
              }
            : { kind: state.configured ? 'pending' : 'unavailable' },
          promotion: code
            ? valid
              ? {
                  kind: 'applied',
                  code,
                  discountCents: discount,
                  message: 'Descuento aplicado: S/ 10.',
                }
              : { kind: 'not-found', message: 'No encontramos ese código.' }
            : null,
          totalCents: available ? state.price - discount + 1000 : null,
          quoteHash: 'a'.repeat(64),
          simulation: true,
        })
      } else {
        await reply({ code: 'fixture_unhandled' }, 500)
        throw Error('Unhandled checkout fixture ' + name)
      }
    })
    await context.route('**/api/checkout/simulate', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const body = route.request().postDataJSON() as Record<string, unknown>
      state.writes.push(body)
      if (state.failWrite) {
        state.failWrite = false
        await route.fulfill({ status: 503, json: { code: 'service' }, headers })
        return
      }
      if (state.conflict) {
        state.conflict = false
        await route.fulfill({
          status: 409,
          json: { code: 'conflict' },
          headers,
        })
        return
      }
      const input = body.checkout as Pick<
        MockOrder,
        | 'contact'
        | 'address'
        | 'deliveryMethod'
        | 'alternateRecipient'
        | 'promotionCode'
      >
      const attached =
        route.request().headers().authorization?.startsWith('Bearer ey') ===
        true
      const value = orders.get(String(body.operationId)) ?? {
        order: {
          ...input,
          reference: 'AI-TEST-1234567890ABCDEF',
          placedAt: new Date().toISOString(),
          mode: attached ? ('demo-account' as const) : ('guest' as const),
          lines: [{ ...line, unitPriceCents: state.price }],
          paymentProvider: 'mercado-pago',
          subtotalCents: state.price,
          discountCents: input.promotionCode ? 1000 : 0,
          shippingCents: 1000,
          totalCents: state.price + 1000 - (input.promotionCode ? 1000 : 0),
          simulation: true,
          paymentStatus: 'pending',
        },
      }
      if (!orders.has(String(body.operationId))) {
        state.ownerId = attached ? supabaseNetwork.currentUserId : null
        state.trackingToken = String(body.trackingToken)
        state.order = {
          ...value.order,
          id: '80000000-0000-4000-8000-000000000001',
          version: 1,
          customerId: state.ownerId ?? '',
          customerName: `${input.contact.firstName} ${input.contact.lastName}`,
          customerEmail: input.contact.email,
          contactPhone: input.contact.phone,
          status: 'received',
          paymentStatus: 'pending',
        }
      }
      orders.set(String(body.operationId), value)
      if (state.lostResponse) {
        state.lostResponse = false
        await route.abort('failed')
        return
      }
      await state.beforeResponse?.()
      await route.fulfill({ json: value, headers })
    })
    await context.addInitScript(
      ({ variantId }) =>
        localStorage.setItem(
          'aroma-infini:cart:v1',
          JSON.stringify({ version: 1, items: [{ variantId, quantity: 1 }] }),
        ),
      { variantId },
    )
    await runFixture(state)
  },
})
async function prepare(page: Page, withAccount = false, navigate = true) {
  if (navigate) await page.goto('/checkout')
  if (withAccount)
    await page.getByRole('radio', { name: /Con mi cuenta/ }).check()
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido', { exact: true }).fill('Torres')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('ana@example.invalid')
  await page.getByLabel('Celular', { exact: true }).fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Zona de entrega', { exact: true }).selectOption('lima')
  await page
    .getByLabel('Distrito de entrega', { exact: true })
    .selectOption('150101')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de prueba 123')
  await expect(
    page.getByRole('button', { name: 'Revisar selección' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await expect(
    page.getByRole('button', { name: 'Guardar selección', exact: true }),
  ).toBeEnabled()
}
test('el servidor cotiza, el cupón se valida remotamente y el pedido de prueba queda confirmado sin enviar precios', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  await page
    .getByText('¿Tienes un código de descuento?', { exact: true })
    .click()
  await page.getByLabel('Código de descuento', { exact: true }).fill('AHORRA')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.locator('.checkout-promotion-message')).toContainText(
    'Descuento aplicado',
  )
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  await expect(page.locator('main')).toContainText('No se realizó ningún cobro')
  expect(checkoutNetwork.writes).toHaveLength(1)
  const command = checkoutNetwork.writes[0],
    input = command.checkout as Record<string, unknown>
  expect(input).not.toHaveProperty('totalCents')
  expect(input).not.toHaveProperty('unitPriceCents')
  expect(input).toHaveProperty('expectedQuoteHash')
  expect(input.lines).toEqual([{ variantId, quantity: 1 }])
  expect(command.trackingToken).toMatch(/^[a-f0-9]{64}$/)
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aroma-infini:order-tracking:v1') || '[]'),
  )
  expect(stored[0].reference).toBe('AI-TEST-1234567890ABCDEF')
})
test('una respuesta perdida conserva datos y reintenta la misma operación sin duplicar el pedido', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Editar datos', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Editar entrega', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  )
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1]).toEqual(checkoutNetwork.writes[0])
})

test('una respuesta perdida seguida de recarga reutiliza el mismo intento al reingresar los datos', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  const first = structuredClone(checkoutNetwork.writes[0])
  const receipt = await page.evaluate(() =>
    sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
  )
  expect(receipt).toBeTruthy()
  expect(receipt).not.toContain('ana@example.invalid')
  expect(receipt).not.toContain('Avenida de prueba')
  await page.reload()
  await prepare(page)
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1]).toEqual(first)
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeNull()
})

test('la primera sesión verificada después de recargar conserva el intento de su propia cuenta', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page, true)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  const first = structuredClone(checkoutNetwork.writes[0])
  await page.reload()
  await prepare(page, true)
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1]).toEqual(first)
  expect(checkoutNetwork.ownerId).toBe(customerA)
})

test('resolver Auth lentamente después de recargar no elimina el intento de la misma cuenta', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page, true)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  const first = structuredClone(checkoutNetwork.writes[0])
  let release = () => {}
  let requested = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requestStarted = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route(`${origin}/auth/v1/user`, async (route) => {
    requested()
    await gate
    await route.fallback()
  })
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await requestStarted
    await expect(
      page.getByRole('heading', { name: 'Finaliza tu selección', exact: true }),
    ).toBeVisible()
    const status = await page.evaluate(async () => {
      const source = '/src/services/auth-service.ts'
      const { authService } = await import(source)
      return authService.getSnapshot().status
    })
    expect(status).toBe('checking')
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
      ),
    ).toBeTruthy()
    release()
    await expect(
      page.getByRole('radio', { name: /Con mi cuenta/ }),
    ).toBeVisible()
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
      ),
    ).toBeTruthy()
    await prepare(page, true, false)
    await page
      .getByRole('button', { name: 'Guardar selección', exact: true })
      .click()
    await expect(page).toHaveURL(/checkout\/confirmacion/)
    expect(checkoutNetwork.writes).toHaveLength(2)
    expect(checkoutNetwork.writes[1]).toEqual(first)
  } finally {
    release()
  }
})

test('recuperar un error inicial de Auth conserva el intento sin conceder acceso durante el fallo', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page, true)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  const first = structuredClone(checkoutNetwork.writes[0])
  let failActor = true
  await page.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (failActor && route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        headers,
        json: { message: 'Temporary isolated fixture failure' },
      })
      return
    }
    await route.fallback()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const source = '/src/services/auth-service.ts'
        const { authService } = await import(source)
        return authService.getSnapshot().status
      }),
    )
    .toBe('error')
  await expect(page.getByRole('radio', { name: /Con mi cuenta/ })).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeTruthy()
  failActor = false
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.refresh()
  })
  await expect(page.getByRole('radio', { name: /Con mi cuenta/ })).toBeVisible()
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeTruthy()
  await prepare(page, true, false)
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1]).toEqual(first)
})

test('un fallo de Auth posterior a verificar la identidad retira el intento privado', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page, true)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeTruthy()
  let failActor = true
  await page.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (failActor && route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        headers,
        json: { message: 'Temporary isolated fixture failure' },
      })
      return
    }
    await route.fallback()
  })
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.refresh()
  })
  await expect(page.getByRole('radio', { name: /Con mi cuenta/ })).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeNull()
  failActor = false
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.refresh()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const source = '/src/services/auth-service.ts'
        const { authService } = await import(source)
        const state = authService.getSnapshot()
        return { status: state.status, owner: state.session?.user.id ?? null }
      }),
    )
    .toEqual({ status: 'authenticated', owner: customerA })
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeNull()
  expect(checkoutNetwork.writes).toHaveLength(1)
})

test('cambiar la dirección después de recargar inicia una intención diferente', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  await page.reload()
  await prepare(page)
  await page
    .getByRole('button', { name: 'Editar entrega', exact: true })
    .click()
  await page.getByLabel('Dirección', { exact: true }).fill('Otra dirección 456')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1].operationId).not.toBe(
    checkoutNetwork.writes[0].operationId,
  )
  expect(checkoutNetwork.writes[1].checkout).toHaveProperty(
    'address.street',
    'Otra dirección 456',
  )
})

test('cerrar sesión retira el comprobante pendiente de la pestaña', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page, true)
  checkoutNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeTruthy()
  await page.goto('/cuenta')
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/iniciar-sesion/)
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('aroma-infini:checkout-attempt:v1'),
    ),
  ).toBeNull()
})

test('una compra confirmada no deduplica otra selección legítima con los mismos datos', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  await prepare(page)
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1].operationId).not.toBe(
    checkoutNetwork.writes[0].operationId,
  )
})

test('confirmar un pedido conserva las unidades añadidas al carrito en otra pestaña', async ({
  page,
  context,
  checkoutNetwork,
}) => {
  await prepare(page)
  const otherTab = await context.newPage()
  await otherTab.goto('/contacto')
  checkoutNetwork.beforeResponse = async () => {
    await otherTab.evaluate((variantId) => {
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({ version: 1, items: [{ variantId, quantity: 3 }] }),
      )
    }, variantId)
    await expect(
      page.getByRole('button', { name: 'Carrito, 3 productos', exact: true }),
    ).toBeVisible()
  }
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  const items = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('aroma-infini:cart:v1') || '{}').items,
  )
  expect(items).toEqual([{ variantId, quantity: 2 }])
  expect(checkoutNetwork.writes).toHaveLength(1)
})

test('sincronizar carrito desde otra pestaña no vuelve a escribir su versión recibida', async ({
  page,
  context,
  checkoutNetwork,
}) => {
  void checkoutNetwork
  await page.goto('/contacto')
  await expect(
    page.getByRole('button', { name: 'Carrito, 1 producto', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.dataset.cartWrites = '0'
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'aroma-infini:cart:v1') {
        document.documentElement.dataset.cartWrites = String(
          Number(document.documentElement.dataset.cartWrites) + 1,
        )
      }
      return original.call(this, key, value)
    }
  })
  const otherTab = await context.newPage()
  await otherTab.route('**/__cart-storage-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Storage probe</title>',
    }),
  )
  await otherTab.goto('/__cart-storage-probe')
  await otherTab.evaluate((variantId) => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({ version: 1, items: [{ variantId, quantity: 3 }] }),
    )
  }, variantId)
  await expect(
    page.getByRole('button', { name: 'Carrito, 3 productos', exact: true }),
  ).toBeVisible()
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  })
  await expect(page.locator('html')).toHaveAttribute('data-cart-writes', '0')
})
test('una renovación de sesión después del registro conserva el intento y recupera el mismo pedido', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await prepare(page)
  await page.evaluate(async () => {
    const source = '/src/services/supabase-client.ts'
    const { requireSupabaseClient } = await import(source)
    const client = requireSupabaseClient()
    const readSession = client.auth.getSession.bind(client.auth)
    const fetchOriginal = window.fetch.bind(window)
    let dispatched = false
    let injected = false
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args)
      if (String(args[0]).endsWith('/api/checkout/simulate')) dispatched = true
      return response
    }
    client.auth.getSession = async () => {
      const result = await readSession()
      // Inject the SDK's post-dispatch token renewal without changing owner.
      if (dispatched && !injected && result.data.session) {
        injected = true
        document.documentElement.dataset.checkoutRenewalFixture = 'used'
        return {
          ...result,
          data: {
            ...result.data,
            session: {
              ...result.data.session,
              access_token: result.data.session.access_token + '-renewed',
            },
          },
        }
      }
      return result
    }
  })
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toContainText('mismo pedido sin duplicarlo')
  await expect(page.locator('html')).toHaveAttribute(
    'data-checkout-renewal-fixture',
    'used',
  )
  await expect(
    page.getByRole('button', { name: 'Editar datos', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  expect(checkoutNetwork.writes).toHaveLength(2)
  expect(checkoutNetwork.writes[1]).toEqual(checkoutNetwork.writes[0])
})

test('un conflicto impide finalizar, conserva la dirección y obliga a revisar los importes', async ({
  page,
  checkoutNetwork,
}) => {
  await prepare(page)
  checkoutNetwork.conflict = true
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(
    page.locator('.checkout-payment-message[role="alert"]'),
  ).toContainText('resumen cambió')
  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.locator('main')).toContainText('Avenida de prueba 123')
  expect(checkoutNetwork.writes).toHaveLength(1)
})
test('sin configuración de envíos no se inventan tarifas ni se puede confirmar el pedido', async ({
  page,
  checkoutNetwork,
}) => {
  checkoutNetwork.configured = false
  await page.goto('/checkout')
  await expect(page.locator('.checkout-summary')).toContainText('Pendiente')
  expect(checkoutNetwork.writes).toHaveLength(0)
})
test('el mismo pedido pasa de checkout de cuenta a administración, PDF y seguimiento sin cambiar sus importes', async ({
  page,
  checkoutNetwork,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await prepare(page, true)
  await page
    .getByText('¿Tienes un código de descuento?', { exact: true })
    .click()
  await page.getByLabel('Código de descuento', { exact: true }).fill('AHORRA')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.locator('.checkout-promotion-message')).toContainText(
    'Descuento aplicado',
  )
  await page
    .getByRole('button', { name: 'Guardar selección', exact: true })
    .click()
  await expect(page).toHaveURL(/checkout\/confirmacion/)
  await expect(
    page.getByRole('link', { name: 'Ver en Mis pedidos' }),
  ).toBeVisible()
  expect(checkoutNetwork.ownerId).toBe(customerA)
  expect(checkoutNetwork.order).toMatchObject({
    customerId: customerA,
    status: 'received',
    paymentStatus: 'pending',
    simulation: true,
    subtotalCents: 12000,
    discountCents: 1000,
    shippingCents: 1000,
    totalCents: 12000,
  })
  const original = structuredClone(checkoutNetwork.order!)
  await page.getByRole('link', { name: 'Ver en Mis pedidos' }).click()
  await expect(page.locator('.account-order-list')).toContainText(
    original.reference,
  )
  await expect(page.locator('.account-order-status')).toHaveText('Recibido')
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/iniciar-sesion/)

  supabaseNetwork.currentUserId = customerB
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await page.goto(`/admin/pedidos/${original.reference}`)
  await expect(page.locator('main')).toContainText('Avenida de prueba 123')
  await page.getByRole('radio', { name: 'En preparación', exact: true }).check()
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Historial del pedido' }),
  ).toContainText('Beatriz Rojas')
  expect(checkoutNetwork.statusWrites).toHaveLength(1)
  expect(checkoutNetwork.history[0]).toMatchObject({
    reference: original.reference,
    fromStatus: 'received',
    toStatus: 'preparing',
    operator: { id: customerB, verified: true },
  })
  expect(checkoutNetwork.order).toEqual({
    ...original,
    status: 'preparing',
    version: 2,
  })

  await page.goto('/admin/pedidos')
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${original.reference}`,
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exportar PDF', exact: true })
  await expect(dialog).toContainText(
    'no acreditan un pago ni autorizan un despacho',
  )
  await dialog
    .getByRole('radio', { name: 'Resúmenes de pedidos', exact: true })
    .check()
  const downloaded = page.waitForEvent('download')
  await dialog
    .getByRole('button', { name: 'Descargar PDF', exact: true })
    .click()
  const download = await downloaded
  expect(download.suggestedFilename()).toMatch(
    /^aroma-infini-resumenes-pedidos-.*\.pdf$/,
  )
  const pdf = await PDFDocument.load(await readFile((await download.path())!))
  expect(pdf.getPageCount()).toBe(1)
  expect(checkoutNetwork.order).toEqual({
    ...original,
    status: 'preparing',
    version: 2,
  })

  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page).toHaveURL(/admin\/login/)
  supabaseNetwork.adminMembership = false
  supabaseNetwork.currentUserId = customerA
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto(`/cuenta/pedidos/${original.reference}`)
  await expect(
    page.getByRole('heading', { name: 'En preparación', exact: true }),
  ).toBeVisible()
  await expect(page.locator('main')).toContainText(
    'no se realizó un cobro ni se reservó inventario',
  )
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/iniciar-sesion/)
  await page.goto(
    `/seguir-pedido?codigo=${original.reference}#acceso=${checkoutNetwork.trackingToken}`,
  )
  await expect(
    page.getByRole('heading', { name: 'Estado: en preparación', exact: true }),
  ).toBeVisible()
  expect(checkoutNetwork.writes).toHaveLength(1)
  expect(record.product.variants[0].stock).toBe(5)
})
for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
])
  test(`la cotización no desplaza los controles de contacto ${width}`, async ({
    page,
    checkoutNetwork,
  }, testInfo) => {
    let releaseQuote!: () => void
    const pendingQuote = new Promise<void>((resolve) => {
      releaseQuote = resolve
    })
    checkoutNetwork.beforeQuoteResponse = () => pendingQuote
    try {
      await page.setViewportSize({ width, height })
      await page.goto('/checkout')
      await page.getByLabel('Nombre', { exact: true }).fill('Ana')
      await page.getByLabel('Apellido', { exact: true }).fill('Torres')
      await page
        .getByLabel('Correo electrónico', { exact: true })
        .fill('ana@example.invalid')
      await page.getByLabel('Celular', { exact: true }).fill('912345678')
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      const busy = page
        .getByRole('status')
        .filter({ hasText: 'Actualizando importes' })
      await expect(busy).toBeVisible()
      await expect.poll(() => checkoutNetwork.quotes.length).toBeGreaterThan(0)
      const placement = await busy.evaluate((element) => {
        const description = element
          .closest('.checkout-heading')
          ?.querySelector('p:not(.checkout-quote-status)')
        const progress = document.querySelector('.checkout-progress')
        if (!description || !progress)
          throw new Error('Missing checkout heading')
        return {
          descriptionBottom: description.getBoundingClientRect().bottom,
          statusTop: element.getBoundingClientRect().top,
          statusBottom: element.getBoundingClientRect().bottom,
          progressTop: progress.getBoundingClientRect().top,
          overflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
        }
      })
      expect(placement.statusTop).toBeGreaterThanOrEqual(
        placement.descriptionBottom,
      )
      expect(placement.statusBottom).toBeLessThanOrEqual(placement.progressTop)
      expect(placement.overflow).toBe(false)
      const continueButton = page.getByRole('button', {
        name: 'Continuar a entrega',
        exact: true,
      })
      const before = await continueButton.evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      )
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({
        path: `artifacts/checkout-quote-stability/${width}-busy.png`,
        fullPage: true,
        animations: 'disabled',
      })
      releaseQuote()
      await expect(busy).toBeHidden()
      const after = await continueButton.evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      )
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({
        path: `artifacts/checkout-quote-stability/${width}-idle.png`,
        fullPage: true,
        animations: 'disabled',
      })
      expect(after).toBe(before)
      await testInfo.attach('quote-layout.json', {
        body: JSON.stringify({ width, height, before, after, placement }),
        contentType: 'application/json',
      })
      await expect(page.getByLabel('Celular', { exact: true })).toHaveValue(
        '912345678',
      )
      await continueButton.click()
      await expect(
        page.getByRole('heading', { name: 'A dónde lo enviamos', exact: true }),
      ).toBeVisible()
      expect(checkoutNetwork.writes).toHaveLength(0)
    } finally {
      releaseQuote()
    }
  })

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
])
  test(`checkout remoto conserva proporciones ${width}`, async ({
    page,
    checkoutNetwork,
  }) => {
    void checkoutNetwork
    await page.setViewportSize({ width, height })
    await prepare(page)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/supabase-phase-5-2026-10-29/checkout-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
