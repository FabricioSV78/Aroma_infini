import { Buffer } from 'node:buffer'
import { installAdminPageBatchGate } from './admin-page-batch-fixture'
import type { HomeContent, HomeMedia } from '../src/types/home'
import type { Page } from '@playwright/test'
import type { AdminBrand, AdminProduct } from '../src/types/admin'
import {
  DEFAULT_OLFACTORY_FAMILIES,
  replaceOlfactoryFamilies,
  type OlfactoryFamilyDefinition,
} from '../src/domain/olfactory-family'
import {
  queryCatalog,
  type CatalogQuery,
} from '../src/services/catalog-service'
import { getProductRecommendations } from '../src/services/product-recommendations'
import { createDefaultHomeContent } from '../src/content/home-editor'
import {
  publicBrandPreviewsFixture,
  publicHomeCatalogFixture,
} from './public-home-catalog-fixture'
import {
  importFile,
  importRecord,
  openImport,
  reviewFile,
} from './product-import-fixtures'
import {
  customerB,
  expect,
  fixtureProject,
  fixtureStorageKey,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const remoteBrandId = '20000000-0000-4000-8000-000000000001'
const remoteProductId = '30000000-0000-4000-8000-000000000001'
const remoteVariantId = '40000000-0000-4000-8000-000000000001'
const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

function makeProduct(): AdminProduct {
  return {
    active: true,
    gender: 'unisex',
    popularity: 1,
    newest: 1,
    lowStockThreshold: 2,
    product: {
      id: remoteProductId,
      sku: '10000',
      productType: 'perfume',
      slug: 'fleur-de-test',
      name: 'Fleur de Test',
      brandId: remoteBrandId,
      family: 'Floral · suave',
      olfactoryFamilies: ['floral'],
      image: '/images/petale-960.webp',
      variants: [
        {
          id: remoteVariantId,
          ml: 50,
          sku: '1000',
          priceCents: 42000,
          stock: 8,
          active: true,
        },
      ],
      discount: null,
    },
    detail: {
      shortDescription: 'Una composición floral para acompañarte cada día.',
      description: 'Una fragancia de prueba de contrato HTTP aislado.',
      olfactoryImage: '/images/petale-960.webp',
      notes: { top: ['Bergamota'], heart: ['Rosa'], base: ['Almizcle'] },
      intensity: 'Suave',
      intensityLevel: 1,
      occasion: 'Diario',
      season: 'Todo el año',
      gallery: [
        {
          image: '/images/petale-960.webp',
          alt: 'Fleur de Test · Maison de Test · Vista 1',
          framing: 'full',
        },
      ],
      recommendationIds: [],
    },
  }
}

interface CatalogCall {
  name: string
  body: Record<string, unknown>
  authorization: string | undefined
}

interface CatalogNetwork {
  olfactoryFamilies: OlfactoryFamilyDefinition[]
  products: AdminProduct[]
  brands: AdminBrand[]
  calls: CatalogCall[]
  unavailable: boolean
  writeError: { code: string; message: string; status: number } | null
  holdWrite: Promise<void> | null
  complementsEnabled: boolean
  featuredBrandId: string | null
  settingsVersion: number
  home: {
    media: HomeMedia | null
    content: HomeContent | null
    version: number
    mediaAssets: unknown[]
  }
  productVersions: Map<string, number>
  rejectedBrandNames: string[]
  importResponseLost: boolean
  failCatalogAfterImport: boolean
  catalogReadUnavailable: boolean
  holdCatalogRead: Promise<void> | null
}

const test = authTest.extend<{ catalogNetwork: CatalogNetwork }>({
  catalogNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: CatalogNetwork = {
      olfactoryFamilies: structuredClone([...DEFAULT_OLFACTORY_FAMILIES]),
      products: [makeProduct()],
      brands: [
        {
          id: remoteBrandId,
          name: 'Maison de Test',
          slug: 'maison-de-test',
          active: true,
        },
      ],
      calls: [],
      unavailable: false,
      writeError: null,
      holdWrite: null,
      complementsEnabled: false,
      featuredBrandId: remoteBrandId,
      settingsVersion: 1,
      home: { media: null, content: null, version: 0, mediaAssets: [] },
      productVersions: new Map([[remoteProductId, 1]]),
      rejectedBrandNames: [],
      importResponseLost: false,
      failCatalogAfterImport: false,
      catalogReadUnavailable: false,
      holdCatalogRead: null,
    }
    const productVersions = state.productVersions
    const brandVersions = new Map([[remoteBrandId, 1]])
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        !name.startsWith('admin_') &&
        name !== 'home_document'
      ) {
        await route.fallback()
        return
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const body = request.postDataJSON() as Record<string, unknown>
      const authorization = request.headers().authorization
      state.calls.push({ name, body, authorization })
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ status, json, headers })
      if (state.unavailable) {
        await reply(
          { code: 'PGRST000', message: 'Isolated fixture unavailable' },
          503,
        )
        return
      }
      if (name.startsWith('admin_')) {
        expect(authorization).toMatch(/^Bearer ey/)
        const token = authorization!.replace(/^Bearer /, '')
        const claims = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
        ) as { aal: string; role: string }
        expect(claims.aal).toBe('aal2')
        expect(claims.role).toBe('authenticated')
      }
      const metadata = {
        brands: state.brands.filter((brand) => brand.active),
        features: { complementsEnabled: state.complementsEnabled },
        featuredBrandId: state.featuredBrandId,
        olfactoryFamilies: state.olfactoryFamilies,
        homeAnnouncement: state.home.content?.announcement ?? null,
        homeVersion: state.home.version,
      }
      const publicProducts = state.products.filter((record) => record.active)
      if (name === 'admin_orders') {
        // Signing into the dashboard now reads the persistent order module.
        // This catalog suite has no orders; keep every request isolated.
        await reply({ orders: [], orderHistory: [], total: 0 })
      } else if (name === 'admin_commerce_settings') {
        await reply({
          shipping: null,
          shippingVersion: 0,
          coupons: [],
          couponVersions: {},
        })
      } else if (name === 'home_document' || name === 'admin_home_document') {
        await reply(state.home)
      } else if (name === 'catalog_home_context') {
        await reply(publicHomeCatalogFixture(metadata, publicProducts))
      } else if (name === 'catalog_brand_previews') {
        await reply(publicBrandPreviewsFixture(metadata.brands, publicProducts))
      } else if (name === 'catalog_browse') {
        // The isolated SQL transport uses the same confirmed dynamic vocabulary
        // as this request; Node's fixture registry is separate from the browser.
        replaceOlfactoryFamilies(state.olfactoryFamilies)
        const query = body.p_query as CatalogQuery
        const normalized = {
          ...query,
          brands: query.brands.filter((slug) =>
            metadata.brands.some((brand) => brand.slug === slug),
          ),
          families: query.families.filter((code) =>
            state.olfactoryFamilies.some((family) => family.value === code),
          ),
          productTypes: state.complementsEnabled ? query.productTypes : [],
        }
        const found = queryCatalog(
          normalized,
          publicProducts.map((record) => record.product),
          publicProducts,
          metadata.brands,
        )
        await reply({
          ...metadata,
          ...found,
          items: found.items.map((product) =>
            publicProducts.find((record) => record.product.id === product.id),
          ),
          availableTotal: publicProducts.length,
          familyCodes: [
            ...new Set(
              publicProducts.flatMap(
                (record) => record.product.olfactoryFamilies ?? [],
              ),
            ),
          ],
        })
      } else if (name === 'catalog_product_context') {
        const selected = publicProducts.find(
          (record) => record.product.slug === body.p_slug,
        )
        const recommendations = selected
          ? getProductRecommendations(
              selected.product,
              selected.detail.recommendationIds,
              publicProducts.map((record) => record.product),
            ).map((product) =>
              publicProducts.find((record) => record.product.id === product.id),
            )
          : []
        await reply({ ...metadata, record: selected ?? null, recommendations })
      } else if (name === 'catalog_products_by_ids') {
        const selected = publicProducts.filter(
          ({ product }) =>
            (body.p_product_ids as string[]).includes(product.id) ||
            product.variants.some((variant) =>
              (body.p_variant_ids as string[]).includes(variant.id),
            ),
        )
        await reply({ items: selected, total: selected.length })
      } else if (name === 'admin_olfactory_families') {
        await reply(
          state.olfactoryFamilies.map((family) => ({
            ...family,
            productCount: state.products.filter(({ product }) =>
              product.olfactoryFamilies?.includes(family.value),
            ).length,
          })),
        )
      } else if (name === 'admin_save_olfactory_family') {
        if (state.writeError) {
          const error = state.writeError
          state.writeError = null
          await reply(
            { code: error.code, message: error.message },
            error.status,
          )
          return
        }
        const current = state.olfactoryFamilies.find(
          (family) => family.value === body.p_code,
        )
        const label = String(body.p_label).trim(),
          code = current?.value ?? label.toLowerCase().replace(/\s+/g, '-')
        const family = {
          value: code,
          label,
          aromaLabel: label,
          active: Boolean(body.p_active),
          aliases: current ? [...current.aliases, current.label] : [],
          version: (current?.version ?? 0) + 1,
          productCount: current?.productCount ?? 0,
        }
        state.olfactoryFamilies = current
          ? state.olfactoryFamilies.map((item) =>
              item.value === code ? family : item,
            )
          : [...state.olfactoryFamilies, family]
        await reply({ family })
      } else if (name === 'admin_delete_olfactory_family') {
        state.olfactoryFamilies = state.olfactoryFamilies.filter(
          (family) => family.value !== body.p_code,
        )
        await reply(null)
      } else if (name === 'catalog_products') {
        const published = state.products.filter((record) => record.active)
        const offset = Number(body.p_offset ?? 0)
        const limit = Number(body.p_limit ?? 100)
        await reply({
          items: published.slice(offset, offset + limit),
          total: published.length,
        })
      } else if (name === 'catalog_brands') {
        await reply(state.brands.filter((brand) => brand.active))
      } else if (name === 'catalog_settings') {
        await reply({
          features: { complementsEnabled: state.complementsEnabled },
          olfactoryFamilies: state.olfactoryFamilies,
          featuredBrandId: state.featuredBrandId,
          homeAnnouncement: state.home.content?.announcement ?? null,
          homeVersion: state.home.version,
        })
      } else if (name === 'catalog_product') {
        await reply(
          state.products.find(({ product }) => product.slug === body.p_slug) ??
            null,
        )
      } else if (name === 'admin_catalog_page') {
        if (state.catalogReadUnavailable) {
          await reply(
            { code: 'PGRST000', message: 'Isolated catalog read unavailable' },
            503,
          )
          return
        }
        const offset = Number(body.p_offset ?? 0)
        const limit = Number(body.p_limit ?? 100)
        const payload = structuredClone({
          products: state.products.slice(offset, offset + limit),
          brands: state.brands,
          features: { complementsEnabled: state.complementsEnabled },
          olfactoryFamilies: state.olfactoryFamilies.map((family) => ({
            ...family,
            productCount: state.products.filter(({ product }) =>
              product.olfactoryFamilies?.includes(family.value),
            ).length,
          })),
          featuredBrandId: state.featuredBrandId,
          productVersions: Object.fromEntries(productVersions),
          brandVersions: Object.fromEntries(brandVersions),
          settingsVersion: state.settingsVersion,
          total: state.products.length,
        })
        const hold = state.holdCatalogRead
        state.holdCatalogRead = null
        if (hold) await hold
        await reply(payload)
      } else {
        if (state.holdWrite) await state.holdWrite
        if (state.writeError) {
          const error = state.writeError
          state.writeError = null
          await reply(
            { code: error.code, message: error.message },
            error.status,
          )
          return
        }
        if (name === 'admin_save_home') {
          expect(JSON.stringify(body)).not.toContain('data:')
          expect(body.p_expected_version).toBe(state.home.version)
          expect(body.p_expected_settings_version).toBe(state.settingsVersion)
          state.complementsEnabled = body.p_complements_enabled === true
          state.featuredBrandId =
            typeof body.p_featured_brand_id === 'string'
              ? body.p_featured_brand_id
              : null
          state.settingsVersion++
          state.home = {
            media: body.p_media as HomeMedia,
            content: body.p_content as HomeContent,
            version: state.home.version + 1,
            mediaAssets: [],
          }
          await reply({
            home: state.home,
            features: { complementsEnabled: state.complementsEnabled },
            featuredBrandId: state.featuredBrandId,
            settingsVersion: state.settingsVersion,
          })
        } else if (name === 'admin_save_brand') {
          const record = body.p_brand as AdminBrand
          const previous = state.brands.find((brand) => brand.id === record.id)
          const version = (brandVersions.get(record.id) ?? 0) + 1
          state.brands = previous
            ? state.brands.map((brand) =>
                brand.id === record.id ? record : brand,
              )
            : [...state.brands, record]
          brandVersions.set(record.id, version)
          await reply({ record, version })
        } else if (name === 'admin_save_product') {
          const record = body.p_record as AdminProduct
          record.product.discount ??= null
          record.product.olfactoryFamilies ??= []
          record.detail.gallery = record.detail.gallery.filter(({ image }) =>
            image.trim(),
          )
          if (!productVersions.has(record.product.id)) {
            record.product.sku = String(10000 + state.products.length)
            for (const [index, variant] of record.product.variants.entries())
              variant.sku ||= String(1000 + state.products.length + index)
          }
          const version = (productVersions.get(record.product.id) ?? 0) + 1
          state.products = state.products.some(
            ({ product }) => product.id === record.product.id,
          )
            ? state.products.map((item) =>
                item.product.id === record.product.id ? record : item,
              )
            : [...state.products, record]
          productVersions.set(record.product.id, version)
          await reply({ record, version })
        } else if (name === 'admin_save_offer') {
          const record = state.products.find(
            ({ product }) => product.id === body.p_product_id,
          )!
          if (
            body.p_expected_version !== productVersions.get(record.product.id)
          ) {
            await reply(
              { code: 'PT409', message: 'Stale isolated fixture version' },
              409,
            )
            return
          }
          record.product.discount =
            body.p_offer as AdminProduct['product']['discount']
          const version = (productVersions.get(record.product.id) ?? 0) + 1
          productVersions.set(record.product.id, version)
          await reply({ record, version })
        } else if (name === 'admin_register_brands') {
          const names = body.p_names as string[]
          const seen = new Set(
            state.brands.map(({ name }) => name.toLowerCase()),
          )
          const existing: string[] = []
          const errors: Array<{ line: number; message: string }> = []
          const freshNames = names.filter((name, index) => {
            if (state.rejectedBrandNames.includes(name)) {
              errors.push({
                line: index + 1,
                message: 'Isolated validation error',
              })
              return false
            }
            const key = name.toLowerCase()
            if (seen.has(key)) {
              existing.push(name)
              return false
            }
            seen.add(key)
            return true
          })
          const created = freshNames.map((name, index) => ({
            id: `20000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
            name,
            slug: name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
            active: true,
          }))
          for (const brand of created) brandVersions.set(brand.id, 1)
          state.brands.push(...created)
          await reply({
            created,
            existing,
            errors,
            versions: Object.fromEntries(brandVersions),
          })
        } else if (
          name === 'admin_save_catalog_settings' ||
          name === 'admin_save_features'
        ) {
          expect(body).not.toHaveProperty('p_home_content')
          expect(JSON.stringify(body)).not.toContain('data:')
          state.complementsEnabled = body.p_complements_enabled === true
          if (name === 'admin_save_catalog_settings')
            state.featuredBrandId =
              typeof body.p_featured_brand_id === 'string'
                ? body.p_featured_brand_id
                : null
          state.settingsVersion++
          await reply({
            features: { complementsEnabled: state.complementsEnabled },
            olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
            featuredBrandId: state.featuredBrandId,
            version: state.settingsVersion,
          })
        } else if (name === 'admin_import_products') {
          const records = structuredClone(body.p_records as AdminProduct[])
          if (
            records.some((record) => productVersions.has(record.product.id))
          ) {
            await reply(
              { code: '23505', message: 'Existing isolated UUID' },
              409,
            )
            return
          }
          for (const record of records) {
            record.active = false
            record.product.sku = String(10000 + state.products.length)
            for (const [index, variant] of record.product.variants.entries())
              variant.sku ||= String(1000 + state.products.length * 2 + index)
            state.products.push(record)
            productVersions.set(record.product.id, 1)
          }
          if (state.failCatalogAfterImport) state.catalogReadUnavailable = true
          if (state.importResponseLost) {
            state.importResponseLost = false
            await route.abort('failed')
            return
          }
          await reply({
            products: records,
            productVersions: Object.fromEntries(
              records.map((record) => [record.product.id, 1]),
            ),
          })
        } else {
          await reply(
            {
              code: 'fixture_unhandled_command',
              message: `Unhandled: ${name}`,
            },
            500,
          )
          throw new Error(`Unhandled catalog command: ${name}`)
        }
      }
    })
    await runFixture(state)
  },
})

for (const includeAccessory of [false, true]) {
  test(`Home respeta el orden de ventas SQL${includeAccessory ? ' y excluye complementos' : ' sin reordenarlo por prioridad editorial'}`, async ({
    page,
    context,
    catalogNetwork,
  }) => {
    const perfumes = Array.from({ length: 4 }, (_, index) => {
      const record = makeProduct()
      record.popularity = index + 1
      record.product = {
        ...record.product,
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        sku: String(10000 + index),
        slug: `perfume-ventas-${index + 1}`,
        name: `Perfume de ventas ${index + 1}`,
        variants: record.product.variants.map((variant) => ({
          ...variant,
          id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          sku: String(1000 + index),
        })),
      }
      return record
    })
    const accessory = makeProduct()
    accessory.popularity = 0
    accessory.gender = null
    accessory.product = {
      ...accessory.product,
      id: '30000000-0000-4000-8000-000000000099',
      sku: '10099',
      slug: 'complemento-qa-ventas',
      name: 'Complemento QA de ventas',
      productType: 'complemento',
      family: '',
      olfactoryFamilies: [],
      variants: [
        {
          id: '40000000-0000-4000-8000-000000000099',
          sku: '1099',
          ml: null,
          label: 'Unidad',
          priceCents: 8000,
          stock: 4,
          active: true,
        },
      ],
    }
    accessory.detail = {
      ...accessory.detail,
      intensity: null,
      intensityLevel: null,
      notes: { top: [], heart: [], base: [] },
    }
    catalogNetwork.complementsEnabled = true
    catalogNetwork.products = [...perfumes, accessory]
    const sqlOrder = includeAccessory
      ? [accessory, perfumes[3], perfumes[1], perfumes[2]]
      : [perfumes[3], perfumes[1], perfumes[2], perfumes[0]]
    await context.route(
      `${origin}/rest/v1/rpc/catalog_home_context`,
      async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers })
          return
        }
        const value = publicHomeCatalogFixture(
          {
            brands: catalogNetwork.brands,
            features: { complementsEnabled: true },
            featuredBrandId: remoteBrandId,
            olfactoryFamilies: catalogNetwork.olfactoryFamilies,
          },
          catalogNetwork.products,
        )
        // Model SQL's confirmed-sales result independently from editorial ranks.
        value.items = sqlOrder
        await route.fulfill({ status: 200, headers, json: value })
      },
    )
    await page.goto('/')
    const expected = sqlOrder
      .filter((record) => record.product.productType === 'perfume')
      .map((record) => record.product.name)
    await expect(
      page.locator('.bestsellers-section .product-card h3'),
    ).toHaveText(expected)
    await expect(page.locator('.bestsellers-section')).not.toContainText(
      accessory.product.name,
    )
  })
}

async function signInAdmin(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
}

async function clientProducts(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    return adminService
      .getSnapshot()
      .products.map(({ product }) => ({ id: product.id, name: product.name }))
  })
}

for (const leave of [false, true]) {
  test(`El catálogo carga mil registros con cuatro lecturas acotadas y ${leave ? 'descarta el lote al cerrar sesión' : 'publica un snapshot completo'}`, async ({
    page,
    context,
    supabaseNetwork,
    catalogNetwork,
  }) => {
    await signInAdmin(page, supabaseNetwork)
    catalogNetwork.products = Array.from({ length: 1000 }, (_, index) => {
      const record = makeProduct()
      record.product.id = `c4110000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      record.product.slug = `batch-fixture-${index + 1}`
      record.product.sku = String(10000 + index)
      record.product.variants[0].id = `c4120000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      record.product.variants[0].sku = String(1000 + index)
      catalogNetwork.productVersions.set(record.product.id, 1)
      return record
    })
    // A document entry in Shipping has no in-memory catalog. Test the initial
    // thousand-row load, rather than replacing an already complete snapshot.
    await page.goto('/admin/envios')
    await expect(page.locator('main h1')).toHaveText('Tarifas de envío')
    const gate = await installAdminPageBatchGate(
      context,
      origin,
      'admin_catalog_page',
    )
    const reading = page.evaluate(async () => {
      const path = '/src/services/catalog-admin-service.ts'
      const { loadAdminCatalog } = (await import(
        path
      )) as typeof import('../src/services/catalog-admin-service')
      try {
        await loadAdminCatalog(true)
        return 'resolved'
      } catch {
        return 'rejected'
      }
    })
    try {
      await expect.poll(() => gate.started.length).toBe(5)
      expect(gate.peak()).toBe(4)
      expect(
        await page.evaluate(async () => {
          const path = '/src/services/admin-service.ts'
          const { adminService } = (await import(
            path
          )) as typeof import('../src/services/admin-service')
          const catalogPath = '/src/services/catalog-admin-service.ts'
          const { hasCurrentAdminCatalog } = (await import(
            catalogPath
          )) as typeof import('../src/services/catalog-admin-service')
          return {
            count: adminService.getSnapshot().products.length,
            reusable: hasCurrentAdminCatalog(),
          }
        }),
      ).toEqual({ count: 0, reusable: false })
      if (leave) {
        await page.evaluate(async () => {
          const path = '/src/services/auth-service.ts'
          const { authService } = (await import(
            path
          )) as typeof import('../src/services/auth-service')
          await authService.signOut()
        })
      }
      gate.releaseAll()
      expect(await reading).toBe(leave ? 'rejected' : 'resolved')
      const result = await page.evaluate(async () => {
        const path = '/src/services/admin-service.ts'
        const { adminService } = (await import(
          path
        )) as typeof import('../src/services/admin-service')
        const catalogPath = '/src/services/catalog-admin-service.ts'
        const { hasCurrentAdminCatalog } = (await import(
          catalogPath
        )) as typeof import('../src/services/catalog-admin-service')
        return {
          count: adminService.getSnapshot().products.length,
          reusable: hasCurrentAdminCatalog(),
        }
      })
      expect(result).toEqual({ count: leave ? 0 : 1000, reusable: !leave })
      expect([...gate.started].sort((a, b) => a - b)).toEqual(
        Array.from({ length: leave ? 5 : 10 }, (_, index) => index * 100),
      )
    } finally {
      gate.releaseAll()
      await reading
    }
  })
}

test('Una lectura anterior al guardado no reemplaza el producto canónico confirmado', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  let release!: () => void
  catalogNetwork.holdCatalogRead = new Promise<void>((resolve) => {
    release = resolve
  })
  const before = catalogNetwork.calls.filter(
    ({ name }) => name === 'admin_catalog_page',
  ).length
  const reading = page.evaluate(async () => {
    const path = '/src/services/catalog-admin-service.ts'
    const { loadAdminCatalog } = (await import(
      path
    )) as typeof import('../src/services/catalog-admin-service')
    await loadAdminCatalog(true)
  })
  try {
    await expect
      .poll(
        () =>
          catalogNetwork.calls.filter(
            ({ name }) => name === 'admin_catalog_page',
          ).length,
      )
      .toBe(before + 1)
    await page.evaluate(async (id) => {
      const path = '/src/services/catalog-admin-service.ts'
      const { catalogAdminService } = (await import(
        path
      )) as typeof import('../src/services/catalog-admin-service')
      const record = catalogAdminService
        .getSnapshot()
        .products.find((item) => item.product.id === id)!
      const result = await catalogAdminService.saveProduct({
        ...record,
        product: { ...record.product, name: 'Canonical product after write' },
      })
      if (result.kind !== 'saved')
        throw new Error('The canonical fixture mutation did not succeed')
    }, remoteProductId)
    expect(catalogNetwork.productVersions.get(remoteProductId)).toBe(2)
    release()
    await reading
    const confirmed = await page.evaluate(async (id) => {
      const path = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      const record = adminService
        .getSnapshot()
        .products.find((item) => item.product.id === id)
      return { version: record?.version, name: record?.product.name }
    }, remoteProductId)
    expect(confirmed).toEqual({
      version: 2,
      name: 'Canonical product after write',
    })
  } finally {
    release()
    await reading
  }
})

test('Home y marcas usan proyecciones públicas acotadas sin descargar el snapshot completo', async ({
  page,
  catalogNetwork,
}) => {
  await page.goto('/')
  await expect(page.locator('.home .product-card')).toHaveCount(1)
  await expect(page.locator('.brand-signature-profile').first()).toHaveText(
    'Floral · suave',
  )
  await expect(page.locator('.finder-entry-options')).toContainText('Floral')
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'catalog_home_context'),
  ).toHaveLength(1)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
  await page.goto('/marcas')
  await expect(page.locator('.brands-directory')).toContainText(
    'Maison de Test',
  )
  await expect(page.locator('.brands-directory img')).toHaveAttribute(
    'src',
    /petale-960\.webp/,
  )
  expect(
    catalogNetwork.calls.filter(
      ({ name }) => name === 'catalog_brand_previews',
    ),
  ).toHaveLength(1)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
})

test('Home hidrata exactamente los productos públicos referenciados por el Hero', async ({
  page,
  catalogNetwork,
}) => {
  const target = structuredClone(catalogNetwork.products[0])
  target.product.id = '30000000-0000-4000-8000-000000000002'
  target.product.slug = 'hero-perfume-publico'
  target.product.variants[0].id = '40000000-0000-4000-8000-000000000002'
  target.popularity = 2
  const privateTarget = structuredClone(target)
  privateTarget.product.id = '30000000-0000-4000-8000-000000000003'
  privateTarget.product.slug = 'hero-perfume-privado'
  privateTarget.product.variants[0].id = '40000000-0000-4000-8000-000000000003'
  privateTarget.active = false
  catalogNetwork.products.push(target, privateTarget)
  const content = createDefaultHomeContent()
  content.featuredBrandId = catalogNetwork.featuredBrandId
  content.hero = content.hero.slice(0, 2).map((slide, index) => ({
    ...slide,
    destination: {
      type: 'product',
      productId: index === 0 ? target.product.id : privateTarget.product.id,
    },
  }))
  catalogNetwork.home = {
    media: { hombre: null, mujer: null, unisex: null, complementos: null },
    content,
    version: 1,
    mediaAssets: [],
  }
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible()
  const heroIds = await page.evaluate(async () => {
    const path = '/src/services/home-service.ts'
    const { homeService } = (await import(
      path
    )) as typeof import('../src/services/home-service')
    return (await homeService.getHome()).heroProducts.map(
      (product) => product.id,
    )
  })
  expect(heroIds).toEqual([target.product.id])
  expect(
    catalogNetwork.calls.filter(
      ({ name }) => name === 'catalog_products_by_ids',
    ),
  ).toHaveLength(1)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
})

test('Una RPC de Home ausente no dispara una descarga completa ni un catálogo local alternativo', async ({
  page,
  context,
  catalogNetwork,
}) => {
  let attempted = false
  await context.route(
    `${origin}/rest/v1/rpc/catalog_home_context`,
    async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      attempted = true
      await route.fulfill({
        status: 404,
        headers,
        json: { code: 'PGRST202', message: 'Missing isolated RPC' },
      })
    },
  )
  await page.goto('/')
  await expect.poll(() => attempted).toBe(true)
  await expect(page.locator('.home')).toHaveCount(0)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
  await expect(page.locator('main')).not.toContainText('Bois Clair')
})

test('la tienda utiliza productos y marcas remotos sin incluir el catálogo local de ejemplo', async ({
  page,
  catalogNetwork,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('.product-card')).toContainText('Fleur de Test')
  await expect(page.locator('.product-card')).toContainText('Maison de Test')
  await expect(page.locator('.product-card')).not.toContainText('Bois Clair')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page
    .getByRole('navigation', { name: 'Navegación principal', exact: true })
    .getByRole('button', { name: 'Marcas', exact: true })
    .click()
  const brandMenu = page.locator('#nav-panel-marcas')
  await expect(
    brandMenu.getByRole('link', { name: 'Maison de Test', exact: true }),
  ).toHaveAttribute('href', '/tienda?marca=maison-de-test')
  await expect(
    brandMenu.getByRole('link', { name: 'Atelier 01', exact: true }),
  ).toHaveCount(0)
  await brandMenu
    .getByRole('link', { name: 'Maison de Test', exact: true })
    .click()
  await expect(page).toHaveURL('/tienda?marca=maison-de-test')
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_browse'),
  ).toBe(true)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
  expect(
    catalogNetwork.calls.every(({ name }) => !name.startsWith('admin_')),
  ).toBe(true)
  await page.goto(`/tienda?marca=${remoteBrandId}&familia=floral`)
  await expect(page.locator('.product-card')).toHaveCount(1)
  await page.goto(`/tienda?familia=amaderado`)
  await expect(page.locator('.product-card')).toHaveCount(0)
})

test('el detalle presenta los datos remotos y el cuestionario recomienda ese perfume', async ({
  page,
  catalogNetwork,
}) => {
  void catalogNetwork
  await page.goto('/producto/fleur-de-test')
  await expect(
    page.getByRole('heading', { name: 'Fleur de Test', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.product-lead')).toHaveText(
    'Una composición floral para acompañarte cada día.',
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Encuentra tu perfume ideal',
  })
  await dialog.getByRole('checkbox', { name: /Floral/ }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Diario', exact: true }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Suave', exact: true }).check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog
    .getByRole('radio', { name: 'Sin límite de presupuesto', exact: true })
    .check()
  await dialog
    .getByRole('button', { name: 'Ver mis perfumes', exact: true })
    .click()
  await expect(
    dialog.getByRole('heading', { name: 'Fleur de Test', exact: true }),
  ).toBeVisible()
  await expect(dialog).not.toContainText('Bois Clair')
})

test('un catálogo remoto vacío permanece vacío y no registra productos automáticamente', async ({
  page,
  catalogNetwork,
}) => {
  catalogNetwork.products = []
  catalogNetwork.brands = []
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('Bois Clair')
  expect(
    catalogNetwork.calls.filter(({ name }) => name.startsWith('admin_')),
  ).toHaveLength(0)
  expect(await clientProducts(page)).toHaveLength(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('#nav-trigger-marcas').click()
  await expect(
    page.locator('#nav-panel-marcas .navigation-brand-links a'),
  ).toHaveCount(0)
  await expect(
    page
      .locator('#nav-panel-marcas')
      .getByRole('link', { name: 'Todas las marcas', exact: true }),
  ).toBeVisible()
})

test('consulta solo la página solicitada de Supabase y conserva cantidad y orden de resultados', async ({
  page,
  catalogNetwork,
}) => {
  catalogNetwork.products = Array.from({ length: 125 }, (_, index) => {
    const record = makeProduct()
    record.product.id = `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    record.product.variants[0].id = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    record.product.slug = `fleur-de-test-${index + 1}`
    record.product.name = `Fleur de Test ${index + 1}`
    record.product.sku = String(10000 + index)
    record.popularity = index + 1
    return record
  })
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page.locator('main')).toContainText('125')
  expect(
    catalogNetwork.calls
      .filter(({ name }) => name === 'catalog_browse')
      .map(({ body }) => (body.p_query as CatalogQuery).page),
  ).toEqual([1])
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'catalog_products'),
  ).toHaveLength(0)
  await page.goto('/tienda?pagina=11')
  await expect(page.locator('.product-card')).toHaveCount(5)
  await expect(page.locator('.product-card').last()).toContainText(
    'Fleur de Test 125',
  )
  expect(
    catalogNetwork.calls
      .filter(({ name }) => name === 'catalog_browse')
      .map(({ body }) => (body.p_query as CatalogQuery).page),
  ).toEqual([1, 11])
})

test('un fallo de Supabase muestra error y no recurre al catálogo local', async ({
  page,
  catalogNetwork,
}) => {
  catalogNetwork.unavailable = true
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('Bois Clair')
  await expect(
    page
      .getByRole('button', {
        name: /Reintentar|Intentar de nuevo|Volver a intentar/i,
      })
      .first(),
  ).toBeVisible()
})

test('el administrador edita con AAL2, recibe versión canónica y la tienda refleja el cambio', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Fleur de Test Actualizada')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(({ name }) => name === 'admin_save_product')
          .length,
    )
    .toBe(1)
  await expect(page).toHaveURL(/guardado=1/)
  const command = catalogNetwork.calls.find(
    ({ name }) => name === 'admin_save_product',
  )!
  expect(command.body.p_expected_version).toBe(1)
  expect(command.body).not.toHaveProperty('user_id')
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toContainText(
    'Fleur de Test Actualizada',
  )
})

test('un error de validación remota conserva el borrador y no confirma un cambio inexistente', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador por revisar')
  catalogNetwork.writeError = {
    code: '22023',
    message: 'Revisa los datos de la presentación.',
    status: 400,
  }
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(({ name }) => name === 'admin_save_product')
          .length,
    )
    .toBe(1)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Borrador por revisar',
  )
  await expect(page).not.toHaveURL(/guardado=1/)
  expect(await clientProducts(page)).toEqual([
    { id: remoteProductId, name: 'Fleur de Test' },
  ])
})

test('un conflicto PT409 conserva el borrador y pide revisar la versión antes de sobrescribir', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Borrador de otra versión')
  catalogNetwork.writeError = {
    code: 'PT409',
    message: 'Stale fixture record',
    status: 409,
  }
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    'Otra persona modificó este registro.',
  )
  await page
    .getByRole('button', { name: 'Volver a editar', exact: true })
    .click()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Borrador de otra versión',
  )
  await expect(page).not.toHaveURL(/guardado=1/)
  expect(await clientProducts(page)).toEqual([
    { id: remoteProductId, name: 'Fleur de Test' },
  ])
})

test('un producto nuevo se guarda como borrador sin imágenes con UUID y SKU asignado por servidor', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/productos/nuevo')
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Nuevo borrador aislado')
  await page.getByLabel('Marca', { exact: true }).selectOption(remoteBrandId)
  await page
    .getByLabel('Perfil aromático breve', { exact: true })
    .fill('Floral')
  await page
    .getByLabel('Resumen de la ficha')
    .fill('Resumen de prueba de integración.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción completa de prueba de integración.')
  await page.getByLabel('Precio (S/)', { exact: true }).fill('150')
  await page
    .getByLabel('Stock de presentación 50 ml', { exact: true })
    .fill('3')
  await expect(page.getByLabel('Producto activo en tienda')).not.toBeChecked()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const call = catalogNetwork.calls.find(
    ({ name }) => name === 'admin_save_product',
  )!
  const record = call.body.p_record as AdminProduct
  expect(record.product.id).toMatch(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
  )
  expect(record.product.variants[0].id).toMatch(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
  )
  expect(record.active).toBe(false)
  expect(record.product.image).toBe('')
  expect(call.body.p_expected_version).toBeUndefined()
  const saved = catalogNetwork.products.find(
    ({ product }) => product.name === 'Nuevo borrador aislado',
  )!
  expect(saved.product.sku).toBe('10001')
  expect(saved.product.variants[0].sku).toBe('1001')
  await expect(page.locator('.admin-products-page')).toContainText('SKU 1001')
  await expect(page.locator('.admin-products-page')).not.toContainText(
    'SKU 10001',
  )
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('main')).not.toContainText('Nuevo borrador aislado')
})

test('las familias administradas se guardan con SDK remoto y se comparten con productos y filtros', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/familias-olfativas')
  await page.getByRole('button', { name: 'Nueva familia', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva familia' })
  await dialog.getByLabel('Nombre de la familia').fill('Especiada')
  catalogNetwork.writeError = {
    code: '23505',
    message: 'A concurrent family already exists',
    status: 409,
  }
  await dialog.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Ya existe una familia')
  await expect(dialog.getByLabel('Nombre de la familia')).toHaveValue(
    'Especiada',
  )
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(dialog).not.toBeVisible()
  expect(
    catalogNetwork.olfactoryFamilies.find(
      (family) => family.value === 'especiada',
    )?.version,
  ).toBe(1)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page.getByRole('checkbox', { name: 'Especiada', exact: true }).check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  expect(catalogNetwork.products[0].product.olfactoryFamilies).toEqual([
    'floral',
    'especiada',
  ])
  await page.goto('/tienda?familia=especiada')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('main')).toContainText('Especiada')
  await page.goto('/admin/familias-olfativas')
  const row = page.getByRole('row').filter({ hasText: 'Especiada' })
  await expect(
    row.getByRole('button', { name: 'Eliminar Especiada', exact: true }),
  ).toHaveCount(0)
  await row
    .getByRole('button', { name: 'Editar Especiada', exact: true })
    .click()
  const edit = page.getByRole('dialog', { name: 'Editar familia' })
  await edit.getByLabel('Nombre de la familia').fill('Especiada cálida')
  await edit.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(edit).not.toBeVisible()
  expect(
    catalogNetwork.olfactoryFamilies.find(
      (family) => family.value === 'especiada',
    )?.aliases,
  ).toContain('Especiada')
  await page
    .getByRole('button', { name: 'Desactivar Especiada cálida', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Desactivar familia', exact: true })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada cálida' }),
  ).toContainText('Desactivada')
  expect(catalogNetwork.products[0].product.olfactoryFamilies).toContain(
    'especiada',
  )
  await page.goto('/tienda')
  await expect(
    page.getByRole('checkbox', { name: 'Especiada cálida', exact: true }),
  ).toHaveCount(0)
  expect(
    catalogNetwork.calls.filter(
      ({ name }) => name === 'admin_save_olfactory_family',
    ),
  ).toHaveLength(4)
})

test('Excel importa mediante el comando remoto y mantiene los productos pendientes de fotos fuera de la tienda', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({
        marca: 'Maison de Test',
        nombre: 'Importado aislado',
        slug: 'importado-aislado',
        sku: 'IMPORTADO-AISLADO-50',
      }),
    ]),
  )
  await preview.getByRole('button', { name: /Confirmar e importar 1/ }).click()
  await expect(preview).not.toBeVisible()
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(
          ({ name }) => name === 'admin_import_products',
        ).length,
    )
    .toBe(1)
  const records = catalogNetwork.calls.find(
    ({ name }) => name === 'admin_import_products',
  )!.body.p_records as AdminProduct[]
  expect(records).toHaveLength(1)
  expect(records[0].product.id).toMatch(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
  )
  expect(records[0].active).toBe(false)
  expect(JSON.stringify(records)).not.toContain('data:')
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('main')).not.toContainText('Importado aislado')
})

for (const scenario of [
  'canonical',
  'lost-response',
  'retry-after-disconnect',
] as const) {
  test(`QA-AROMA Excel ${scenario}: confirma una sola operación sin depender de una lectura posterior`, async ({
    page,
    supabaseNetwork,
    catalogNetwork,
  }) => {
    await signInAdmin(page, supabaseNetwork)
    await openImport(page)
    const file = await importFile([
      importRecord({
        marca: 'Maison de Test',
        nombre: `QA-AROMA ${scenario}`,
        slug: `qa-aroma-${scenario}`,
        sku: '',
      }),
      importRecord({
        marca: 'Maison de Test',
        nombre: `QA-AROMA ${scenario}`,
        slug: `qa-aroma-${scenario}`,
        sku: `QA-AROMA-${scenario}-100`,
        tamano_ml: 100,
        precio_soles: '199,90',
      }),
    ])
    const preview = await reviewFile(page, file)
    const readsBefore = catalogNetwork.calls.filter(
      ({ name }) => name === 'admin_catalog_page',
    ).length
    catalogNetwork.failCatalogAfterImport = scenario !== 'lost-response'
    catalogNetwork.importResponseLost = scenario !== 'canonical'
    await preview
      .getByRole('button', { name: /Confirmar e importar 1/ })
      .click()
    if (scenario === 'retry-after-disconnect') {
      await expect(page.locator('.admin-notice-dialog')).toContainText(
        'No se pudieron importar los productos',
      )
      expect(catalogNetwork.products).toHaveLength(2)
      await page
        .locator('.admin-notice-dialog')
        .getByRole('button', { name: 'Entendido', exact: true })
        .click()
      catalogNetwork.catalogReadUnavailable = false
      catalogNetwork.failCatalogAfterImport = false
      await preview
        .getByRole('button', { name: /Confirmar e importar 1/ })
        .click()
    }
    await expect(preview).not.toBeVisible()
    await expect(page.locator('.admin-notice-dialog')).toContainText(
      '1 producto importado',
    )
    const expectedWrites = scenario === 'retry-after-disconnect' ? 2 : 1
    const writes = catalogNetwork.calls.filter(
      ({ name }) => name === 'admin_import_products',
    )
    expect(writes).toHaveLength(expectedWrites)
    if (writes.length === 2) expect(writes[1].body).toEqual(writes[0].body)
    expect(catalogNetwork.products).toHaveLength(2)
    const imported = catalogNetwork.products.find(
      ({ product }) => product.slug === `qa-aroma-${scenario}`,
    )!
    expect(imported.active).toBe(false)
    expect(imported.product.variants).toHaveLength(2)
    expect(imported.product.variants[1].sku).toBe(
      `QA-AROMA-${scenario}-100`.toUpperCase(),
    )
    if (scenario === 'canonical')
      expect(
        catalogNetwork.calls.filter(
          ({ name }) => name === 'admin_catalog_page',
        ),
      ).toHaveLength(readsBefore)
  })
}

test('QA-AROMA Excel no confirma ni sobrescribe una importación modificada tras perder la respuesta', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({
        marca: 'Maison de Test',
        nombre: 'QA-AROMA Conflicto',
        slug: 'qa-aroma-conflicto',
        sku: 'QA-AROMA-CONFLICTO-50',
      }),
    ]),
  )
  catalogNetwork.importResponseLost = true
  catalogNetwork.failCatalogAfterImport = true
  await preview.getByRole('button', { name: /Confirmar e importar 1/ }).click()
  await expect(page.locator('.admin-notice-dialog')).toBeVisible()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Entendido', exact: true })
    .click()
  const imported = catalogNetwork.products.find(
    ({ product }) => product.slug === 'qa-aroma-conflicto',
  )!
  imported.product.variants[0].priceCents = 35000
  catalogNetwork.productVersions.set(imported.product.id, 2)
  catalogNetwork.catalogReadUnavailable = false
  catalogNetwork.failCatalogAfterImport = false
  await preview.getByRole('button', { name: /Confirmar e importar 1/ }).click()
  await expect(page.locator('.admin-notice-dialog')).toBeVisible()
  await expect(page.locator('.admin-notice-dialog')).not.toContainText(
    'producto importado',
  )
  expect(imported.product.variants[0].priceCents).toBe(35000)
  expect(catalogNetwork.products).toHaveLength(2)
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'admin_import_products'),
  ).toHaveLength(2)
})

test('QA-AROMA Excel remoto importa 500 productos y 1000 presentaciones con una sola RPC y paginación persistente', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  test.setTimeout(120_000)
  await signInAdmin(page, supabaseNetwork)
  await openImport(page)
  const records = Array.from({ length: 500 }, (_, index) =>
    [50, 100].map((ml) =>
      importRecord({
        marca: 'Maison de Test',
        nombre: `QA-AROMA RPC 500 ${index + 1}`,
        slug: `qa-aroma-rpc-500-${index + 1}`,
        sku: `QA-AROMA-RPC-${index + 1}-${ml}`,
        tamano_ml: ml,
        precio_soles: ml === 50 ? '159.90' : '199,90',
      }),
    ),
  ).flat()
  const preview = await reviewFile(
    page,
    await importFile(records, undefined, 'QA-AROMA-500-remoto.xlsx'),
  )
  await expect(preview).toContainText('1000 filas correctas')
  const readsBefore = catalogNetwork.calls.filter(
    ({ name }) => name === 'admin_catalog_page',
  ).length
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 500 productos',
      exact: true,
    })
    .click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '500 productos importados',
  )
  expect(catalogNetwork.products).toHaveLength(501)
  const imports = catalogNetwork.calls.filter(
    ({ name }) => name === 'admin_import_products',
  )
  expect(imports).toHaveLength(1)
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'admin_catalog_page'),
  ).toHaveLength(readsBefore)
  const payload = imports[0].body.p_records as AdminProduct[]
  expect(payload).toHaveLength(500)
  expect(payload.flatMap(({ product }) => product.variants)).toHaveLength(1000)
  expect(
    new Set(
      payload.flatMap(({ product }) => product.variants.map(({ id }) => id)),
    ).size,
  ).toBe(1000)
  expect(
    payload.every(
      (record) =>
        !record.active &&
        !record.product.image &&
        record.detail.gallery.length === 0,
    ),
  ).toBe(true)
  expect(JSON.stringify(payload)).not.toMatch(/data:image|https?:\/\/|r2\.dev/)
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await page.reload()
  await page
    .getByLabel('Buscar producto, marca o SKU')
    .fill('QA-AROMA-RPC-500-100')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--products tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table--products tbody tr')).toContainText(
    'QA-AROMA RPC 500 500',
  )
})

test('el editor del Home no descarga el catálogo público hasta abrir el recomendador', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  const begin = catalogNetwork.calls.length
  await page.goto('/admin/home')
  await expect(page.locator('main h1')).toHaveText('Home')
  const publicReads = () =>
    catalogNetwork.calls
      .slice(begin)
      .filter((call) =>
        ['catalog_products', 'catalog_brands', 'catalog_settings'].includes(
          call.name,
        ),
      )
  expect(publicReads()).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Encuentra tu perfume ideal', exact: true })
    .click()
  await expect.poll(() => publicReads().length).toBe(3)
  await expect(
    page.getByRole('button', {
      name: 'Encuentra tu perfume ideal',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('el Home guarda contenido versionado, Complementos y marca destacada sin archivos en SQL', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/home')
  await page.getByRole('button', { name: /Para él, para ella/ }).click()
  await page
    .getByLabel('Mostrar Complementos en la tienda', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Marcas', exact: true }).click()
  await page
    .getByRole('combobox', { name: /^Marca destacada/ })
    .selectOption(remoteBrandId)
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )
  const call = catalogNetwork.calls.find(
    ({ name }) => name === 'admin_save_home',
  )!
  expect(call.body).toMatchObject({
    p_complements_enabled: true,
    p_featured_brand_id: remoteBrandId,
    p_expected_version: 0,
    p_expected_settings_version: 1,
  })
  expect(JSON.stringify(call.body)).not.toContain('data:')
  expect(call.body).not.toHaveProperty('homeContent')
  expect(call.body).toHaveProperty('p_content.hero')
  expect(catalogNetwork.complementsEnabled).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: /Para él, para ella/ }).click()
  await expect(
    page.getByLabel('Mostrar Complementos en la tienda', { exact: true }),
  ).toBeChecked()
})

test('un registro parcial de marcas distingue los errores sin perder las marcas creadas', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  catalogNetwork.rejectedBrandNames = ['Nombre rechazado']
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/marcas')
  await page
    .getByRole('button', { name: 'Registrar marcas', exact: true })
    .click()
  const editor = page.locator('.admin-brand-registration')
  await editor
    .getByLabel('Marcas (una por línea)', { exact: true })
    .fill('Marca aceptada\nNombre rechazado')
  await editor
    .getByRole('button', { name: 'Revisar marcas', exact: true })
    .click()
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  const summary = page.locator('#brand-registration-result')
  await expect(summary).toContainText('1 marca creada.')
  await expect(summary).toContainText('1 sin registrar.')
  await summary.getByText('Ver detalle del registro', { exact: true }).click()
  await expect(summary).toContainText(
    'No se pudo registrar esta marca. Revisa su nombre.',
  )
  expect(catalogNetwork.brands.map(({ name }) => name)).toContain(
    'Marca aceptada',
  )
  expect(catalogNetwork.brands.map(({ name }) => name)).not.toContain(
    'Nombre rechazado',
  )
})

test('las marcas repetidas se revisan antes de guardar y las nuevas usan UUID del servidor', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/marcas')
  await page
    .getByRole('button', { name: 'Registrar marcas', exact: true })
    .click()
  const editor = page.locator('.admin-brand-registration')
  await editor
    .getByLabel('Marcas (una por línea)', { exact: true })
    .fill('Maison de Test\nMaison Nouvelle\nMAISON NOUVELLE')
  await editor
    .getByRole('button', { name: 'Revisar marcas', exact: true })
    .click()
  await expect(editor).toContainText('Ya existe')
  await expect(editor).toContainText('Repetida')
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  await expect(editor).toHaveCount(0)
  expect(
    catalogNetwork.brands.filter(({ name }) => name === 'Maison Nouvelle'),
  ).toHaveLength(1)
  expect(
    catalogNetwork.calls.find(({ name }) => name === 'admin_register_brands')
      ?.body.p_names,
  ).toEqual(['Maison de Test', 'Maison Nouvelle', 'MAISON NOUVELLE'])
  await page.goto('/admin/productos/nuevo')
  await expect(
    page
      .getByLabel('Marca', { exact: true })
      .getByRole('option', { name: 'Maison Nouvelle', exact: true }),
  ).toBeAttached()
  await page.goto('/tienda')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('#nav-trigger-marcas').click()
  await expect(
    page
      .locator('#nav-panel-marcas')
      .getByRole('link', { name: 'Maison Nouvelle', exact: true }),
  ).toHaveAttribute('href', '/tienda?marca=maison-nouvelle')
  // Public refresh also follows renames and deactivation; no static copy of
  // names or slugs is retained by the menu.
  const added = catalogNetwork.brands.find(
    (brand) => brand.name === 'Maison Nouvelle',
  )!
  added.name = 'Maison Renommée'
  added.slug = 'maison-renommee'
  await page.reload()
  await page.locator('#nav-trigger-marcas').click()
  await expect(
    page
      .locator('#nav-panel-marcas')
      .getByRole('link', { name: 'Maison Renommée', exact: true }),
  ).toHaveAttribute('href', '/tienda?marca=maison-renommee')
  await expect(
    page
      .locator('#nav-panel-marcas')
      .getByRole('link', { name: 'Maison Nouvelle', exact: true }),
  ).toHaveCount(0)
  added.active = false
  await page.reload()
  await page.locator('#nav-trigger-marcas').click()
  await expect(
    page
      .locator('#nav-panel-marcas')
      .getByRole('link', { name: 'Maison Renommée', exact: true }),
  ).toHaveCount(0)
})

test('las ofertas se guardan mediante su comando remoto sin alterar el precio habitual', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/promociones?vista=ofertas')
  await page
    .getByRole('button', { name: 'Crear oferta de producto', exact: true })
    .click()
  const editor = page.locator('.admin-offers-editor')
  await expect(editor).toBeVisible()
  await editor.getByLabel('Producto').selectOption(remoteProductId)
  await editor.getByLabel('Descuento (%)', { exact: true }).fill('20')
  await editor
    .getByRole('button', { name: 'Guardar y crear otra', exact: true })
    .click()
  await expect(editor.getByLabel('Producto')).toHaveValue('')
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'admin_save_offer'),
  ).toHaveLength(1)
  expect(catalogNetwork.products[0].product.variants[0].priceCents).toBe(42000)
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.goto('/producto/fleur-de-test')
  await expect(
    page.locator('.product-selected-price .price-display__current'),
  ).toContainText('336')
  await expect(page.locator('.product-selected-price del')).toContainText('420')
  await page.getByRole('button', { name: 'Reseñas', exact: true }).click()
  const reviews = page.getByRole('region', { name: 'Reseñas', exact: true })
  await expect(
    reviews.getByRole('heading', { name: 'Aún no hay reseñas publicadas' }),
  ).toBeVisible()
  await expect(reviews.getByLabel(/Valoración promedio:/)).toHaveCount(0)
  await expect(reviews.getByRole('alert')).toHaveCount(0)
})

test('una oferta abierta conserva su versión aunque el catálogo se actualice antes de guardar', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  catalogNetwork.products[0].product.discount = {
    active: true,
    type: 'percent',
    value: 10,
    startsAt: '',
    endsAt: '',
  }
  await signInAdmin(page, supabaseNetwork)
  await page.goto('/admin/promociones?vista=ofertas')
  await page.getByRole('button', { name: 'Editar oferta', exact: true }).click()
  const editor = page.locator('.admin-offers-editor')
  await editor.getByLabel('Descuento (%)', { exact: true }).fill('20')
  catalogNetwork.products[0].product.discount = {
    active: true,
    type: 'percent',
    value: 15,
    startsAt: '',
    endsAt: '',
  }
  catalogNetwork.productVersions.set(remoteProductId, 2)
  await page.evaluate(async () => {
    const path = '/src/services/catalog-admin-service.ts'
    const { loadAdminCatalog } = (await import(
      path
    )) as typeof import('../src/services/catalog-admin-service')
    await loadAdminCatalog(true)
  })
  await expect(editor.getByLabel('Descuento (%)', { exact: true })).toHaveValue(
    '20',
  )
  await editor
    .getByRole('button', { name: 'Guardar oferta', exact: true })
    .click()
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(({ name }) => name === 'admin_save_offer')
          .length,
    )
    .toBe(1)
  expect(
    catalogNetwork.calls.find(({ name }) => name === 'admin_save_offer')!.body
      .p_expected_version,
  ).toBe(1)
  await expect(page.getByRole('alertdialog')).toContainText(
    'Otra persona modificó este registro.',
  )
  expect(catalogNetwork.products[0].product.discount?.value).toBe(15)
})

test('un cambio de propietario durante el guardado no confirma datos privados en la sesión anterior', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Respuesta tardía de otro propietario')
  let release!: () => void
  catalogNetwork.holdWrite = new Promise<void>((resolve) => {
    release = resolve
  })
  const save = page.locator('.admin-editor-actions button[type="submit"]')
  await save.click()
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(({ name }) => name === 'admin_save_product')
          .length,
    )
    .toBe(1)
  await expect(save).toBeDisabled()
  supabaseNetwork.currentUserId = customerB
  const replacement = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) throw new Error('Expected isolated SDK session')
    return JSON.parse(raw) as { access_token: string; user: { id: string } }
  }, fixtureStorageKey)
  const [tokenHeader, tokenBody, signature] =
    replacement.access_token.split('.')
  const claims = JSON.parse(
    Buffer.from(tokenBody, 'base64url').toString('utf8'),
  )
  replacement.access_token = `${tokenHeader}.${Buffer.from(JSON.stringify({ ...claims, sub: customerB })).toString('base64url')}.${signature}`
  replacement.user.id = customerB
  await page.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: fixtureStorageKey, session: replacement },
  )
  release()
  await expect(save).toBeEnabled()
  await expect(page).not.toHaveURL(/guardado=1/)
  await expect
    .poll(async () =>
      (await clientProducts(page)).some(
        ({ name }) => name === 'Respuesta tardía de otro propietario',
      ),
    )
    .toBe(false)
})

test('un fallo de almacenamiento conserva las fotografías y no envía base64 a PostgreSQL', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await page.route('**/api/admin/media/upload', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'storage', message: 'Isolated media outage' },
    }),
  )
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await page
    .getByLabel('Reemplazar foto principal del producto', { exact: true })
    .setInputFiles('public/images/cedre-960.webp')
  await expect(
    page.locator('.admin-product-upload-item > img').first(),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    'No pudimos terminar de guardar las fotografías.',
  )
  await expect(
    page.locator('.admin-product-upload-item > img').first(),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page).not.toHaveURL(/guardado=1/)
  expect(
    catalogNetwork.calls.filter(({ name }) => name === 'admin_save_product'),
  ).toHaveLength(0)
  expect(await clientProducts(page)).toEqual([
    { id: remoteProductId, name: 'Fleur de Test' },
  ])
})

test('cerrar sesión y volver con el mismo administrador descarta el guardado pendiente de la sesión anterior', async ({
  page,
  supabaseNetwork,
  catalogNetwork,
}) => {
  await signInAdmin(page, supabaseNetwork)
  await page.goto(`/admin/productos/${remoteProductId}`)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Fleur de Test',
  )
  let release!: () => void
  catalogNetwork.holdWrite = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = page.evaluate(async () => {
    const source = '/src/services/catalog-admin-service.ts'
    const { catalogAdminService } = (await import(
      source
    )) as typeof import('../src/services/catalog-admin-service')
    const record = catalogAdminService.getSnapshot().products[0]
    try {
      await catalogAdminService.saveProduct({
        ...record,
        product: { ...record.product, name: 'Respuesta anterior al cierre' },
      })
      return { saved: true }
    } catch {
      return { saved: false }
    }
  })
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(({ name }) => name === 'admin_save_product')
          .length,
    )
    .toBe(1)
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = (await import(
      source
    )) as typeof import('../src/services/auth-service')
    await authService.signOut()
    await authService.signIn({
      email: 'ana@example.invalid',
      password: 'Una-clave-Segura-123!',
    })
  })
  release()
  expect(await pending).toEqual({ saved: false })
  expect(
    (await clientProducts(page)).some(
      ({ name }) => name === 'Respuesta anterior al cierre',
    ),
  ).toBe(false)
})

const viewports = [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

async function openSelectionProbe(page: Page) {
  await page.route('**/__selection-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Selection probe</title>',
    }),
  )
  await page.goto('/__selection-probe')
}

async function selectionProbe(page: Page) {
  return page.evaluate(async (variantId) => {
    const source = '/src/services/selection-catalog-service.ts'
    const { loadSelectionProducts } = (await import(
      source
    )) as typeof import('../src/services/selection-catalog-service')
    try {
      await loadSelectionProducts('cart', [variantId])
      return true
    } catch {
      return false
    }
  }, remoteVariantId)
}

async function confirmedSelectionCount(page: Page) {
  return page.evaluate(async () => {
    const source = '/src/services/storefront-repository.ts'
    const { storefrontRepository } = (await import(
      source
    )) as typeof import('../src/services/storefront-repository')
    return storefrontRepository.peekSnapshot().products.length
  })
}

test('La selección acotada de checkout vacío no descarga productos', async ({
  page,
  catalogNetwork,
}) => {
  await page.goto('/checkout')
  await expect(page.locator('.checkout-page')).toBeVisible()
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products_by_ids'),
  ).toBe(false)
  expect(await confirmedSelectionCount(page)).toBe(0)
})

test('La selección acotada de checkout hidrata sólo variantes del carrito', async ({
  page,
  catalogNetwork,
}) => {
  const unrelated = structuredClone(catalogNetwork.products[0])
  unrelated.product.id = '30000000-0000-4000-8000-000000000002'
  unrelated.product.slug = 'otro-perfume'
  unrelated.product.variants[0].id = '40000000-0000-4000-8000-000000000002'
  catalogNetwork.products.push(unrelated)
  await page.addInitScript((variantId) => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId, quantity: 1 }],
      }),
    )
  }, remoteVariantId)
  await page.goto('/checkout')
  await expect(page.locator('.checkout-page')).toBeVisible()
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
  const reads = catalogNetwork.calls.filter(
    ({ name }) => name === 'catalog_products_by_ids',
  )
  expect(reads).toHaveLength(1)
  expect(reads[0].body).toEqual({
    p_product_ids: [],
    p_variant_ids: [remoteVariantId],
  })
  expect(await confirmedSelectionCount(page)).toBe(1)
})

test('La selección acotada solapa fetch y espera familias dinámicas antes de publicar', async ({
  page,
  context,
  catalogNetwork,
}) => {
  catalogNetwork.olfactoryFamilies = [
    {
      value: 'resina-especial',
      label: 'Resina especial',
      aromaLabel: 'Resina especial',
      active: true,
      aliases: [],
    },
  ]
  catalogNetwork.products[0].product.olfactoryFamilies = ['resina-especial']
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route(
    `${origin}/rest/v1/rpc/catalog_settings`,
    async (route) => {
      await held
      await route.fallback()
    },
  )
  await openSelectionProbe(page)
  const pending = selectionProbe(page)
  await expect
    .poll(
      () =>
        catalogNetwork.calls.filter(
          ({ name }) => name === 'catalog_products_by_ids',
        ).length,
    )
    .toBe(1)
  expect(await confirmedSelectionCount(page)).toBe(0)
  release()
  expect(await pending).toBe(true)
  expect(await confirmedSelectionCount(page)).toBe(1)
})

test('La selección acotada invalidada en vuelo espera metadata y productos nuevos', async ({
  page,
  context,
  catalogNetwork,
}) => {
  catalogNetwork.olfactoryFamilies = [
    {
      value: 'resina-especial',
      label: 'Resina especial',
      aromaLabel: 'Resina especial',
      active: true,
      aliases: [],
    },
  ]
  catalogNetwork.products[0].product.olfactoryFamilies = ['resina-especial']
  let releaseOld!: () => void
  let releaseNew!: () => void
  const oldMetadata = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const newMetadata = new Promise<void>((resolve) => {
    releaseNew = resolve
  })
  let metadataReads = 0
  await context.route(
    `${origin}/rest/v1/rpc/catalog_settings`,
    async (route) => {
      metadataReads++
      await (metadataReads === 1 ? oldMetadata : newMetadata)
      await route.fallback()
    },
  )
  await openSelectionProbe(page)
  const firstIds = page.waitForResponse(
    `${origin}/rest/v1/rpc/catalog_products_by_ids`,
  )
  const pending = selectionProbe(page)
  await (await firstIds).finished()
  catalogNetwork.products[0].product.name = 'Selección nueva confirmada'
  await page.evaluate(async () => {
    const source = '/src/services/storefront-repository.ts'
    const { invalidateSupabaseStorefront } = (await import(
      source
    )) as typeof import('../src/services/storefront-repository')
    invalidateSupabaseStorefront()
  })
  releaseOld()
  await expect.poll(() => metadataReads).toBe(2)
  expect(await confirmedSelectionCount(page)).toBe(0)
  releaseNew()
  expect(await pending).toBe(true)
  expect(await confirmedSelectionCount(page)).toBe(1)
  expect(
    await page.evaluate(async () => {
      const source = '/src/services/storefront-repository.ts'
      const { storefrontRepository } = (await import(
        source
      )) as typeof import('../src/services/storefront-repository')
      return storefrontRepository.peekSnapshot().products[0].product.name
    }),
  ).toBe('Selección nueva confirmada')
  expect(
    catalogNetwork.calls.filter(
      ({ name }) => name === 'catalog_products_by_ids',
    ),
  ).toHaveLength(2)
})

for (const invalidations of [1, 2]) {
  test(`La selección acotada renueva metadata resuelta antes de ${invalidations} invalidaciones con IDs pendientes`, async ({
    page,
    context,
    catalogNetwork,
  }) => {
    const gates = Array.from({ length: invalidations + 1 }, () => {
      let release!: () => void
      const wait = new Promise<void>((resolve) => {
        release = resolve
      })
      return { wait, release }
    })
    let idReads = 0
    await context.route(
      `${origin}/rest/v1/rpc/catalog_products_by_ids`,
      async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback()
        const index = idReads++
        const items = structuredClone(catalogNetwork.products)
        await gates[index].wait
        await route.fulfill({ headers, json: { items } })
      },
    )
    await openSelectionProbe(page)
    const pending = selectionProbe(page)
    // Complete the first metadata projection while its matching IDs stay slow.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const source = '/src/services/storefront-repository.ts'
          const { storefrontRepository } = (await import(
            source
          )) as typeof import('../src/services/storefront-repository')
          return storefrontRepository.peekSnapshot().brands.length
        }),
      )
      .toBe(1)
    for (let revision = 1; revision <= invalidations; revision++) {
      await expect.poll(() => idReads).toBe(revision)
      const family = `resina-nueva-${revision}`
      catalogNetwork.olfactoryFamilies = [
        {
          value: family,
          label: family,
          aromaLabel: family,
          active: true,
          aliases: [],
        },
      ]
      catalogNetwork.products[0].product.olfactoryFamilies = [family]
      catalogNetwork.products[0].product.name = `Selección generación ${revision}`
      await page.evaluate(async () => {
        const source = '/src/services/storefront-repository.ts'
        const { invalidateSupabaseStorefront } = (await import(
          source
        )) as typeof import('../src/services/storefront-repository')
        invalidateSupabaseStorefront()
      })
      gates[revision - 1].release()
    }
    await expect.poll(() => idReads).toBe(invalidations + 1)
    expect(await confirmedSelectionCount(page)).toBe(0)
    gates[invalidations].release()
    expect(await pending).toBe(true)
    expect(
      await page.evaluate(async () => {
        const source = '/src/services/storefront-repository.ts'
        const { storefrontRepository } = (await import(
          source
        )) as typeof import('../src/services/storefront-repository')
        return storefrontRepository
          .peekSnapshot()
          .products.map(({ product }) => ({
            name: product.name,
            families: product.olfactoryFamilies,
          }))
      }),
    ).toEqual([
      {
        name: `Selección generación ${invalidations}`,
        families: [`resina-nueva-${invalidations}`],
      },
    ])
    expect(
      catalogNetwork.calls.filter(({ name }) => name === 'catalog_settings'),
    ).toHaveLength(2)
  })
}

test('La selección acotada no confirma tras error de metadata y permite reintentar', async ({
  page,
  context,
  catalogNetwork,
}) => {
  let fail = true
  await context.route(
    `${origin}/rest/v1/rpc/catalog_settings`,
    async (route) => {
      if (!fail) return route.fallback()
      await route.fulfill({ status: 503, headers, json: { code: 'PGRST000' } })
    },
  )
  await openSelectionProbe(page)
  expect(await selectionProbe(page)).toBe(false)
  expect(await confirmedSelectionCount(page)).toBe(0)
  fail = false
  expect(await selectionProbe(page)).toBe(true)
  expect(await confirmedSelectionCount(page)).toBe(1)
  expect(
    catalogNetwork.calls.some(({ name }) => name === 'catalog_products'),
  ).toBe(false)
})

test('La selección acotada no cachea errores de IDs y permite reintentar', async ({
  page,
  context,
  catalogNetwork,
}) => {
  let fail = true
  await context.route(
    `${origin}/rest/v1/rpc/catalog_products_by_ids`,
    async (route) => {
      if (!fail) return route.fallback()
      await route.fulfill({ status: 503, headers, json: { code: 'PGRST000' } })
    },
  )
  await openSelectionProbe(page)
  expect(await selectionProbe(page)).toBe(false)
  expect(await confirmedSelectionCount(page)).toBe(0)
  fail = false
  expect(await selectionProbe(page)).toBe(true)
  expect(await confirmedSelectionCount(page)).toBe(1)
  expect(
    catalogNetwork.calls.filter(
      ({ name }) => name === 'catalog_products_by_ids',
    ),
  ).toHaveLength(1)
})

for (const viewport of viewports) {
  test(`catálogo remoto y formularios conservan proporciones en ${viewport.name}`, async ({
    page,
    supabaseNetwork,
    catalogNetwork,
  }) => {
    void catalogNetwork
    await page.setViewportSize(viewport)
    const capture = async (name: string) => {
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true)
      await page.screenshot({
        path: `artifacts/supabase-catalog/screenshots/${name}-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
    await page.goto('/tienda')
    await expect(page.locator('.product-card')).toHaveCount(1)
    await capture('store')
    await signInAdmin(page, supabaseNetwork)
    await page.goto('/admin/productos')
    await expect(page.locator('.admin-products-page')).toBeVisible()
    await capture('admin-products')
    await page.goto('/admin/marcas')
    await expect(
      page.getByRole('heading', { name: 'Marcas', exact: true }),
    ).toBeVisible()
    await capture('admin-brands')
    await page.goto(`/admin/productos/${remoteProductId}`)
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
      'Fleur de Test',
    )
    await capture('admin-product')
  })
}
