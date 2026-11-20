import { adminListFixture } from './admin-list-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { Page } from '@playwright/test'
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
const metadata = {
  brands: [],
  features: { complementsEnabled: false },
  featuredBrandId: null,
  olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
  homeAnnouncement: null,
  homeVersion: 0,
  shipping: null,
  shippingVersion: 0,
}

const test = authTest.extend<{ workspaceRequests: string[] }>({
  workspaceRequests: async ({ context, supabaseNetwork }, provideRequests) => {
    void supabaseNetwork
    const requests: string[] = []
    const coupons: AdminPromotion[] = []
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      if (name === 'admin_save_coupon') {
        requests.push(name)
        const body = route.request().postDataJSON() as {
          p_coupon: AdminPromotion
          p_expected_version: number
        }
        const current = coupons.find((item) => item.id === body.p_coupon.id)
        if (body.p_expected_version !== (current?.version ?? 0))
          return route.fulfill({
            headers,
            status: 409,
            json: { code: 'PT409' },
          })
        const coupon = {
          ...body.p_coupon,
          used: current?.used ?? 0,
          version: (current?.version ?? 0) + 1,
        }
        if (current) coupons.splice(coupons.indexOf(current), 1)
        coupons.push(coupon)
        return route.fulfill({
          headers,
          json: { coupon, version: coupon.version },
        })
      }
      const workspace = adminListFixture(name,route.request().postDataJSON() as Record<string,unknown>)
      if (workspace) { requests.push(name);return route.fulfill({headers,json:workspace}) }
      const responses: Record<string, unknown> = {
        catalog_settings: metadata,
        commerce_settings: { shipping: null, shippingVersion: 0 },
        admin_catalog_page: {
          ...metadata,
          products: [],
          productVersions: {},
          brandVersions: {},
          total: 0,
          settingsVersion: 1,
        },
        admin_orders: { orders: [], orderHistory: [], total: 0 },
        admin_commerce_settings: {
          shipping: null,
          shippingVersion: 0,
          coupons,
          couponVersions: Object.fromEntries(
            coupons.map((item) => [item.id, item.version]),
          ),
        },
        home_document: {
          version: 0,
          media: null,
          content: null,
          mediaAssets: [],
        },
        catalog_products: { items: [], total: 0 },
      }
      if (!Object.hasOwn(responses, name)) return route.fallback()
      requests.push(name)
      return route.fulfill({ headers, json: responses[name] })
    })
    await provideRequests(requests)
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
  await expect(page.locator('main h1')).toHaveText('Resumen del negocio')
}

test('Promociones en frío carga cupones sin esperar el catálogo y conserva el guardado versionado', async ({
  page,
  supabaseNetwork,
  workspaceRequests,
}) => {
  await administrator(page, supabaseNetwork)
  workspaceRequests.length = 0
  await page.goto('/admin/promociones')
  await expect(
    page.getByRole('tab', { name: 'Cupones', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('button', { name: 'Nueva promoción', exact: true }),
  ).toBeVisible()
  expect(workspaceRequests).toContain('admin_commerce_settings')
  expect(workspaceRequests).not.toContain('admin_catalog_page')

  await page
    .getByRole('button', { name: 'Nueva promoción', exact: true })
    .click()
  const form = page.locator('.admin-promotion-form')
  await form.getByLabel('Código', { exact: true }).fill('SELECTIVO15')
  await form
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(form).not.toBeVisible()
  await expect(page.locator('.admin-promotion-list')).toContainText(
    'SELECTIVO15',
  )
  await page
    .getByRole('button', { name: 'Editar SELECTIVO15', exact: true })
    .click()
  await form.getByLabel('Descuento (%)', { exact: true }).fill('15')
  await form
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(form).not.toBeVisible()
  expect(
    workspaceRequests.filter((name) => name === 'admin_save_coupon'),
  ).toHaveLength(2)
  expect(workspaceRequests).not.toContain('admin_catalog_page')
})

test('Promociones con enlace directo de ofertas carga una página específica y revalida el acceso al cambiar de pestaña', async ({
  page,
  supabaseNetwork,
  workspaceRequests,
}) => {
  await administrator(page, supabaseNetwork)
  workspaceRequests.length = 0
  await page.goto('/admin/promociones?vista=ofertas')
  await expect(
    page.getByRole('tab', { name: 'Ofertas de productos', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('heading', {
      name: 'Aún no hay productos en oferta',
      exact: true,
    }),
  ).toBeVisible()
  expect(
    workspaceRequests.filter((name) => name === 'admin_offer_list'),
  ).toHaveLength(1)
  expect(workspaceRequests).toContain('admin_catalog_context')
  expect(workspaceRequests).not.toContain('admin_catalog_page')
  expect(workspaceRequests).not.toContain('admin_commerce_settings')

  supabaseNetwork.adminMembership = false
  await page.getByRole('tab', { name: 'Cupones', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/)
  await expect(page.locator('.admin-promotions-codes')).toHaveCount(0)
})

test('Promociones carga la página de ofertas y consulta cupones de nuevo sin perder la protección del borrador', async ({
  page,
  supabaseNetwork,
  workspaceRequests,
}) => {
  await administrator(page, supabaseNetwork)
  workspaceRequests.length = 0
  await page.goto('/admin/promociones')
  await expect(
    page.getByRole('button', { name: 'Nueva promoción', exact: true }),
  ).toBeVisible()
  expect(
    workspaceRequests.filter((name) => name === 'admin_commerce_settings'),
  ).toHaveLength(1)
  expect(workspaceRequests).not.toContain('admin_catalog_page')

  await page
    .getByRole('button', { name: 'Nueva promoción', exact: true })
    .click()
  const form = page.locator('.admin-promotion-form')
  await form.getByLabel('Código', { exact: true }).fill('CONSERVAR15')
  await page
    .getByRole('tab', { name: 'Ofertas de productos', exact: true })
    .click()
  const confirmation = page.getByRole('alertdialog', {
    name: '¿Salir sin guardar?',
  })
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click()
  await expect(form.getByLabel('Código', { exact: true })).toHaveValue(
    'CONSERVAR15',
  )
  expect(workspaceRequests).not.toContain('admin_catalog_page')

  await page
    .getByRole('tab', { name: 'Ofertas de productos', exact: true })
    .click()
  await confirmation
    .getByRole('button', { name: 'Salir sin guardar', exact: true })
    .click()
  await expect(
    page.getByRole('tab', { name: 'Ofertas de productos', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  expect(
    workspaceRequests.filter((name) => name === 'admin_offer_list'),
  ).toHaveLength(1)
  expect(
    workspaceRequests.filter((name) => name === 'admin_commerce_settings'),
  ).toHaveLength(1)

  await page.getByRole('tab', { name: 'Cupones', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Nueva promoción', exact: true }),
  ).toBeVisible()
  expect(
    workspaceRequests.filter((name) => name === 'admin_offer_list'),
  ).toHaveLength(1)
  expect(
    workspaceRequests.filter((name) => name === 'admin_commerce_settings'),
  ).toHaveLength(2)
})

for (const destination of [
  {
    path: '/admin/envios',
    title: 'Tarifas de envío',
    rpc: 'admin_commerce_settings',
  },
  { path: '/admin/pedidos', title: 'Pedidos', rpc: 'admin_order_list' },
  { path: '/admin/clientes', title: 'Clientes', rpc: 'admin_customer_list' },
]) {
  test(`carga fría de ${destination.path} evita el catálogo y Productos lo carga al entrar`, async ({
    page,
    supabaseNetwork,
    workspaceRequests,
  }) => {
    supabaseNetwork.adminMembership = true
    await signIn(page, 'admin')
    await page
      .getByLabel('Código de verificación', { exact: true })
      .fill('123456')
    await page
      .getByRole('button', { name: 'Verificar y continuar', exact: true })
      .click()
    await expect(page.locator('main h1')).toHaveText('Resumen del negocio')
    workspaceRequests.length = 0
    // A document navigation clears the in-memory catalog cache. A warm visit
    // alone could hide an unconditional catalog read behind that cache.
    await page.goto(destination.path)
    await expect(page.locator('main h1')).toHaveText(destination.title)
    expect(workspaceRequests).toContain(destination.rpc)
    expect(workspaceRequests).not.toContain('admin_catalog_page')
    const navigation = page.getByRole('navigation', {
      name: 'Navegación administrativa',
    })
    await navigation
      .getByRole('link', { name: 'Productos', exact: true })
      .click()
    await expect(page.locator('main h1')).toHaveText('Productos')
    expect(
      workspaceRequests.filter((name) => name === 'admin_product_list'),
    ).toHaveLength(1)
    const accessReads = () =>
      supabaseNetwork.requests.filter((request) =>
        ['/auth/v1/user', '/rest/v1/rpc/current_actor'].includes(request.path),
      ).length
    // Each metadata destination must still verify current authorization,
    // without retrieving any complete product documents.
    for (const title of ['Marcas', 'Familias olfativas', 'Productos']) {
      const verifiedReads = accessReads()
      await navigation.getByRole('link', { name: title, exact: true }).click()
      await expect(page.locator('main h1')).toHaveText(title)
      expect(accessReads()).toBeGreaterThan(verifiedReads)
      expect(
        workspaceRequests.filter((name) => name === 'admin_catalog_page'),
      ).toHaveLength(0)
    }
    expect(workspaceRequests.filter(name => name === 'admin_catalog_context')).toHaveLength(2)
    expect(workspaceRequests.filter(name => name === 'admin_product_list')).toHaveLength(2)
  })
}
