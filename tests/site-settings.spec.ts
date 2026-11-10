import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  defaultSiteSettings,
  parseSiteSettingsDocument,
  validateSiteSettings,
  type SiteSettings,
} from '../src/domain/site-settings'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

interface SettingsNetwork {
  version: number
  data: SiteSettings | null
  writes: Array<Record<string, unknown>>
  reads: number
  failRead: boolean
  failSave: boolean
  conflict: boolean
  holdSave: Promise<void> | null
}

// Fixture profiles only: these URLs are never written to a hosted database.
const socialProfiles = [
  {
    key: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com/aroma_prueba/',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    url: 'https://www.facebook.com/aroma_prueba/',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/@aroma_prueba',
  },
] as const

const test = authTest.extend<{ settingsNetwork: SettingsNetwork }>({
  settingsNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: SettingsNetwork = {
      version: 3,
      data: defaultSiteSettings(),
      writes: [],
      reads: 0,
      failRead: false,
      failSave: false,
      conflict: false,
      holdSave: null,
    }
    await context.route(
      `https://${fixtureProject}.supabase.co/rest/v1/rpc/*`,
      async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)!
        const handled = [
          'site_settings',
          'admin_save_site_settings',
          'catalog_settings',
          'catalog_home_context',
          'catalog_brand_previews',
          'catalog_brands',
          'admin_catalog_page',
          'admin_orders',
          'admin_commerce_settings',
          'catalog_products',
          'catalog_products_by_ids',
        ]
        if (!handled.includes(name)) {
          await route.fallback()
          return
        }
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
        }
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers })
          return
        }
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
        if (name === 'site_settings') {
          state.reads++
          if (state.failRead) await reply({ code: 'PGRST000' }, 503)
          else await reply({ version: state.version, data: state.data })
        } else if (name === 'admin_save_site_settings') {
          const body = route.request().postDataJSON() as Record<string, unknown>
          state.writes.push(body)
          if (state.holdSave) await state.holdSave
          if (state.failSave) await reply({ code: 'PGRST000' }, 503)
          else if (state.conflict || body.p_expected_version !== state.version)
            await reply({ code: 'PT409' }, 409)
          else {
            const confirmed = parseSiteSettingsDocument({
              version: state.version + 1,
              data: body.p_data,
            })
            state.version = confirmed.version
            state.data = confirmed.data
            await reply(confirmed)
          }
        } else if (name === 'catalog_settings') await reply(metadata)
        else if (name === 'catalog_home_context')
          await reply({ ...metadata, profiles: [], items: [] })
        else if (name === 'catalog_brand_previews')
          await reply({ brands: [], mediaAssets: [] })
        else if (name === 'catalog_brands') await reply([])
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
        else if (name === 'admin_commerce_settings')
          await reply({ ...metadata, coupons: [], couponVersions: {} })
        else await reply({ items: [], total: 0 })
      },
    )
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
  await page.goto('/admin/configuracion')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toBeEnabled()
}

test('El contrato rechaza perfiles inseguros, datos incompletos y contenido malformado', () => {
  const data = defaultSiteSettings()
  expect(validateSiteSettings(data)).toEqual({})
  data.social.instagram = 'https://instagram.com.ejemplo.invalid/perfil'
  data.social.facebook = 'javascript:alert(1)'
  data.social.tiktok = 'https://tiktok.com@evil.invalid/perfil'
  data.contact.whatsapp = '999 123'
  data.business.name = ''
  expect(Object.keys(validateSiteSettings(data)).sort()).toEqual([
    'business.name',
    'contact.whatsapp',
    'social.facebook',
    'social.instagram',
    'social.tiktok',
  ])
  expect(() => parseSiteSettingsDocument({ version: 1, data })).toThrow()
  expect(() =>
    parseSiteSettingsDocument({
      version: 1,
      data: {
        ...defaultSiteSettings(),
        secret: 'not allowed',
      },
    }),
  ).toThrow()
  const live = { ...defaultSiteSettings(), demonstration: false }
  expect(validateSiteSettings(live)['business.taxId']).toBeTruthy()
  expect(validateSiteSettings(live)['contact.email']).toBeTruthy()
})

test('Guarda una versión y Contacto, footer y políticas leen los mismos datos confirmados', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByLabel('WhatsApp con código de país', { exact: true })
    .fill('51912345678')
  await page
    .getByLabel('Correo de atención', { exact: true })
    .fill('atencion@ejemplo.invalid')
  await page
    .getByLabel('Horario de atención', { exact: true })
    .fill('Lunes a viernes, 10:00 a 17:00')
  for (const social of socialProfiles)
    await page.getByLabel(social.label, { exact: true }).fill(social.url)
  await page
    .getByLabel('Privacidad', { exact: true })
    .fill(
      'Política confirmada de prueba.\n\nTus datos se usan para gestionar pedidos.',
    )
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect.poll(() => settingsNetwork.version).toBe(4)
  await expect(page.getByRole('status')).toContainText(
    'Configuración guardada.',
  )
  expect(settingsNetwork.writes).toHaveLength(1)
  expect(settingsNetwork.writes[0].p_expected_version).toBe(3)
  expect(settingsNetwork.writes[0]).not.toHaveProperty('updated_by')
  await page.goto('/contacto')
  await expect(page.locator('.contact-actions a').first()).toHaveAttribute(
    'href',
    /wa.me\/51912345678/,
  )
  await expect(page.locator('.contact-hours')).toContainText('10:00 a 17:00')
  await expect(
    page
      .locator('.contact-actions')
      .getByRole('link', { name: 'atencion@ejemplo.invalid' }),
  ).toHaveAttribute('href', 'mailto:atencion@ejemplo.invalid')
  await expect(page.locator('.footer-social a')).toHaveCount(3)
  for (const social of socialProfiles) {
    await expect(
      page.locator('.contact-social').getByRole('link', {
        name: social.label,
        exact: true,
      }),
    ).toHaveAttribute('href', social.url)
    await expect(
      page.locator('.footer-social').getByRole('link', {
        name: `${social.label} de Aroma Infini, abre en una nueva pestaña`,
        exact: true,
      }),
    ).toHaveAttribute('href', social.url)
  }
  await page.goto('/privacidad')
  await expect(page.locator('.institutional-policy-copy')).toContainText(
    'Política confirmada de prueba.',
  )
  await page.goto('/admin/configuracion')
  await expect(
    page.getByLabel('WhatsApp con código de país', { exact: true }),
  ).toHaveValue('51912345678')
  expect(settingsNetwork.writes).toHaveLength(1)
})

test('Contacto muestra las redes configuradas con enlaces seguros, iconos y navegación por teclado', async ({
  page,
  settingsNetwork,
}) => {
  for (const social of socialProfiles)
    settingsNetwork.data!.social[social.key] = social.url
  await page.goto('/contacto')
  const socialNavigation = page.getByRole('navigation', { name: 'Síguenos' })
  await expect(socialNavigation.getByRole('link')).toHaveCount(3)
  for (const social of socialProfiles) {
    const link = socialNavigation.getByRole('link', {
      name: social.label,
      exact: true,
    })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', social.url)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/)
    await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/)
    await expect(link).toHaveAccessibleDescription(/nueva pestaña/i)
    await expect(link.locator('svg')).toHaveCount(1)
    const box = await link.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await socialNavigation
    .getByRole('link', { name: 'Instagram', exact: true })
    .focus()
  await expect(
    socialNavigation.getByRole('link', { name: 'Instagram', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    socialNavigation.getByRole('link', { name: 'Facebook', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    socialNavigation.getByRole('link', { name: 'TikTok', exact: true }),
  ).toBeFocused()
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('Contacto oculta las redes vacías sin publicar perfiles inventados', async ({
  page,
  settingsNetwork,
}) => {
  settingsNetwork.data!.social = { instagram: '', facebook: '', tiktok: '' }
  await page.goto('/contacto')
  await expect(page.locator('.contact-actions a').first()).toHaveAttribute(
    'href',
    /wa.me\/51955565209/,
  )
  await expect(page.locator('.contact-social')).toHaveCount(0)
  await expect(page.locator('.footer-social')).toHaveCount(0)
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('La descarga de QR permanece bloqueada cuando falta el dominio definitivo', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(
    page.getByRole('heading', { name: 'QR de Contacto', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Descargar SVG', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Descargar PNG', exact: true }),
  ).toBeDisabled()
  await expect(page.getByText(/dominio definitivo/i).first()).toBeVisible()
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('Los errores de campo se muestran junto al campo y no envían datos inválidos', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  const whatsapp = page.getByLabel('WhatsApp con código de país', {
    exact: true,
  })
  await whatsapp.fill('número inválido')
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect(whatsapp).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#site-contact-whatsapp-error')).toContainText(
    'código de país',
  )
  await expect(whatsapp).toBeFocused()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(settingsNetwork.writes).toHaveLength(0)
  await whatsapp.fill('51911122233')
  await expect(whatsapp).toHaveAttribute('aria-invalid', 'false')
})

for (const reason of ['conflict', 'failure'] as const) {
  test(`Un ${reason} conserva los textos y permite volver al formulario`, async ({
    page,
    supabaseNetwork,
    settingsNetwork,
  }) => {
    await administrator(page, supabaseNetwork)
    await page
      .getByLabel('Nombre comercial', { exact: true })
      .fill('Mi texto pendiente')
    settingsNetwork.conflict = reason === 'conflict'
    settingsNetwork.failSave = reason === 'failure'
    await page
      .getByRole('button', { name: 'Guardar configuración', exact: true })
      .click()
    await expect(page.getByRole('alertdialog')).toContainText(
      reason === 'conflict' ? 'Otra persona cambió' : 'No pudimos guardar',
    )
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Volver a editar', exact: true })
      .click()
    await expect(
      page.getByLabel('Nombre comercial', { exact: true }),
    ).toHaveValue('Mi texto pendiente')
    await expect(
      page.getByRole('button', { name: 'Guardar configuración', exact: true }),
    ).toBeEnabled()
    expect(settingsNetwork.version).toBe(3)
    expect(settingsNetwork.data!.business.name).toBe('Aroma Infini')
  })
}

test('El guardado pendiente bloquea clics repetidos y confirma una sola escritura', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByLabel('Nombre comercial', { exact: true })
    .fill('Una sola escritura')
  let release!: () => void
  settingsNetwork.holdSave = new Promise<void>((resolve) => {
    release = resolve
  })
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect.poll(() => settingsNetwork.writes.length).toBe(1)
  await expect(
    page.getByRole('button', { name: 'Guardando…', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toBeDisabled()
  await page
    .locator('.site-settings-form')
    .evaluate((form: HTMLFormElement) => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
  release()
  await expect.poll(() => settingsNetwork.version).toBe(4)
  expect(settingsNetwork.writes).toHaveLength(1)
})

test('Una lectura fallida no permite sobrescribir con valores de demostración y ofrece reintento', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  settingsNetwork.failRead = true
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await page.goto('/admin/configuracion')
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Guardar configuración', exact: true }),
  ).toBeDisabled()
  settingsNetwork.failRead = false
  settingsNetwork.data!.business.name = 'Configuración existente'
  await page
    .getByRole('button', { name: 'Volver a intentar', exact: true })
    .click()
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toHaveValue('Configuración existente')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toBeEnabled()
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('La navegación protege los cambios pendientes hasta confirmar la salida', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByLabel('Nombre comercial', { exact: true })
    .fill('Conservar borrador')
  await page
    .locator('.admin-sidebar')
    .getByRole('link', { name: 'Marcas', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '¿Salir sin guardar?',
  )
  await page
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click()
  await expect(page).toHaveURL('/admin/configuracion')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toHaveValue('Conservar borrador')
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('Una configuración confirmada se conserva si una recarga posterior falla', async ({
  page,
  supabaseNetwork,
  settingsNetwork,
}) => {
  settingsNetwork.data!.business.name = 'Datos ya confirmados'
  await administrator(page, supabaseNetwork)
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toHaveValue('Datos ya confirmados')
  await page
    .locator('.admin-sidebar')
    .getByRole('link', { name: 'Marcas', exact: true })
    .click()
  await expect(page).toHaveURL('/admin/marcas')
  settingsNetwork.failRead = true
  await page
    .locator('.admin-sidebar')
    .getByRole('link', { name: 'Datos de la tienda', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toHaveValue('Datos ya confirmados')
  await expect(
    page.getByLabel('Nombre comercial', { exact: true }),
  ).toBeDisabled()
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('Una primera lectura remota fallida no publica contacto ni políticas de demostración', async ({
  page,
  settingsNetwork,
}) => {
  settingsNetwork.failRead = true
  await page.goto('/contacto')
  await expect(
    page.getByRole('heading', { name: 'Contacto', exact: true }),
  ).toBeVisible()
  await expect.poll(() => settingsNetwork.reads).toBeGreaterThan(0)
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0)
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  await expect(page.locator('.contact-hours')).toHaveCount(0)
  await expect(page.locator('.footer-social')).toHaveCount(0)
  await page.goto('/privacidad')
  await expect(page.locator('.institutional-policy-copy')).toHaveText('')
  await expect(page.locator('body')).not.toContainText(
    'Información de demostración',
  )
  await expect(page.locator('body')).not.toContainText(
    'contacto@aromainfini.example',
  )
  expect(settingsNetwork.writes).toHaveLength(0)
})

test('Un documento vacío confirmado por la API adopta los datos de demostración explícitos', async ({
  page,
  settingsNetwork,
}) => {
  settingsNetwork.version = 0
  settingsNetwork.data = null
  await page.goto('/contacto')
  await expect(page.locator('.contact-actions a').first()).toHaveAttribute(
    'href',
    /wa.me\/51955565209/,
  )
  await page.goto('/privacidad')
  await expect(page.locator('.institutional-policy-copy')).toContainText(
    'Información de demostración',
  )
  expect(settingsNetwork.writes).toHaveLength(0)
})

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`Configuración y contacto son legibles en ${width} × ${height}`, async ({
    page,
    supabaseNetwork,
    settingsNetwork,
  }) => {
    await page.setViewportSize({ width, height })
    await administrator(page, supabaseNetwork)
    const form = page.locator('.site-settings-form')
    await expect(form).toBeVisible()
    await expect(
      page.getByLabel('Correo de atención', { exact: true }),
    ).toHaveValue('contacto@aromainfini.example')
    const controls = await form
      .locator('input:not([type=checkbox]), textarea')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect()
          return {
            width: box.width,
            height: box.height,
            left: box.left,
            right: box.right,
          }
        }),
      )
    for (const box of controls) {
      expect(box.width).toBeGreaterThan(170)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(width + 1)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await mkdir('artifacts/contact-social-qr-2026-11-07', { recursive: true })
    await page.screenshot({
      path: `artifacts/contact-social-qr-2026-11-07/admin-${width}.png`,
      fullPage: true,
    })
    for (const social of socialProfiles)
      settingsNetwork.data!.social[social.key] = social.url
    await page.goto('/contacto')
    for (const social of socialProfiles) {
      const link = page.locator('.contact-social').getByRole('link', {
        name: social.label,
        exact: true,
      })
      await expect(link).toBeVisible()
      const box = await link.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/contact-social-qr-2026-11-07/contact-${width}.png`,
      fullPage: true,
    })
    expect(settingsNetwork.writes).toHaveLength(0)
  })
}
