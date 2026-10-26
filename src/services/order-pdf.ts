import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { AdminOrder } from './admin-service'
import type { CustomerRecord } from '../types/commerce'
import { variantLabel } from '../domain/product-type'
import {
  documentText,
  getOrderDocumentRecipient,
  inspectOrderDocuments,
  type OrderDocumentType,
} from '../domain/order-documents'
import { formatPEN } from './currency'
import { UserFacingError } from './admin-messages'
export { orderDocumentFilename } from '../domain/order-documents'

const regularFontUrl = new URL(
  '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
  import.meta.url,
).href
const boldFontUrl = new URL(
  '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
  import.meta.url,
).href
const ink = rgb(0.14, 0.17, 0.16)
const muted = rgb(0.36, 0.39, 0.37)
const brand = rgb(0, 0.23, 0.21)
const ruleColor = rgb(0.82, 0.83, 0.81)
const pale = rgb(0.96, 0.96, 0.94)
const mm = (value: number) => (value * 72) / 25.4
const summaryPage = [595.28, 841.89] as const
// Landscape 15 × 10 cm labels read upright when placed two-up on A4.
const labelPage = [mm(150), mm(100)] as const
const sheetMargin = 18
const compactPage = [
  summaryPage[0] - sheetMargin * 2,
  (summaryPage[1] - sheetMargin * 3) / 2,
] as const

const statusLabels: Record<AdminOrder['status'], string> = {
  received: 'Nuevo',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
}
const paymentLabels: Record<AdminOrder['paymentStatus'], string> = {
  pending: 'Pago pendiente',
  approved: 'Pagado',
  rejected: 'Pago rechazado',
  refunded: 'Reembolsado',
}

interface DocumentFonts {
  regular: PDFFont
  bold: PDFFont
}
export interface OrderPdfOptions {
  onProgress?: (completed: number, total: number) => void
  /** Makes the same generator testable without a browser or network requests. */
  fontBytes?: { regular: Uint8Array; bold: Uint8Array }
}

async function fetchFont(source: string) {
  const response = await fetch(source)
  if (!response.ok)
    throw new UserFacingError(
      'pdf-font-load',
      'No se pudo cargar la tipografía del documento. Vuelve a intentarlo.',
    )
  return new Uint8Array(await response.arrayBuffer())
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const words = documentText(text).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
    }
    if (font.widthOfTextAtSize(word, size) <= width) {
      current = word
      continue
    }
    for (const character of word) {
      const part = current + character
      if (font.widthOfTextAtSize(part, size) > width && current) {
        lines.push(current)
        current = character
      } else current = part
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  top: number,
  size: number,
  font: PDFFont,
  color = ink,
) {
  page.drawText(documentText(text), {
    x,
    y: page.getHeight() - top - size,
    size,
    font,
    color,
  })
}

function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  top: number,
  size: number,
  font: PDFFont,
  color = ink,
  maxWidth?: number,
) {
  const measured = font.widthOfTextAtSize(documentText(text), size)
  const fittedSize =
    maxWidth && measured > maxWidth ? (size * maxWidth) / measured : size
  drawText(
    page,
    text,
    right - font.widthOfTextAtSize(documentText(text), fittedSize),
    top,
    fittedSize,
    font,
    color,
  )
}

function drawRule(page: PDFPage, left: number, top: number, width: number) {
  page.drawLine({
    start: { x: left, y: page.getHeight() - top },
    end: { x: left + width, y: page.getHeight() - top },
    thickness: 0.6,
    color: ruleColor,
  })
}

function supported(text: string, font: PDFFont, reference: string) {
  const glyphs = new Set(font.getCharacterSet())
  if (
    Array.from(documentText(text)).some(
      (character) => !glyphs.has(character.codePointAt(0)!),
    )
  ) {
    throw new UserFacingError(
      'pdf-unsupported-character',
      `El pedido ${reference} contiene caracteres que la tipografía no puede representar. Revisa sus textos antes de exportarlo.`,
    )
  }
}

function validateCharacters(
  order: AdminOrder,
  customers: readonly CustomerRecord[],
  type: OrderDocumentType,
  fonts: DocumentFonts,
) {
  const recipient = getOrderDocumentRecipient(order, customers)
  const data =
    type === 'shipping'
      ? [order.reference, ...Object.values(recipient)]
      : [
          order.reference,
          order.customerName,
          order.customerEmail,
          order.promotionCode ?? '',
          ...Object.values(recipient),
          ...order.lines.flatMap((line) => [
            line.brand,
            line.name,
            variantLabel(line),
          ]),
        ]
  data.forEach((text) => supported(text, fonts.regular, order.reference))
}

interface LabelBlock {
  text: string
  size: number
  bold?: boolean
  gap?: number
  color?: ReturnType<typeof rgb>
}

function drawShippingLabel(
  pdf: PDFDocument,
  order: AdminOrder,
  customers: readonly CustomerRecord[],
  fonts: DocumentFonts,
) {
  const recipient = getOrderDocumentRecipient(order, customers)
  const margin = 18
  const width = labelPage[0] - margin * 2
  const blocks: LabelBlock[] = [
    { text: 'DESTINATARIO', size: 8, gap: 3, color: muted },
    { text: recipient.name, size: 14, bold: true, gap: 3 },
    {
      text: `Contacto: ${recipient.phone}`,
      size: 11,
      gap: recipient.dni ? 2 : 10,
    },
    ...(recipient.dni
      ? [{ text: `DNI de quien recibe: ${recipient.dni}`, size: 9, gap: 8 }]
      : []),
    { text: 'DIRECCIÓN DE ENTREGA', size: 8, gap: 3, color: muted },
    { text: recipient.street, size: 12, bold: true, gap: 4 },
    {
      text: `${recipient.district} · ${recipient.province} · ${recipient.department}`,
      size: 10.5,
      gap: 7,
    },
    ...(recipient.reference
      ? [{ text: `Referencia: ${recipient.reference}`, size: 9.5, gap: 7 }]
      : []),
    {
      text: `Modalidad: ${order.deliveryMethod === 'courier' ? 'Courier' : 'Motorizado'}`,
      size: 10,
      bold: true,
    },
  ]
  const referenceLines = wrapText(order.reference, fonts.bold, 15, width)
  const start = 49 + referenceLines.length * 18
  const available = labelPage[1] - 26 - start
  let scale = 1
  const measure = (factor: number) =>
    blocks.reduce(
      (height, block) =>
        height +
        wrapText(
          block.text,
          block.bold ? fonts.bold : fonts.regular,
          block.size * factor,
          width,
        ).length *
          block.size *
          factor *
          1.25 +
        (block.gap ?? 0) * factor,
      0,
    )
  while (scale > 0.88 && measure(scale) > available)
    scale = Math.round((scale - 0.02) * 100) / 100
  if (measure(scale) > available)
    throw new UserFacingError(
      'pdf-label-overflow',
      `La ficha de ${order.reference} contiene más texto del que cabe de forma legible en 10 × 15 cm. Revisa la dirección y su referencia antes de exportar.`,
    )
  const page = pdf.addPage([...labelPage])
  drawText(page, 'AROMA INFINI', margin, 17, 11, fonts.bold, brand)
  drawRight(
    page,
    'FICHA DE ENVÍO',
    labelPage[0] - margin,
    19,
    7.5,
    fonts.regular,
    muted,
  )
  referenceLines.forEach((line, index) =>
    drawText(page, line, margin, 37 + index * 18, 15, fonts.bold),
  )
  drawRule(page, margin, start - 5, width)
  let top = start + 4
  for (const block of blocks) {
    const font = block.bold ? fonts.bold : fonts.regular
    const size = block.size * scale
    for (const line of wrapText(block.text, font, size, width)) {
      drawText(page, line, margin, top, size, font, block.color ?? ink)
      top += size * 1.25
    }
    top += (block.gap ?? 0) * scale
  }
}

class SummaryWriter {
  page!: PDFPage
  top = 0
  readonly margin = 40
  readonly right = summaryPage[0] - this.margin
  readonly width = summaryPage[0] - this.margin * 2
  readonly bottom = summaryPage[1] - 44
  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: DocumentFonts,
    readonly reference: string,
  ) {
    this.newPage(false)
  }
  newPage(continuation = true) {
    this.page = this.pdf.addPage([...summaryPage])
    this.top = 30
    drawText(
      this.page,
      'AROMA INFINI',
      this.margin,
      this.top,
      12,
      this.fonts.bold,
      brand,
    )
    drawRight(
      this.page,
      'RESUMEN DE PEDIDO',
      this.right,
      this.top + 1,
      9,
      this.fonts.regular,
      muted,
    )
    this.top += 27
    const lines = wrapText(
      this.reference,
      this.fonts.bold,
      continuation ? 14 : 22,
      this.width,
    )
    for (const line of lines) {
      drawText(
        this.page,
        line,
        this.margin,
        this.top,
        continuation ? 14 : 22,
        this.fonts.bold,
      )
      this.top += continuation ? 18 : 28
    }
    if (continuation) {
      drawText(
        this.page,
        'Continuación',
        this.margin,
        this.top,
        9,
        this.fonts.regular,
        muted,
      )
      this.top += 18
    }
    this.top += 5
  }
  ensure(height: number) {
    if (this.top + height > this.bottom) this.newPage()
  }
  paragraph(text: string, size = 10.5, bold = false, color = ink) {
    const font = bold ? this.fonts.bold : this.fonts.regular
    for (const line of wrapText(text, font, size, this.width)) {
      this.ensure(size * 1.35)
      drawText(this.page, line, this.margin, this.top, size, font, color)
      this.top += size * 1.35
    }
  }
  tableHeader() {
    this.ensure(48)
    this.page.drawRectangle({
      x: this.margin,
      y: this.page.getHeight() - this.top - 24,
      width: this.width,
      height: 24,
      color: pale,
    })
    drawText(
      this.page,
      'Producto / presentación',
      this.margin + 8,
      this.top + 6,
      9,
      this.fonts.bold,
    )
    drawRight(
      this.page,
      'Cant.',
      this.margin + 305,
      this.top + 6,
      9,
      this.fonts.bold,
    )
    drawRight(
      this.page,
      'P. unitario',
      this.margin + 405,
      this.top + 6,
      9,
      this.fonts.bold,
    )
    drawRight(
      this.page,
      'Importe',
      this.right - 8,
      this.top + 6,
      9,
      this.fonts.bold,
    )
    this.top += 30
  }
}

function drawSummary(
  pdf: PDFDocument,
  order: AdminOrder,
  customers: readonly CustomerRecord[],
  fonts: DocumentFonts,
) {
  const writer = new SummaryWriter(pdf, fonts, order.reference)
  const recipient = getOrderDocumentRecipient(order, customers)
  const date = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(order.placedAt))
  writer.paragraph(
    `${date} · ${statusLabels[order.status]} · ${paymentLabels[order.paymentStatus]}`,
    10.5,
    false,
    muted,
  )
  writer.top += 13
  if (documentText(order.customerName))
    writer.paragraph(`Cliente: ${order.customerName}`, 11, true)
  if (documentText(order.customerEmail))
    writer.paragraph(order.customerEmail, 10, false, muted)
  if (recipient.phone) writer.paragraph(`Contacto: ${recipient.phone}`, 10)
  if (order.alternateRecipient && recipient.name)
    writer.paragraph(`Recibe: ${recipient.name}`, 10.5, true)
  if (recipient.street) writer.paragraph(`Entrega: ${recipient.street}`, 10)
  const location = [
    recipient.district,
    recipient.province,
    recipient.department,
  ]
    .filter(Boolean)
    .join(' · ')
  if (location) writer.paragraph(location, 10, false, muted)
  if (recipient.reference)
    writer.paragraph(`Referencia: ${recipient.reference}`, 9.5, false, muted)
  if (['courier', 'motorizado'].includes(order.deliveryMethod))
    writer.paragraph(
      `Modalidad: ${order.deliveryMethod === 'courier' ? 'Courier' : 'Motorizado'}`,
      10,
    )
  writer.top += 17
  writer.tableHeader()
  for (const line of order.lines) {
    const name = [documentText(line.brand), documentText(line.name)]
      .filter(Boolean)
      .join(' · ')
    const productLines = [
      ...wrapText(name, fonts.bold, 10.5, 258),
      ...wrapText(variantLabel(line), fonts.regular, 9.5, 258),
      ...(Number.isSafeInteger(line.originalUnitPriceCents) &&
      (line.originalUnitPriceCents ?? 0) > line.unitPriceCents
        ? wrapText(
            `Precio habitual: ${formatPEN(line.originalUnitPriceCents!)}`,
            fonts.regular,
            9,
            258,
          )
        : []),
    ]
    const rowHeight = Math.max(32, productLines.length * 14 + 12)
    const continuationHeaderHeight =
      110 + wrapText(order.reference, fonts.bold, 14, writer.width).length * 18
    // Keep ordinary product rows together; split only a row longer than a fresh page.
    if (
      rowHeight <= writer.bottom - continuationHeaderHeight &&
      writer.top + rowHeight > writer.bottom
    ) {
      writer.newPage()
      writer.tableHeader()
    }
    let offset = 0
    let amountsDrawn = false
    while (offset < productLines.length) {
      if (writer.top + 35 > writer.bottom) {
        writer.newPage()
        writer.tableHeader()
      }
      const availableLines = Math.max(
        1,
        Math.floor((writer.bottom - writer.top - 12) / 14),
      )
      const chunk = productLines.slice(offset, offset + availableLines)
      const rowTop = writer.top
      chunk.forEach((text, index) =>
        drawText(
          writer.page,
          text,
          writer.margin + 8,
          rowTop + index * 14,
          offset + index === 0 ? 10.5 : 9.5,
          offset + index === 0 ? fonts.bold : fonts.regular,
          offset + index === 0 ? ink : muted,
        ),
      )
      if (!amountsDrawn) {
        drawRight(
          writer.page,
          String(line.quantity),
          writer.margin + 305,
          rowTop,
          10.5,
          fonts.regular,
        )
        drawRight(
          writer.page,
          formatPEN(line.unitPriceCents),
          writer.margin + 405,
          rowTop,
          10.5,
          fonts.regular,
          ink,
          92,
        )
        drawRight(
          writer.page,
          formatPEN(line.unitPriceCents * line.quantity),
          writer.right - 8,
          rowTop,
          10.5,
          fonts.bold,
          ink,
          94,
        )
        amountsDrawn = true
      }
      writer.top += Math.max(32, chunk.length * 14 + 12)
      offset += chunk.length
      drawRule(writer.page, writer.margin, writer.top - 6, writer.width)
    }
  }
  const totals = [
    ['Subtotal', formatPEN(order.subtotalCents)],
    ...(order.discountCents > 0
      ? [
          [
            `Descuento${order.promotionCode ? ` (${documentText(order.promotionCode)})` : ''}`,
            `−${formatPEN(order.discountCents)}`,
          ],
        ]
      : []),
    [
      'Envío',
      order.shippingCents === 0 ? 'Gratis' : formatPEN(order.shippingCents),
    ],
  ]
  const totalRows = totals.map(([label, amount]) => ({
    lines: wrapText(label, fonts.regular, 10.5, 200),
    amount,
  }))
  writer.ensure(
    totalRows.reduce(
      (height, row) => height + Math.max(21, row.lines.length * 14 + 5),
      58,
    ),
  )
  writer.top += 10
  for (const row of totalRows) {
    for (const [index, text] of row.lines.entries())
      drawText(
        writer.page,
        text,
        writer.margin + 160,
        writer.top + index * 14,
        10.5,
        fonts.regular,
        muted,
      )
    drawRight(
      writer.page,
      row.amount,
      writer.right - 8,
      writer.top,
      11,
      fonts.regular,
      ink,
      140,
    )
    writer.top += Math.max(21, row.lines.length * 14 + 5)
  }
  writer.ensure(46)
  drawRule(writer.page, writer.margin + 160, writer.top, writer.width - 160)
  writer.top += 10
  drawText(
    writer.page,
    'TOTAL',
    writer.margin + 160,
    writer.top,
    12,
    fonts.bold,
  )
  drawRight(
    writer.page,
    formatPEN(order.totalCents),
    writer.right - 8,
    writer.top - 2,
    17,
    fonts.bold,
    brand,
    230,
  )
}

/** Short purchase summaries use half an A4 sheet at native, readable text sizes. */
function drawCompactSummary(
  pdf: PDFDocument,
  order: AdminOrder,
  customers: readonly CustomerRecord[],
  fonts: DocumentFonts,
): boolean {
  const margin = 20
  const width = compactPage[0] - margin * 2
  const right = compactPage[0] - margin
  const recipient = getOrderDocumentRecipient(order, customers)
  const referenceLines = wrapText(order.reference, fonts.bold, 16, width)
  const customerLines = wrapText(
    `Cliente: ${order.customerName}`,
    fonts.bold,
    9.5,
    width,
  )
  const contactLines = wrapText(
    [
      documentText(order.customerEmail),
      recipient.phone ? `Tel.: ${recipient.phone}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    fonts.regular,
    9,
    width,
  )
  const alternateLines = order.alternateRecipient
    ? wrapText(`Recibe: ${recipient.name}`, fonts.regular, 9, width)
    : []
  const rows = order.lines.map((line) => {
    const lines = [
      ...wrapText(
        [documentText(line.brand), documentText(line.name)]
          .filter(Boolean)
          .join(' · '),
        fonts.bold,
        9.5,
        258,
      ).map((text) => ({ text, bold: true })),
      ...wrapText(variantLabel(line), fonts.regular, 9, 258).map((text) => ({
        text,
        bold: false,
      })),
      ...(Number.isSafeInteger(line.originalUnitPriceCents) &&
      (line.originalUnitPriceCents ?? 0) > line.unitPriceCents
        ? wrapText(
            `Precio habitual: ${formatPEN(line.originalUnitPriceCents!)}`,
            fonts.regular,
            9,
            258,
          ).map((text) => ({ text, bold: false }))
        : []),
    ]
    return { line, lines, height: lines.length * 11.5 + 8 }
  })
  const totals = [
    ['Subtotal', formatPEN(order.subtotalCents)],
    ...(order.discountCents > 0
      ? [
          [
            `Descuento${order.promotionCode ? ` (${order.promotionCode})` : ''}`,
            `−${formatPEN(order.discountCents)}`,
          ],
        ]
      : []),
    ['Envío', order.shippingCents ? formatPEN(order.shippingCents) : 'Gratis'],
  ].map(([label, amount]) => ({
    lines: wrapText(label, fonts.regular, 9.5, 185),
    amount,
  }))
  const tableTop =
    32 +
    referenceLines.length * 19 +
    19 +
    customerLines.length * 12 +
    contactLines.length * 11.5 +
    alternateLines.length * 11.5 +
    8
  const end =
    tableTop +
    24 +
    rows.reduce((sum, row) => sum + row.height, 0) +
    9 +
    totals.reduce(
      (sum, row) => sum + Math.max(15, row.lines.length * 11.5),
      0,
    ) +
    28
  // A long summary keeps the approved full-page layout; never shrink it to fit.
  if (end > compactPage[1] - 30) return false
  const page = pdf.addPage([...compactPage])
  drawText(page, 'AROMA INFINI', margin, 15, 9.5, fonts.bold, brand)
  drawRight(page, 'RESUMEN DE PEDIDO', right, 16, 8, fonts.regular, muted)
  let top = 32
  for (const text of referenceLines) {
    drawText(page, text, margin, top, 16, fonts.bold)
    top += 19
  }
  const date = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(order.placedAt))
  drawText(
    page,
    `${date} · ${statusLabels[order.status]} · ${paymentLabels[order.paymentStatus]}`,
    margin,
    top + 1,
    9,
    fonts.regular,
    muted,
  )
  top += 19
  for (const text of customerLines) {
    drawText(page, text, margin, top, 9.5, fonts.bold)
    top += 12
  }
  for (const text of [...contactLines, ...alternateLines]) {
    drawText(page, text, margin, top, 9, fonts.regular, muted)
    top += 11.5
  }
  top += 8
  page.drawRectangle({
    x: margin,
    y: page.getHeight() - top - 18,
    width,
    height: 18,
    color: pale,
  })
  drawText(page, 'Producto / presentación', margin + 5, top + 4, 8, fonts.bold)
  drawRight(page, 'Cant.', margin + 305, top + 4, 8, fonts.bold)
  drawRight(page, 'P. unitario', margin + 405, top + 4, 8, fonts.bold)
  drawRight(page, 'Importe', right - 5, top + 4, 8, fonts.bold)
  top += 24
  for (const row of rows) {
    row.lines.forEach(({ text, bold }, index) =>
      drawText(
        page,
        text,
        margin + 5,
        top + index * 11.5,
        bold ? 9.5 : 9,
        bold ? fonts.bold : fonts.regular,
        bold ? ink : muted,
      ),
    )
    drawRight(
      page,
      String(row.line.quantity),
      margin + 305,
      top,
      9.5,
      fonts.regular,
      ink,
      32,
    )
    drawRight(
      page,
      formatPEN(row.line.unitPriceCents),
      margin + 405,
      top,
      9.5,
      fonts.regular,
      ink,
      92,
    )
    drawRight(
      page,
      formatPEN(row.line.unitPriceCents * row.line.quantity),
      right - 5,
      top,
      9.5,
      fonts.bold,
      ink,
      94,
    )
    top += row.height
    drawRule(page, margin, top - 4, width)
  }
  top += 9
  for (const row of totals) {
    row.lines.forEach((text, index) =>
      drawText(
        page,
        text,
        margin + 220,
        top + index * 11.5,
        9.5,
        fonts.regular,
        muted,
      ),
    )
    drawRight(page, row.amount, right - 5, top, 9.5, fonts.regular, ink, 100)
    top += Math.max(15, row.lines.length * 11.5)
  }
  drawRule(page, margin + 220, top + 1, width - 220)
  drawText(page, 'TOTAL', margin + 220, top + 8, 10, fonts.bold)
  drawRight(
    page,
    formatPEN(order.totalCents),
    right - 5,
    top + 6,
    13,
    fonts.bold,
    brand,
    185,
  )
  return true
}

/** Impose native-size documents on A4, pairing short documents in selection order. */
async function printableSheets(source: PDFDocument) {
  const document = await PDFDocument.load(await source.save())
  const result = await PDFDocument.create()
  result.setTitle(source.getTitle() ?? 'Aroma Infini')
  result.setAuthor('Aroma Infini')
  result.setCreator('Aroma Infini')
  const pages = document.getPages()
  const embedded = await result.embedPages(pages)
  let sheet: PDFPage | undefined
  let slot = 0
  for (let index = 0; index < pages.length; index += 1) {
    const size = pages[index].getSize()
    const full = Math.abs(size.height - summaryPage[1]) < 1
    if (full) {
      sheet = undefined
      slot = 0
      result.addPage([...summaryPage]).drawPage(embedded[index])
      continue
    }
    if (!sheet || slot === 2) {
      sheet = result.addPage([...summaryPage])
      slot = 0
    }
    const x = (summaryPage[0] - size.width) / 2
    const slotTop = sheetMargin + slot * (compactPage[1] + sheetMargin)
    const y = summaryPage[1] - slotTop - (compactPage[1] + size.height) / 2
    sheet.drawPage(embedded[index], {
      x,
      y,
      width: size.width,
      height: size.height,
    })
    for (const [from, to] of [
      [
        { x, y },
        { x: x + size.width, y },
      ],
      [
        { x, y: y + size.height },
        { x: x + size.width, y: y + size.height },
      ],
      [
        { x, y },
        { x, y: y + size.height },
      ],
      [
        { x: x + size.width, y },
        { x: x + size.width, y: y + size.height },
      ],
    ])
      sheet.drawLine({
        start: from,
        end: to,
        thickness: 0.4,
        color: ruleColor,
        dashArray: [3, 3],
      })
    slot += 1
  }
  return result.save()
}

/** Pure document output: selection must be resolved by reference before calling. */
export async function generateOrderPdf(
  orders: readonly AdminOrder[],
  customers: readonly CustomerRecord[],
  type: OrderDocumentType,
  options: OrderPdfOptions = {},
): Promise<Uint8Array> {
  const inspection = inspectOrderDocuments(orders, customers, type)
  if (!inspection.total)
    throw new UserFacingError(
      'pdf-empty',
      'Selecciona al menos un pedido para exportar.',
    )
  if (inspection.issues.length)
    throw new UserFacingError(
      'pdf-invalid-orders',
      `Revisa los pedidos antes de exportar: ${inspection.issues.map((issue) => issue.reference).join(', ')}.`,
    )
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const bytes = options.fontBytes ?? {
    regular: await fetchFont(regularFontUrl),
    bold: await fetchFont(boldFontUrl),
  }
  const fonts = {
    regular: await pdf.embedFont(bytes.regular, { subset: true }),
    bold: await pdf.embedFont(bytes.bold, { subset: true }),
  }
  pdf.setTitle(
    type === 'shipping'
      ? 'Aroma Infini · Fichas de envío'
      : 'Aroma Infini · Resúmenes de pedidos',
  )
  pdf.setAuthor('Aroma Infini')
  pdf.setCreator('Aroma Infini')
  const referencesByPage: string[] = []
  for (let index = 0; index < inspection.valid.length; index += 1) {
    const order = inspection.valid[index]
    validateCharacters(order, customers, type, fonts)
    const before = pdf.getPageCount()
    if (type === 'shipping') drawShippingLabel(pdf, order, customers, fonts)
    else if (!drawCompactSummary(pdf, order, customers, fonts))
      drawSummary(pdf, order, customers, fonts)
    for (let page = before; page < pdf.getPageCount(); page += 1)
      referencesByPage[page] = order.reference
    options.onProgress?.(index + 1, inspection.valid.length)
    if (index % 5 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  const pages = pdf.getPages()
  pages.forEach((page, index) => {
    const size = type === 'shipping' ? 7.5 : 8
    drawRight(
      page,
      `${index + 1} / ${pages.length}`,
      page.getWidth() - (type === 'shipping' ? 18 : 40),
      page.getHeight() - 19,
      size,
      fonts.regular,
      muted,
    )
    if (type === 'summary')
      drawText(
        page,
        referencesByPage[index],
        40,
        page.getHeight() - 19,
        size,
        fonts.regular,
        muted,
      )
  })
  return printableSheets(pdf)
}
