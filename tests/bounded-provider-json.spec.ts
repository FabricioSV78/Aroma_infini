import { expect, test } from '@playwright/test'
import { boundedProviderJson } from '../supabase/functions/_shared/bounded-provider-json'

test('Auth upstream JSON accepts small valid documents and rejects invalid UTF-8', async () => {
  expect(
    await boundedProviderJson(
      Response.json({ result: true }),
      AbortSignal.timeout(1000),
    ),
  ).toEqual({ result: true })
  await expect(
    boundedProviderJson(
      new Response(new Uint8Array([0xff, 0xfe])),
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow()
})

for (const declared of [false, true])
  test(`Auth upstream JSON rejects oversized responses without waiting for cancellation (declared=${declared})`, async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(512 * 1024 + 1))
      },
      cancel() {
        cancelled = true
        return new Promise<void>(() => {})
      },
    })
    await expect(
      boundedProviderJson(
        new Response(stream, {
          headers: declared ? { 'Content-Length': '524289' } : {},
        }),
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow()
    expect(cancelled).toBe(true)
  })

test('Auth upstream body stops when its request deadline expires', async () => {
  const controller = new AbortController()
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
  const pending = boundedProviderJson(new Response(stream), controller.signal)
  await expect.poll(() => stream.locked).toBe(true)
  controller.abort()
  await expect(pending).rejects.toThrow('upstream_response_invalid')
  expect(cancelled).toBe(true)
})
