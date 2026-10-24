import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const source = process.argv[2]
if (!source) throw new Error('Indica la fotografía original de atomizadores.')
await mkdir('public/images', { recursive: true })
for (const width of [480, 960, 1122]) {
  await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(`public/images/discovery-complements-v1-${width}.webp`)
}
console.log(await sharp(source).metadata())
