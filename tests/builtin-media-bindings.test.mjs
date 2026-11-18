import assert from 'node:assert/strict'
import { test } from 'node:test'
import inventory from '../src/content/media-default-inventory.json' with { type: 'json' }
import { buildBuiltinMediaBindings } from '../src/domain/builtin-media-bindings.ts'

function indexed() {
  return new Map(buildBuiltinMediaBindings().map((binding) => [binding.path, binding]))
}

test('the semantic manifest covers the complete physical inventory exactly once', () => {
  const bindings = buildBuiltinMediaBindings()
  assert.deepEqual(
    bindings.map(({ path }) => path).sort(),
    inventory.map(({ path }) => path).sort(),
  )
  assert.equal(new Set(bindings.map(({ path }) => path)).size, bindings.length)
  for (const { uses } of bindings) {
    assert.equal(new Set(uses.map(({ kind, key }) => `${kind}:${key}`)).size, uses.length)
  }
  assert.deepEqual(buildBuiltinMediaBindings(), bindings)
})

test('Hero variants use stable fallback indices independently of presentation order', () => {
  const bindings = buildBuiltinMediaBindings()
  for (let index = 0; index < 5; index++) {
    for (const orientation of ['desktop', 'mobile']) {
      const matches = bindings.filter(({ uses }) => uses.some(
        ({ key }) => key === `hero.default.${index}.${orientation}`,
      ))
      assert.equal(matches.length, 3)
      for (const match of matches) {
        const use = match.uses.find(({ key }) => key === `hero.default.${index}.${orientation}`)
        assert.deepEqual(use.metadata, { owner: 'hero', fallbackIndex: index, orientation })
        assert.ok(match.path.includes(`-${orientation}-`))
      }
    }
  }
})

test('a category replacement owns both its original preview and four-column crops', () => {
  const bindings = buildBuiltinMediaBindings()
  for (const id of ['hombre', 'mujer', 'unisex', 'complementos']) {
    const uses = bindings.flatMap(({ uses }) => uses.filter(({ key }) => key === `category.${id}`))
    assert.deepEqual(new Set(uses.map(({ metadata }) => metadata.layout)), new Set([3, 4]))
    assert.ok(uses.every(({ metadata }) => metadata.category === id))
  }
})

test('replacing a Home photograph does not retire independent SEO or finder references', () => {
  const bindings = indexed()
  assert.deepEqual(
    bindings.get('/images/hero-v2-lumiere-desktop-1536.webp').uses.map(({ key }) => key),
    ['hero.default.0.desktop', 'seo.home'],
  )
  assert.deepEqual(
    bindings.get('/images/discovery-bois-1536.webp').uses.map(({ key }) => key),
    ['category.hombre', 'seo.brands'],
  )
  assert.deepEqual(
    bindings.get('/images/olfactory-cedre.webp').uses.map(({ key }) => key),
    ['finder.desktop', 'finder.family.amaderado'],
  )
  assert.deepEqual(
    bindings.get('/images/olfactory-cedre-thumb-160.webp').uses.map(({ key }) => key),
    ['finder.family.amaderado'],
  )
})

test('the film keeps distinct mobile fallback conditions and never owns a mobile video', () => {
  const bindings = indexed()
  assert.deepEqual(
    bindings.get('/videos/perfume-editorial-wide.webp').uses.map(({ metadata }) => metadata.role),
    ['desktopPoster', 'mobilePosterFallback'],
  )
  assert.equal(
    bindings.get('/videos/perfume-editorial-mobile.webp').uses[0].metadata.role,
    'mobilePoster',
  )
  assert.deepEqual(bindings.get('/videos/perfume-editorial-mobile.mp4').uses, [])
  assert.equal(bindings.get('/videos/perfume-editorial-mobile.mp4').classification, 'legacy-unused')
})

test('all nine site placements are editable owners, including the identity logo', () => {
  const keys = new Set(buildBuiltinMediaBindings().flatMap(({ uses }) =>
    uses.filter(({ kind }) => kind === 'site').map(({ key }) => key),
  ))
  assert.deepEqual(keys, new Set([
    'identity.logo',
    'auth.customer.desktop',
    'auth.customer.mobile',
    'seo.brands',
    'about.hero.desktop',
    'about.hero.mobile',
    'seo.catalog',
    'seo.home',
    'about.story',
  ]))
})

test('catalog references and unknown resources cannot be mistaken for unowned disposable files', () => {
  const bindings = indexed()
  for (const path of ['/images/ambre-480.webp', '/images/olfactory-figue.webp', '/images/olfactory-iris.webp']) {
    assert.equal(bindings.get(path).classification, 'catalog-reference')
    assert.deepEqual(bindings.get(path).uses, [])
  }
  const unknown = buildBuiltinMediaBindings([
    ...inventory,
    { path: '/images/future-unreviewed.webp', section: 'Future' },
  ]).find(({ path }) => path === '/images/future-unreviewed.webp')
  assert.equal(unknown.classification, 'unknown')
  assert.deepEqual(unknown.uses, [])
})

test('incomplete or duplicate inventories fail closed instead of seeding unsafe reference data', () => {
  assert.throws(
    () => buildBuiltinMediaBindings(inventory.filter(({ path }) => path !== '/brand/logo-on-light.svg')),
    /missing from the inventory/,
  )
  assert.throws(
    () => buildBuiltinMediaBindings([...inventory, inventory[0]]),
    /duplicate paths/,
  )
})
