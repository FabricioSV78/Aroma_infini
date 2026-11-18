import test from 'node:test'
import assert from 'node:assert/strict'

let instance = 0
const fresh = () =>
  import(`../src/services/public-query-cache.ts?seed-case=${instance++}`)

test('document data reuses only the remaining public freshness window', async () => {
  const cache = await fresh(),
    original = Date.now
  let clock = 10000,
    reads = 0
  Date.now = () => clock
  try {
    assert.equal(
      cache.seedInitialPublicQuery('browse:one', 'initial', 2000),
      true,
    )
    const read = async () => {
      reads++
      return 'server'
    }
    assert.equal(await cache.cachedPublicQuery('browse:one', read), 'initial')
    assert.equal(reads, 0)
    clock = 13000
    assert.equal(await cache.cachedPublicQuery('browse:one', read), 'server')
    assert.equal(reads, 1)
  } finally {
    Date.now = original
  }
})

test('expired or malformed document ages cannot seed a public query', async () => {
  const cache = await fresh()
  for (const age of [-1, 5000, Infinity, NaN])
    assert.equal(
      cache.seedInitialPublicQuery(String(age), 'invalid', age),
      false,
    )
})

test('an existing fresh response is never overwritten by initial HTML', async () => {
  const cache = await fresh()
  await cache.cachedPublicQuery('one', async () => 'newer')
  assert.equal(cache.seedInitialPublicQuery('one', 'older', 0), false)
  assert.equal(
    await cache.cachedPublicQuery('one', async () => 'unexpected'),
    'newer',
  )
})

test('an in-flight read remains authoritative over an initial document', async () => {
  const cache = await fresh()
  let release
  const pending = cache.cachedPublicQuery(
    'one',
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  assert.equal(cache.seedInitialPublicQuery('one', 'initial', 0), false)
  release('server')
  assert.equal(await pending, 'server')
})

test('invalidation permanently prevents reusing the initial document epoch', async () => {
  const cache = await fresh()
  cache.invalidatePublicQueryCache()
  assert.equal(cache.seedInitialPublicQuery('one', 'initial', 0), false)
  assert.equal(
    await cache.cachedPublicQuery('one', async () => 'fresh'),
    'fresh',
  )
})
