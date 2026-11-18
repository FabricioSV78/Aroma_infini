import { expect, test } from '@playwright/test'
import { publicReadTiming } from '../worker/public-read-timing'

test('staging correlates a fixed public read without logging credentials or payloads', async () => {
  const id = '019a7bd1-1234-4567-89ab-0123456789ab'
  const log: unknown[][] = []
  const original = console.info
  console.info = (...args: unknown[]) => {
    log.push(args)
  }
  try {
    const timing = publicReadTiming('staging', 'media_public_asset')
    const transport: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBe('fixture-key')
      expect(headers.get('X-Client-Info')).toBe(
        `aroma-public-read/${timing.requestId}`,
      )
      expect(headers.get('traceparent')).toMatch(
        /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/,
      )
      return Response.json(
        { privatePayload: 'must-not-log' },
        {
          headers: {
            'sb-request-id': id,
            'cf-ray': '1234567890abcdef-GRU',
            'x-kong-proxy-latency': '2',
            'x-kong-upstream-latency': '8',
          },
        },
      )
    }
    const response = await timing.fetch(
      transport,
      'https://example.test/fixed',
      { headers: { apikey: 'fixture-key' } },
    )
    await response.json()
    timing.finish('ok')
    timing.finish('error')
    expect(timing.headers().get('X-Aroma-Upstream-Id')).toBe(id)
    expect(timing.headers().get('Server-Timing')).toContain(
      'gateway_upstream;dur=8.0',
    )
    expect(log).toHaveLength(1)
    expect(JSON.stringify(log)).not.toMatch(
      /fixture-key|must-not-log|example.test/,
    )
  } finally {
    console.info = original
  }
})

test('production has no diagnostic headers, logs, or additional transport metadata', async () => {
  const timing = publicReadTiming('production', 'media_public_asset')
  const init: RequestInit = { headers: { apikey: 'fixture' } }
  const transport: typeof fetch = async (_url, received) => {
    expect(received).toBe(init)
    return Response.json(null)
  }
  await timing.fetch(transport, 'https://example.test', init)
  timing.finish('ok')
  expect([...timing.headers()]).toHaveLength(0)
  expect(timing.requestId).toBeUndefined()
})

test('upstream diagnostic fields reject untrusted text and durations', async () => {
  const timing = publicReadTiming('staging', 'media_public_asset')
  await timing.fetch(
    async () =>
      Response.json(null, {
        headers: {
          'sb-request-id': 'untrusted',
          'cf-ray': 'untrusted',
          'x-kong-proxy-latency': '-1',
          'x-kong-upstream-latency': '999999999',
        },
      }),
    'https://example.test',
    {},
  )
  const headers = timing.headers()
  expect(headers.has('X-Aroma-Upstream-Id')).toBe(false)
  expect(headers.get('Server-Timing')).not.toContain('gateway_')
})

test('documented provider phases correlate body, Envoy and PostgREST without treating transaction as SQL alone', async () => {
  const timing = publicReadTiming('staging', 'media_public_asset')
  const saved = console.info
  const logs: unknown[][] = []
  console.info = (...args: unknown[]) => {
    logs.push(args)
  }
  try {
    const response = await timing.fetch(
      async () =>
        Response.json(null, {
          headers: {
            'Server-Timing':
              'jwt;dur=0.1, parse;dur=0.2, plan;dur=0.3, transaction;dur=1000.4, response;dur=0.0, secret;desc="must-not-forward", transaction;dur=9000',
            'x-envoy-upstream-service-time': '1007',
            'x-envoy-attempt-count': '1',
          },
        }),
      'https://example.test',
      {},
    )
    await response.json()
    timing.finish('ok')
    const header = timing.headers().get('Server-Timing')
    expect(header).toContain('manifest_body;dur=')
    expect(header).toContain('envoy_upstream;dur=1007.0')
    expect(header).toContain('pgrst_transaction;dur=1000.4')
    expect(header).not.toMatch(/secret|must-not-forward|9000/)
    expect(JSON.stringify(logs)).toContain('"upstreamAttempts":1')
  } finally {
    console.info = saved
  }
})

test('oversized, negative and nonnumeric timing fields remain unknown', async () => {
  const timing = publicReadTiming('staging', 'media_public_asset')
  await timing.fetch(
    async () =>
      Response.json(null, {
        headers: {
          'Server-Timing': 'transaction;dur=-1, parse;dur=NaN, plan;dur=60001',
          'x-envoy-upstream-service-time': 'not-a-duration',
        },
      }),
    'https://example.test',
    {},
  )
  expect(timing.headers().get('Server-Timing')).not.toMatch(/pgrst_|envoy_/)
})
