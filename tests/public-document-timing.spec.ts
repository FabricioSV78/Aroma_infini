import { expect, test } from '@playwright/test'
import { publicDocumentTiming } from '../worker/public-document-timing'

const origin = 'https://abcdefghijklmnopqrst.supabase.co'
const clientId = '11111111-2222-4333-8444-555555555555'
const upstreamId = '66666666-7777-4888-8999-aaaaaaaaaaaa'
const init = { method: 'POST', headers: { apikey: 'must-not-expose', 'X-Client-Info': `aroma-public-read/${clientId}` }, body: '{"never":"expose-body"}' }

test('document diagnostics correlate only fixed anonymous reads and preserve the response stream', async () => {
  const response = new Response('body-not-consumed', { headers: { 'sb-request-id': upstreamId } })
  const diagnostic = publicDocumentTiming('staging', origin, async (_url, received) => {
    expect(received).toBe(init)
    return response
  })
  expect(await diagnostic.fetch(origin + '/rest/v1/rpc/catalog_browse', init)).toBe(response)
  expect(response.bodyUsed).toBe(false)
  expect(JSON.parse(diagnostic.header()!)).toEqual([{ operation: 'catalog_browse', clientId, upstreamId, pending: false, headersMs: expect.any(Number) }])
  expect(diagnostic.header()).not.toMatch(/must-not-expose|expose-body|supabase|apikey/)
})

test('pending document diagnostics do not delay headers for a slow streamed projection', async () => {
  let resolve!: (value: Response) => void
  const diagnostic = publicDocumentTiming('staging', origin, () => new Promise<Response>(done => { resolve = done }))
  const reading = diagnostic.fetch(origin + '/rest/v1/rpc/catalog_home_context', init)
  expect(JSON.parse(diagnostic.header()!)).toEqual([{ operation: 'catalog_home_context', clientId, pending: true }])
  resolve(Response.json(null, { headers: { 'sb-request-id': upstreamId } }))
  await reading
  expect(JSON.parse(diagnostic.header()!)[0].upstreamId).toBe(upstreamId)
})

test('production retains identical transport and adds no document diagnostic metadata', async () => {
  const transport: typeof fetch = async () => Response.json(null)
  const diagnostic = publicDocumentTiming('production', origin, transport)
  expect(diagnostic.fetch).toBe(transport)
  await diagnostic.fetch(origin + '/rest/v1/rpc/catalog_browse', init)
  expect(diagnostic.header()).toBeNull()
})

test('private operations, credentials, foreign origins and invalid IDs never enter document diagnostics', async () => {
  const diagnostic = publicDocumentTiming('staging', origin, async () => Response.json(null, { headers: { 'sb-request-id': 'malicious-provider-text' } }))
  for (const [url, options] of [
    [origin + '/rest/v1/rpc/admin_product_list', init],
    ['https://foreign.invalid/rest/v1/rpc/catalog_browse', init],
    [origin + '/rest/v1/rpc/catalog_browse', { ...init, headers: { ...init.headers, Authorization: 'Bearer never-expose' } }],
    [origin + '/rest/v1/rpc/catalog_browse', { ...init, headers: { 'X-Client-Info': 'untrusted' } }],
  ] as const) await diagnostic.fetch(url, options)
  expect(diagnostic.header()).toBeNull()
  await diagnostic.fetch(origin + '/rest/v1/rpc/catalog_browse', init)
  expect(diagnostic.header()).not.toContain('malicious-provider-text')
})

test('document diagnostic metadata is bounded to eight public operations', async () => {
  const diagnostic = publicDocumentTiming('staging', origin, async () => Response.json(null))
  for (let i = 0; i < 20; i++) await diagnostic.fetch(origin + '/rest/v1/rpc/catalog_browse', init)
  expect(JSON.parse(diagnostic.header()!)).toHaveLength(8)
  expect(diagnostic.header()!.length).toBeLessThan(2048)
})
