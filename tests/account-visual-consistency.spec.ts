import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'

test.use({ authMode: 'customer' })

const phase = process.env.ACCOUNT_VISUAL_PHASE === 'before' ? 'before' : 'after'
const root = `artifacts/account-consistency-2026-10-28/${phase}`
const pages = [
  { key: 'resumen', path: '/cuenta', title: 'Hola, Camila', nav: 'Resumen' },
  { key: 'datos', path: '/cuenta/datos', title: 'Mis datos', nav: 'Mis datos' },
  {
    key: 'direcciones',
    path: '/cuenta/direcciones',
    title: 'Direcciones',
    nav: 'Direcciones',
  },
  {
    key: 'pedidos',
    path: '/cuenta/pedidos',
    title: 'Mis pedidos',
    nav: 'Mis pedidos',
  },
  { key: 'pagos', path: '/cuenta/pagos', title: 'Pagos', nav: 'Pagos' },
  {
    key: 'favoritos',
    path: '/cuenta/favoritos',
    title: 'Favoritos',
    nav: 'Favoritos',
  },
] as const

async function ready(page: Page) {
  await expect(page.locator('.account-page')).toBeVisible()
  await expect(
    page.getByText('Cargando tu cuenta…', { exact: true }),
  ).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((image) =>
        image.decode().catch(() => undefined),
      ),
    )
  })
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    function effectiveBackground(element: Element | null): string {
      for (let item = element; item; item = item.parentElement) {
        const background = getComputedStyle(item).backgroundColor
        if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent')
          return background
      }
      return 'rgb(255, 255, 255)'
    }
    const content = document.querySelector('.account-content')!
    const heading = content.querySelector('h1')!.getBoundingClientRect()
    const boundary = content.getBoundingClientRect()
    const fields = [
      ...content.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input, select',
      ),
    ]
      .filter((field) => field.getClientRects().length)
      .map((field) => ({
        id: field.id,
        height: field.getBoundingClientRect().height,
        background: effectiveBackground(field),
      }))
    return {
      pageBackground: effectiveBackground(
        document.querySelector('.account-page'),
      ),
      contentBackground: effectiveBackground(content),
      panelBackgrounds: [
        ...content.querySelectorAll(
          '.account-overview-grid > section, .account-form, .account-payment-provider, .account-order-delivery, .account-transactions',
        ),
      ].map(effectiveBackground),
      overflow: document.documentElement.scrollWidth > innerWidth,
      headingX: heading.x,
      contentX: boundary.x,
      contentWidth: boundary.width,
      fields,
    }
  })
}

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Mi cuenta: coherencia y navegación en ${viewport.name}`, async ({
    page,
    authFixture,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mkdir(root, { recursive: true })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const results = []
    for (const item of pages) {
      await page.goto(item.path)
      await ready(page)
      await expect(
        page.getByRole('heading', { name: item.title, exact: true, level: 1 }),
      ).toBeVisible()
      await expect(
        page.locator('.account-sidebar').getByRole('link', {
          name: item.nav,
          exact: true,
          includeHidden: true,
        }),
      ).toHaveAttribute('aria-current', 'page')
      const measured = await geometry(page)
      expect(measured.overflow, `${item.key}: desbordamiento horizontal`).toBe(
        false,
      )
      if (phase === 'after') {
        expect(
          measured.pageBackground,
          `${item.key}: superficie de página`,
        ).toBe('rgb(255, 255, 255)')
        expect(
          measured.contentBackground,
          `${item.key}: superficie principal`,
        ).toBe('rgb(255, 255, 255)')
        expect(
          measured.panelBackgrounds.every(
            (value) => value === 'rgb(255, 255, 255)',
          ),
          `${item.key}: paneles blancos`,
        ).toBe(true)
        expect(
          Math.abs(measured.headingX - measured.contentX),
          `${item.key}: encabezado alineado`,
        ).toBeLessThanOrEqual(2)
        for (const field of measured.fields) {
          expect(field.height, field.id).toBeGreaterThanOrEqual(44)
          expect(field.height, field.id).toBeLessThanOrEqual(54)
          expect(field.background, field.id).toBe('rgb(255, 255, 255)')
        }
        if (item.key === 'direcciones') {
          const label = page.getByLabel('Etiqueta de la dirección', {
            exact: true,
          })
          const recipient = page.getByLabel('Nombre de quien recibe', {
            exact: true,
          })
          await expect(label).toBeVisible()
          await expect(recipient).toBeVisible()
          await expect(label).toHaveAccessibleDescription(
            'Por ejemplo: Casa u Oficina.',
          )
          await expect(recipient).toHaveAccessibleDescription(
            'Puede ser tú u otra persona.',
          )
        }
      }
      await page.screenshot({
        path: `${root}/${item.key}-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
      results.push({ section: item.key, ...measured })
    }
    if (phase === 'after') {
      await page.goto('/cuenta')
      await ready(page)
      const toggle = page.locator('.account-menu-toggle')
      if (await toggle.isVisible()) {
        await toggle.focus()
        await page.keyboard.press('Enter')
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      }
      const dataLink = page
        .locator('.account-sidebar')
        .getByRole('link', { name: 'Mis datos', exact: true })
      await dataLink.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL('/cuenta/datos')
      await ready(page)
      if (await toggle.isVisible())
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      authFixture.setAccountMode('empty')
      const emptyAccount = authFixture.getAccountData()
      authFixture.setAccountData({ ...emptyAccount, address: null, orders: [] })
      for (const item of [
        {
          key: 'direcciones-vacio',
          path: '/cuenta/direcciones',
          title: 'No hay una dirección guardada',
        },
        {
          key: 'pedidos-vacio',
          path: '/cuenta/pedidos',
          title: 'Aún no hay pedidos',
        },
        {
          key: 'pagos-vacio',
          path: '/cuenta/pagos',
          title: 'No hay pagos registrados',
        },
      ]) {
        await page.goto(item.path)
        await ready(page)
        await expect(
          page.getByRole('heading', { name: item.title, exact: true }),
        ).toBeVisible()
        expect((await geometry(page)).overflow).toBe(false)
        await page.screenshot({
          path: `${root}/${item.key}-${viewport.name}.png`,
          fullPage: true,
          animations: 'disabled',
        })
      }
    }
    expect(errors).toEqual([])
    await writeFile(
      `${root}/${viewport.name}.json`,
      JSON.stringify({ viewport, phase, sections: results, errors }, null, 2),
    )
  })
}
