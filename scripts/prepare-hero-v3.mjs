import sharp from 'sharp'
import { readFile, mkdir, copyFile } from 'node:fs/promises'

const { assets } = JSON.parse(
  await readFile('scripts/hero-v3-assets.json', 'utf8'),
)
await mkdir('artifacts/home-refinement/sources', { recursive: true })
for (const asset of assets) {
  await copyFile(
    asset.source,
    `artifacts/home-refinement/sources/${asset.name}.png`,
  )
  const mobile = asset.name.endsWith('mobile')
  for (const width of mobile ? [480, 780, 1024] : [960, 1536, 2048]) {
    await sharp(asset.source)
      .resize({
        width,
        height: Math.round(width * (mobile ? 1.5 : 9 / 16)),
        fit: 'cover',
      })
      .webp({ quality: 86 })
      .toFile(`public/images/${asset.name}-${width}.webp`)
  }
}
