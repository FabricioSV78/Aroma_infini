import test from 'node:test'
import assert from 'node:assert/strict'

test('PEN locale initialization waits for a price and reuses the same formatter', async () => {
  const original = Intl.NumberFormat
  const expected = new original('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  let constructions = 0
  Intl.NumberFormat = new Proxy(original, {
    construct(target, args) {
      constructions++
      return Reflect.construct(target, args)
    },
  })
  try {
    const { formatPEN } = await import('../src/services/currency.ts')
    assert.equal(constructions, 0)
    for (const cents of [0, 100, 1099, 33000, 123456789, -150, 123.4]) {
      assert.equal(formatPEN(cents), expected.format(cents / 100))
    }
    assert.equal(constructions, 1)
  } finally {
    Intl.NumberFormat = original
  }
})
