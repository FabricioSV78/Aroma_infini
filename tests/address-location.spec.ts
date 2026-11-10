import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from './test'

test.use({ authMode: 'customer' })

const latitude = -12.121234
const longitude = -77.031234
const captures = 'artifacts/address-location-2026-11-04/screenshots'
const tileFixture = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#f1f0e9"/>
  <path d="M0 38H256M0 126H256M0 214H256M42 0V256M130 0V256M218 0V256" stroke="#fff" stroke-width="12"/>
  <path d="M0 38H256M0 126H256M0 214H256M42 0V256M130 0V256M218 0V256" stroke="#d7d6ca" stroke-width="1"/>
  <path d="M55 55h60v55H55zM145 145h55v55h-55z" fill="#dce6d8"/>
</svg>`

type GeolocationResult = 'success' | 'denied' | 'timeout' | 'unavailable'

async function installGeolocation(page: Page, result: GeolocationResult) {
  await page.addInitScript(
    ({ result, latitude, longitude }) => {
      Object.defineProperty(window, '__geolocationRequests', {
        configurable: true,
        writable: true,
        value: 0,
      })
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(
            success: PositionCallback,
            error?: PositionErrorCallback | null,
          ) {
            const counter = window as unknown as {
              __geolocationRequests: number
            }
            counter.__geolocationRequests++
            setTimeout(() => {
              if (result === 'success') {
                success({
                  coords: {
                    latitude,
                    longitude,
                    accuracy: 12,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                    toJSON: () => ({ latitude, longitude, accuracy: 12 }),
                  },
                  timestamp: Date.now(),
                  toJSON: () => ({ latitude, longitude }),
                })
              } else {
                const code =
                  result === 'denied' ? 1 : result === 'timeout' ? 3 : 2
                error?.({
                  code,
                  message: 'Synthetic geolocation failure for isolated tests',
                  PERMISSION_DENIED: 1,
                  POSITION_UNAVAILABLE: 2,
                  TIMEOUT: 3,
                })
              }
            }, 0)
          },
        },
      })
    },
    { result, latitude, longitude },
  )
}

async function geolocationRequests(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __geolocationRequests: number })
        .__geolocationRequests,
  )
}

async function openAddresses(page: Page) {
  await page.goto('/cuenta/direcciones')
  await expect(
    page.getByRole('heading', { name: 'Direcciones', exact: true, level: 1 }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle de prueba 123')
}

function locationDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Elegir ubicación de entrega' })
}

function selectedLocation(page: Page) {
  return page.getByText('Ubicación seleccionada', { exact: true })
}

function mapsLink(page: Page) {
  return page.getByRole('link', { name: /^Ver en Google Maps/ })
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false)
}

test.beforeEach(async ({ page }) => {
  // Never make automated requests against the public tile service.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: tileFixture,
    }),
  )
})

test('GPS solo se solicita por acción del cliente y la ubicación se guarda al confirmar la dirección', async ({
  page,
  authFixture,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  const original = authFixture.getAccountData().address
  expect(await geolocationRequests(page)).toBe(0)
  await expect(selectedLocation(page)).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Usar mi ubicación', exact: true })
    .click()
  const dialog = locationDialog(page)
  await expect(dialog).toBeVisible()
  await expect.poll(() => geolocationRequests(page)).toBe(1)
  await expect(
    dialog.getByRole('button', { name: 'Usar este punto' }),
  ).toBeEnabled()
  expect(authFixture.getAccountData().address).toEqual(original)
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(selectedLocation(page)).toBeVisible()
  await expect(mapsLink(page)).toHaveAttribute(
    'href',
    new RegExp(String(latitude)),
  )
  await expect(mapsLink(page)).toHaveAttribute(
    'href',
    new RegExp(String(longitude)),
  )
  expect(authFixture.getAccountData().address).toEqual(original)
  await expect(page.getByLabel('Distrito', { exact: true })).toHaveValue(
    '150122',
  )
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle de prueba 123')
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Dirección guardada.' }),
  ).toBeVisible()
  const savedAddress = JSON.stringify(authFixture.getAccountData().address)
  expect(savedAddress).toContain(String(latitude))
  expect(savedAddress).toContain(String(longitude))
  await page.reload()
  await expect(selectedLocation(page)).toBeVisible()
  await expect(mapsLink(page)).toHaveAttribute(
    'href',
    new RegExp(String(latitude)),
  )
  expect(await geolocationRequests(page)).toBe(0)
})

test('el mapa funciona por teclado, descarta cambios al cancelar y permite quitar la ubicación', async ({
  page,
  authFixture,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  const original = authFixture.getAccountData().address
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  const dialog = locationDialog(page)
  const confirm = dialog.getByRole('button', { name: 'Usar este punto' })
  await expect(confirm).toBeDisabled()
  const map = dialog.getByRole('group', {
    name: 'Mapa para elegir la ubicación',
  })
  await expect(map).toHaveAttribute('tabindex', '0')
  await map.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(selectedLocation(page)).toBeVisible()
  const originalLink = await mapsLink(page).getAttribute('href')
  expect(authFixture.getAccountData().address).toEqual(original)
  expect(await geolocationRequests(page)).toBe(0)

  await page
    .getByRole('button', { name: 'Ajustar ubicación', exact: true })
    .click()
  await map.focus()
  await page.keyboard.press('ArrowRight')
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(mapsLink(page)).toHaveAttribute('href', originalLink!)

  await page
    .getByRole('button', { name: 'Ajustar ubicación', exact: true })
    .click()
  await map.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(mapsLink(page)).toHaveAttribute('href', originalLink!)
  await page
    .getByRole('button', { name: 'Quitar ubicación', exact: true })
    .click()
  await expect(mapsLink(page)).toHaveCount(0)
  await expect(selectedLocation(page)).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Dirección guardada.' }),
  ).toBeVisible()
  await page.reload()
  await expect(mapsLink(page)).toHaveCount(0)
  await expect(selectedLocation(page)).toHaveCount(0)
})

test('seleccionar un punto con el ratón y cambiar zoom no altera el punto confirmado', async ({
  page,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  const dialog = locationDialog(page)
  const map = dialog.getByRole('group', {
    name: 'Mapa para elegir la ubicación',
  })
  const bounds = await map.boundingBox()
  expect(bounds).not.toBeNull()
  await map.click({
    position: { x: bounds!.width * 0.6, y: bounds!.height * 0.55 },
  })
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  const selectedLink = await mapsLink(page).getAttribute('href')
  await page
    .getByRole('button', { name: 'Ajustar ubicación', exact: true })
    .click()
  await dialog.getByRole('button', { name: /Acercar/ }).click()
  await dialog.getByRole('button', { name: /Alejar/ }).click()
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  await expect(mapsLink(page)).toHaveAttribute('href', selectedLink!)
  expect(await geolocationRequests(page)).toBe(0)
})

for (const failure of ['denied', 'timeout', 'unavailable'] as const) {
  test(`GPS ${failure}: explica el problema sin perder la dirección y permite elegir en el mapa`, async ({
    page,
    authFixture,
  }) => {
    await installGeolocation(page, failure)
    await openAddresses(page)
    const original = authFixture.getAccountData().address
    await page
      .getByRole('button', { name: 'Usar mi ubicación', exact: true })
      .click()
    const dialog = locationDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog).not.toContainText('Synthetic geolocation failure')
    await expect(
      dialog.getByRole('button', { name: 'Usar este punto' }),
    ).toBeDisabled()
    await expect(
      page.getByRole('textbox', { name: 'Dirección', exact: true }),
    ).toHaveValue('Calle de prueba 123')
    expect(authFixture.getAccountData().address).toEqual(original)
    const map = dialog.getByRole('group', {
      name: 'Mapa para elegir la ubicación',
    })
    await map.focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      dialog.getByRole('button', { name: 'Usar este punto' }),
    ).toBeEnabled()
    await dialog.getByRole('button', { name: 'Usar este punto' }).click()
    await expect(selectedLocation(page)).toBeVisible()
    expect(authFixture.getAccountData().address).toEqual(original)
  })
}

test('arrastrar el mapa permite ajustar el punto sin solicitar GPS', async ({
  page,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  const dialog = locationDialog(page)
  const map = dialog.getByRole('group', {
    name: 'Mapa para elegir la ubicación',
  })
  await map.focus()
  await map.press('Enter')
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  const originalLink = await mapsLink(page).getAttribute('href')
  await page
    .getByRole('button', { name: 'Ajustar ubicación', exact: true })
    .click()
  const bounds = await map.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 80,
    bounds!.y + bounds!.height / 2 + 30,
    { steps: 6 },
  )
  await page.mouse.up()
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  await expect(mapsLink(page)).not.toHaveAttribute('href', originalLink!)
  expect(await geolocationRequests(page)).toBe(0)
})

test('una respuesta GPS tardía no restaura el borrador después de cancelar', async ({
  page,
  authFixture,
}) => {
  await page.addInitScript(
    ({ latitude, longitude }) => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            Object.defineProperty(window, '__resolveDelayedPosition', {
              configurable: true,
              value: () =>
                success({
                  coords: { latitude, longitude, accuracy: 10 },
                } as GeolocationPosition),
            })
          },
        },
      })
    },
    { latitude, longitude },
  )
  await openAddresses(page)
  const original = authFixture.getAccountData().address
  await page
    .getByRole('button', { name: 'Usar mi ubicación', exact: true })
    .click()
  const dialog = locationDialog(page)
  await expect(
    dialog.getByRole('button', { name: 'Buscando tu ubicación…' }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.evaluate(() =>
    (
      window as unknown as { __resolveDelayedPosition: () => void }
    ).__resolveDelayedPosition(),
  )
  await expect(selectedLocation(page)).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: 'Usar este punto' }),
  ).toBeDisabled()
  expect(authFixture.getAccountData().address).toEqual(original)
})

test('fallos de teselas conservan el formulario y permiten reintentar', async ({
  page,
  authFixture,
}) => {
  await installGeolocation(page, 'success')
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  )
  await openAddresses(page)
  const original = authFixture.getAccountData().address
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  const dialog = locationDialog(page)
  await expect(dialog.getByText(/No se pudo cargar el mapa/)).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Reintentar', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle de prueba 123')
  expect(authFixture.getAccountData().address).toEqual(original)
})

test('un error al guardar conserva el punto y la dirección para reintentar', async ({
  page,
  authFixture,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  const original = authFixture.getAccountData().address
  await page
    .getByRole('button', { name: 'Usar mi ubicación', exact: true })
    .click()
  const dialog = locationDialog(page)
  await expect(
    dialog.getByRole('button', { name: 'Usar este punto' }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  authFixture.setAccountMode('unavailable')
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect(
    page.locator('.account-form-message[role="alert"]'),
  ).not.toBeEmpty()
  await expect(selectedLocation(page)).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle de prueba 123')
  expect(authFixture.getAccountData().address).toEqual(original)
  authFixture.setAccountMode('populated')
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Dirección guardada.' }),
  ).toBeVisible()
  expect(JSON.stringify(authFixture.getAccountData().address)).toContain(
    String(latitude),
  )
})

test('cambiar el domicilio retira el pin anterior mientras destinatario y referencia lo conservan', async ({
  page,
}) => {
  await installGeolocation(page, 'success')
  await openAddresses(page)
  await page
    .getByRole('button', { name: 'Usar mi ubicación', exact: true })
    .click()
  const dialog = locationDialog(page)
  await expect(
    dialog.getByRole('button', { name: 'Usar este punto' }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Usar este punto' }).click()
  await page
    .getByLabel('Nombre de quien recibe', { exact: true })
    .fill('Otra persona')
  await page.getByLabel('Referencia', { exact: false }).fill('Puerta azul')
  await expect(selectedLocation(page)).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Dirección', exact: true })
    .fill('Otra calle 456')
  await expect(selectedLocation(page)).toHaveCount(0)
  await expect(mapsLink(page)).toHaveCount(0)
  await expect(page.getByText(/Vuelve a marcar/)).toBeVisible()
})

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`ubicación precisa: composición y captura en ${viewport.name}`, async ({
    page,
  }) => {
    await installGeolocation(page, 'success')
    await page.setViewportSize(viewport)
    await mkdir(captures, { recursive: true })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openAddresses(page)
    await page.evaluate(() => document.fonts.ready)
    await assertNoHorizontalOverflow(page)
    await page.screenshot({
      path: `${captures}/account-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page
      .getByRole('button', { name: 'Elegir en el mapa', exact: true })
      .click()
    const dialog = locationDialog(page)
    await expect(dialog).toBeVisible()
    const map = dialog.getByRole('group', {
      name: 'Mapa para elegir la ubicación',
    })
    await map.focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      dialog.getByRole('button', { name: 'Usar este punto' }),
    ).toBeEnabled()
    await assertNoHorizontalOverflow(page)
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    await page.screenshot({
      path: `${captures}/picker-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await dialog.getByRole('button', { name: 'Usar este punto' }).click()
    await expect(selectedLocation(page)).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({
      path: `${captures}/location-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    expect(errors).toEqual([])
  })
}
