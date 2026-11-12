import type { Page } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { ShippingSettings } from '../src/types/shipping'
import type { AdminPromotion } from '../src/types/admin'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
interface SettingsFixture {
  shipping: ShippingSettings | null
  shippingVersion: number
  coupons: AdminPromotion[]
  calls: Array<{ name: string; body: Record<string, unknown> }>
  fail: boolean
  conflict: boolean
  holdNextRead: Promise<void> | null
}
const test = authTest.extend<{ settingsNetwork: SettingsFixture }>({
  settingsNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: SettingsFixture = {
      shipping: null,
      shippingVersion: 0,
      coupons: [],
      calls: [],
      fail: false,
      conflict: false,
      holdNextRead: null,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request(),
        name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        !name.startsWith('admin_') &&
        name !== 'commerce_settings' &&
        name !== 'customer_orders'
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
      const shipping = {
        shipping: state.shipping,
        shippingVersion: state.shippingVersion,
      }
      const metadata = {
        ...shipping,
        brands: [],
        featuredBrandId: null,
        features: { complementsEnabled: false },
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: null,
        homeVersion: 0,
      }
      if (name === 'customer_orders') await reply([])
      else if (name === 'commerce_settings') await reply(shipping)
      else if (name === 'catalog_settings') await reply(metadata)
      else if (name === 'catalog_brands') await reply([])
      else if (
        name === 'catalog_products' ||
        name === 'catalog_products_by_ids'
      )
        await reply({ items: [], total: 0 })
      else if (name === 'catalog_browse')
        await reply({
          ...metadata,
          items: [],
          total: 0,
          availableTotal: 0,
          page: 1,
          pages: 1,
          familyCodes: [],
        })
      else if (name === 'admin_catalog_page')
        await reply({
          ...metadata,
          products: [],
          productVersions: {},
          brandVersions: {},
          total: 0,
          settingsVersion: 1,
        })
      else if (name === 'admin_orders')
        await reply({ orders: [], orderHistory: [], total: 0 })
      else if (name === 'admin_commerce_settings') {
        const payload = structuredClone({
          ...shipping,
          coupons: state.coupons,
          couponVersions: Object.fromEntries(
            state.coupons.map((item) => [item.id, item.version]),
          ),
        })
        const hold = state.holdNextRead
        state.holdNextRead = null
        if (hold) await hold
        await reply(payload)
      } else if (name === 'admin_save_shipping') {
        if (state.fail) {
          await reply({ code: 'PGRST000' }, 503)
          return
        }
        if (
          state.conflict ||
          body.p_expected_version !== state.shippingVersion
        ) {
          await reply({ code: 'PT409' }, 409)
          return
        }
        state.shipping = body.p_shipping as ShippingSettings
        state.shippingVersion++
        await reply({
          shipping: state.shipping,
          publicShipping: state.shipping,
          version: state.shippingVersion,
        })
      } else if (name === 'admin_save_coupon') {
        if (state.fail) {
          await reply({ code: 'PGRST000' }, 503)
          return
        }
        const input = body.p_coupon as AdminPromotion,
          current = state.coupons.find((item) => item.id === input.id)
        if (
          state.conflict ||
          body.p_expected_version !== (current?.version ?? 0)
        ) {
          await reply({ code: 'PT409' }, 409)
          return
        }
        if (
          state.coupons.some(
            (item) => item.id !== input.id && item.code === input.code,
          )
        ) {
          await reply({ code: '23505' }, 409)
          return
        }
        const coupon = {
          ...input,
          used: 0,
          version: (current?.version ?? 0) + 1,
        }
        state.coupons = [
          ...state.coupons.filter((item) => item.id !== coupon.id),
          coupon,
        ]
        await reply({ coupon, version: coupon.version })
      } else if (name === 'admin_delete_coupon') {
        const current = state.coupons.find((item) => item.id === body.p_id)
        if (!current || current.version !== body.p_expected_version) {
          await reply({ code: 'PT409' }, 409)
          return
        }
        state.coupons = state.coupons.filter((item) => item.id !== current.id)
        await route.fulfill({ status: 204, headers })
      } else await reply({ code: 'fixture_unhandled' }, 500)
    })
    await runFixture(state)
  },
})
async function administrator(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin', { timeout: 15000 })
  await expect(page.locator('main h1')).toHaveText('Resumen del negocio')
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function products(page: Page, network: SupabaseAuthNetwork) {
  await administrator(page, network)
  await page.getByRole('link', { name: 'Productos', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Productos')
}

for (const change of ['shipping', 'save-coupon', 'delete-coupon'] as const) {
  test(`Una lectura anterior a ${change} no restaura la configuración comercial reemplazada`, async ({
    page,
    supabaseNetwork,
    settingsNetwork,
  }) => {
    settingsNetwork.shipping = {
      freeThresholdCents: 30000,
      provinceShippingEnabled: false,
      nationalCourierFeeCents: 0,
      nationalEstimate: '',
      zones: [],
    }
    settingsNetwork.shippingVersion = 1
    settingsNetwork.coupons = [
      {
        id: 'b3110000-0000-4000-8000-000000000001',
        code: 'FIXTURE',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '',
        endsAt: '',
        usageLimit: null,
        used: 0,
        version: 1,
      },
    ]
    await administrator(page, supabaseNetwork)
    await page.evaluate(async () => {
      const path = '/src/services/commerce-settings-service.ts'
      const { loadAdminCommerceSettings } = (await import(
        path
      )) as typeof import('../src/services/commerce-settings-service')
      await loadAdminCommerceSettings()
    })
    const gate = deferred()
    settingsNetwork.holdNextRead = gate.promise
    const before = settingsNetwork.calls.filter(
      ({ name }) => name === 'admin_commerce_settings',
    ).length
    const reading = page.evaluate(async () => {
      const path = '/src/services/commerce-settings-service.ts'
      const { loadAdminCommerceSettings } = (await import(
        path
      )) as typeof import('../src/services/commerce-settings-service')
      await loadAdminCommerceSettings()
    })
    try {
      await expect
        .poll(
          () =>
            settingsNetwork.calls.filter(
              ({ name }) => name === 'admin_commerce_settings',
            ).length,
        )
        .toBe(before + 1)
      await page.evaluate(async (change) => {
        const servicePath = '/src/services/commerce-settings-service.ts'
        const statePath = '/src/services/admin-service.ts'
        const { commerceSettingsService } = (await import(
          servicePath
        )) as typeof import('../src/services/commerce-settings-service')
        const { adminService } = (await import(
          statePath
        )) as typeof import('../src/services/admin-service')
        const state = adminService.getSnapshot()
        if (change === 'shipping')
          await commerceSettingsService.saveShipping(
            { ...state.shipping, freeThresholdCents: 45000 },
            state.shippingVersion!,
          )
        else if (change === 'save-coupon')
          await commerceSettingsService.savePromotion({
            ...state.promotions[0],
            value: 20,
          })
        else
          await commerceSettingsService.deletePromotion(
            state.promotions[0].id,
            state.promotions[0].version!,
          )
      }, change)
      gate.release()
      await reading
      const confirmed = await page.evaluate(async () => {
        const path = '/src/services/admin-service.ts'
        const { adminService } = (await import(
          path
        )) as typeof import('../src/services/admin-service')
        const state = adminService.getSnapshot()
        return {
          shippingVersion: state.shippingVersion,
          threshold: state.shipping.freeThresholdCents,
          coupons: state.promotions.map(({ version, value }) => ({
            version,
            value,
          })),
        }
      })
      expect(confirmed).toEqual({
        shippingVersion: change === 'shipping' ? 2 : 1,
        threshold: change === 'shipping' ? 45000 : 30000,
        coupons:
          change === 'delete-coupon'
            ? []
            : [
                {
                  version: change === 'save-coupon' ? 2 : 1,
                  value: change === 'save-coupon' ? 20 : 10,
                },
              ],
      })
    } finally {
      gate.release()
      await reading
    }
  })
}

test('Preparar el código de una opción del menú no adelanta consultas privadas de Supabase', async ({
  page,
  context,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await products(page, supabaseNetwork)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await context.route(
    '**/src/features/admin/AdminShippingPage.tsx*',
    async (route) => {
      requested = true
      await gate
      await route.continue()
    },
  )
  const beforeAuth = supabaseNetwork.requests.length
  const beforeSettings = settingsNetwork.calls.length
  const link = page.getByRole('link', { name: 'Tarifas de envío', exact: true })
  try {
    await link.focus()
    await expect.poll(() => requested).toBe(true)
    release()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    expect(supabaseNetwork.requests).toHaveLength(beforeAuth)
    expect(settingsNetwork.calls).toHaveLength(beforeSettings)
    await expect(page.locator('main h1')).toHaveText('Productos')
  } finally {
    release()
  }
})

test('Una navegación administrativa vigente solapa tarifas y permisos sin mostrar el destino antes de autorizarlo', async ({
  page,
  context,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await products(page, supabaseNetwork)
  const authorization = deferred()
  let authorizing = false
  await context.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (route.request().method() !== 'OPTIONS') {
      authorizing = true
      await authorization.promise
    }
    await route.fallback()
  })
  const previousReads = settingsNetwork.calls.filter(
    (call) => call.name === 'admin_commerce_settings',
  ).length
  try {
    await page
      .getByRole('link', { name: 'Tarifas de envío', exact: true })
      .click()
    await expect.poll(() => authorizing).toBe(true)
    await expect
      .poll(
        () =>
          settingsNetwork.calls.filter(
            (call) => call.name === 'admin_commerce_settings',
          ).length,
      )
      .toBe(previousReads + 1)
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('main h1')).toHaveText('Productos')
    authorization.release()
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toBeVisible()
  } finally {
    authorization.release()
  }
})

test('Una recarga en frío confirma identidad y permisos antes de consultar las tarifas privadas', async ({
  page,
  context,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await products(page, supabaseNetwork)
  const authorization = deferred()
  let authorizing = false
  await context.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (route.request().method() !== 'OPTIONS') {
      authorizing = true
      await authorization.promise
    }
    await route.fallback()
  })
  const previousReads = settingsNetwork.calls.filter(
    (call) => call.name === 'admin_commerce_settings',
  ).length
  try {
    await page.goto('/admin/envios', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => authorizing).toBe(true)
    expect(
      settingsNetwork.calls.filter(
        (call) => call.name === 'admin_commerce_settings',
      ),
    ).toHaveLength(previousReads)
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toHaveCount(0)
    authorization.release()
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toBeVisible()
    expect(
      settingsNetwork.calls.filter(
        (call) => call.name === 'admin_commerce_settings',
      ),
    ).toHaveLength(previousReads + 1)
  } finally {
    authorization.release()
  }
})

for (const revoked of ['role', 'mfa'] as const) {
  test(`Una navegación paralela no publica las tarifas si se revoca ${revoked}`, async ({
    page,
    context,
    supabaseNetwork,
    settingsNetwork,
  }) => {
    await products(page, supabaseNetwork)
    const authorization = deferred()
    let authorizing = false
    await context.route(
      `${origin}/rest/v1/rpc/current_actor`,
      async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fallback()
          return
        }
        authorizing = true
        await authorization.promise
        await route.fulfill({
          headers,
          json: {
            user_id: supabaseNetwork.currentUserId,
            role: revoked === 'role' ? 'customer' : 'admin',
            aal: revoked === 'mfa' ? 'aal1' : 'aal2',
            requires_mfa: revoked === 'mfa',
          },
        })
      },
    )
    try {
      await page
        .getByRole('link', { name: 'Tarifas de envío', exact: true })
        .click()
      await expect.poll(() => authorizing).toBe(true)
      await expect
        .poll(() =>
          settingsNetwork.calls.some(
            (call) => call.name === 'admin_commerce_settings',
          ),
        )
        .toBe(true)
      await expect(
        page.getByLabel('Courier en Lima (S/)', { exact: true }),
      ).toHaveCount(0)
      authorization.release()
      await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/)
      await expect(page.locator('.admin-sidebar')).toHaveCount(0)
      await expect(
        page.getByLabel('Courier en Lima (S/)', { exact: true }),
      ).toHaveCount(0)
    } finally {
      authorization.release()
    }
  })
}

test('Cerrar sesión descarta una respuesta de tarifas que todavía estaba en vuelo', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await products(page, supabaseNetwork)
  settingsNetwork.shipping = {
    freeThresholdCents: 33000,
    provinceShippingEnabled: false,
    nationalCourierFeeCents: 0,
    nationalEstimate: '',
    zones: [],
  }
  settingsNetwork.shippingVersion = 8
  const read = deferred()
  settingsNetwork.holdNextRead = read.promise
  const loading = page.evaluate(async () => {
    const modulePath = '/src/services/commerce-settings-service.ts'
    const { loadAdminCommerceSettings } = await import(modulePath)
    try {
      await loadAdminCommerceSettings()
      return 'resolved'
    } catch {
      return 'rejected'
    }
  })
  try {
    await expect
      .poll(() =>
        settingsNetwork.calls.some(
          (call) => call.name === 'admin_commerce_settings',
        ),
      )
      .toBe(true)
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click()
    await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/)
    read.release()
    expect(await loading).toBe('rejected')
    const snapshot = await page.evaluate(async () => {
      const modulePath = '/src/services/admin-service.ts'
      const { adminService } = await import(modulePath)
      const state = adminService.getSnapshot()
      return {
        shippingVersion: state.shippingVersion,
        coupons: state.promotions.length,
      }
    })
    expect(snapshot).toEqual({ shippingVersion: 0, coupons: 0 })
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toHaveCount(0)
  } finally {
    read.release()
    await loading
  }
})

test('Dos lecturas concurrentes comparten verificación y RPC pero una visita posterior vuelve a consultar', async ({
  page,
  context,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await products(page, supabaseNetwork)
  const verification = deferred()
  const read = deferred()
  let userReads = 0
  await context.route(`${origin}/auth/v1/user`, async (route) => {
    if (route.request().method() === 'GET') {
      userReads++
      await verification.promise
    }
    await route.fallback()
  })
  settingsNetwork.holdNextRead = read.promise
  const loading = page.evaluate(async () => {
    const modulePath = '/src/services/commerce-settings-service.ts'
    const { loadAdminCommerceSettings } = await import(modulePath)
    await Promise.all([
      loadAdminCommerceSettings(),
      loadAdminCommerceSettings(),
    ])
  })
  try {
    await expect.poll(() => userReads).toBe(1)
    verification.release()
    await expect
      .poll(
        () =>
          settingsNetwork.calls.filter(
            (call) => call.name === 'admin_commerce_settings',
          ).length,
      )
      .toBe(1)
    read.release()
    await loading
    expect(userReads).toBe(1)
    await page.evaluate(async () => {
      const modulePath = '/src/services/commerce-settings-service.ts'
      const { loadAdminCommerceSettings } = await import(modulePath)
      await loadAdminCommerceSettings()
    })
    expect(userReads).toBe(2)
    expect(
      settingsNetwork.calls.filter(
        (call) => call.name === 'admin_commerce_settings',
      ),
    ).toHaveLength(2)
  } finally {
    verification.release()
    read.release()
    await loading
  }
})

test('Las tarifas se publican por versión y se leen desde otra navegación sin datos locales de muestra', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page.goto('/admin/envios')
  await expect(page.locator('.admin-form-notice')).toContainText(
    'no se importaron tarifas',
  )
  await page.getByLabel('Courier en Lima (S/)', { exact: true }).fill('21')
  await page
    .getByLabel('Plazo estimado en Lima', { exact: true })
    .fill('Hasta 48 horas')
  await page.getByLabel('Courier en Callao (S/)', { exact: true }).fill('21')
  await page
    .getByLabel('Plazo estimado en Callao', { exact: true })
    .fill('Hasta 48 horas')
  await page.getByLabel('Envío gratis desde (S/)', { exact: true }).fill('500')
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect.poll(() => settingsNetwork.shippingVersion).toBe(1)
  await expect(page.locator('.admin-shipping-footer')).not.toHaveClass(
    /is-dirty/,
  )
  await page.reload()
  await expect(
    page.getByLabel('Courier en Lima (S/)', { exact: true }),
  ).toHaveValue('21')
  await page.goto('/envios')
  await expect(page.locator('.delivery-price').first()).toContainText('21')
  await expect(page.locator('.delivery-free')).toContainText('500')
  expect(
    settingsNetwork.calls.find((call) => call.name === 'admin_save_shipping')!
      .body,
  ).not.toHaveProperty('p_shipping.configured')
})

test('Los cupones permiten guardar consecutivamente y eliminar con confirmación desde el listado', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page.goto('/admin/promociones')
  await page
    .getByRole('button', { name: 'Nueva promoción', exact: true })
    .click()
  await page.getByLabel('Código', { exact: true }).fill('PRIMERO')
  await page
    .getByRole('button', { name: 'Guardar y crear otra', exact: true })
    .click()
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('')
  expect(settingsNetwork.coupons).toHaveLength(1)
  await page.getByLabel('Código', { exact: true }).fill('SEGUNDO')
  await page
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(page.locator('.admin-promotions-codes')).toContainText('SEGUNDO')
  expect(settingsNetwork.coupons).toHaveLength(2)
  await page
    .getByRole('button', { name: 'Eliminar cupón PRIMERO', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '¿Eliminar el cupón PRIMERO?',
  )
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Eliminar cupón', exact: true })
    .click()
  await expect.poll(() => settingsNetwork.coupons.length).toBe(1)
  expect(settingsNetwork.coupons[0].code).toBe('SEGUNDO')
  await page.reload()
  await expect(page.locator('.admin-promotions-codes')).not.toContainText(
    'PRIMERO',
  )
  const saved = settingsNetwork.calls.filter(
    (call) => call.name === 'admin_save_coupon',
  )
  expect(saved).toHaveLength(2)
  for (const call of saved) {
    expect(call.body).not.toHaveProperty('p_coupon.used')
    expect(String((call.body.p_coupon as AdminPromotion).id)).toMatch(
      /^[a-f0-9-]{36}$/,
    )
  }
})

test('Un conflicto de cupón conserva el formulario y no anuncia un guardado inexistente', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page.goto('/admin/promociones')
  await page
    .getByRole('button', { name: 'Nueva promoción', exact: true })
    .click()
  await page.getByLabel('Código', { exact: true }).fill('SINPERDER')
  settingsNetwork.conflict = true
  await page
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    'Otra persona modificó',
  )
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Volver a editar', exact: true })
    .click()
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue(
    'SINPERDER',
  )
  expect(settingsNetwork.coupons).toHaveLength(0)
})

for (const [name, width, height] of [
  ['monitor', 1920, 1080],
  ['desktop', 1440, 900],
  ['laptop', 1366, 768],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
] as const) {
  test(`Las interfaces de envíos y cupones mantienen campos legibles en ${name}`, async ({
    page,
    supabaseNetwork,
    settingsNetwork,
  }) => {
    await page.setViewportSize({ width, height })
    await administrator(page, supabaseNetwork)
    await page.goto('/admin/envios')
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await expect(page.locator('.admin-shipping-feedback')).toContainText(
      'Configuración pendiente',
    )
    await page.screenshot({
      path: `artifacts/commerce-phase-2026-10-29/screenshots/shipping-${name}.png`,
      fullPage: true,
    })
    settingsNetwork.coupons = [
      {
        id: '80000000-0000-4000-8000-000000000001',
        code: 'FUTURO',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '2027-01-10T15:00:00.000Z',
        endsAt: '2027-01-12T15:00:00.000Z',
        usageLimit: 5,
        used: 0,
        version: 1,
      },
    ]
    await page.goto('/admin/promociones')
    await page
      .getByRole('button', { name: 'Editar FUTURO', exact: true })
      .click()
    await expect(page.getByLabel('Inicio', { exact: true })).not.toHaveValue('')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/commerce-phase-2026-10-29/screenshots/coupons-${name}.png`,
      fullPage: true,
    })
  })
}
