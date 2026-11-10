import { expect, test } from '@playwright/test'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

test('native HTTP disconnect reaches request.signal with the configured compatibility flag', async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: 'disconnect-security-regression',
      modules: true,
      compatibilityDate: '2026-10-08',
      compatibilityFlags: ['nodejs_compat', 'enable_request_signal'],
      unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
      script: `let disconnected=false;export default{fetch(request){
        if(new URL(request.url).pathname==='/status')return Response.json({disconnected});
        request.signal.addEventListener('abort',()=>{disconnected=true},{once:true});
        let timer;return new Response(new ReadableStream({start(c){
          c.enqueue(new Uint8Array([1]));timer=setInterval(()=>c.enqueue(new Uint8Array([1])),50)
        },cancel(){clearInterval(timer)}}))
      }}`,
    }),
  )
  try {
    await runtime.ready
    const origin = await runtime.unsafeGetDirectURL(
      'disconnect-security-regression',
    )
    const controller = new AbortController()
    const response = await fetch(new URL('/stream', origin), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
    })
    const reader = response.body!.getReader()
    await reader.read()
    controller.abort()
    void reader.cancel().catch(() => {})
    await expect
      .poll(async () => {
        const response = await fetch(new URL('/status', origin), {
          signal: AbortSignal.timeout(1000),
        })
        return ((await response.json()) as { disconnected: boolean })
          .disconnected
      })
      .toBe(true)
  } finally {
    await runtime.dispose()
  }
})
