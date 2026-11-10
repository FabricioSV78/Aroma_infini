import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECKOUT_ATTEMPT_LIFETIME,
  CHECKOUT_ATTEMPT_STORAGE_KEY,
  clearCheckoutAttempt,
  fingerprintCheckoutAttempt,
  rememberCheckoutAttempt,
  restoreCheckoutAttempt,
} from '../src/services/checkout-attempt.ts'

const now = Date.UTC(2026, 10, 8)
function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}
function operation(suffix = '1') {
  return {
    operationId: `10000000-0000-4000-8000-00000000000${suffix}`,
    trackingToken: suffix.repeat(64),
    checkout: {
      lines: [
        { variantId: '20000000-0000-4000-8000-000000000001', quantity: 1 },
      ],
      contact: {
        firstName: 'Private Firstname',
        email: 'private@example.invalid',
      },
      address: { street: 'Private street 123' },
      alternateRecipient: null,
      deliveryMethod: 'courier',
      promotionCode: null,
      expectedQuoteHash: 'a'.repeat(64),
    },
  }
}

test('a retry receipt survives a module reload without persisting checkout, identity or Auth', async () => {
  const storage = memoryStorage(),
    first = operation()
  const fingerprint = await fingerprintCheckoutAttempt(
    first,
    'demo-account',
    'private-owner-uuid',
  )
  rememberCheckoutAttempt(fingerprint, first, storage, now)
  const saved = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  for (const privateValue of [
    'Private Firstname',
    'private@example.invalid',
    'Private street 123',
    'private-owner-uuid',
    'contact',
    'address',
    'access_token',
    'refresh_token',
  ])
    assert.equal(saved.includes(privateValue), false)
  const fresh = operation('2')
  fresh.checkout.expectedQuoteHash = 'b'.repeat(64)
  assert.equal(
    await fingerprintCheckoutAttempt(
      fresh,
      'demo-account',
      'private-owner-uuid',
    ),
    fingerprint,
  )
  assert.deepEqual(
    restoreCheckoutAttempt(fingerprint, fresh, storage, now + 1),
    first,
  )
})

test('another owner or checkout mode never resumes a previous receipt', async () => {
  const storage = memoryStorage(),
    first = operation(),
    fresh = operation('2')
  const key = await fingerprintCheckoutAttempt(first, 'demo-account', 'owner-a')
  rememberCheckoutAttempt(key, first, storage, now)
  for (const [mode, owner] of [
    ['demo-account', 'owner-b'],
    ['guest', 'owner-a'],
    ['demo-account', null],
  ]) {
    const other = await fingerprintCheckoutAttempt(fresh, mode, owner)
    assert.notEqual(other, key)
    assert.equal(restoreCheckoutAttempt(other, fresh, storage, now), fresh)
  }
})

for (const change of [
  'contact',
  'address',
  'quantity',
  'coupon',
  'recipient',
  'delivery',
])
  test(`a changed ${change} creates a distinct intention`, async () => {
    const storage = memoryStorage(),
      first = operation(),
      fresh = operation('2')
    const key = await fingerprintCheckoutAttempt(first, 'guest', null)
    rememberCheckoutAttempt(key, first, storage, now)
    if (change === 'contact') fresh.checkout.contact.firstName = 'Other name'
    if (change === 'address') fresh.checkout.address.street = 'Other address'
    if (change === 'quantity') fresh.checkout.lines[0].quantity = 2
    if (change === 'coupon') fresh.checkout.promotionCode = 'COUPON'
    if (change === 'recipient')
      fresh.checkout.alternateRecipient = {
        name: 'Other recipient',
        dni: '12345678',
      }
    if (change === 'delivery') fresh.checkout.deliveryMethod = 'motorizado'
    const changedKey = await fingerprintCheckoutAttempt(fresh, 'guest', null)
    assert.notEqual(changedKey, key)
    assert.equal(restoreCheckoutAttempt(changedKey, fresh, storage, now), fresh)
  })

test('expired and malformed receipts are removed rather than trusted', async () => {
  const storage = memoryStorage(),
    first = operation(),
    fresh = operation('2')
  const key = await fingerprintCheckoutAttempt(first, 'guest', null)
  for (const value of [
    '{}',
    '[]',
    '{invalid',
    JSON.stringify({ version: 1, operationId: first.operationId }),
  ]) {
    storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, value)
    assert.equal(restoreCheckoutAttempt(key, fresh, storage, now), fresh)
    assert.equal(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null)
  }
  rememberCheckoutAttempt(key, first, storage, now)
  assert.equal(
    restoreCheckoutAttempt(
      key,
      fresh,
      storage,
      now + CHECKOUT_ATTEMPT_LIFETIME,
    ),
    fresh,
  )
  assert.equal(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null)
})

test('a retry does not extend the receipt lifetime', async () => {
  const storage = memoryStorage(),
    first = operation()
  const key = await fingerprintCheckoutAttempt(first, 'guest', null)
  rememberCheckoutAttempt(key, first, storage, now)
  rememberCheckoutAttempt(key, first, storage, now + 1000)
  assert.equal(
    JSON.parse(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)).createdAt,
    now,
  )
})

test('success clears only its own receipt and identical later purchases remain possible', async () => {
  const storage = memoryStorage(),
    first = operation(),
    fresh = operation('2')
  const key = await fingerprintCheckoutAttempt(first, 'guest', null)
  rememberCheckoutAttempt(key, fresh, storage, now)
  clearCheckoutAttempt(first.operationId, storage)
  assert.equal(
    restoreCheckoutAttempt(key, first, storage, now).operationId,
    fresh.operationId,
  )
  clearCheckoutAttempt(fresh.operationId, storage)
  assert.equal(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null)
  assert.equal(restoreCheckoutAttempt(key, first, storage, now), first)
})

test('blocked browser storage preserves the current in-memory command', async () => {
  const blocked = {
    getItem() {
      throw new Error('Blocked')
    },
    setItem() {
      throw new Error('Blocked')
    },
    removeItem() {
      throw new Error('Blocked')
    },
  }
  const first = operation(),
    key = await fingerprintCheckoutAttempt(first, 'guest', null)
  assert.equal(restoreCheckoutAttempt(key, first, blocked, now), first)
  assert.doesNotThrow(() => rememberCheckoutAttempt(key, first, blocked, now))
  assert.doesNotThrow(() => clearCheckoutAttempt(undefined, blocked))
})
