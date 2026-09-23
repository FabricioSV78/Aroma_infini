import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// node scripts/prepare-hero-v2.mjs <directorio-de-originales>
const source = process.argv[2]
if (!source)
  throw new Error('Indica el directorio documentado en docs/HERO_V2_ASSETS.md.')
const assets = {
  'hero-v2-lumiere-desktop': 'exec-206fa45e-c031-48ac-83da-c6f634fe39c9.png',
  'hero-v2-lumiere-mobile': 'exec-4fe01fd9-5842-428d-92b6-c99c8dd20ea5.png',
  'hero-v2-silence-desktop': 'exec-bb4c017a-3f1d-4af2-95c8-728843c7af4d.png',
  'hero-v2-silence-mobile': 'exec-995c7ad3-fc2c-447c-8695-ec85c3597eec.png',
}
await mkdir('public/images', { recursive: true })
for (const [name, filename] of Object.entries(assets)) {
  const widths = name.endsWith('mobile') ? [480, 780, 1024] : [960, 1536, 2048]
  for (const width of widths) {
    await sharp(resolve(source, filename))
      .resize({ width })
      .webp({ quality: 86 })
      .toFile(`public/images/${name}-${width}.webp`)
  }
}
