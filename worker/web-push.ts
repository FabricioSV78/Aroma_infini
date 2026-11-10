/** Standard Web Push: RFC 8291/8188 encryption and RFC 8292 VAPID.
 * Uses platform cryptographic primitives, with no Node HTTP/crypto polyfills.
 * Subscription endpoints are capabilities: never log them or response bodies.
 */
export interface WebPushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}
export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}
const encoder = new TextEncoder()
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
export function decodePushKey(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('invalid_push_key')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
export function encodePushKey(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
/** Fixed providers only. No credentials, custom ports, redirects or arbitrary hosts. */
export function validPushEndpoint(value: string): boolean {
  if (
    value.length > 2048 ||
    /\s/.test(value) ||
    [...value].some(
      (letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127,
    )
  )
    return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.pathname.length > 1 || Boolean(url.search)) &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    )
  } catch {
    return false
  }
}
async function hkdf(
  secret: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    concat(secret),
    'HKDF',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: concat(salt), info: concat(info) },
    key,
    length * 8,
  )
  return concat(new Uint8Array(bits))
}
/** Optional material is only for the published RFC interoperability vector. */
export async function encryptWebPushPayload(
  subscription: Pick<WebPushSubscription, 'p256dh' | 'auth'>,
  plaintext: string,
  material?: { salt: Uint8Array<ArrayBuffer>; keyPair: CryptoKeyPair },
): Promise<Uint8Array<ArrayBuffer>> {
  const payload = encoder.encode(plaintext)
  if (payload.length > 3000) throw new Error('push_payload_too_large')
  const receiver = decodePushKey(subscription.p256dh)
  const auth = decodePushKey(subscription.auth)
  if (receiver.length !== 65 || receiver[0] !== 4 || auth.length !== 16)
    throw new Error('invalid_push_key')
  // importKey also verifies that the received point belongs to P-256.
  const receiverKey = await crypto.subtle.importKey(
    'raw',
    receiver,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const keyPair =
    material?.keyPair ??
    (await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    ))
  if (!('privateKey' in keyPair)) throw new Error('invalid_ephemeral_key')
  const rawSender = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  if (!(rawSender instanceof ArrayBuffer))
    throw new Error('invalid_ephemeral_key')
  const sender = new Uint8Array(rawSender)
  // Workerd's generated type spells the optional field $public; the Web Crypto
  // wire API is the standard public. An inferred object preserves that API.
  const agreement = { name: 'ECDH', public: receiverKey }
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(agreement, keyPair.privateKey, 256),
  )
  const ikm = await hkdf(
    shared,
    auth,
    concat(encoder.encode('WebPush: info\0'), receiver, sender),
    32,
  )
  const salt = new Uint8Array(
    material?.salt ?? crypto.getRandomValues(new Uint8Array(16)),
  )
  if (salt.length !== 16) throw new Error('invalid_push_salt')
  const cek = await hkdf(
    ikm,
    salt,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdf(
    ikm,
    salt,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  )
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      key,
      concat(payload, new Uint8Array([2])),
    ),
  )
  // aes128gcm header: 16-byte salt, 4-byte network record size, 1-byte key length.
  const header = new Uint8Array(21)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = sender.length
  return concat(header, sender, ciphertext)
}
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const publicKey = decodePushKey(keys.publicKey)
  const privateKey = decodePushKey(keys.privateKey)
  if (
    publicKey.length !== 65 ||
    publicKey[0] !== 4 ||
    privateKey.length !== 32 ||
    !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(keys.subject)
  )
    throw new Error('invalid_vapid_configuration')
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encodePushKey(publicKey.slice(1, 33)),
      y: encodePushKey(publicKey.slice(33)),
      d: keys.privateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = encodePushKey(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  )
  const claims = encodePushKey(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 3600,
        sub: keys.subject,
      }),
    ),
  )
  const input = `${header}.${claims}`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(input),
    ),
  )
  return `vapid t=${input}.${encodePushKey(signature)}, k=${keys.publicKey}`
}
export async function sendWebPush(
  subscription: WebPushSubscription,
  keys: VapidKeys,
  payload: unknown,
  transport: typeof fetch = (input, init) => fetch(input, init),
): Promise<{ status: number; retryAfter?: number }> {
  if (!validPushEndpoint(subscription.endpoint))
    throw new Error('invalid_push_endpoint')
  const [body, authorization] = await Promise.all([
    encryptWebPushPayload(subscription, JSON.stringify(payload)),
    vapidAuthorization(subscription.endpoint, keys),
  ])
  const response = await transport(subscription.endpoint, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'normal',
      ...(new URL(subscription.endpoint).hostname.endsWith(
        '.notify.windows.com',
      )
        ? { 'X-WNS-Type': 'wns/raw' }
        : {}),
    },
    body,
  })
  const retry = response.headers.get('retry-after')
  const seconds =
    retry && /^\d+$/.test(retry)
      ? Number(retry)
      : retry
        ? Math.ceil((Date.parse(retry) - Date.now()) / 1000)
        : 0
  await response.body?.cancel()
  return {
    status: response.status,
    ...(Number.isFinite(seconds) && seconds > 0
      ? { retryAfter: Math.min(seconds, 3600) }
      : {}),
  }
}
