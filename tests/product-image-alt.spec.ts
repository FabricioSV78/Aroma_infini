import { expect, test } from '@playwright/test'
import {
  productImageAlt,
  withGeneratedGalleryAlts,
} from '../src/services/product-image-alt'
import { adminService } from '../src/services/admin-service'

test('genera descripciones neutras y útiles para cada foto', () => {
  expect(productImageAlt('Bois Clair', 'Atelier 01', 0)).toBe(
    'Bois Clair de Atelier 01, imagen principal',
  )
  expect(productImageAlt('Bois Clair', 'Atelier 01', 2)).toBe(
    'Bois Clair de Atelier 01, imagen 3',
  )
})

test('conserva descripciones detalladas y actualiza las fotos nuevas o renombradas', () => {
  const previous = {
    productName: 'Bois Clair',
    brandName: 'Atelier 01',
    gallery: [
      {
        image: 'front.webp',
        alt: 'Vista frontal de Bois Clair',
        framing: 'full' as const,
      },
      {
        image: 'detail.webp',
        alt: 'Detalle del atomizador de Bois Clair',
        framing: 'detail-top' as const,
      },
    ],
  }
  const gallery = [
    { ...previous.gallery[0] },
    { ...previous.gallery[1], image: 'new-detail.webp' },
    { image: '', alt: 'Texto obsoleto', framing: 'full' as const },
  ]

  expect(
    withGeneratedGalleryAlts(gallery, 'Bois Clair', 'Atelier 01', previous).map(
      (view) => view.alt,
    ),
  ).toEqual([
    'Vista frontal de Bois Clair',
    'Bois Clair de Atelier 01, imagen 2',
    '',
  ])
  expect(
    withGeneratedGalleryAlts(
      previous.gallery,
      'Bois Clair Intense',
      'Atelier 01',
      previous,
    )[0].alt,
  ).toBe('Bois Clair Intense de Atelier 01, imagen principal')
})

test('el guardado del producto completa el alt sin pedirlo al administrador', () => {
  adminService.reset()
  const original = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')
  expect(original).toBeDefined()
  const draft = structuredClone(original!)
  draft.detail.gallery[0].alt = ''

  expect(adminService.saveProduct(draft)).toEqual({ kind: 'saved' })
  const saved = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')!
  expect(saved.detail.gallery[0].alt).toBe(
    'Bois Clair de Atelier 01, imagen principal',
  )
  expect(saved.detail.gallery[1].alt).toBe(original!.detail.gallery[1].alt)
})
