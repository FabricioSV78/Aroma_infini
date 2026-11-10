import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { expect, test } from '@playwright/test'
import { createComplaintsHandler } from '../worker/complaints-handler'
import {
  emptyComplaint,
  parseComplaintReceipt,
  validateComplaint,
  type ComplaintInput,
  type ComplaintReceipt,
} from '../src/domain/complaints'
import { buildComplaintPdf } from '../src/services/complaint-pdf'

export function complaintFixture(): ComplaintInput {
  return {
    ...emptyComplaint(),
    consumer: {
      name: 'María Núñez',
      documentType: 'DNI',
      documentNumber: '12345678',
      email: 'consumer@example.invalid',
      phone: '999888777',
      address: 'Av. Ejemplo 123, Lima',
      minor: false,
      guardianName: '',
      guardianDocument: '',
    },
    purchase: {
      kind: 'product',
      description: 'Perfume de 50 ml',
      amountCents: 5000,
      orderReference: '',
    },
    detail: 'El paquete llegó dañado.',
    request: 'Solicito la revisión del producto.',
  }
}
export function receiptFixture(): ComplaintReceipt {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    reference: 'LR-2026-000001',
    submittedAt: '2026-11-01T12:00:00.000Z',
    input: complaintFixture(),
    provider: {
      name: 'Aroma Infini',
      legalName: 'Proveedor de demostración',
      taxId: '',
      address: 'Dirección de demostración',
    },
    demonstration: true,
    status: 'received',
    response: '',
    responseChannel: '',
    responseDeliveredAt: null,
    deliveryEvidence: '',
    version: 1,
    history: [],
  }
}
function fixture(
  options: {
    allowed?: boolean
    status?: number
    code?: string
    malformed?: boolean
  } = {},
) {
  const calls: Array<{
    url: string
    body: Record<string, unknown>
    headers: Headers
  }> = []
  const handler = createComplaintsHandler(async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    })
    return options.code
      ? Response.json(
          { code: options.code, message: 'PRIVATE_INTERNAL_DETAILS' },
          { status: options.status ?? 400 },
        )
      : options.malformed
        ? Response.json({ private: 'PRIVATE_INTERNAL_DETAILS' })
        : Response.json(receiptFixture())
  })
  const env = {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_COMMERCE_SECRET_KEY: 'sb_secret_synthetic-do-not-print',
    MEDIA_ALLOWED_ORIGINS: 'http://127.0.0.1:5203',
    CHECKOUT_RATE_LIMITER: {
      limit: async () => ({ success: options.allowed !== false }),
    },
  }
  const request = (
    body: unknown = {
      operationId: '60000000-0000-4000-8000-000000000001',
      receiptSecret: 'a'.repeat(64),
      input: complaintFixture(),
      website: '',
    },
    origin = 'http://127.0.0.1:5203',
  ) =>
    new Request('https://aroma-staging.fixture.workers.dev/api/complaints', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.1',
      },
      body: JSON.stringify(body),
    })
  return { handler, env, calls, request }
}

test('guest submission returns a receipt only after the command confirms and hashes the IP identifier', async () => {
  const f = fixture(),
    response = await f.handler(f.request(), f.env)
  expect(response?.status).toBe(201)
  expect(response?.headers.get('Cache-Control')).toBe('no-store')
  expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
    'http://127.0.0.1:5203',
  )
  const body = await response!.text()
  expect(parseComplaintReceipt(JSON.parse(body)).reference).toBe(
    'LR-2026-000001',
  )
  expect(body).not.toContain('sb_secret_')
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].url).toBe(
    'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/create_complaint',
  )
  expect(f.calls[0].body.p_client_hash).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(f.calls[0].body)).not.toContain('192.0.2.1')
  expect(f.calls[0].headers.get('Authorization')).toBeNull()
})

test('the complaint server key is sent only with a manual redirect policy', async () => {
  const f = fixture()
  let policy: RequestRedirect | undefined
  const handler = createComplaintsHandler(async (_input, init) => {
    policy = init?.redirect
    return Response.json(receiptFixture())
  })
  expect((await handler(f.request(), f.env))?.status).toBe(201)
  expect(policy).toBe('manual')
})
test('foreign origins, honeypots and invalid minors never reach SQL', async () => {
  const foreign = fixture()
  expect(
    (
      await foreign.handler(
        foreign.request(undefined, 'https://foreign.invalid'),
        foreign.env,
      )
    )?.status,
  ).toBe(403)
  expect(foreign.calls).toHaveLength(0)
  for (const mutate of [
    (body: Record<string, unknown>) => {
      body.website = 'spam'
    },
    (body: Record<string, unknown>) => {
      ;(body.input as ComplaintInput).consumer.minor = true
    },
  ]) {
    const f = fixture(),
      body = {
        operationId: '60000000-0000-4000-8000-000000000001',
        receiptSecret: 'a'.repeat(64),
        input: complaintFixture(),
        website: '',
      }
    mutate(body)
    expect((await f.handler(f.request(body), f.env))?.status).toBe(400)
    expect(f.calls).toHaveLength(0)
  }
})
test('GET and bounded malformed requests cannot create records', async () => {
  const f = fixture()
  expect(
    (
      await f.handler(
        new Request('https://aroma-staging.fixture.workers.dev/api/complaints'),
        f.env,
      )
    )?.status,
  ).toBe(405)
  const bad = new Request(
    'https://aroma-staging.fixture.workers.dev/api/complaints',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    },
  )
  expect((await f.handler(bad, f.env))?.status).toBe(400)
  const large = new Request(
    'https://aroma-staging.fixture.workers.dev/api/complaints',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(32769),
    },
  )
  expect((await f.handler(large, f.env))?.status).toBe(413)
  expect((await f.handler(f.request([]), f.env))?.status).toBe(400)
  expect((await f.handler(f.request(null), f.env))?.status).toBe(400)
  expect(f.calls).toHaveLength(0)
})
test('both Worker and durable SQL limits surface clearly without exposing provider errors', async () => {
  const blocked = fixture({ allowed: false })
  expect((await blocked.handler(blocked.request(), blocked.env))?.status).toBe(
    429,
  )
  expect(blocked.calls).toHaveLength(0)
  for (const [code, expected] of [
    ['PT429', 429],
    ['PT409', 409],
    ['22023', 400],
    ['XX000', 503],
  ] as const) {
    const f = fixture({ code }),
      response = await f.handler(f.request(), f.env)
    expect(response?.status).toBe(expected)
    expect(await response!.text()).not.toContain('PRIVATE_INTERNAL_DETAILS')
  }
})
test('unverified success payload is never announced as a saved complaint', async () => {
  const f = fixture({ malformed: true }),
    response = await f.handler(f.request(), f.env)
  expect(response?.status).toBe(503)
  expect(await response!.text()).not.toContain('PRIVATE_INTERNAL_DETAILS')
})

test('an unfinished request is cancelled on deadline without waiting for its cancellation callback', async () => {
  const deadline = new AbortController()
  let cancelled = false
  let upstreamCalls = 0
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{'))
    },
    cancel() {
      cancelled = true
      return new Promise<void>(() => {})
    },
  })
  const handler = createComplaintsHandler(
    async () => {
      upstreamCalls++
      return Response.json(receiptFixture())
    },
    { requestSignal: () => deadline.signal },
  )
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  }
  const response = handler(
    new Request(
      'https://aroma-staging.fixture.workers.dev/api/complaints',
      options,
    ),
    fixture().env,
  )
  await expect.poll(() => stream.locked).toBe(true)
  deadline.abort()
  expect((await response)?.status).toBe(408)
  expect(cancelled).toBe(true)
  expect(upstreamCalls).toBe(0)
})

test('an oversized unfinished body is rejected even when stream cancellation never resolves', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(32769))
    },
    cancel: () => new Promise<void>(() => {}),
  })
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  }
  const f = fixture()
  const response = await f.handler(
    new Request(
      'https://aroma-staging.fixture.workers.dev/api/complaints',
      options,
    ),
    f.env,
  )
  expect(response?.status).toBe(413)
  expect(f.calls).toHaveLength(0)
})

test('an incomplete upstream receipt times out without claiming the complaint was not saved', async () => {
  const deadline = new AbortController()
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{'))
    },
    cancel() {
      cancelled = true
      return new Promise<void>(() => {})
    },
  })
  const handler = createComplaintsHandler(async () => new Response(stream), {
    requestSignal: () => deadline.signal,
  })
  const f = fixture()
  const pending = handler(f.request(), f.env)
  await expect.poll(() => stream.locked).toBe(true)
  deadline.abort()
  const response = await pending
  expect(response?.status).toBe(503)
  expect(await response!.json()).toMatchObject({
    code: 'unavailable',
    message: expect.stringContaining('No pudimos confirmar el registro'),
  })
  expect(cancelled).toBe(true)
})
test('required fields and a minor representative are validated without requiring a web account', () => {
  expect(validateComplaint(complaintFixture())).toEqual({})
  const input = complaintFixture()
  input.consumer.minor = true
  expect(Object.keys(validateComplaint(input))).toEqual([
    'consumer.guardianName',
    'consumer.guardianDocument',
  ])
  input.consumer.guardianName = 'Representante del menor'
  input.consumer.guardianDocument = 'DNI 87654321'
  expect(validateComplaint(input)).toEqual({})
})
test('an invalid receipt identity or unproven delivered response is never treated as confirmed', () => {
  for (const changed of [
    { ...receiptFixture(), id: '-'.repeat(36) },
    { ...receiptFixture(), responseDeliveredAt: 'not-a-date' },
    { ...receiptFixture(), status: 'responded' },
    {
      ...receiptFixture(),
      status: 'responded',
      response: 'Respuesta escrita',
      responseChannel: 'letter',
      responseDeliveredAt: '2026-10-01T12:00:00.000Z',
      deliveryEvidence: 'Constancia 001',
    },
  ])
    expect(() => parseComplaintReceipt(changed)).toThrow()
})
test('the complete receipt and long content produce a readable multipage PDF without truncation', async () => {
  const receipt = receiptFixture()
  receipt.input.detail = 'Descripción extensa del consumidor. '.repeat(140)
  receipt.input.request = 'Pedido concreto del consumidor. '.repeat(100)
  const bytes = await buildComplaintPdf(
    receipt,
    await readFile(
      'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
    ),
  )
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBeGreaterThan(2)
  for (const page of pdf.getPages()) {
    expect(page.getWidth()).toBeCloseTo(595.28, 2)
    expect(page.getHeight()).toBeCloseTo(841.89, 2)
  }
})
