import { expect, test } from '@playwright/test'
import { getProductPhotoStatus } from '../src/domain/product-photos'
import { adminService } from '../src/services/admin-service'
import { saveProductPhotos } from '../src/services/product-photos'
import type { ProductGalleryView } from '../src/types/catalog'

function gallery(count = 4): ProductGalleryView[] {
  return Array.from({ length: count }, (_, index) => ({
    image: `/images/photo-save-${index + 1}.webp`,
    alt: `Foto ${index + 1}`,
    framing: 'full',
  }))
}

test.beforeEach(() => {
  adminService.reset()
})

test('La cola distingue perfumes sin fotos, incompletos y completos sin mezclar la imagen olfativa', () => {
  const record = structuredClone(adminService.getSnapshot().products[0])
  record.product.image = ''
  record.detail.gallery = []
  record.detail.olfactoryImage = null
  expect(getProductPhotoStatus(record)).toEqual({
    gallery: 0,
    hasOlfactoryImage: false,
    count: 0,
    expected: 5,
    status: 'none',
  })
  record.detail.olfactoryImage = '/images/olfactory-save.webp'
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 1,
    gallery: 0,
    status: 'incomplete',
  })
  record.detail.gallery = gallery(3)
  record.product.image = record.detail.gallery[0].image
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 4,
    gallery: 3,
    status: 'incomplete',
  })
  record.detail.gallery = gallery()
  record.detail.olfactoryImage = null
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 4,
    status: 'incomplete',
  })
  record.detail.olfactoryImage = '/images/olfactory-save.webp'
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 5,
    status: 'complete',
  })
  record.product.image = '/images/different-cover.webp'
  expect(getProductPhotoStatus(record).status).toBe('incomplete')
})

test('Los complementos requieren cuatro fotos y nunca contabilizan una quinta foto olfativa', () => {
  const record = structuredClone(adminService.getSnapshot().products[0])
  record.product.productType = 'complemento'
  record.product.image = ''
  record.detail.gallery = []
  record.detail.olfactoryImage = '/images/ignored-olfactory.webp'
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 0,
    expected: 4,
    hasOlfactoryImage: false,
    status: 'none',
  })
  record.detail.gallery = gallery(2)
  record.product.image = record.detail.gallery[0].image
  expect(getProductPhotoStatus(record)).toMatchObject({
    count: 2,
    status: 'incomplete',
  })
  record.detail.gallery = gallery()
  expect(getProductPhotoStatus(record)).toEqual({
    count: 4,
    gallery: 4,
    expected: 4,
    hasOlfactoryImage: false,
    status: 'complete',
  })
})

test('Guardar fotos usa el producto más reciente y conserva stock, oferta, textos, presentaciones y SKU', async () => {
  const original = structuredClone(adminService.getSnapshot().products[0])
  const photosDraft = {
    gallery: gallery(),
    olfactoryImage: '/images/olfactory-draft.webp',
  }
  const latest = structuredClone(original)
  latest.product.name = 'Nombre corregido después de abrir las fotos'
  latest.product.variants[0].stock += 20
  latest.product.variants[0].priceCents += 10000
  latest.product.discount = {
    active: true,
    type: 'percent',
    value: 15,
    startsAt: '',
    endsAt: '',
  }
  latest.detail.description =
    'Descripción actualizada mientras se preparaban fotos.'
  expect(adminService.saveProduct(latest)).toEqual({ kind: 'saved' })
  const beforePhotoSave = structuredClone(adminService.getSnapshot())
  expect(saveProductPhotos(original.product.id, photosDraft)).toEqual({
    kind: 'saved',
  })
  await adminService.flush()
  const after = adminService.getSnapshot()
  const saved = after.products.find(
    (item) => item.product.id === original.product.id,
  )!
  const current = beforePhotoSave.products.find(
    (item) => item.product.id === original.product.id,
  )!
  expect(saved.product).toEqual({
    ...current.product,
    image: photosDraft.gallery[0].image,
  })
  expect(saved.detail).toEqual({
    ...current.detail,
    gallery: saved.detail.gallery,
    olfactoryImage: photosDraft.olfactoryImage,
  })
  expect(saved.product.sku).toBe(original.product.sku)
  expect(saved.product.variants).toEqual(current.product.variants)
  expect(saved.product.discount).toEqual(current.product.discount)
  expect(saved.detail.gallery.map((view) => view.image)).toEqual(
    photosDraft.gallery.map((view) => view.image),
  )
  expect(saved.detail.gallery).toHaveLength(4)
  expect(
    saved.detail.gallery.some(
      (view) => view.image === photosDraft.olfactoryImage,
    ),
  ).toBe(false)
  expect(
    after.products.filter((item) => item.product.id !== original.product.id),
  ).toEqual(
    beforePhotoSave.products.filter(
      (item) => item.product.id !== original.product.id,
    ),
  )
  expect(after.revision).toBe(beforePhotoSave.revision + 1)
})

test('Quitar la principal de un producto visible se rechaza sin cambiar datos', () => {
  const current = adminService
    .getSnapshot()
    .products.find((item) => item.active)!
  const before = structuredClone(adminService.getSnapshot())
  const result = saveProductPhotos(current.product.id, {
    gallery: [],
    olfactoryImage: current.detail.olfactoryImage,
  })
  expect(result.kind).toBe('validation')
  if (result.kind === 'validation')
    expect(result.message).toContain('principal')
  expect(adminService.getSnapshot()).toEqual(before)
})

test('Un borrador puede quedarse sin fotos y conservar sus demás datos y SKU', () => {
  const current = adminService.getSnapshot().products[0]
  expect(adminService.setProductActive(current.product.id, false)).toEqual({
    kind: 'saved',
  })
  const before = structuredClone(adminService.getSnapshot().products[0])
  expect(
    saveProductPhotos(current.product.id, {
      gallery: [],
      olfactoryImage: null,
    }),
  ).toEqual({ kind: 'saved' })
  const saved = adminService.getSnapshot().products[0]
  expect(saved).toEqual({
    ...before,
    product: { ...before.product, image: '' },
    detail: { ...before.detail, gallery: [], olfactoryImage: null },
  })
  expect(getProductPhotoStatus(saved).status).toBe('none')
})

test('No se admiten cinco fotografías comerciales ni productos que ya no existen', () => {
  const current = adminService.getSnapshot().products[0]
  const before = structuredClone(adminService.getSnapshot())
  const extra = saveProductPhotos(current.product.id, {
    gallery: gallery(5),
    olfactoryImage: null,
  })
  expect(extra).toEqual({
    kind: 'validation',
    message: 'La galería admite hasta cuatro fotografías.',
  })
  expect(adminService.getSnapshot()).toEqual(before)
  const missing = saveProductPhotos('producto-inexistente', {
    gallery: gallery(),
    olfactoryImage: null,
  })
  expect(missing).toEqual({
    kind: 'validation',
    message: 'Este producto ya no está disponible.',
  })
  expect(adminService.getSnapshot()).toEqual(before)
})

test('Guardar un complemento elimina datos olfativos residuales y mantiene su galería y SKU', () => {
  const draft = structuredClone(adminService.getSnapshot().products[0])
  draft.product.id = 'photo-complement'
  draft.product.slug = 'complemento-prueba-fotos'
  draft.product.name = 'Complemento de prueba'
  draft.product.productType = 'complemento'
  draft.detail.recommendationIds = []
  draft.product.variants = [
    {
      id: 'photo-complement-unit',
      label: 'Unidad',
      ml: null,
      priceCents: 3000,
      stock: 8,
    },
  ]
  expect(adminService.saveProduct(draft)).toEqual({ kind: 'saved' })
  const sku = adminService.getSnapshot().products.at(-1)!.product.sku
  expect(
    saveProductPhotos(draft.product.id, {
      gallery: gallery(),
      olfactoryImage: '/images/should-not-be-used.webp',
    }),
  ).toEqual({ kind: 'saved' })
  const saved = adminService.getSnapshot().products.at(-1)!
  expect(saved.product.sku).toBe(sku)
  expect(saved.detail.olfactoryImage).toBeNull()
  expect(saved.detail.gallery.map((view) => view.image)).toEqual(
    gallery().map((view) => view.image),
  )
  expect(getProductPhotoStatus(saved)).toMatchObject({
    expected: 4,
    count: 4,
    status: 'complete',
  })
})
