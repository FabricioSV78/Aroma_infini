import { expect, test } from '@playwright/test'
import {
  createECDH,
  createDecipheriv,
  hkdfSync,
  createPublicKey,
  verify,
} from 'node:crypto'
import {
  decodePushKey,
  encodePushKey,
  encryptWebPushPayload,
  sendWebPush,
  validPushEndpoint,
  vapidAuthorization,
} from '../worker/web-push'

const receiverPublic =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const senderPublic =
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const senderPrivate = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const auth = 'BTBZMqHH6r4Tts7J_aSIgg'
const subscription = {
  endpoint: 'https://fcm.googleapis.com/wp/example-opaque',
  p256dh: receiverPublic,
  auth,
}

async function vapidFixture() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  return {
    publicKey: encodePushKey(raw),
    privateKey: jwk.d!,
    subject: 'mailto:admin@example.org',
  }
}

test('exact RFC 8291 section 5 interoperability vector (not a roundtrip-only assertion)', async () => {
  const publicBytes = decodePushKey(senderPublic)
  const publicKey = await crypto.subtle.importKey(
    'raw',
    publicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encodePushKey(publicBytes.slice(1, 33)),
      y: encodePushKey(publicBytes.slice(33)),
      d: senderPrivate,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const body = await encryptWebPushPayload(
    subscription,
    'When I grow up, I want to be a watermelon',
    {
      salt: decodePushKey('DGv6ra1nlYgDCS1FRnbzlw'),
      keyPair: { publicKey, privateKey },
    },
  )
  expect(encodePushKey(body)).toBe(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  )
})

test('random sender keys/salt and independent Node decryption preserve only the intended payload', async () => {
  const receiver = createECDH('prime256v1')
  receiver.generateKeys()
  const sub = { p256dh: receiver.getPublicKey().toString('base64url'), auth }
  const plaintext = JSON.stringify({
    kind: 'test',
    id: crypto.randomUUID(),
    url: '/admin/notificaciones',
  })
  const body = Buffer.from(await encryptWebPushPayload(sub, plaintext))
  const other = Buffer.from(await encryptWebPushPayload(sub, plaintext))
  expect(body.equals(other)).toBe(false)
  expect(body.includes(Buffer.from(plaintext))).toBe(false)
  expect(body.readUInt32BE(16)).toBe(4096)
  expect(body[20]).toBe(65)
  const sender = body.subarray(21, 86)
  const shared = receiver.computeSecret(sender)
  const ikm = hkdfSync(
    'sha256',
    shared,
    Buffer.from(auth, 'base64url'),
    Buffer.concat([
      Buffer.from('WebPush: info\0'),
      receiver.getPublicKey(),
      sender,
    ]),
    32,
  )
  const cek = hkdfSync(
    'sha256',
    new Uint8Array(ikm),
    body.subarray(0, 16),
    Buffer.from('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = hkdfSync(
    'sha256',
    new Uint8Array(ikm),
    body.subarray(0, 16),
    Buffer.from('Content-Encoding: nonce\0'),
    12,
  )
  const decrypt = createDecipheriv(
    'aes-128-gcm',
    Buffer.from(cek),
    Buffer.from(nonce),
  )
  decrypt.setAuthTag(body.subarray(-16))
  const result = Buffer.concat([
    decrypt.update(body.subarray(86, -16)),
    decrypt.final(),
  ])
  expect(result.subarray(0, -1).toString()).toBe(plaintext)
  expect(result.at(-1)).toBe(2)
})

test('VAPID is independently verifiable ES256, bound to push origin and expires in one hour', async () => {
  const keys = await vapidFixture()
  const now = 1_800_000_000_000
  const authorization = await vapidAuthorization(
    subscription.endpoint,
    keys,
    now,
  )
  const jwt = authorization.split('t=')[1].split(',')[0]
  const [header, payload, signature] = jwt.split('.')
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    typ: 'JWT',
    alg: 'ES256',
  })
  expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
    aud: 'https://fcm.googleapis.com',
    exp: now / 1000 + 3600,
    sub: keys.subject,
  })
  const raw = Buffer.from(keys.publicKey, 'base64url')
  const key = createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: raw.subarray(1, 33).toString('base64url'),
      y: raw.subarray(33).toString('base64url'),
    },
    format: 'jwk',
  })
  expect(
    verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    ),
  ).toBe(true)
  expect(authorization.endsWith(`k=${keys.publicKey}`)).toBe(true)
})

test('allowed push providers and SSRF rejects', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/wp/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/a',
    'https://web.push.apple.com/Qabc',
  ])
    expect(validPushEndpoint(endpoint)).toBe(true)
  for (const endpoint of [
    'http://fcm.googleapis.com/wp/a',
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com.evil.test/a',
    'https://evilpush.apple.com/a',
    'https://fcm.googleapis.com:8443/a',
    'https://user:pass@fcm.googleapis.com/a',
    'https://fcm.googleapis.com/a#token',
  ])
    expect(validPushEndpoint(endpoint)).toBe(false)
})

test('invalid keys and oversized messages fail closed before a network request', async () => {
  await expect(
    encryptWebPushPayload({ ...subscription, auth: 'bad' }, 'a'),
  ).rejects.toThrow('invalid_push_key')
  await expect(
    encryptWebPushPayload(
      { ...subscription, p256dh: encodePushKey(new Uint8Array(65).fill(4)) },
      'a',
    ),
  ).rejects.toThrow()
  await expect(
    encryptWebPushPayload(subscription, 'a'.repeat(3001)),
  ).rejects.toThrow('push_payload_too_large')
  await expect(
    sendWebPush(
      { ...subscription, endpoint: 'http://127.0.0.1/admin' },
      await vapidFixture(),
      {},
    ),
  ).rejects.toThrow('invalid_push_endpoint')
})

test('transport is bounded, redirects rejected, response status accepted without claiming display', async () => {
  let init: RequestInit | undefined
  const result = await sendWebPush(
    subscription,
    await vapidFixture(),
    { kind: 'test' },
    async (_url, options) => {
      init = options
      return new Response(null, {
        status: 429,
        headers: { 'Retry-After': '10000' },
      })
    },
  )
  expect(result).toEqual({ status: 429, retryAfter: 3600 })
  expect(init?.redirect).toBe('manual')
  expect(init?.signal).toBeTruthy()
  expect(new Headers(init?.headers).get('Content-Encoding')).toBe('aes128gcm')
  expect(new Headers(init?.headers).get('TTL')).toBe('3600')
})
