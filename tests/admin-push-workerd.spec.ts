import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'

test('native workerd fetch authenticates and reads RPC using the supported manual redirect policy', async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
    import {createAdminPushHandler} from './worker/admin-push-handler';
    const handle=createAdminPushHandler();export default {fetch(request,env){return handle(request,env)}};
  `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
  })
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-08',
      bindings: {
        APP_ENVIRONMENT: 'staging',
        PUSH_ENVIRONMENT: 'staging',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
      outboundService: async (request: Request) => {
        const path = new URL(request.url).pathname
        return Response.json(
          path.endsWith('/user')
            ? { id: '10000000-0000-4000-8000-000000000001' }
            : path.endsWith('/current_actor')
              ? {
                  user_id: '10000000-0000-4000-8000-000000000001',
                  role: 'admin',
                  aal: 'aal2',
                }
              : { device: null },
        )
      },
    }),
  )
  try {
    const response = await runtime.dispatchFetch(
      'https://local.test/api/admin/push/status?deviceId=20000000-0000-4000-8000-000000000001',
      { headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwx' } },
    )
    expect(await response.json()).toEqual({
      configured: false,
      publicKey: null,
      currentDevice: null,
    })
    expect(response.status).toBe(200)
  } finally {
    await runtime.dispose()
  }
})

test('real workerd WebCrypto implements the RFC encryption vector and VAPID signing', async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
      import {decodePushKey,encodePushKey,encryptWebPushPayload,vapidAuthorization} from './worker/web-push';
      export default { async fetch() {
        const raw=decodePushKey('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
        const jwk={kty:'EC',crv:'P-256',x:encodePushKey(raw.slice(1,33)),y:encodePushKey(raw.slice(33)),d:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'};
        const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
        const publicKey=await crypto.subtle.importKey('raw',raw,{name:'ECDH',namedCurve:'P-256'},true,[]);
        const body=await encryptWebPushPayload({p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',auth:'BTBZMqHH6r4Tts7J_aSIgg'},'When I grow up, I want to be a watermelon',{salt:decodePushKey('DGv6ra1nlYgDCS1FRnbzlw'),keyPair:{privateKey,publicKey}});
        const authorization=await vapidAuthorization('https://fcm.googleapis.com/wp/fixture',{publicKey:encodePushKey(raw),privateKey:jwk.d,subject:'mailto:admin@example.invalid'});
        return Response.json({body:encodePushKey(body),signed:authorization.startsWith('vapid t=')});
      }};
    `,
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
    }),
  )
  try {
    const response = await runtime.dispatchFetch('http://local.test/')
    const result = (await response.json()) as { body: string; signed: boolean }
    expect(result.body).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
    expect(result.signed).toBe(true)
  } finally {
    await runtime.dispose()
  }
})
