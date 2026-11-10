import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'
import { webpFixture } from './r2-media-worker-fixture'
import { inspectMp4 } from '../worker/media-mp4'

test('native local R2 returns metadata with GET and no stream for matching conditional requests', async () => {
  const bytes = await webpFixture(960)
  const hash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
  const id = '00000000-0000-4000-8000-000000000001'
  const key = `public/dynamic/${id}/${hash}/960.webp`
  const src = `/media/${key}`
  const asset = {
    id,
    src,
    width: 960,
    height: 1200,
    variants: [{ src, width: 960, height: 1200 }],
  }
  const compiled = await build({
    stdin: {
      contents: `
        import { createMediaHandler } from './worker/media-handler';
        const handle = createMediaHandler({
          fetch: async () => Response.json(${JSON.stringify(asset)}),
          decodeWebp: async () => { throw new Error('Decoder is not needed for public reads'); }
        });
        export default { fetch(request, env) { return handle(request, env); } };
      `,
      resolveDir: process.cwd(),
      sourcefile: 'r2-native-test.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  })
  // Wrangler's already installed Miniflare/workerd; in-memory local R2 only.
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-08',
      r2Buckets: ['MEDIA_BUCKET'],
      bindings: {
        SUPABASE_URL: 'https://isolated-media.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test',
        SUPABASE_MEDIA_SECRET_KEY: 'sb_secret_local-test',
        MEDIA_ALLOWED_ORIGINS: '',
      },
    }),
  )
  try {
    const { MEDIA_BUCKET: bucket } = await runtime.getBindings<{
      MEDIA_BUCKET: {
        put(
          key: string,
          bytes: ArrayBuffer,
          options: { httpMetadata: { contentType: string } },
        ): Promise<unknown>
        delete(key: string): Promise<void>
      }
    }>()
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: 'image/webp' },
    })
    const initial = await runtime.dispatchFetch(`https://media.example${src}`)
    expect(initial.status).toBe(200)
    expect(initial.headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(new Uint8Array(await initial.arrayBuffer())).toEqual(
      new Uint8Array(bytes),
    )
    const etag = initial.headers.get('etag')!
    for (const condition of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const unchanged = await runtime.dispatchFetch(
        `https://media.example${src}`,
        {
          headers: { 'If-None-Match': condition },
        },
      )
      expect(unchanged.status).toBe(304)
      expect(await unchanged.text()).toBe('')
      expect(unchanged.headers.get('etag')).toBe(etag)
    }
    const head = await runtime.dispatchFetch(`https://media.example${src}`, {
      method: 'HEAD',
    })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(await head.text()).toBe('')
    const changed = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { 'If-None-Match': '"other"' },
    })
    expect(changed.status).toBe(200)
    expect((await changed.arrayBuffer()).byteLength).toBe(bytes.byteLength)
    await bucket.delete(key)
    expect(
      (await runtime.dispatchFetch(`https://media.example${src}`)).status,
    ).toBe(404)
  } finally {
    await runtime.dispose()
  }
})

test('native local R2 streams verified MP4 ranges, ignores stale If-Range and returns 416 for invalid ranges', async () => {
  const bytes = new Uint8Array(
    await readFile('public/videos/perfume-editorial-mobile.mp4'),
  ).buffer
  const hash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
  const id = '00000000-0000-4000-8000-000000000002'
  const key = `public/dynamic/${id}/${hash}/video.mp4`,
    src = `/media/${key}`
  const asset = {
    id,
    src,
    ...inspectMp4(bytes),
    byteSize: bytes.byteLength,
    mimeType: 'video/mp4',
  }
  const compiled = await build({
    stdin: {
      contents: `import { createMediaHandler } from './worker/media-handler'; const h=createMediaHandler({fetch:async()=>Response.json(${JSON.stringify(asset)}),decodeWebp:async()=>{throw Error('No image decoding')}});export default{fetch:(request,env)=>h(request,env)};`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  })
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-08',
      r2Buckets: ['MEDIA_BUCKET'],
      bindings: {
        SUPABASE_URL: 'https://isolated-media.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test',
        SUPABASE_MEDIA_SECRET_KEY: 'sb_secret_local-test',
        MEDIA_ALLOWED_ORIGINS: '',
      },
    }),
  )
  try {
    const { MEDIA_BUCKET: bucket } = await runtime.getBindings<{
      MEDIA_BUCKET: {
        put(
          key: string,
          bytes: ArrayBuffer,
          options: { httpMetadata: { contentType: string } },
        ): Promise<unknown>
      }
    }>()
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
    const head = await runtime.dispatchFetch(`https://media.example${src}`, {
      method: 'HEAD',
    })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(await head.text()).toBe('')
    const etag = head.headers.get('etag')!
    const partial = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { Range: 'bytes=0-99', 'If-Range': etag },
    })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('content-range')).toBe(
      `bytes 0-99/${bytes.byteLength}`,
    )
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(
      new Uint8Array(bytes.slice(0, 100)),
    )
    const stale = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { Range: 'bytes=0-99', 'If-Range': '"outdated"' },
    })
    expect(stale.status).toBe(200)
    expect((await stale.arrayBuffer()).byteLength).toBe(bytes.byteLength)
    const staleInvalid = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { Range: 'bytes=999999999-', 'If-Range': '"outdated"' },
    })
    expect(staleInvalid.status).toBe(200)
    expect((await staleInvalid.arrayBuffer()).byteLength).toBe(bytes.byteLength)
    const cached = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { Range: 'bytes=0-99', 'If-None-Match': etag },
    })
    expect(cached.status).toBe(304)
    // workerd may strip Content-Length on a bodyless 304 response.
    expect([null, String(bytes.byteLength)]).toContain(
      cached.headers.get('content-length'),
    )
    expect(await cached.text()).toBe('')
    const cachedInvalid = await runtime.dispatchFetch(
      `https://media.example${src}`,
      {
        headers: { Range: 'bytes=999999999-', 'If-None-Match': etag },
      },
    )
    expect(cachedInvalid.status).toBe(304)
    expect(cachedInvalid.headers.get('content-range')).toBeNull()
    expect(await cachedInvalid.text()).toBe('')
    const unknownUnit = await runtime.dispatchFetch(
      `https://media.example${src}`,
      {
        headers: { Range: 'items=0-99' },
      },
    )
    expect(unknownUnit.status).toBe(200)
    expect(unknownUnit.headers.get('content-range')).toBeNull()
    expect((await unknownUnit.arrayBuffer()).byteLength).toBe(bytes.byteLength)
    const mixedCase = await runtime.dispatchFetch(
      `https://media.example${src}`,
      {
        headers: { Range: 'Bytes=0-99' },
      },
    )
    expect(mixedCase.status).toBe(206)
    expect(new Uint8Array(await mixedCase.arrayBuffer())).toEqual(
      new Uint8Array(bytes.slice(0, 100)),
    )
    const headRange = await runtime.dispatchFetch(
      `https://media.example${src}`,
      {
        method: 'HEAD',
        headers: { Range: 'bytes=999999999-' },
      },
    )
    expect(headRange.status).toBe(200)
    expect(headRange.headers.get('content-length')).toBe(
      String(bytes.byteLength),
    )
    expect(await headRange.text()).toBe('')
    const invalid = await runtime.dispatchFetch(`https://media.example${src}`, {
      headers: { Range: 'bytes=999999999-' },
    })
    expect(invalid.status).toBe(416)
  } finally {
    await runtime.dispose()
  }
})
