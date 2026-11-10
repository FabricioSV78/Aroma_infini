type PublicCatalogEnvironment = Pick<
  Env,
  'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'
>
type PublicCatalogOperation =
  'catalog_products' | 'catalog_product_context' | 'catalog_brands'

function publicConfiguration(env: PublicCatalogEnvironment) {
  const origin = new URL(env.SUPABASE_URL)
  if (!/^https:\/\/[a-z]{20}\.supabase\.co\/$/.test(origin.href))
    throw new Error('catalog-configuration')
  const key = env.SUPABASE_PUBLISHABLE_KEY
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))
      throw new Error('catalog-configuration')
    const encoded = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
    const claims: unknown = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')),
    )
    if (
      !claims ||
      typeof claims !== 'object' ||
      !('role' in claims) ||
      claims.role !== 'anon'
    )
      throw new Error('catalog-configuration')
  }
  return { origin: origin.origin, key }
}

/** Fixed public read operations only; no session or privileged client is loaded. */
export async function readPublicCatalog(
  env: PublicCatalogEnvironment,
  operation: PublicCatalogOperation,
  body: Record<string, unknown>,
  transport: typeof fetch = fetch,
  maximumBytes = 2 * 1024 * 1024,
): Promise<unknown> {
  if (
    !['catalog_products', 'catalog_product_context', 'catalog_brands'].includes(
      operation,
    ) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 8 * 1024 * 1024
  )
    throw new Error('catalog-operation')
  const configuration = publicConfiguration(env)
  const response = await transport(
    `${configuration.origin}/rest/v1/rpc/${operation}`,
    {
      method: 'POST',
      redirect: 'manual',
      headers: {
        apikey: configuration.key,
        'Content-Type': 'application/json',
        'Content-Profile': 'api',
        'Accept-Profile': 'api',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  )
  const reader = response.body?.getReader()
  try {
    if (
      response.status !== 200 ||
      !/^application\/json\b/i.test(response.headers.get('Content-Type') ?? '')
    )
      throw new Error('catalog-response')
    const declared = response.headers.get('Content-Length')
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)
    )
      throw new Error('catalog-size')
    if (!reader) throw new Error('catalog-response')
    let length = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > maximumBytes) throw new Error('catalog-size')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
