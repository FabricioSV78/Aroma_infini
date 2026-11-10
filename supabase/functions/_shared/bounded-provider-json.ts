/** Bound upstream Auth/RPC data separately from the incoming credential form. */
export async function boundedProviderJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const maximum = 512 * 1024
  const reader = response.body?.getReader()
  const failure = () => new Error('upstream_response_invalid')
  let stop: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(failure())
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
  void aborted.catch(() => {})
  let complete = false
  try {
    const declared = response.headers.get('Content-Length')
    if (
      !reader ||
      (declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > maximum))
    )
      throw failure()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const next = await Promise.race([reader.read(), aborted])
      if (next.done) {
        complete = true
        break
      }
      length += next.value.byteLength
      if (length > maximum) throw failure()
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    )
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
    if (reader) {
      if (!complete) void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
