import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { readAdminPageBatches } from '../src/services/admin-page-batches.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function invalid() {
  throw new Error('Invalid complete snapshot')
}
const count = (page) => page.total

test('The first private page establishes the size before any other read starts', async () => {
  const first = deferred()
  const offsets = []
  const reading = readAdminPageBatches(
    async (offset) => {
      offsets.push(offset)
      if (offset === 0) await first.promise
      return { offset, total: 201 }
    },
    count,
    invalid,
  )
  await setImmediate()
  assert.deepEqual(offsets, [0])
  first.resolve()
  const result = await reading
  assert.deepEqual(
    result.pages.map(({ offset }) => offset),
    [0, 100, 200],
  )
})

test('Four reads at most run together and out-of-order results retain offset order', async () => {
  const gates = new Map(
    Array.from({ length: 9 }, (_, index) => [(index + 1) * 100, deferred()]),
  )
  const offsets = []
  let active = 0,
    peak = 0
  const reading = readAdminPageBatches(
    async (offset) => {
      offsets.push(offset)
      active++
      peak = Math.max(peak, active)
      if (offset) await gates.get(offset).promise
      active--
      return { offset, total: 1000 }
    },
    count,
    invalid,
  )
  await setImmediate()
  assert.deepEqual(offsets, [0, 100, 200, 300, 400])
  for (const offset of [400, 200, 100]) gates.get(offset).resolve()
  await setImmediate()
  assert.equal(offsets.length, 5)
  gates.get(300).resolve()
  await setImmediate()
  assert.deepEqual(offsets, [0, 100, 200, 300, 400, 500, 600, 700, 800])
  for (const offset of [800, 600, 700, 500]) gates.get(offset).resolve()
  await setImmediate()
  gates.get(900).resolve()
  const result = await reading
  assert.equal(peak, 4)
  assert.deepEqual(
    result.pages.map(({ offset }) => offset),
    Array.from({ length: 10 }, (_, index) => index * 100),
  )
})

test('An empty complete snapshot needs exactly one private page', async () => {
  const offsets = []
  const result = await readAdminPageBatches(
    async (offset) => {
      offsets.push(offset)
      return { total: 0 }
    },
    count,
    invalid,
  )
  assert.deepEqual(offsets, [0])
  assert.equal(result.total, 0)
})

test('Malformed or excessive counts cannot trigger additional private reads', async () => {
  for (const total of [undefined, null, -1, 1.5, 10001, Infinity, '1000']) {
    let calls = 0
    await assert.rejects(
      readAdminPageBatches(
        async () => {
          calls++
          return { total }
        },
        count,
        invalid,
      ),
      /Invalid complete snapshot/,
    )
    assert.equal(calls, 1)
  }
})

test('A rejected group drains its existing requests and never starts the next group', async () => {
  const gates = new Map(
    [100, 200, 300, 400].map((offset) => [offset, deferred()]),
  )
  const offsets = []
  let finished = false
  const expected = new Error('One private request failed')
  const outcome = readAdminPageBatches(
    async (offset) => {
      offsets.push(offset)
      if (offset) await gates.get(offset).promise
      return { total: 1000 }
    },
    count,
    invalid,
  )
    .then(
      () => undefined,
      (error) => error,
    )
    .finally(() => {
      finished = true
    })
  await setImmediate()
  gates.get(100).reject(expected)
  await setImmediate()
  assert.equal(finished, false)
  for (const offset of [200, 300, 400]) gates.get(offset).resolve()
  assert.equal(await outcome, expected)
  assert.deepEqual(offsets, [0, 100, 200, 300, 400])
})

test('A changed count rejects the complete result instead of requesting further pages', async () => {
  const offsets = []
  await assert.rejects(
    readAdminPageBatches(
      async (offset) => {
        offsets.push(offset)
        return { total: offset === 300 ? 999 : 1000 }
      },
      count,
      invalid,
    ),
    /Invalid complete snapshot/,
  )
  assert.deepEqual(offsets, [0, 100, 200, 300, 400])
})

test('The existing ten-thousand-record ceiling produces exactly one hundred bounded pages', async () => {
  let active = 0,
    peak = 0
  const offsets = []
  const result = await readAdminPageBatches(
    async (offset) => {
      offsets.push(offset)
      active++
      peak = Math.max(peak, active)
      await setImmediate()
      active--
      return { offset, total: 10000 }
    },
    count,
    invalid,
  )
  assert.equal(result.pages.length, 100)
  assert.equal(offsets.at(-1), 9900)
  assert.equal(peak, 4)
})
