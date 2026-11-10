import { expect, test } from '@playwright/test'
import { contactQrUrl } from '../src/domain/contact-qr'
import { createContactQr } from '../src/services/contact-qr'

test('El QR usa exclusivamente el origen HTTPS configurado y la ruta estable de Contacto', () => {
  expect(contactQrUrl('https://www.aromainfini.pe')).toBe(
    'https://www.aromainfini.pe/contacto',
  )
  expect(contactQrUrl('https://aromainfini.pe/')).toBe(
    'https://aromainfini.pe/contacto',
  )
})

test('El QR vectorial conserva módulos cuadrados, margen blanco y destino directo', () => {
  const code = createContactQr('https://perfumeria-cliente.pe')
  expect(code.url).toBe('https://perfumeria-cliente.pe/contacto')
  expect(code.size).toBe(code.modules.length + 8)
  expect(code.modules.every((row) => row.length === code.modules.length)).toBe(
    true,
  )
  expect(code.svg).toContain('width="30mm" height="30mm"')
  expect(code.svg).toContain('shape-rendering="crispEdges"')
  expect(code.svg).toContain('fill="#fff"')
  expect(code.svg).toContain('M4 4h1v1h-1z')
  expect(code.svg).not.toMatch(
    /<image|<script|<foreignObject|https:\/\/perfumeria/,
  )
  expect(() => createContactQr()).toThrow(/dominio definitivo/)
})

test('SVG y PNG se descargan con el nombre y formato correctos sin llamadas externas', async ({
  page,
}) => {
  // A synthetic domain is used only in memory; no printable fixture is saved.
  await page.route('https://**/*', (route) => route.abort())
  await page.goto('/admin/login')
  const result = await page.evaluate(async () => {
    const path = '/src/services/contact-qr.ts'
    const { contactQrFile } = await import(/* @vite-ignore */ path)
    const svg = await contactQrFile('https://perfumeria-cliente.pe', 'svg')
    const png = await contactQrFile('https://perfumeria-cliente.pe', 'png')
    const image = await createImageBitmap(png)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const corner = Array.from(context.getImageData(0, 0, 1, 1).data)
    const dimensions = { width: image.width, height: image.height }
    image.close()
    return { svgType: svg.type, pngType: png.type, corner, ...dimensions }
  })
  expect(result.svgType).toBe('image/svg+xml')
  expect(result.pngType).toBe('image/png')
  expect(result.width).toBe(result.height)
  expect(result.width).toBeGreaterThan(1000)
  expect(result.corner).toEqual([255, 255, 255, 255])
  for (const format of ['svg', 'png']) {
    const received = page.waitForEvent('download')
    await page.evaluate(async (format) => {
      const path = '/src/services/contact-qr.ts'
      const { downloadContactQr } = await import(/* @vite-ignore */ path)
      await downloadContactQr('https://perfumeria-cliente.pe', format)
    }, format)
    const download = await received
    expect(download.suggestedFilename()).toBe(`aroma-infini-contacto.${format}`)
    expect(await download.failure()).toBeNull()
    await download.delete()
  }
})

for (const [reason, value] of [
  ['sin configurar', undefined],
  ['vacío', ''],
  ['solo espacios', '   '],
  ['URL relativa', '/contacto'],
  ['HTTP', 'http://aromainfini.pe'],
  ['localhost', 'https://localhost'],
  ['localhost con subdominio', 'https://tienda.localhost'],
  ['IPv4 de bucle local', 'https://127.0.0.1'],
  ['IPv4 privado', 'https://192.168.1.30'],
  ['IPv4 interno', 'https://10.20.30.40'],
  ['IPv6 de bucle local', 'https://[::1]'],
  ['IPv6 privado', 'https://[fd00::1]'],
  ['staging', 'https://staging.aromainfini.pe'],
  ['desarrollo', 'https://dev.aromainfini.pe'],
  ['pruebas', 'https://test.aromainfini.pe'],
  ['dominio reservado', 'https://aromainfini.example'],
  ['dominio inválido', 'https://aromainfini.invalid'],
  ['marcador del proyecto', 'https://www.dominio-confirmado.pe'],
  ['Worker temporal', 'https://aroma-infini.workers.dev'],
  ['bucket temporal', 'https://aroma-infini.r2.dev'],
  ['Cloudflare Pages temporal', 'https://aroma-infini.pages.dev'],
  ['Vercel temporal', 'https://aroma-infini.vercel.app'],
  ['Netlify temporal', 'https://aroma-infini.netlify.app'],
  ['Supabase', 'https://abcdefghijklmnopqrst.supabase.co'],
  ['usuario', 'https://usuario@aromainfini.pe'],
  ['contraseña', 'https://usuario:clave@aromainfini.pe'],
  ['puerto', 'https://aromainfini.pe:8443'],
  ['ruta', 'https://aromainfini.pe/tienda'],
  ['ruta de Contacto precargada', 'https://aromainfini.pe/contacto'],
  ['consulta', 'https://aromainfini.pe/?campana=tarjeta'],
  ['fragmento', 'https://aromainfini.pe/#contacto'],
] as const) {
  test(`El QR rechaza ${reason}`, () => {
    expect(contactQrUrl(value)).toBeNull()
  })
}
