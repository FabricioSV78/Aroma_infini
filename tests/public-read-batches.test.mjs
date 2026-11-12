import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { readPublicBatches } from '../src/services/public-read-batches.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('Public read waves cap concurrency at four and retain input order after out-of-order replies', async () => {
  const pending = Array.from({ length: 10 }, deferred),
    reads = []
  const result = readPublicBatches(
    pending.map((_, i) => i),
    (i) => {
      reads.push(i)
      return pending[i].promise
    },
  )
  assert.deepEqual(reads, [0, 1, 2, 3])
  for (const i of [3, 2, 1]) pending[i].resolve(i)
  await setImmediate()
  assert.deepEqual(reads, [0, 1, 2, 3])
  pending[0].resolve(0)
  await setImmediate()
  assert.deepEqual(reads, [0, 1, 2, 3, 4, 5, 6, 7])
  for (const i of [7, 6, 5, 4]) pending[i].resolve(i)
  await setImmediate()
  assert.equal(reads.length, 10)
  pending[9].resolve(9)
  pending[8].resolve(8)
  assert.deepEqual(
    await result,
    Array.from({ length: 10 }, (_, i) => i),
  )
})

test('A failed public read drains its wave and never starts later batches', async () => {
  const pending = Array.from({ length: 6 }, deferred),
    reads = []
  const failure = new Error('isolated-public-read')
  let settled = false
  const result = readPublicBatches(
    pending.map((_, i) => i),
    (i) => {
      reads.push(i)
      return pending[i].promise
    },
  )
  const assertion = assert.rejects(result, failure).then(() => {
    settled = true
  })
  pending[0].reject(failure)
  await setImmediate()
  assert.equal(settled, false)
  for (const i of [3, 2, 1]) pending[i].resolve(i)
  await assertion
  assert.deepEqual(reads, [0, 1, 2, 3])
})

test('Empty public selections perform no reads and synchronous transport errors still drain the wave', async () => {
  assert.deepEqual(
    await readPublicBatches([], () => {
      throw Error('unexpected read')
    }),
    [],
  )
  const reads = []
  await assert.rejects(
    readPublicBatches([0, 1, 2, 3, 4], (i) => {
      reads.push(i)
      if (i === 0) throw Error('sync failure')
      return Promise.resolve(i)
    }),
    /sync failure/,
  )
  assert.deepEqual(reads, [0, 1, 2, 3])
})
