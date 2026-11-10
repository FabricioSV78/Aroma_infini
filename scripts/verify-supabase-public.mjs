import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Anonymous, read-only HTTP checks. Never loads CLI credentials or creates users.
// POST reads plus explicitly unauthorized admin probes; no authorized mutation.
const env = { ...process.env }
for (const filename of ['.env.local', '.env.example']) {
  let contents
  try {
    contents = await readFile(
      new URL(`../${filename}`, import.meta.url),
      'utf8',
    )
  } catch (error) {
    if (error.code === 'ENOENT') continue
    throw error
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(VITE_SUPABASE_(?:URL|PUBLISHABLE_KEY))\s*=\s*(.*?)\s*$/,
    )
    if (match && !env[match[1]])
      env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
const url = new URL(env.VITE_SUPABASE_URL || 'https://invalid.local')
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
assert(
  url.protocol === 'https:' && /^[a-z]{20}\.supabase\.co$/.test(url.hostname),
  'A hosted development Supabase URL is required.',
)
if (key.startsWith('eyJ')) {
  assert.equal(
    JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role,
    'anon',
    'Only an anonymous public key is accepted.',
  )
} else {
  assert(
    key.startsWith('sb_publishable_'),
    'Only a publishable key is accepted.',
  )
}
let passed = 0
let publishedProductId = null
async function check(
  name,
  route,
  { schema = 'api', body, withKey = true, expected = 200, validate } = {},
) {
  const headers = { 'Accept-Profile': schema }
  if (withKey) headers.apikey = key
  if (body !== undefined) {
    headers['Content-Profile'] = schema
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(new URL(`/rest/v1/${route}`, url), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await response.json()
  assert(
    [expected].flat().includes(response.status),
    `${name}: unexpected HTTP ${response.status} / ${data?.code ?? 'no code'}`,
  )
  if (validate) validate(data)
  passed++
  // Do not log response bodies, headers, keys, profiles or tokens.
  console.log(`PASS: ${name} (HTTP ${response.status})`)
}
await check('Public catalog RPC', 'rpc/catalog_products', {
  body: {},
  validate: (data) => {
    assert(Array.isArray(data.items))
    assert(Number.isInteger(data.total))
    assert(data.total >= 0)
    publishedProductId =
      data.items.find((item) =>
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
          String(item?.product?.id),
        ),
      )?.product.id ?? null
  },
})
await check(
  'Public Home contains only published fields and verified references',
  'rpc/home_document',
  {
    body: {},
    validate: (data) => {
      assert.deepEqual(Object.keys(data).sort(), [
        'content',
        'media',
        'mediaAssets',
        'version',
      ])
      assert(Number.isSafeInteger(data.version) && data.version >= 0)
      assert(Array.isArray(data.mediaAssets))
      assert(!JSON.stringify(data).includes('data:'))
    },
  },
)
await check(
  'Anonymous cannot read administrative Home',
  'rpc/admin_home_document',
  {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check('Anonymous cannot save Home', 'rpc/admin_save_home', {
  body: {
    p_media: {},
    p_content: {},
    p_expected_version: 0,
    p_expected_settings_version: 1,
    p_complements_enabled: false,
  },
  expected: [401, 403],
  validate: (data) => assert.equal(data.code, '42501'),
})
await check('Public brand RPC', 'rpc/catalog_brands', {
  body: {},
  validate: (data) => assert(Array.isArray(data)),
})
await check(
  'Public Home catalog exposes bounded cards and minimal profiles',
  'rpc/catalog_home_context',
  {
    body: {},
    validate: (data) => {
      assert(Array.isArray(data.items) && data.items.length <= 4)
      assert(Array.isArray(data.profiles) && data.profiles.length <= 10000)
      for (const profile of data.profiles) {
        assert.deepEqual(Object.keys(profile).sort(), [
          'brandId',
          'family',
          'finderAvailable',
          'intensity',
          'occasion',
          'olfactoryFamilies',
        ])
        assert.equal(typeof profile.finderAvailable, 'boolean')
      }
      assert(!('productVersions' in data) && !('settingsVersion' in data))
    },
  },
)
await check(
  'Public brand previews expose only names and cover manifests',
  'rpc/catalog_brand_previews',
  {
    body: {},
    validate: (data) => {
      assert.deepEqual(Object.keys(data).sort(), ['brands', 'mediaAssets'])
      assert(Array.isArray(data.brands) && Array.isArray(data.mediaAssets))
      for (const brand of data.brands)
        assert.deepEqual(Object.keys(brand).sort(), [
          'id',
          'name',
          'previewImage',
          'slug',
        ])
    },
  },
)
await check(
  'Public catalog settings contain no administrative fields',
  'rpc/catalog_settings',
  {
    body: {},
    validate: (data) => {
      assert.deepEqual(Object.keys(data).sort(), [
        'featuredBrandId',
        'features',
        'homeAnnouncement',
        'homeVersion',
        'olfactoryFamilies',
        'shipping',
        'shippingVersion',
      ])
      assert.deepEqual(Object.keys(data.features), ['complementsEnabled'])
      assert.equal(typeof data.features.complementsEnabled, 'boolean')
      assert(Array.isArray(data.olfactoryFamilies))
      for (const family of data.olfactoryFamilies) {
        assert.deepEqual(Object.keys(family).sort(), [
          'active',
          'aliases',
          'aromaLabel',
          'label',
          'value',
        ])
        assert.equal(typeof family.active, 'boolean')
      }
    },
  },
)
await check(
  'Public browse is bounded and contains only public metadata',
  'rpc/catalog_browse',
  {
    body: { p_query: {}, p_page_size: 12 },
    validate: (data) => {
      assert(Array.isArray(data.items) && data.items.length <= 12)
      assert(Number.isInteger(data.total))
      assert(Array.isArray(data.olfactoryFamilies))
      assert(!('productVersions' in data))
      assert(!('settingsVersion' in data))
    },
  },
)
await check('Browse cannot request oversized pages', 'rpc/catalog_browse', {
  body: { p_page_size: 13 },
  expected: 400,
})
await check(
  'Empty selected products returns no catalog snapshot',
  'rpc/catalog_products_by_ids',
  {
    body: { p_product_ids: [], p_variant_ids: [] },
    validate: (data) => assert.deepEqual(data, { items: [], total: 0 }),
  },
)
await check(
  'Missing product context exposes no recommendations',
  'rpc/catalog_product_context',
  {
    body: { p_slug: 'sql-security-probe-missing-product' },
    validate: (data) => {
      assert.equal(data.record, null)
      assert.deepEqual(data.recommendations, [])
    },
  },
)
await check(
  'Anonymous cannot read family management metadata',
  'rpc/admin_olfactory_families',
  {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check(
  'Anonymous cannot read administrative catalog',
  'rpc/admin_catalog_page',
  {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check('Missing product returns null', 'rpc/catalog_product', {
  body: { p_slug: 'sql-security-probe-missing-product' },
  validate: (data) => assert.equal(data, null),
})
await check('Catalog page-size limit', 'rpc/catalog_products', {
  body: { p_limit: 101 },
  expected: 400,
})
await check(
  'Public business settings omit administrative audit metadata',
  'rpc/site_settings',
  {
    body: {},
    validate: (data) => {
      assert.deepEqual(Object.keys(data).sort(), ['data', 'version'])
      assert(Number.isSafeInteger(data.version) && data.version >= 0)
      if (data.data === null) {
        assert.equal(data.version, 0)
        return
      }
      assert.deepEqual(Object.keys(data.data).sort(), [
        'business',
        'contact',
        'demonstration',
        'policies',
        'social',
      ])
      assert.equal(typeof data.data.demonstration, 'boolean')
      for (const [group, fields] of Object.entries({
        business: ['address', 'legalName', 'name', 'taxId'],
        contact: ['email', 'hours', 'whatsapp'],
        policies: ['privacy', 'returns', 'terms'],
        social: ['facebook', 'instagram', 'tiktok'],
      })) {
        assert.deepEqual(Object.keys(data.data[group]).sort(), fields)
        assert(
          Object.values(data.data[group]).every(
            (value) => typeof value === 'string',
          ),
        )
      }
    },
  },
)
await check(
  'Anonymous cannot save business settings',
  'rpc/admin_save_site_settings',
  {
    body: { p_data: {}, p_expected_version: -1 },
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)

function validatePublicReviews(data) {
  assert.deepEqual(Object.keys(data).sort(), [
    'average',
    'count',
    'distribution',
    'items',
    'page',
    'pageSize',
    'total',
  ])
  assert(Array.isArray(data.items) && data.items.length <= 3)
  assert.equal(data.page, 1)
  assert.equal(data.pageSize, 3)
  assert(Number.isSafeInteger(data.count) && data.count >= 0)
  assert.equal(data.total, data.count)
  assert.deepEqual(Object.keys(data.distribution).sort(), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ])
  assert(
    Object.values(data.distribution).every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ),
  )
  assert.equal(
    Object.values(data.distribution).reduce((sum, count) => sum + count, 0),
    data.count,
  )
  if (data.count === 0) assert.equal(data.average, null)
  else
    assert(
      Number.isFinite(data.average) && data.average >= 1 && data.average <= 5,
    )
  for (const review of data.items) {
    // A review's own public id is expected. Owner ids, profile contacts,
    // publication internals and authentication metadata must not be projected.
    assert.deepEqual(Object.keys(review).sort(), [
      'author',
      'comment',
      'date',
      'id',
      'rating',
      'sizeMl',
      'title',
    ])
    assert.equal(typeof review.author, 'string')
    assert(!review.author.includes('@'))
    assert(
      Number.isInteger(review.rating) &&
        review.rating >= 1 &&
        review.rating <= 5,
    )
    assert.equal(typeof review.title, 'string')
    assert.equal(typeof review.comment, 'string')
    assert(/^\d{4}-\d{2}-\d{2}$/.test(review.date))
    assert(Number.isSafeInteger(review.sizeMl) && review.sizeMl >= 0)
  }
}
if (publishedProductId) {
  await check(
    'Published product reviews expose no owner or contact identifiers',
    'rpc/product_reviews',
    {
      body: { p_product_id: publishedProductId, p_page: 1 },
      validate: validatePublicReviews,
    },
  )
} else {
  console.log(
    'INFO: No published product is available; public review privacy remains covered by the missing-product and SQL contract checks.',
  )
}
await check(
  'Missing products expose no reviews or ratings',
  'rpc/product_reviews',
  {
    body: { p_product_id: '00000000-0000-4000-8000-000000000000', p_page: 1 },
    validate: (data) => {
      validatePublicReviews(data)
      assert.deepEqual(data.items, [])
      assert.equal(data.count, 0)
    },
  },
)
await check(
  'Anonymous cannot read a customer-owned review',
  'rpc/customer_product_review',
  {
    body: { p_product_id: null },
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check('Anonymous cannot submit a review', 'rpc/submit_product_review', {
  // Deliberately invalid even if permission boundaries regress.
  body: { p_product_id: null, p_rating: 0, p_title: '', p_comment: '' },
  expected: [401, 403],
  validate: (data) => assert.equal(data.code, '42501'),
})
await check(
  'Anonymous cannot list private complaint records',
  'rpc/admin_complaints',
  {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check(
  'Anonymous cannot update a complaint',
  'rpc/admin_update_complaint',
  {
    body: { p_id: null, p_expected_version: -1, p_status: 'invalid' },
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check(
  'Direct complaint creation is server-only',
  'rpc/create_complaint',
  {
    body: {
      p_operation_id: null,
      p_receipt_secret: '',
      p_input: {},
      p_client_hash: '',
    },
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  },
)
await check(
  'Shipping is public without coupon lists or customer data',
  'rpc/commerce_settings',
  {
    body: {},
    validate: (data) => {
      assert.deepEqual(Object.keys(data).sort(), [
        'shipping',
        'shippingVersion',
      ])
      assert(
        Number.isSafeInteger(data.shippingVersion) && data.shippingVersion >= 0,
      )
    },
  },
)
await check('A reference alone reveals no guest order', 'rpc/order_tracking', {
  body: { p_reference: 'AI-0000000000000000' },
  validate: (data) => assert.equal(data, null),
})
for (const rpc of [
  'admin_commerce_settings',
  'customer_orders',
  'customer_favorites',
  'admin_orders',
]) {
  await check(`Anonymous cannot call ${rpc}`, `rpc/${rpc}`, {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  })
}
await check('Order creation is server-only', 'rpc/create_simulated_order', {
  body: {
    p_operation_id: '50000000-0000-4000-8000-000000000001',
    p_tracking_token: 'a'.repeat(64),
    p_checkout: {},
  },
  expected: [401, 403],
  validate: (data) => assert.equal(data.code, '42501'),
})
await check('Anonymous cannot modify favorites', 'rpc/set_customer_favorite', {
  body: {
    p_product_id: '50000000-0000-4000-8000-000000000001',
    p_selected: true,
    p_expected_version: 0,
  },
  expected: [401, 403],
  validate: (data) => assert.equal(data.code, '42501'),
})
for (const rpc of ['current_actor', 'get_profile', 'get_address']) {
  await check(`Anonymous cannot call ${rpc}`, `rpc/${rpc}`, {
    body: {},
    expected: [401, 403],
    validate: (data) => assert.equal(data.code, '42501'),
  })
}
for (const schema of ['app', 'private', 'public']) {
  await check(`${schema} is not exposed`, 'profiles?select=*', {
    schema,
    expected: 406,
    validate: (data) => assert.equal(data.code, 'PGRST106'),
  })
}
await check('API exposes no products table', 'products?select=*', {
  expected: 404,
  validate: (data) => assert.equal(data.code, 'PGRST205'),
})
await check('API exposes no favorites table', 'customer_favorites?select=*', {
  expected: 404,
  validate: (data) => assert.equal(data.code, 'PGRST205'),
})
for (const table of ['product_reviews', 'complaints', 'site_settings']) {
  await check(`API exposes no ${table} table`, `${table}?select=*`, {
    expected: 404,
    validate: (data) => assert.equal(data.code, 'PGRST205'),
  })
}
await check('Missing API key is denied', 'rpc/catalog_brands', {
  body: {},
  withKey: false,
  expected: 401,
})

// Account functions live on a different origin from the frontend. A working
// localhost check alone must not hide an unusable recovery screen on staging.
const worker = ts.parseConfigFileTextToJson(
  'wrangler.jsonc',
  await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
)
assert(!worker.error, 'Worker configuration must be valid JSONC.')
const staging = worker.config.env?.staging?.vars
if (staging?.SUPABASE_URL === url.origin) {
  assert(
    staging.CHECKOUT_SIMULATION_ORIGIN,
    'An explicit staging origin is required.',
  )
  const stagingOrigin = new URL(staging.CHECKOUT_SIMULATION_ORIGIN)
  assert.equal(stagingOrigin.protocol, 'https:')
  assert.equal(stagingOrigin.pathname, '/')
  assert(
    !stagingOrigin.username &&
      !stagingOrigin.password &&
      !stagingOrigin.search &&
      !stagingOrigin.hash,
  )
  for (const [name, init, status] of [
    ['Complaint Worker refuses GET', { method: 'GET' }, 405],
    [
      'Complaint Worker refuses foreign origins before reading a form',
      {
        method: 'POST',
        headers: {
          Origin: 'https://outside.example.invalid',
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      403,
    ],
  ]) {
    const response = await fetch(new URL('/api/complaints', stagingOrigin), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    })
    assert.equal(
      response.status,
      status,
      `${name}: unexpected HTTP status; the current Worker may not yet be deployed.`,
    )
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    const data = await response.json()
    assert.deepEqual(Object.keys(data).sort(), ['code', 'message'])
    passed++
    console.log(`PASS: ${name} (HTTP ${response.status})`)
  }
  const origins = [
    ...new Set([
      ...String(staging.MEDIA_ALLOWED_ORIGINS || '')
        .split(',')
        .filter(Boolean),
      staging.CHECKOUT_SIMULATION_ORIGIN,
    ]),
  ]
  for (const name of ['account-recovery', 'change-email']) {
    for (const origin of [...origins, 'https://outside.example.invalid']) {
      const allowed = origins.includes(origin)
      const response = await fetch(new URL(`/functions/v1/${name}`, url), {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'apikey,authorization,content-type',
        },
        signal: AbortSignal.timeout(20000),
      })
      assert.equal(
        response.status,
        allowed ? 204 : 403,
        `${name}: unexpected preflight status for ${allowed ? 'allowed' : 'foreign'} origin.`,
      )
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        allowed ? origin : null,
      )
      passed++
      console.log(
        `PASS: ${name} CORS ${allowed ? 'declared origin accepted' : 'foreign origin denied'} (HTTP ${response.status})`,
      )
    }
  }
}
console.log(
  `Anonymous hosted API: ${passed} checks passed. No writes, signups or privileged keys used.`,
)
