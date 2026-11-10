import qrcode from 'qrcode-generator'
import { contactQrUrl } from '../domain/contact-qr'

const QUIET_ZONE = 4
const PIXELS_PER_MODULE = 32

export function createContactQr(siteUrl?: string) {
  const url = contactQrUrl(siteUrl)
  if (!url)
    throw new Error('Configura primero el dominio definitivo de la tienda.')
  const code = qrcode(0, 'M')
  code.addData(url, 'Byte')
  code.make()
  const count = code.getModuleCount()
  const modules = Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) => code.isDark(row, column)),
  )
  const size = count + QUIET_ZONE * 2
  const path: string[] = []
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`)
    })
  })
  // No image, logo, tracking redirect or external service is embedded in the QR.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><title>Contacto de Aroma Infini</title><rect width="${size}" height="${size}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`
  return { url, modules, size, svg }
}

export async function contactQrFile(
  siteUrl: string | undefined,
  format: 'svg' | 'png',
): Promise<Blob> {
  const code = createContactQr(siteUrl)
  if (format === 'svg') return new Blob([code.svg], { type: 'image/svg+xml' })
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = code.size * PIXELS_PER_MODULE
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('No pudimos preparar el archivo. Vuelve a intentar.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  code.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark)
        context.fillRect(
          (x + QUIET_ZONE) * PIXELS_PER_MODULE,
          (y + QUIET_ZONE) * PIXELS_PER_MODULE,
          PIXELS_PER_MODULE,
          PIXELS_PER_MODULE,
        )
    })
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else
        reject(new Error('No pudimos preparar el archivo. Vuelve a intentar.'))
    }, 'image/png')
  })
}

export async function downloadContactQr(
  siteUrl: string | undefined,
  format: 'svg' | 'png',
) {
  const blob = await contactQrFile(siteUrl, format)
  const source = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = source
  link.download = `aroma-infini-contacto.${format}`
  document.body.append(link)
  link.click()
  link.remove()
  // Allow the browser to finish consuming the download before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(source), 1000)
}
