import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const { assets } = JSON.parse(
  await readFile(
    new URL('./alternate-product-assets.json', import.meta.url),
    'utf8',
  ),
)
for (const [name, source] of Object.entries(assets)) {
  for (const width of [480, 960]) {
    await sharp(source)
      .resize(width, Math.round(width * 1.25), { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(`public/images/${name}-alternate-${width}.webp`)
  }
}
