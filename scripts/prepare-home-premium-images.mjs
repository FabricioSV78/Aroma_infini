import sharp from 'sharp'
import { readFile, mkdir, copyFile } from 'node:fs/promises'

const { assets } = JSON.parse(
  await readFile('scripts/home-premium-assets.json', 'utf8'),
)
await mkdir('artifacts/home-premium/sources', { recursive: true })
for (const asset of assets) {
  await copyFile(
    asset.source,
    `artifacts/home-premium/sources/${asset.name}.png`,
  )
  for (const width of [480, 960, 1536]) {
    await sharp(asset.source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(`public/images/${asset.name}-${width}.webp`)
  }
  if (asset.name === 'editorial-essential-v3') {
    for (const width of [480, 780]) {
      await sharp(asset.source)
        .resize({
          width,
          height: Math.round(width * 1.1),
          fit: 'cover',
          position: 'right',
        })
        .webp({ quality: 86 })
        .toFile(`public/images/${asset.name}-mobile-${width}.webp`)
    }
  }
}
console.log(
  'Fotografías editoriales guardadas como WebP responsive en public/images/.',
)
