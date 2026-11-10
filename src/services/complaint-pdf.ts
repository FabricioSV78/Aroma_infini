import {
  complaintStatusLabels,
  type ComplaintReceipt,
} from '../domain/complaints'

const regular = new URL(
  '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
  import.meta.url,
).href
export async function buildComplaintPdf(
  receipt: ComplaintReceipt,
  fontBytes?: Uint8Array,
): Promise<Uint8Array> {
  // The form does not need PDF/font parsers until a receipt is downloaded.
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ])
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const bytes =
    fontBytes ?? new Uint8Array(await (await fetch(regular)).arrayBuffer())
  const font = await document.embedFont(bytes, { subset: true })
  let page = document.addPage([595.28, 841.89]),
    y = 795
  const text = (value: string, size = 10) => {
    for (const paragraph of [...value]
      .filter(
        (character) =>
          character.charCodeAt(0) >= 32 ||
          [9, 10, 13].includes(character.charCodeAt(0)),
      )
      .join('')
      .split(/\r?\n/)) {
      let line = ''
      const lines: string[] = []
      for (const character of paragraph) {
        if (font.widthOfTextAtSize(line + character, size) > 505 && line) {
          lines.push(line)
          line = ''
        }
        line += character
      }
      lines.push(line)
      for (const entry of lines) {
        if (y < 55) {
          page = document.addPage([595.28, 841.89])
          y = 795
        }
        page.drawText(entry, {
          x: 45,
          y,
          size,
          font,
          color: rgb(0.1, 0.19, 0.17),
        })
        y -= size + 5
      }
    }
    y -= 5
  }
  const { input, provider } = receipt
  text('LIBRO DE RECLAMACIONES', 17)
  text(
    `Hoja ${receipt.reference} · ${new Date(receipt.submittedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
    11,
  )
  if (receipt.demonstration)
    text('ENTORNO DE DEMOSTRACIÓN · datos del proveedor de ejemplo', 10)
  text(
    `${provider.legalName} · RUC: ${provider.taxId || 'No configurado'}\n${provider.address}`,
  )
  text('1. Identificación del consumidor', 12)
  text(
    `${input.consumer.name}\n${input.consumer.documentType}: ${input.consumer.documentNumber}\nCorreo: ${input.consumer.email} · Teléfono: ${input.consumer.phone}\nDomicilio: ${input.consumer.address}`,
  )
  if (input.consumer.minor)
    text(
      `Menor de edad. Padre/madre o representante: ${input.consumer.guardianName}\nDocumento del representante: ${input.consumer.guardianDocument}`,
    )
  text('2. Bien o servicio contratado', 12)
  text(
    `${input.purchase.kind === 'product' ? 'Producto' : 'Servicio'} · Monto: S/ ${(input.purchase.amountCents / 100).toFixed(2)}\n${input.purchase.description}${input.purchase.orderReference ? `\nPedido: ${input.purchase.orderReference}` : ''}`,
  )
  text(
    `3. ${input.kind === 'claim' ? 'Reclamo' : 'Queja'} y pedido del consumidor`,
    12,
  )
  text(`Detalle: ${input.detail}\nPedido: ${input.request}`)
  text('4. Acciones y observaciones del proveedor', 12)
  text(
    receipt.response ||
      'Solicitud recibida. La respuesta escrita se gestiona por el proveedor.',
  )
  text(`Estado: ${complaintStatusLabels[receipt.status]}`)
  if (receipt.responseDeliveredAt)
    text(
      `Medio: ${receipt.responseChannel === 'letter' ? 'Carta' : 'Correo enviado externamente'}\nEntrega registrada: ${new Date(receipt.responseDeliveredAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}\nConstancia: ${receipt.deliveryEvidence}`,
    )
  text(
    'El proveedor debe responder en un plazo máximo de 15 días hábiles. La presentación de esta hoja no impide acudir a otras vías de solución ni exige una compra previa en esta cuenta.',
    9,
  )
  text('COPIA DEL CONSUMIDOR · Conserva este documento y su número de hoja.', 9)
  return document.save()
}
export async function downloadComplaintPdf(receipt: ComplaintReceipt) {
  const bytes = await buildComplaintPdf(receipt)
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${receipt.reference}.pdf`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
