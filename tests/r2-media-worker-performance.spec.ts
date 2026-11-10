import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createMediaHandler } from '../worker/media-handler'
import {
  decodeFixture,
  mediaTestOrigin,
  mediaWorkerHarness,
  uploadRequest,
  type ManagedMediaAsset,
} from './r2-media-worker-fixture'

/** Controlled local I/O model, never an Internet or production load test. */
const simulatedDependencyMs = 4
const delay = () =>
  new Promise<void>((resolve) => setTimeout(resolve, simulatedDependencyMs))

function percentile(samples: number[], rank: number) {
  const ordered = [...samples].sort((a, b) => a - b)
  return Number(
    ordered[
      Math.min(ordered.length - 1, Math.ceil(ordered.length * rank) - 1)
    ].toFixed(3),
  )
}

test('media read benchmark records local p50/p95 and dependency counts for 20/100 operations', async () => {
  const testInfo = test.info()
  const fixture = mediaWorkerHarness()
  const initial = createMediaHandler({
    fetch: fixture.upstream,
    decodeWebp: decodeFixture,
  })
  const uploaded = await initial(
    await uploadRequest({ widths: [960] }),
    fixture.environment,
  )
  expect(uploaded?.status).toBe(200)
  const { asset } = (await uploaded!.json()) as { asset: ManagedMediaAsset }
  const nativeHead = fixture.bucket.head.bind(fixture.bucket)
  const nativeGet = fixture.bucket.get.bind(fixture.bucket)
  fixture.bucket.head = async (key) => {
    await delay()
    return nativeHead(key)
  }
  fixture.bucket.get = async (key, options) => {
    await delay()
    return nativeGet(key, options)
  }
  let decoderCalls = 0
  const handle = createMediaHandler({
    fetch: async (input, init) => {
      await delay()
      return fixture.upstream(input, init)
    },
    async decodeWebp() {
      decoderCalls++
      throw new Error('Public reads must not load the image decoder')
    },
  })
  const url = `${mediaTestOrigin}${asset.src}`
  const stored = fixture.bucket.objects.get(asset.src.slice('/media/'.length))!
  const results: Array<Record<string, number | string>> = []
  for (const count of [20, 100]) {
    for (const mode of ['GET', 'HEAD', 'conditional GET'] as const) {
      fixture.calls.length = 0
      fixture.bucket.heads.length = 0
      fixture.bucket.reads.length = 0
      const samples: number[] = []
      for (let index = 0; index < count; index++) {
        const started = performance.now()
        const response = await handle(
          new Request(url, {
            method: mode === 'HEAD' ? 'HEAD' : 'GET',
            ...(mode === 'conditional GET'
              ? { headers: { 'If-None-Match': stored.httpEtag } }
              : {}),
          }),
          fixture.environment,
        )
        expect(response?.status).toBe(mode === 'conditional GET' ? 304 : 200)
        const body = await response!.arrayBuffer()
        expect(body.byteLength > 0).toBe(mode === 'GET')
        samples.push(performance.now() - started)
      }
      const metadataRpc = fixture.calls.filter(
        (call) => call.name === 'media_public_asset',
      ).length
      expect(metadataRpc).toBe(count)
      expect(fixture.bucket.heads.length).toBe(mode === 'HEAD' ? count : 0)
      expect(fixture.bucket.reads.length).toBe(mode === 'HEAD' ? 0 : count)
      results.push({
        mode,
        count,
        simulatedDependencyMs,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        metadataRpc,
        r2Head: fixture.bucket.heads.length,
        r2Get: fixture.bucket.reads.length,
      })
    }
  }
  expect(decoderCalls).toBe(0)
  expect(fixture.bucket.writes).toHaveLength(1)
  const report = {
    scope:
      'Local Node harness; sequential reads; simulated 4 ms per RPC/R2 operation; no network',
    decoderCalls,
    results,
  }
  const phase = process.env.MEDIA_BENCHMARK_PHASE
  if (phase === 'baseline' || phase === 'optimized') {
    const directory = 'artifacts/performance-media-audit-2026-10-29'
    await mkdir(directory, { recursive: true })
    await writeFile(
      `${directory}/${phase}.json`,
      JSON.stringify(report, null, 2),
    )
  }
  await testInfo.attach('media-local-benchmark.json', {
    contentType: 'application/json',
    body: JSON.stringify(report, null, 2),
  })
})
