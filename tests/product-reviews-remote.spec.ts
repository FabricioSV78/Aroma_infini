import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import {
  customerA,
  expect,
  fixtureProject,
  test as authTest,
} from './supabase-auth-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { ProductReview } from '../src/types/review'
import type { AdminProduct } from '../src/types/admin'
import {
  publicBrandPreviewsFixture,
  publicHomeCatalogFixture,
} from './public-home-catalog-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const productId = '30000000-0000-4000-8000-000000000001'
const brandId = '20000000-0000-4000-8000-000000000001'
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
const product: AdminProduct = {
  active: true,
  gender: 'unisex',
  popularity: 1,
  newest: 1,
  lowStockThreshold: 2,
  product: {
    id: productId,
    sku: '10000',
    productType: 'perfume',
    slug: 'perfume-opinion',
    name: 'Perfume Opinión',
    brandId,
    family: 'Floral',
    olfactoryFamilies: ['floral'],
    image: '/images/petale-960.webp',
    discount: null,
    variants: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        sku: '1000',
        ml: 50,
        priceCents: 12000,
        stock: 8,
        active: true,
      },
    ],
  },
  detail: {
    shortDescription: 'Una fragancia floral.',
    description: 'Prueba aislada de reseñas reales.',
    olfactoryImage: '/images/petale-960.webp',
    notes: { top: ['Rosa'], heart: ['Rosa'], base: ['Almizcle'] },
    intensity: 'Suave',
    intensityLevel: 1,
    occasion: 'Diario',
    season: 'Todo el año',
    gallery: [
      { image: '/images/petale-960.webp', alt: 'Perfume', framing: 'full' },
    ],
    recommendationIds: [],
  },
}
const metadata = {
  brands: [{ id: brandId, name: 'Casa Opinión', slug: 'casa-opinion' }],
  features: { complementsEnabled: false },
  featuredBrandId: null,
  olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
  homeAnnouncement: null,
  homeVersion: 0,
  shipping: null,
  shippingVersion: 0,
}
interface ReviewsNetwork {
  reviews: Array<ProductReview & { owner: string }>
  failWrite: boolean
  rejectWrite: boolean
  failRead: boolean
  writes: number
}
const test = authTest.extend<{ reviewsNetwork: ReviewsNetwork }>({
  reviewsNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: ReviewsNetwork = {
      reviews: [],
      failWrite: false,
      rejectWrite: false,
      failRead: false,
      writes: 0,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request(),
        name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        ![
          'product_reviews',
          'customer_product_review',
          'submit_product_review',
          'commerce_settings',
          'home_document',
          'site_settings',
        ].includes(name)
      ) {
        await route.fallback()
        return
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      const payload: Record<string, unknown> = request.postDataJSON()
      const token = request.headers().authorization ?? ''
      const claims = token.startsWith('Bearer ey')
        ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        : null
      const owner = typeof claims?.sub === 'string' ? claims.sub : null
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers: cors })
      if (name === 'catalog_product_context')
        await reply({ ...metadata, record: product, recommendations: [] })
      else if (name === 'catalog_settings') await reply(metadata)
      else if (name === 'catalog_home_context')
        await reply(publicHomeCatalogFixture(metadata, [product]))
      else if (name === 'catalog_brand_previews')
        await reply(publicBrandPreviewsFixture(metadata.brands, [product]))
      else if (name === 'catalog_brands') await reply(metadata.brands)
      else if (name === 'catalog_products')
        await reply({ items: [product], total: 1 })
      else if (name === 'catalog_products_by_ids')
        await reply({ items: [product], total: 1 })
      else if (name === 'commerce_settings')
        await reply({ shipping: null, shippingVersion: 0 })
      else if (name === 'home_document')
        await reply({ media: null, content: null, version: 0, mediaAssets: [] })
      else if (name === 'site_settings') await reply({ version: 0, data: null })
      else if (name === 'customer_product_review')
        await reply(
          state.reviews.find((review) => review.owner === owner) ?? null,
        )
      else if (name === 'submit_product_review') {
        state.writes++
        expect(owner).toBe(customerA)
        expect(payload).not.toHaveProperty('p_user_id')
        expect(payload).not.toHaveProperty('author')
        if (state.failWrite) {
          state.failWrite = false
          await reply(
            { code: 'PGRST000', message: 'private network detail' },
            503,
          )
          return
        }
        if (state.rejectWrite) {
          state.rejectWrite = false
          await reply({ code: 'PT422', message: 'private filter detail' }, 422)
          return
        }
        if (state.reviews.some((review) => review.owner === owner)) {
          await reply({ code: 'PT409', message: 'duplicate' }, 409)
          return
        }
        const review = {
          id: '90000000-0000-4000-8000-000000000001',
          owner: owner!,
          author: 'Ana T.',
          date: '2026-11-01',
          rating: Number(payload.p_rating) as ProductReview['rating'],
          title: String(payload.p_title),
          comment: String(payload.p_comment),
          sizeMl: Number(payload.p_size_ml ?? 0),
        }
        state.reviews.push(review)
        await reply(review)
      } else if (name === 'product_reviews') {
        if (state.failRead) {
          await reply({ code: 'PGRST000', message: 'private details' }, 503)
          return
        }
        const distribution = Object.fromEntries(
          [1, 2, 3, 4, 5].map((rating) => [
            rating,
            state.reviews.filter((review) => review.rating === rating).length,
          ]),
        )
        const selected = state.reviews
          .filter(
            (review) => !payload.p_rating || review.rating === payload.p_rating,
          )
          .sort((a, b) =>
            payload.p_order === 'highest'
              ? b.rating - a.rating
              : payload.p_order === 'lowest'
                ? a.rating - b.rating
                : b.id.localeCompare(a.id),
          )
        const page = Number(payload.p_page ?? 1),
          offset = (page - 1) * 3
        await reply({
          items: selected.slice(offset, offset + 3),
          page,
          pageSize: 3,
          total: selected.length,
          count: state.reviews.length,
          average: state.reviews.length
            ? Math.round(
                (state.reviews.reduce((sum, review) => sum + review.rating, 0) /
                  state.reviews.length) *
                  10,
              ) / 10
            : null,
          distribution,
        })
      }
    })
    await runFixture(state)
  },
})
async function openReviews(page: import('@playwright/test').Page) {
  await page.goto('/producto/perfume-opinion')
  await page.getByRole('button', { name: 'Reseñas', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Reseñas', exact: true }),
  ).toBeVisible()
}
async function startForm(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: 'Escribir una reseña', exact: true })
    .click()
  await page.getByRole('radio', { name: '2 estrellas', exact: true }).check()
  await page.getByLabel('Título', { exact: true }).fill('No es para mí')
  await page
    .getByLabel('Tu opinión', { exact: true })
    .fill('No dura mucho en mi piel. No lo recomiendo.')
}
test('guest reads the empty state and is asked to sign in before publishing', async ({
  page,
  reviewsNetwork,
}) => {
  await openReviews(page)
  await expect(
    page.getByRole('heading', { name: 'Aún no hay reseñas publicadas' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Escribir una reseña' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Inicia sesión para compartir tu experiencia.',
  )
  expect(reviewsNetwork.writes).toBe(0)
})
test('a respectful negative review is published once and survives a reload', async ({
  page,
  supabaseNetwork,
  reviewsNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await openReviews(page)
  await startForm(page)
  await page
    .getByRole('button', { name: 'Publicar reseña', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.review-status')).toContainText(
    'Tu reseña se publicó',
  )
  await expect(page.locator('.product-review-list')).toContainText('Ana T.')
  await expect(
    page.getByRole('button', { name: 'Ya compartiste tu opinión' }),
  ).toBeDisabled()
  expect(reviewsNetwork.writes).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: 'Reseñas', exact: true }).click()
  await expect(page.locator('.product-review-list')).toContainText(
    'No es para mí',
  )
  await expect(page.locator('.product-reviews-score')).toContainText('2.0')
})
test('offensive input gets inline feedback and never reaches the publication RPC', async ({
  page,
  supabaseNetwork,
  reviewsNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await openReviews(page)
  await startForm(page)
  await page
    .getByLabel('Tu opinión', { exact: true })
    .fill('Esto es una m13rd4 de perfume.')
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.getByRole('alert')).toContainText('sin insultos')
  await expect(page.getByLabel('Tu opinión', { exact: true })).toHaveValue(
    'Esto es una m13rd4 de perfume.',
  )
  expect(reviewsNetwork.writes).toBe(0)
})
test('backend rejection and network failures preserve fields for correction and retry', async ({
  page,
  supabaseNetwork,
  reviewsNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await openReviews(page)
  await startForm(page)
  reviewsNetwork.rejectWrite = true
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.getByRole('alert')).toContainText('sin insultos')
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(
    'No es para mí',
  )
  reviewsNetwork.failWrite = true
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.getByRole('alert')).toContainText('Conservamos tu opinión')
  await expect(page.getByLabel('Tu opinión', { exact: true })).toHaveValue(
    'No dura mucho en mi piel. No lo recomiendo.',
  )
  await page.getByRole('button', { name: 'Publicar reseña' }).click()
  await expect(page.locator('.review-status')).toContainText(
    'Tu reseña se publicó',
  )
  expect(reviewsNetwork.reviews).toHaveLength(1)
})
test('server pagination, filters and sorting update a real review list', async ({
  page,
  reviewsNetwork,
}) => {
  reviewsNetwork.reviews = [1, 2, 3, 4, 5].map((rating) => ({
    id: `90000000-0000-4000-8000-${String(rating).padStart(12, '0')}`,
    owner: `fixture-${rating}`,
    author: 'Cliente',
    date: '2026-11-01',
    rating: rating as ProductReview['rating'],
    title: `Opinión ${rating}`,
    comment: 'Una experiencia personal con el perfume.',
    sizeMl: 50,
  }))
  await openReviews(page)
  await expect(page.locator('.product-review-list > li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.locator('.product-review-list > li')).toHaveCount(2)
  await page.getByRole('button', { name: '5 estrellas: 1 reseñas' }).click()
  await expect(page.locator('.product-review-list > li')).toHaveCount(1)
  await expect(page.locator('.product-review-list')).toContainText('Opinión 5')
  await page.getByRole('button', { name: /Ver todas/ }).click()
  await page.locator('.review-toolbar select').selectOption('lowest')
  await expect(page.locator('.product-review-list h3').first()).toHaveText(
    'Opinión 1',
  )
})
test('a failed public read shows retry without substituting fixture opinions', async ({
  page,
  reviewsNetwork,
}) => {
  reviewsNetwork.failRead = true
  await openReviews(page)
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos cargar las reseñas',
  )
  await expect(page.locator('.product-review-list > li')).toHaveCount(0)
  reviewsNetwork.failRead = false
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Aún no hay reseñas publicadas' }),
  ).toBeVisible()
  expect(reviewsNetwork.writes).toBe(0)
})

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`reviews and the publication form remain usable at ${width}px`, async ({
    page,
    supabaseNetwork,
    reviewsNetwork,
  }) => {
    void reviewsNetwork
    await page.setViewportSize({ width, height })
    await supabaseNetwork.seedSession(page)
    await openReviews(page)
    await startForm(page)
    await expect(
      page.getByRole('button', { name: 'Publicar reseña' }),
    ).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
    expect(overflow).toBe(false)
    await mkdir('artifacts/product-reviews-captures', { recursive: true })
    await page.screenshot({
      path: `artifacts/product-reviews-captures/review-form-${width}.png`,
      fullPage: false,
    })
  })
}
