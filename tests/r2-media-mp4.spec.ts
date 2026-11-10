import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { inspectMp4 } from '../worker/media-mp4'

for (const name of [
  'perfume-editorial-wide.mp4',
  'perfume-editorial-mobile.mp4',
  'perfume-ritual.mp4',
]) {
  test(`real editorial MP4 is structurally validated: ${name}`, async () => {
    const source = await readFile(`public/videos/${name}`)
    const value = inspectMp4(new Uint8Array(source).buffer)
    expect(value.width).toBeGreaterThanOrEqual(480)
    expect(value.height).toBeGreaterThanOrEqual(480)
    expect(value.durationMs).toBeGreaterThanOrEqual(2000)
    expect(value.durationMs).toBeLessThanOrEqual(60000)
  })
}

for (const [label, mutate] of [
  ['truncated payload', (b: Buffer) => b.subarray(0, b.length - 5)],
  [
    'seeking index outside the file',
    (b: Buffer) => {
      b.writeBigUInt64BE(BigInt(b.length + 1), b.indexOf('tfra') + 28)
      return b
    },
  ],
  [
    'contradictory encoded canvas',
    (b: Buffer) => {
      b.writeUInt16BE(640, b.indexOf('avc1', 100) + 28)
      return b
    },
  ],
  [
    'external data reference',
    (b: Buffer) => {
      b.writeUInt32BE(0, b.indexOf('url ') + 4)
      return b
    },
  ],
  [
    'unsupported video codec',
    (b: Buffer) => {
      b.write('hvc1', b.indexOf('avc1', 100))
      return b
    },
  ],
  [
    'sample data outside mdat',
    (b: Buffer) => {
      b.writeInt32BE(b.length + 100, b.indexOf('trun') + 12)
      return b
    },
  ],
  [
    'malformed NAL length',
    (b: Buffer) => {
      b.writeUInt32BE(0, b.indexOf('mdat') + 4)
      return b
    },
  ],
  [
    'unbounded box length',
    (b: Buffer) => {
      b.writeUInt32BE(0xffffffff, 0)
      return b
    },
  ],
  [
    'duplicate movie box',
    (b: Buffer) =>
      Buffer.concat([b, Buffer.from([0, 0, 0, 8, 109, 111, 111, 118])]),
  ],
] as const) {
  test(`MP4 rejects ${label}`, async () => {
    const bytes = mutate(
      Buffer.from(await readFile('public/videos/perfume-editorial-wide.mp4')),
    )
    expect(() => inspectMp4(new Uint8Array(bytes).buffer)).toThrow()
  })
}

test('arbitrary data with an MP4 MIME or header never becomes a valid film', () => {
  expect(() =>
    inspectMp4(
      new TextEncoder().encode('video/mp4 <script>alert(1)</script>').buffer,
    ),
  ).toThrow()
  const ftypOnly = new Uint8Array(100)
  new DataView(ftypOnly.buffer).setUint32(0, 100)
  ftypOnly.set(new TextEncoder().encode('ftypisom'), 4)
  expect(() => inspectMp4(ftypOnly.buffer)).toThrow()
})
