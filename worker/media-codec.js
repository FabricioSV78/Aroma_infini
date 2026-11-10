import decode, { init } from '@jsquash/webp/decode.js'
import webpModule from '@jsquash/webp/codec/dec/webp_dec.wasm'

// The codec returns ImageData in browsers. Workers need only this small pixel
// container; no DOM, canvas, outbound transformation service or filesystem.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}
await init(webpModule)

export async function decodeWebp(bytes) {
  const result = await decode(bytes)
  if (!result || result.data.length !== result.width * result.height * 4)
    throw new Error('WebP pixel decode failed')
  return { width: result.width, height: result.height }
}
