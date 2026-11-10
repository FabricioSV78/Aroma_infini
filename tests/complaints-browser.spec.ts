import { mkdir, readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import { emptyComplaint, type ComplaintReceipt } from '../src/domain/complaints'

const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
function receiptFixture(index = 1): ComplaintReceipt {
  return {
    id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    reference: `LR-2026-${String(index).padStart(6, '0')}`,
    submittedAt: '2026-11-01T12:00:00.000Z',
    input: {
      ...emptyComplaint(),
      consumer: {
        name: `Consumidor de prueba ${index}`,
        documentType: 'DNI',
        documentNumber: '12345678',
        email: 'consumer@example.invalid',
        phone: '999888777',
        address: 'Av. Ejemplo 123, Lima',
        minor: false,
        guardianName: '',
        guardianDocument: '',
      },
      purchase: {
        kind: 'product',
        description: 'Perfume de 50 ml',
        amountCents: 5000,
        orderReference: '',
      },
      detail: 'El paquete llegó dañado.',
      request: 'Solicito la revisión del producto.',
    },
    provider: {
      name: 'Aroma Infini',
      legalName: 'Proveedor de demostración',
      taxId: '',
      address: 'Dirección de demostración',
    },
    demonstration: true,
    status: 'received',
    response: '',
    responseChannel: '',
    responseDeliveredAt: null,
    deliveryEvidence: '',
    version: 1,
    history: [],
  }
}
interface ComplaintNetwork {
  submissions: Record<string, unknown>[]
  updates: Record<string, unknown>[]
  queries: Record<string, unknown>[]
  fail: 'none' | 'ambiguous' | 'validation'
  conflict: boolean
  items: ComplaintReceipt[]
}
const test = authTest.extend<{ complaintsNetwork: ComplaintNetwork }>({
  complaintsNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: ComplaintNetwork = {
      submissions: [],
      updates: [],
      queries: [],
      fail: 'none',
      conflict: false,
      items: Array.from({ length: 21 }, (_, i) => receiptFixture(i + 1)),
    }
    await context.route('**/api/complaints', async (route) => {
      const body: Record<string, unknown> = route.request().postDataJSON()
      state.submissions.push(body)
      // Delay long enough to exercise the submission lock with rapid clicks.
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (state.fail === 'ambiguous') {
        state.fail = 'none'
        await route.abort('connectionreset')
      } else if (state.fail === 'validation') {
        state.fail = 'none'
        await route.fulfill({ status: 400, json: { code: 'validation' } })
      } else
        await route.fulfill({
          status: 201,
          json: { ...receiptFixture(), input: body.input },
        })
    })
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request(),
        name = new URL(request.url()).pathname.split('/').at(-1)!
      const handled =
        name.startsWith('catalog_') ||
        [
          'site_settings',
          'home_document',
          'commerce_settings',
          'admin_catalog_page',
          'admin_commerce_settings',
          'admin_home_document',
          'admin_orders',
          'admin_complaints',
          'admin_update_complaint',
        ].includes(name)
      if (!handled) return route.fallback()
      if (request.method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      const body = request.postDataJSON() as Record<string, unknown>
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers })
      const metadata = {
        brands: [],
        featuredBrandId: null,
        features: { complementsEnabled: false },
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: null,
        homeVersion: 0,
        shipping: null,
        shippingVersion: 0,
      }
      if (name === 'catalog_settings') return reply(metadata)
      if (name === 'catalog_brands') return reply([])
      if (name === 'catalog_products' || name === 'catalog_products_by_ids')
        return reply({ items: [], total: 0 })
      if (name === 'catalog_browse')
        return reply({
          ...metadata,
          items: [],
          total: 0,
          availableTotal: 0,
          page: 1,
          pages: 1,
          familyCodes: [],
        })
      if (name === 'site_settings') return reply({ version: 0, data: null })
      if (name === 'home_document')
        return reply({
          media: null,
          content: null,
          version: 0,
          mediaAssets: [],
        })
      if (name === 'commerce_settings')
        return reply({ shipping: null, shippingVersion: 0 })
      if (name === 'admin_catalog_page')
        return reply({
          ...metadata,
          products: [],
          productVersions: {},
          brandVersions: {},
          total: 0,
          settingsVersion: 1,
        })
      if (name === 'admin_commerce_settings')
        return reply({
          shipping: null,
          shippingVersion: 0,
          coupons: [],
          couponVersions: {},
        })
      if (name === 'admin_home_document')
        return reply({
          version: 0,
          media: null,
          content: null,
          mediaAssets: [],
        })
      if (name === 'admin_orders') return reply({ items: [], total: 0 })
      if (name === 'admin_complaints') {
        state.queries.push(body)
        const selected = state.items.filter(
          (item) =>
            (!body.p_status || item.status === body.p_status) &&
            (!body.p_search ||
              item.reference.includes(String(body.p_search)) ||
              item.input.consumer.name.includes(String(body.p_search))),
        )
        const start = (Number(body.p_page) - 1) * 20
        return reply({
          page: body.p_page,
          total: selected.length,
          items: selected.slice(start, start + 20),
        })
      }
      if (name === 'admin_update_complaint') {
        state.updates.push(body)
        if (state.conflict) return reply({ code: 'PT409' }, 409)
        const item = state.items.find((item) => item.id === body.p_id)!
        expect(body.p_expected_version).toBe(item.version)
        expect(request.headers().authorization).toMatch(/^Bearer ey/)
        Object.assign(item, {
          status: body.p_status,
          response: body.p_response,
          responseChannel: body.p_response_channel,
          responseDeliveredAt: body.p_delivered_at ?? null,
          deliveryEvidence: body.p_delivery_evidence,
          version: item.version + 1,
        })
        return reply(item)
      }
      return reply({ code: 'fixture_unhandled' }, 500)
    })
    await runFixture(state)
  },
})
async function completeForm(page: Page) {
  await page
    .getByLabel('Nombres y apellidos', { exact: true })
    .fill('María Núñez')
  await page.getByLabel('Número de documento', { exact: true }).fill('12345678')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('consumer@example.invalid')
  await page.getByLabel('Teléfono', { exact: true }).fill('999888777')
  await page
    .getByLabel('Domicilio', { exact: true })
    .fill('Av. Ejemplo 123, Lima')
  await page.getByLabel('Monto reclamado (S/)', { exact: true }).fill('50')
  await page
    .getByLabel('Descripción del bien o servicio', { exact: true })
    .fill('Perfume de 50 ml')
  await page
    .getByLabel('¿Qué ocurrió?', { exact: true })
    .fill('El paquete llegó dañado.')
  await page
    .getByLabel('¿Qué solicitas?', { exact: true })
    .fill('Solicito la revisión del producto.')
}
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
  await page.goto('/admin/reclamaciones')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Libro de reclamaciones',
  )
}

test('el listado comparte únicamente peticiones idénticas en vuelo, vuelve a consultar después e invalida una lectura anterior al guardar', async ({
  page,
  context,
  supabaseNetwork,
  complaintsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(page.getByRole('row')).toHaveCount(21)
  let release!: () => void
  let gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: string[] = []
  await context.route(
    `${origin}/rest/v1/rpc/admin_complaints`,
    async (route) => {
      if (route.request().method() !== 'OPTIONS') {
        calls.push(String(route.request().postDataJSON().p_status))
        await gate
      }
      await route.fallback()
    },
  )
  const read = (multiple = false) =>
    page.evaluate(async (twice) => {
      const source = '/src/services/complaints-service.ts'
      const { complaintsAdminService: service } = await import(source)
      try {
        await Promise.all(
          twice
            ? [service.list(1), service.list(1), service.list(1, 'reviewing')]
            : [service.list(1)],
        )
        return true
      } catch {
        return false
      }
    }, multiple)
  const loading = read(true)
  try {
    await expect.poll(() => calls.length).toBe(2)
    expect(calls.sort()).toEqual(['', 'reviewing'])
    release()
    expect(await loading).toBe(true)
    expect(await read()).toBe(true)
    expect(calls).toHaveLength(3)
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const outdated = read()
    await expect.poll(() => calls.length).toBe(4)
    await page.evaluate(async (receipt) => {
      const source = '/src/services/complaints-service.ts'
      await (
        await import(source)
      ).complaintsAdminService.update(receipt, {
        status: 'reviewing',
        response: '',
        responseChannel: '',
        responseDeliveredAt: null,
        deliveryEvidence: '',
      })
    }, complaintsNetwork.items[0])
    release()
    expect(await outdated).toBe(false)
    expect(await read()).toBe(true)
    expect(calls).toHaveLength(5)
  } finally {
    release()
    await loading
  }
})

test('el listado pendiente no devuelve datos después de cerrar sesión', async ({
  page,
  context,
  supabaseNetwork,
  complaintsNetwork,
}) => {
  void complaintsNetwork
  await administrator(page, supabaseNetwork)
  await expect(page.getByRole('row')).toHaveCount(21)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  await context.route(
    `${origin}/rest/v1/rpc/admin_complaints`,
    async (route) => {
      if (route.request().method() !== 'OPTIONS') {
        started = true
        await gate
      }
      await route.fallback()
    },
  )
  const loading = page.evaluate(async () => {
    const source = '/src/services/complaints-service.ts'
    try {
      await (await import(source)).complaintsAdminService.list(1)
      return true
    } catch {
      return false
    }
  })
  try {
    await expect.poll(() => started).toBe(true)
    await page.evaluate(async () => {
      const source = '/src/services/auth-service.ts'
      await (await import(source)).authService.signOut()
    })
    release()
    expect(await loading).toBe(false)
  } finally {
    release()
    await loading
  }
})
test('Guest field errors stay below the corresponding fields; a minor requires a representative', async ({
  page,
  complaintsNetwork,
}) => {
  await page.goto('/libro-de-reclamaciones')
  await page
    .getByRole('button', { name: 'Registrar solicitud', exact: true })
    .click()
  await expect(
    page.getByLabel('Nombres y apellidos', { exact: true }),
  ).toBeFocused()
  await expect(page.locator('#complaint-consumer-name-error')).toHaveText(
    'Completa este campo.',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(complaintsNetwork.submissions).toHaveLength(0)
  await completeForm(page)
  await page.getByLabel('El consumidor es menor de edad').check()
  await page
    .getByRole('button', { name: 'Registrar solicitud', exact: true })
    .click()
  await expect(
    page.getByLabel('Padre, madre o representante', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true')
  expect(complaintsNetwork.submissions).toHaveLength(0)
})
test('A confirmed guest registration sends one command and downloads the complete receipt PDF', async ({
  page,
  complaintsNetwork,
}) => {
  const pdfRequests: string[] = []
  page.on('request', (request) => {
    if (/fontkit|\/pdf-lib[^/]*\.js/.test(request.url()))
      pdfRequests.push(request.url())
  })
  await page.goto('/libro-de-reclamaciones')
  await completeForm(page)
  await page
    .getByRole('button', { name: 'Registrar solicitud', exact: true })
    .dblclick()
  await expect(
    page.getByRole('heading', { name: 'LR-2026-000001', exact: true }),
  ).toBeVisible()
  expect(complaintsNetwork.submissions).toHaveLength(1)
  expect(complaintsNetwork.submissions[0].operationId).toMatch(
    /^[a-f0-9-]{36}$/,
  )
  expect(complaintsNetwork.submissions[0].receiptSecret).toMatch(
    /^[a-f0-9]{64}$/,
  )
  expect(pdfRequests).toEqual([])
  const downloadEvent = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar hoja (PDF)', exact: true })
    .click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('LR-2026-000001.pdf')
  const pdf = await PDFDocument.load(await readFile((await download.path())!))
  expect(pdf.getPageCount()).toBeGreaterThan(0)
  expect(pdfRequests.some((url) => url.includes('fontkit'))).toBe(true)
})
test('An ambiguous response preserves and locks the draft; retry uses the exact same operation', async ({
  page,
  complaintsNetwork,
}) => {
  complaintsNetwork.fail = 'ambiguous'
  await page.goto('/libro-de-reclamaciones')
  await completeForm(page)
  await page
    .getByRole('button', { name: 'Registrar solicitud', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('No recibimos la confirmación')
  await dialog.getByRole('button', { name: 'Entendido', exact: true }).click()
  await expect(
    page.getByLabel('Nombres y apellidos', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByLabel('Nombres y apellidos', { exact: true }),
  ).toHaveValue('María Núñez')
  await page
    .getByRole('button', { name: 'Reintentar registro', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'LR-2026-000001' }),
  ).toBeVisible()
  expect(complaintsNetwork.submissions).toHaveLength(2)
  expect(complaintsNetwork.submissions[1]).toEqual(
    complaintsNetwork.submissions[0],
  )
})
test('A validation rejection preserves editable data and unsaved navigation asks before leaving', async ({
  page,
  complaintsNetwork,
}) => {
  complaintsNetwork.fail = 'validation'
  await page.goto('/libro-de-reclamaciones')
  await completeForm(page)
  await page
    .getByRole('button', { name: 'Registrar solicitud', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Entendido', exact: true })
    .click()
  await expect(
    page.getByLabel('Nombres y apellidos', { exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByLabel('Nombres y apellidos', { exact: true }),
  ).toHaveValue('María Núñez')
  await page
    .getByRole('link', { name: 'Privacidad', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('¿Salir sin registrar?')
  await dialog
    .getByRole('button', { name: 'Seguir completando', exact: true })
    .click()
  await expect(page).toHaveURL('/libro-de-reclamaciones')
  await expect(page.getByLabel('Domicilio', { exact: true })).toHaveValue(
    'Av. Ejemplo 123, Lima',
  )
})
test('The administrator paginates, filters and records delivery only after entering a written response and evidence', async ({
  page,
  supabaseNetwork,
  complaintsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(page.getByRole('row')).toHaveCount(21)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: 'Consumidor de prueba 21', exact: false }),
  ).toBeVisible()
  await page
    .getByLabel('Buscar hoja o consumidor', { exact: true })
    .fill('000021')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Ver hoja', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('responded')
  await dialog
    .getByRole('button', { name: 'Guardar atención', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText(
    'completa la respuesta escrita',
  )
  expect(complaintsNetwork.updates).toHaveLength(0)
  await dialog
    .getByLabel('Respuesta escrita / observaciones', { exact: true })
    .fill(
      'Se acordó la sustitución del producto y se entregó la respuesta por carta.',
    )
  await dialog
    .getByLabel('Medio de entrega', { exact: true })
    .selectOption('letter')
  await dialog
    .getByLabel('Fecha de entrega', { exact: true })
    .fill('2026-11-01T13:00')
  await dialog
    .getByLabel('Constancia de entrega', { exact: true })
    .fill('Carta 000021, cargo de recepción archivado')
  await dialog
    .getByRole('button', { name: 'Guardar atención', exact: true })
    .click()
  await expect(dialog.getByRole('status')).toContainText(
    'Respuesta entregada registrada',
  )
  expect(complaintsNetwork.updates).toHaveLength(1)
  await expect(
    dialog.getByLabel('Respuesta escrita / observaciones', { exact: true }),
  ).toBeDisabled()
})
test('A version conflict keeps the admin response intact for review', async ({
  page,
  supabaseNetwork,
  complaintsNetwork,
}) => {
  complaintsNetwork.conflict = true
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Ver hoja', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('reviewing')
  await dialog
    .getByLabel('Respuesta escrita / observaciones', { exact: true })
    .fill('Observación que debe conservarse ante un conflicto.')
  await dialog
    .getByRole('button', { name: 'Guardar atención', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Otra persona actualizó',
  )
  await expect(
    dialog.getByLabel('Respuesta escrita / observaciones', { exact: true }),
  ).toHaveValue('Observación que debe conservarse ante un conflicto.')
})
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`Public form and admin details remain readable at ${width} × ${height}`, async ({
    page,
    supabaseNetwork,
    complaintsNetwork,
  }) => {
    void complaintsNetwork
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height })
    await page.goto('/libro-de-reclamaciones')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Libro de reclamaciones',
    )
    await page.getByLabel('El consumidor es menor de edad').check()
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur()
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(await overflow()).toBe(false)
    await mkdir('artifacts/complaints-captures', { recursive: true })
    await page.screenshot({
      path: `artifacts/complaints-captures/public-${width}.png`,
      fullPage: true,
    })
    // Return the draft to its initial state before navigating away.
    await page.getByLabel('El consumidor es menor de edad').uncheck()
    await administrator(page, supabaseNetwork)
    expect(await overflow()).toBe(false)
    await page.screenshot({
      path: `artifacts/complaints-captures/admin-${width}.png`,
      fullPage: true,
    })
    await page
      .getByRole('button', { name: 'Ver hoja', exact: true })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await overflow()).toBe(false)
    await page.screenshot({
      path: `artifacts/complaints-captures/detail-${width}.png`,
      fullPage: false,
    })
    await page.getByRole('dialog').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.screenshot({
      path: `artifacts/complaints-captures/detail-bottom-${width}.png`,
      fullPage: false,
    })
  })
}
