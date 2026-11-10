import {
  MEDIA_PREPARED_MAX_WIDTH,
  MEDIA_PREPARED_MAX_HEIGHT,
  MEDIA_PREPARED_MAX_PIXELS,
} from '../src/domain/media'

/** Bounds before invoking a full decoder; this is deliberately not validation alone. */
export function webpDimensions(bytes: ArrayBuffer): {
  width: number
  height: number
} {
  const data = new Uint8Array(bytes)
  const tag = (offset: number) =>
    String.fromCharCode(...data.subarray(offset, offset + 4))
  const view = new DataView(bytes)
  if (
    data.length < 30 ||
    tag(0) !== 'RIFF' ||
    tag(8) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== data.length
  )
    throw new Error('Invalid WebP container')
  let width = 0,
    height = 0,
    hasImage = false
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = tag(offset)
    const length = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > data.length) throw new Error('Truncated WebP')
    if (kind === 'ANIM' || kind === 'ANMF')
      throw new Error('Animated images are not supported')
    if (kind === 'VP8X') {
      if (offset !== 12 || length !== 10 || data[start] & 2)
        throw new Error('Invalid WebP extension')
      width =
        1 + data[start + 4] + (data[start + 5] << 8) + (data[start + 6] << 16)
      height =
        1 + data[start + 7] + (data[start + 8] << 8) + (data[start + 9] << 16)
    } else if (kind === 'VP8 ') {
      if (
        hasImage ||
        length < 10 ||
        data[start + 3] !== 0x9d ||
        data[start + 4] !== 0x01 ||
        data[start + 5] !== 0x2a
      )
        throw new Error('Invalid WebP frame')
      const w = view.getUint16(start + 6, true) & 0x3fff
      const h = view.getUint16(start + 8, true) & 0x3fff
      if (width && (width !== w || height !== h))
        throw new Error('Contradictory WebP dimensions')
      if (!width) {
        width = w
        height = h
      }
      hasImage = true
    } else if (kind === 'VP8L') {
      if (hasImage || length < 5 || data[start] !== 0x2f)
        throw new Error('Invalid lossless WebP')
      const bits = view.getUint32(start + 1, true)
      const w = (bits & 0x3fff) + 1
      const h = ((bits >>> 14) & 0x3fff) + 1
      if (width && (width !== w || height !== h))
        throw new Error('Contradictory WebP dimensions')
      if (!width) {
        width = w
        height = h
      }
      hasImage = true
    }
    offset = start + length + (length % 2)
  }
  if (
    !hasImage ||
    !width ||
    !height ||
    width > MEDIA_PREPARED_MAX_WIDTH ||
    height > MEDIA_PREPARED_MAX_HEIGHT ||
    width * height > MEDIA_PREPARED_MAX_PIXELS
  )
    throw new Error('Image dimensions exceed limits')
  return { width, height }
}
