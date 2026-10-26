import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib'
import { generateOrderPdf } from '../src/services/order-pdf'
import {
  inspectOrderDocuments,
  orderDocumentFilename,
} from '../src/domain/order-documents'
import { adminService, type AdminOrder } from '../src/services/admin-service'

async function fontBytes() {
  return {
    regular: await readFile(
      'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
    ),
    bold: await readFile(
      'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
    ),
  }
}

function fixture(index: number): AdminOrder {
  const base = structuredClone(adminService.getSnapshot().orders[0])
  return {
    ...base,
    reference: `AI-PDF-${String(index + 1).padStart(4, '0')}`,
    customerName: 'María Núñez Muñoz',
    customerEmail: 'maria@example.invalid',
    contactPhone: '999888777',
    placedAt: '2026-10-22T02:00:00Z',
    address: {
      department: 'lima',
      province: '1501',
      district: '150122',
      street: 'Av. José Gálvez 123, piso 4, departamento 401',
      reference: 'Frente al parque de la urbanización; timbre azul.',
    },
  }
}

for (const count of [1, 3, 5, 10, 50, 100]) {
  for (const type of ['shipping', 'summary'] as const) {
    test(`${count} ${type}: PDF vectorial, fuente incorporada y páginas completas`, async () => {
      const orders = Array.from({ length: count }, (_, index) => fixture(index))
      const before = structuredClone(orders)
      const progress: number[] = []
      const bytes = await generateOrderPdf(orders, [], type, {
        fontBytes: await fontBytes(),
        onProgress: (value) => progress.push(value),
      })
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(Math.ceil(count / 2))
      expect(pdf.getAuthor()).toBe('Aroma Infini')
      for (const page of pdf.getPages()) {
        expect(page.getWidth()).toBeCloseTo(595.28, 2)
        expect(page.getHeight()).toBeCloseTo(841.89, 2)
      }
      if (type === 'shipping') {
        const boxes = pdf.context
          .enumerateIndirectObjects()
          .flatMap(([, object]) => {
            if (
              !(object instanceof PDFRawStream) ||
              object.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form'
            )
              return []
            const box = object.dict.lookup(PDFName.of('BBox'))
            if (!(box instanceof PDFArray)) return []
            return [
              box.asArray().map((number) => (number as PDFNumber).asNumber()),
            ]
          })
        expect(boxes).toHaveLength(count)
        for (const [left, bottom, right, top] of boxes) {
          expect(right - left).toBeCloseTo((150 * 72) / 25.4, 2)
          expect(top - bottom).toBeCloseTo((100 * 72) / 25.4, 2)
        }
      }
      expect(progress).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      )
      expect(orders).toEqual(before)
      expect(bytes.byteLength).toBeGreaterThan(4000)
    })
  }
}

test('la entrega usa el destinatario alternativo y no requiere correo ni DNI del comprador', () => {
  const order = fixture(0)
  order.alternateRecipient = { name: 'José Peña', dni: '12345678' }
  order.customerEmail = ''
  expect(inspectOrderDocuments([order], [], 'shipping').valid).toHaveLength(1)
  const invalid = {
    ...fixture(1),
    contactPhone: '',
    address: { ...order.address, street: '' },
  }
  const result = inspectOrderDocuments([order, invalid, order], [], 'shipping')
  expect(result.total).toBe(2)
  expect(result.valid.map((item) => item.reference)).toEqual([order.reference])
  expect(result.issues[0].message).toMatch(/teléfono.*dirección/)
  expect(
    orderDocumentFilename('shipping', new Date('2026-10-26T02:00:00Z')),
  ).toBe('aroma-infini-fichas-envio-2026-10-25.pdf')
})

test('el resumen divide productos extensos en varias páginas sin perder ninguno', async () => {
  const order = fixture(0)
  order.lines = Array.from({ length: 100 }, (_, index) => ({
    ...order.lines[0],
    variantId: `v-${index}`,
    name: `Perfume ${index + 1} · ${'Descripción con acentos y caracteres españoles. '.repeat(5)}`,
    ml: 50,
    quantity: 1,
    unitPriceCents: 15900,
    originalUnitPriceCents: 19900,
  }))
  order.subtotalCents = 1590000
  order.discountCents = 10000
  order.shippingCents = 1500
  order.totalCents = 1581500
  const bytes = await generateOrderPdf([order], [], 'summary', {
    fontBytes: await fontBytes(),
  })
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBeGreaterThan(5)
  expect(
    pdf
      .getPages()
      .every(
        (page) => page.getWidth() === 595.28 && page.getHeight() === 841.89,
      ),
  ).toBe(true)
})
