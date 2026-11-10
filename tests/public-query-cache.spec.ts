import { expect, test } from '@playwright/test'
import {
  cachedPublicQuery,
  invalidatePublicQueryCache,
} from '../src/services/public-query-cache'

const realNow = Date.now
let now = 1000

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test.beforeEach(() => {
  invalidatePublicQueryCache()
  now = 1000
  Date.now = () => now
})

test.afterEach(() => {
  Date.now = realNow
  invalidatePublicQueryCache()
})

test('Diez lecturas concurrentes comparten una única petición pública', async () => {
  const response = deferred<{ total: number }>()
  let calls = 0
  const read = () => {
    calls++
    return response.promise
  }
  const reads = Array.from({ length: 10 }, () =>
    cachedPublicQuery('same-public-query', read),
  )
  expect(calls).toBe(1)
  const value = { total: 12 }
  response.resolve(value)
  const results = await Promise.all(reads)
  expect(results).toHaveLength(10)
  for (const result of results) expect(result).toBe(value)
  expect(await cachedPublicQuery('same-public-query', read)).toBe(value)
  expect(calls).toBe(1)
})

test('La entrada se reutiliza antes del TTL y se consulta al alcanzar su vencimiento', async () => {
  let calls = 0
  const read = async () => ({ revision: ++calls })
  expect(await cachedPublicQuery('ttl', read, 100)).toEqual({ revision: 1 })
  now = 1099
  expect(await cachedPublicQuery('ttl', read, 100)).toEqual({ revision: 1 })
  expect(calls).toBe(1)
  now = 1100
  expect(await cachedPublicQuery('ttl', read, 100)).toEqual({ revision: 2 })
  expect(calls).toBe(2)
})

test('Invalidar durante una petición pendiente impide devolver su respuesta anterior', async () => {
  const oldResponse = deferred<{ revision: number }>()
  let calls = 0
  const read = () => {
    calls++
    return calls === 1 ? oldResponse.promise : Promise.resolve({ revision: 2 })
  }
  const pending = cachedPublicQuery('pending-invalidation', read)
  expect(calls).toBe(1)
  invalidatePublicQueryCache()
  oldResponse.resolve({ revision: 1 })
  expect(await pending).toEqual({ revision: 2 })
  expect(calls).toBe(2)
})

test('Una invalidación permite una lectura nueva sin que la anterior la elimine', async () => {
  const oldResponse = deferred<{ revision: number }>()
  const newResponse = deferred<{ revision: number }>()
  let calls = 0
  const oldRead = () => {
    calls++
    return calls === 1 ? oldResponse.promise : newResponse.promise
  }
  const first = cachedPublicQuery('replace-pending', oldRead)
  invalidatePublicQueryCache()
  const second = cachedPublicQuery('replace-pending', () => {
    calls++
    return newResponse.promise
  })
  oldResponse.resolve({ revision: 1 })
  await Promise.resolve()
  // Invalidated callers join the current request instead of starting a third.
  expect(calls).toBe(2)
  newResponse.resolve({ revision: 2 })
  expect(await first).toEqual({ revision: 2 })
  expect(await second).toEqual({ revision: 2 })
  expect(
    await cachedPublicQuery('replace-pending', async () => ({ revision: 4 })),
  ).toEqual({ revision: 2 })
  expect(calls).toBe(2)
})

test('Dos invalidaciones consecutivas descartan también el segundo resultado pendiente', async () => {
  const firstResponse = deferred<{ revision: number }>()
  const secondResponse = deferred<{ revision: number }>()
  let calls = 0
  const read = () => {
    calls++
    return calls === 1
      ? firstResponse.promise
      : calls === 2
        ? secondResponse.promise
        : Promise.resolve({ revision: 3 })
  }
  const pending = cachedPublicQuery('double-invalidation', read)
  invalidatePublicQueryCache()
  firstResponse.resolve({ revision: 1 })
  await Promise.resolve()
  expect(calls).toBe(2)
  invalidatePublicQueryCache()
  secondResponse.resolve({ revision: 2 })
  expect(await pending).toEqual({ revision: 3 })
  expect(calls).toBe(3)
  expect(await cachedPublicQuery('double-invalidation', read)).toEqual({
    revision: 3,
  })
  expect(calls).toBe(3)
})

test('Un error no queda cacheado y el siguiente intento puede recuperarse', async () => {
  let calls = 0
  const failure = new Error('Simulated public RPC failure')
  const read = async () => {
    calls++
    if (calls === 1) throw failure
    return { total: 5 }
  }
  await expect(cachedPublicQuery('failed-query', read)).rejects.toBe(failure)
  expect(await cachedPublicQuery('failed-query', read)).toEqual({ total: 5 })
  expect(await cachedPublicQuery('failed-query', read)).toEqual({ total: 5 })
  expect(calls).toBe(2)
})

test('El límite de cuarenta entradas elimina la más antigua sin vaciar las demás', async () => {
  const calls = new Map<string, number>()
  const read = (key: string) => async () => {
    calls.set(key, (calls.get(key) ?? 0) + 1)
    return key
  }
  for (let index = 0; index < 40; index++) {
    const key = `entry-${index}`
    expect(await cachedPublicQuery(key, read(key))).toBe(key)
  }
  expect(await cachedPublicQuery('entry-40', read('entry-40'))).toBe('entry-40')
  expect(await cachedPublicQuery('entry-39', read('entry-39'))).toBe('entry-39')
  expect(calls.get('entry-39')).toBe(1)
  expect(await cachedPublicQuery('entry-0', read('entry-0'))).toBe('entry-0')
  expect(calls.get('entry-0')).toBe(2)
})
