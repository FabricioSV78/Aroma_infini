import { expect, test, type Locator, type Page } from './test'
import { emptyComplaint, type ComplaintReceipt } from '../src/domain/complaints'
import { importFile, importRecord, openImport, reviewFile } from './product-import-fixtures'

test.use({ authMode: 'admin' })

const widths = [360, 390, 430, 768, 1024, 1440] as const
const mobileWidths = [360, 390, 430, 768, 1024] as const
const screens = [
  ['resumen', '/admin'],
  ['productos', '/admin/productos'],
  ['producto-nuevo', '/admin/productos/nuevo'],
  ['producto-editar', '/admin/productos/cedre'],
  ['fotografias', '/admin/productos/cedre/fotos'],
  ['familias', '/admin/familias-olfativas'],
  ['marcas', '/admin/marcas'],
  ['pedidos', '/admin/pedidos'],
  ['pedido-detalle', '/admin/pedidos/AI-210926-01'],
  ['clientes', '/admin/clientes'],
  ['cupones', '/admin/promociones'],
  ['ofertas', '/admin/promociones?vista=ofertas'],
  ['envios', '/admin/envios'],
  ['home', '/admin/home'],
  ['configuracion', '/admin/configuracion'],
  ['notificaciones', '/admin/notificaciones'],
  ['reclamaciones', '/admin/reclamaciones'],
] as const

function complaint(index: number): ComplaintReceipt {
  return {
    id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    reference: `LR-2026-${String(index).padStart(6, '0')}`,
    submittedAt: '2026-11-19T12:00:00.000Z',
    input: {
      ...emptyComplaint(),
      consumer: {
        name: `Consumidor de prueba ${index}`,
        documentType: 'DNI', documentNumber: '12345678',
        email: 'consumidor@example.invalid', phone: '999888777',
        address: 'Avenida de prueba 123, Lima', minor: false,
        guardianName: '', guardianDocument: '',
      },
      purchase: { kind: 'product', description: 'Perfume de prueba de 50 ml', amountCents: 5000, orderReference: '' },
      detail: 'El paquete requiere una revisión.',
      request: 'Solicito la revisión del producto.',
    },
    provider: { name: 'Aroma Infini', legalName: 'Proveedor de prueba', taxId: '', address: 'Dirección de prueba' },
    demonstration: true, status: 'received', response: '', responseChannel: '',
    responseDeliveredAt: null, deliveryEvidence: '', version: 1, history: [],
  }
}

// These substitutions exist only in the runner. They exercise populated UI,
// not live push delivery or hosted authorization (covered by their SDK suites).
test.beforeEach(async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/src/services/admin-notifications.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
const snapshot = {items:[{id:'mobile-notice',kind:'simulated_order',orderReference:'AI-210926-01',createdAt:'2026-11-19T12:00:00Z',read:false}],unreadCount:1,loading:false,loaded:true,error:''};
export const adminNotifications = {subscribe:()=>()=>{},getSnapshot:()=>snapshot,refresh:async()=>{},markRead:async()=>{}};
export const adminNotificationError = ()=>'No se pudo completar la operación.';
export const adminPushCapabilities = ()=>({supported:true,secure:true,ios:false,standalone:false,permission:'default'});
export const getAdminPushStatus = async()=>({configured:true,publicKey:null,currentDevice:null});
export const inspectAdminPushSubscription = async()=>'missing';
export const enableAdminPush = async()=>{};
export const disableAdminPush = async()=>{};
export const testAdminPush = async()=>{};
export const disableAdminPushOnSignOut = async()=>{};
export const getAdminPushDeviceId = ()=>'isolated-mobile-device';
`,
  }))
  await context.route('**/src/services/complaints-service.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
const items=${JSON.stringify(Array.from({ length: 21 }, (_, i) => complaint(i + 1)))};
export const complaintsAdminService={
 async list(page,status='',search=''){const filtered=items.filter(i=>(!status||i.status===status)&&(!search||(i.reference+' '+i.input.consumer.name).toLowerCase().includes(search.toLowerCase())));return {items:filtered.slice((page-1)*20,page*20),total:filtered.length};},
 async update(item,changes){return {...item,...changes,version:item.version+1};}
};
`,
  }))
})

async function fitsPage(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth - 1),
    pageOutside: [...document.querySelectorAll('.admin-page')].some(element => {
      const box = element.getBoundingClientRect()
      return box.left < -1 || box.right > innerWidth + 1
    }),
  }))).toEqual({ overflow: 0, pageOutside: false })
}

async function touchTarget(control: Locator) {
  await expect(control).toBeVisible()
  await expect.poll(() => control.evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.width >= 43 && box.height >= 43
  })).toBe(true)
}

async function fitsDialog(dialog: Locator) {
  await expect(dialog).toBeVisible()
  await expect.poll(() => dialog.evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.left >= -1 && box.right <= innerWidth + 1 &&
      box.top >= -1 && box.bottom <= innerHeight + 1 &&
      element.scrollWidth <= element.clientWidth + 1
  })).toBe(true)
  await touchTarget(dialog.getByRole('button', { name: 'Cerrar', exact: true }))
}

for (const width of widths) {
  for (const [name, path] of screens) {
    test(`${name}: contenido y acciones dentro de ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(path)
      await expect(page.locator('#admin-content h1')).toBeVisible()
      await expect(page.locator('.admin-page')).toBeVisible()
      if (name === 'reclamaciones')
        await expect(page.locator('.complaint-table-wrap tbody tr')).toHaveCount(20)
      if (name === 'notificaciones')
        await expect(page.locator('.admin-notification-device-status')).toContainText('Disponible')
      await fitsPage(page)
      // Check the actual header controls, rather than shrinking them or creating
      // a separate mobile header with a different action model.
      if (width < 1200) {
        await touchTarget(page.getByRole('button', { name: 'Abrir menú administrativo' }))
        await touchTarget(page.getByRole('button', { name: 'Cerrar sesión', exact: true }))
        await touchTarget(page.getByRole('link', { name: 'Ver tienda', exact: true }))
      } else {
        await expect(page.getByRole('navigation', { name: 'Navegación administrativa' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Abrir menú administrativo' })).not.toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }

  test(`navegación SPA y foco del menú a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin')
    await expect(page.locator('#admin-content h1')).toBeVisible()
    await page.evaluate(() => Reflect.set(window, '__mobileNavigationDocument', 'same-document'))
    const navigation = page.getByRole('navigation', { name: 'Navegación administrativa' })
    if (width < 1200) {
      const open = page.getByRole('button', { name: 'Abrir menú administrativo' })
      await open.click()
      const drawer = page.getByRole('dialog', { name: 'Menú administrativo' })
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Cerrar menú administrativo' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
      await expect(open).toBeFocused()
      await open.click()
    }
    await navigation.getByRole('link', { name: 'Pedidos', exact: true }).click()
    await expect(page).toHaveURL('/admin/pedidos')
    await expect(page.locator('#admin-content')).toBeFocused()
    await expect(page.locator('#admin-content h1')).toHaveText('Pedidos')
    expect(await page.evaluate(() => Reflect.get(window, '__mobileNavigationDocument'))).toBe('same-document')
    if (width < 1200)
      await expect(page.getByRole('dialog', { name: 'Menú administrativo' })).not.toBeVisible()
    await fitsPage(page)
  })
}

for (const width of mobileWidths) {
  test(`producto: borrador, cinco fotos y acciones se conservan al adaptar ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/productos/cedre')
    const name = page.getByLabel('Nombre', { exact: true })
    await name.fill('Bois Clair revisión móvil')
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(name).toHaveValue('Bois Clair revisión móvil')
    if (width < 600) {
      const traits = page.locator('.admin-olfactory-editor .olfactory-profile-traits input')
      await expect(traits).toHaveCount(2)
      for (const field of await traits.all())
        expect(await field.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    }
    await page.setViewportSize({ width, height: 900 })
    await expect(name).toHaveValue('Bois Clair revisión móvil')
    await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
    await expect(page.locator('.admin-product-olfactory-slot')).toHaveCount(1)
    await expect(page.getByLabel('Subir varias fotos del producto')).toBeAttached()
    await expect(page.getByLabel('Subir imagen del perfil olfativo')).toBeAttached()
    const save = page.getByRole('button', { name: 'Guardar producto', exact: true })
    await save.scrollIntoViewIfNeeded()
    await touchTarget(save)
    await touchTarget(page.getByRole('button', { name: 'Vista previa', exact: true }))
    await fitsPage(page)
  })

  test(`familias: modal, checkbox y error junto al campo a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/familias-olfativas')
    await page.getByRole('button', { name: 'Nueva familia', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Nueva familia' })
    const name = dialog.getByLabel('Nombre de la familia')
    await fitsDialog(dialog)
    await name.fill('Floral')
    await dialog.getByRole('button', { name: 'Guardar familia' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Ya existe')
    await expect(name).toHaveValue('Floral')
    await touchTarget(dialog.locator('.admin-family-active'))
    await fitsDialog(dialog)
    await fitsPage(page)
  })

  test(`Home: todas las pestañas y preguntas conservan sus controles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/home')
    const tabs = page.getByRole('group', { name: 'Apartados del Home', exact: true })
    for (const label of [
      'Franja superior', 'Para él, para ella y unisex', 'Marcas',
      'Video editorial', 'Encuentra tu perfume ideal', 'Carrusel principal',
    ]) {
      const tab = tabs.getByRole('button', { name: label, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      await touchTarget(tab)
      await fitsPage(page)
    }
    await tabs.getByRole('button', { name: 'Encuentra tu perfume ideal', exact: true }).click()
    const finder = page.getByRole('group', { name: 'Partes de Encuentra tu perfume ideal' })
    for (const label of ['Preguntas y opciones', 'Resultados', 'Presentación']) {
      const tab = finder.getByRole('button', { name: label, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      await touchTarget(tab)
      await fitsPage(page)
    }
  })

  test(`Excel: revisión paginada y cierre accesibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openImport(page)
    await touchTarget(page.getByRole('button', { name: 'Subir Excel', exact: true }))
    const file = await importFile(Array.from({ length: 30 }, (_, index) => importRecord({
      slug: `movil-excel-${index}`, nombre: `Perfume de revisión ${index}`,
      sku: `MOVIL-${index}`,
    })), undefined, 'revision-movil.xlsx')
    const dialog = await reviewFile(page, file)
    await fitsDialog(dialog)
    await expect(dialog.getByRole('region', { name: 'Vista previa de importación' })).toContainText('30 productos')
    await expect(dialog.locator('.admin-product-import__rows > li')).toHaveCount(25)
    const next = dialog.getByRole('button', { name: 'Siguiente', exact: true })
    await next.scrollIntoViewIfNeeded()
    await touchTarget(next)
    await next.click()
    await expect(dialog.locator('.admin-product-import__rows > li')).toHaveCount(5)
    await fitsDialog(dialog)
    await fitsPage(page)
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })

  test(`cupones y ofertas: formularios y guardado consecutivo a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/promociones')
    await page.getByRole('button', { name: 'Nueva promoción', exact: true }).click()
    const coupon = page.locator('.admin-promotion-form')
    await coupon.getByLabel('Código', { exact: true }).fill('MOVIL20')
    await coupon.getByLabel('Promoción activa').check()
    const another = coupon.getByRole('button', { name: 'Guardar y crear otra', exact: true })
    await another.scrollIntoViewIfNeeded()
    await touchTarget(another)
    await another.click()
    await expect(coupon.getByLabel('Código', { exact: true })).toHaveValue('')
    await expect(page.locator('.admin-promotion-list')).toContainText('MOVIL20')
    await fitsPage(page)
    await coupon.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('tab', { name: 'Ofertas de productos', exact: true }).click()
    await page.getByRole('button', { name: 'Crear oferta de producto', exact: true }).click()
    const offer = page.locator('.admin-offers-editor')
    await offer.getByRole('combobox', { name: 'Producto', exact: true }).selectOption('cedre')
    await offer.getByLabel('Descuento (%)', { exact: true }).fill('15')
    const save = offer.getByRole('button', { name: 'Guardar y crear otra', exact: true })
    await save.scrollIntoViewIfNeeded()
    await touchTarget(save)
    await save.click()
    await expect(offer.getByRole('combobox', { name: 'Producto', exact: true })).toHaveValue('')
    await expect(page.getByRole('region', { name: 'Ofertas de productos', exact: true })).toContainText('1 producto con oferta')
    await offer.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect(page.locator('.admin-offers-list')).toContainText('Bois Clair')
    await fitsPage(page)
  })

  test(`reclamaciones y notificaciones: contenido, páginas y ventanas a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/reclamaciones')
    await expect(page.locator('.complaint-table-wrap tbody tr')).toHaveCount(20)
    await page.getByRole('button', { name: 'Ver hoja', exact: true }).first().click()
    const receipt = page.getByRole('dialog', { name: 'LR-2026-000001', exact: true })
    await fitsDialog(receipt)
    await expect(receipt).toContainText('consumidor@example.invalid')
    const save = receipt.getByRole('button', { name: 'Guardar atención', exact: true })
    await save.scrollIntoViewIfNeeded()
    await touchTarget(save)
    await receipt.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('navigation', { name: 'Paginación de solicitudes' }).getByRole('button', { name: 'Siguiente', exact: true }).click()
    await expect(page.locator('.complaint-table-wrap tbody tr')).toHaveCount(1)
    await fitsPage(page)
    await page.getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true }).click()
    const notifications = page.getByRole('dialog', { name: 'Notificaciones', exact: true })
    await fitsDialog(notifications)
    await expect(notifications).toContainText('AI-210926-01')
    await expect(notifications.getByRole('link', { name: 'Configurar notificaciones', exact: true })).toHaveAttribute('href', '/admin/notificaciones')
  })

  test(`marcas: revisión múltiple y errores sin pérdida a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/marcas')
    await page.getByRole('button', { name: 'Registrar marcas', exact: true }).click()
    const editor = page.locator('.admin-brand-registration')
    const names = editor.getByLabel('Marcas (una por línea)', { exact: true })
    await names.fill('Maison Móvil\nMAISON MÓVIL\nAtelier 01\n---')
    await editor.getByRole('button', { name: 'Revisar marcas', exact: true }).click()
    const results = editor.getByRole('region', { name: 'Resultados de la revisión' })
    await expect(results).toContainText('Repetida')
    await expect(results).toContainText('Ya existe')
    await expect(results).toContainText('Revisar')
    await expect(names).toHaveValue('Maison Móvil\nMAISON MÓVIL\nAtelier 01\n---')
    await touchTarget(editor.getByRole('button', { name: 'Guardar marcas', exact: true }))
    await fitsPage(page)
  })

  test(`envíos: editor de tarifas conserva campos y acciones a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/envios')
    await page.getByRole('button', { name: 'Agregar tarifa por distrito', exact: true }).click()
    const editor = page.locator('#admin-shipping-zone-editor')
    await expect(editor).toBeVisible()
    await expect(editor.getByLabel('Nombre visible de la tarifa')).toBeVisible()
    await expect(editor.getByRole('combobox', { name: 'Zona', exact: true })).toBeVisible()
    await expect(editor.getByRole('combobox', { name: 'Distrito', exact: true })).toBeVisible()
    await expect(editor.getByLabel('Courier (S/)', { exact: true })).toBeVisible()
    await expect(editor.getByLabel('Motorizado (S/)', { exact: true })).toBeVisible()
    await expect(editor.getByLabel('Plazo', { exact: true })).toBeVisible()
    await touchTarget(editor.getByLabel('Tarifa especial activa').locator('..'))
    const save = page.getByRole('button', { name: 'Guardar configuración', exact: true })
    await save.scrollIntoViewIfNeeded()
    await touchTarget(save)
    await fitsPage(page)
  })

  test(`configuración: campos y ubicaciones de imágenes accesibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/configuracion')
    await expect(page.getByLabel('Nombre comercial', { exact: true })).toBeEnabled()
    await page.getByText('Imágenes del sitio', { exact: true }).click()
    const placements = page.getByRole('region', { name: 'Ubicaciones de imágenes de la tienda' })
    await expect(placements.locator('.admin-media-card').first()).toBeVisible()
    await expect(placements.getByRole('link', { name: 'Editar imágenes y videos del Home' })).toHaveAttribute('href', '/admin/home')
    await page.getByLabel('Nombre comercial', { exact: true }).fill('Aroma Infini revisión móvil')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByLabel('Nombre comercial', { exact: true })).toHaveValue('Aroma Infini revisión móvil')
    const save = page.locator('.site-settings-actions').getByRole('button', { name: 'Guardar configuración', exact: true })
    await save.scrollIntoViewIfNeeded()
    await touchTarget(save)
    await fitsPage(page)
  })
}

test.describe('Acceso administrativo móvil sin sesión', () => {
  test.use({ authMode: 'anonymous' })

  for (const width of mobileWidths) {
    for (const path of ['/admin/login', '/admin/recuperar', '/admin/restablecer']) {
      test(`${path}: acceso seguro y controles dentro de ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await expect(page.locator('.admin-auth-main h1')).toBeVisible()
        await expect(page.locator('#admin-content')).toHaveCount(0)
        await expect(page.locator('.admin-sidebar')).toHaveCount(0)
        await expect.poll(() => page.locator('.auth-form-panel').evaluate(element => {
          const box = element.getBoundingClientRect()
          return box.left >= -1 && box.right <= innerWidth + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1
        })).toBe(true)
        if (path === '/admin/login') {
          await expect(page.getByRole('heading', { name: 'Acceso administrativo', exact: true })).toBeVisible()
          const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true })
          await touchTarget(submit)
          await submit.click()
          await expect(page.getByRole('textbox', { name: 'Correo electrónico', exact: true })).toHaveAttribute('aria-invalid', 'true')
          await expect(page.locator('.auth-field-error')).toHaveCount(2)
          await expect(page.locator('dialog[open]')).toHaveCount(0)
          await fitsPage(page)
        } else {
          // Both aliases intentionally explain owner-managed admin recovery.
          // Neither a missing token nor the customer recovery form grants access.
          await expect(page.getByRole('heading', { name: 'Recuperar acceso administrativo', exact: true })).toBeVisible()
          await expect(page.locator('.admin-auth-main')).toContainText('directamente en Supabase')
          await expect(page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true })).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Volver a iniciar sesión', exact: true })).toHaveAttribute('href', /^\/admin\/login(?:\?|$)/)
        }
      })
    }
  }
})
