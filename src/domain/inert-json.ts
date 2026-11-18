/** Bounded inert HTML data. Never interpolate raw JSON into a script element. */
export function inertJson(value: unknown, maximumBytes: number) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return undefined
  const json = serialized
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return new TextEncoder().encode(json).byteLength <= maximumBytes
    ? json
    : undefined
}
