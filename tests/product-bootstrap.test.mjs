import assert from 'node:assert/strict'
import test from 'node:test'
import { inertJson } from '../src/domain/inert-json.ts'

test('anonymous product bootstrap is bounded and cannot close its inert script element', () => {
  const value = { name: '</script><script>alert(1)</script>\u2028\u2029 & $&' }
  const json = inertJson(
    {
      version: 1,
      project: 'https://example.supabase.co',
      slug: 'perfume',
      value,
    },
    512,
  )
  assert(!json.includes('<'))
  assert(!json.includes('\u2028') && !json.includes('\u2029'))
  assert.deepEqual(JSON.parse(json), {
    version: 1,
    project: 'https://example.supabase.co',
    slug: 'perfume',
    value,
  })
  assert.equal(inertJson('é'.repeat(400), 512), undefined)
})
