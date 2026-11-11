import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { inspectStaticSvg } from '../src/domain/static-svg.js'

const minimal =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M0 0h100v80H0z"/></svg>'
const whitespace = ' '.repeat(200000)
const bytes = (source) => new TextEncoder().encode(source).buffer

function bounded(operation) {
  const started = performance.now()
  const result = operation()
  assert(
    performance.now() - started < 1000,
    'Static SVG inspection exceeded one second for bounded input.',
  )
  return result
}

test(
  'static SVG attribute scanning accepts long leading whitespace in bounded time',
  { timeout: 5000 },
  () => {
    assert.deepEqual(
      bounded(() =>
        inspectStaticSvg(bytes(minimal.replace('<svg ', '<svg ' + whitespace))),
      ),
      { width: 100, height: 80 },
    )
  },
)

test(
  'static SVG attribute scanning accepts long trailing whitespace without rescanning',
  { timeout: 5000 },
  () => {
    assert.deepEqual(
      bounded(() =>
        inspectStaticSvg(
          bytes(minimal.replace('><path', whitespace + '><path')),
        ),
      ),
      { width: 100, height: 80 },
    )
  },
)

test(
  'static SVG token scanning rejects many unmatched opening brackets in bounded time',
  { timeout: 5000 },
  () => {
    bounded(() =>
      assert.throws(() =>
        inspectStaticSvg(
          bytes(minimal.slice(0, minimal.indexOf('<path')) + '<'.repeat(200000)),
        ),
      ),
    )
  },
)

test(
  'static SVG attributes reject long whitespace followed by malformed tokens in bounded time',
  { timeout: 5000 },
  () => {
    bounded(() =>
      assert.throws(() =>
        inspectStaticSvg(
          bytes(minimal.replace('><path', whitespace + 'nonsense><path')),
        ),
      ),
    )
    bounded(() =>
      assert.throws(() =>
        inspectStaticSvg(
          bytes(minimal.replace('><path', ' ' + 'n'.repeat(200000) + '><path')),
        ),
      ),
    )
  },
)

test('shared static SVG inspection preserves the original identity bytes', async () => {
  const original = await readFile(
    new URL('../public/brand/logo-on-light.svg', import.meta.url),
  )
  const copy = Buffer.from(original)
  assert.deepEqual(inspectStaticSvg(new Uint8Array(original).buffer), {
    width: 774,
    height: 374,
  })
  assert.deepEqual(original, copy)
})
