import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
const assets = JSON.parse(
  await readFile(new URL('./discovery-assets.json', import.meta.url), 'utf8'),
)
for (const [name, source] of Object.entries(assets)) {
  for (const width of [480, 960, 1536]) {
    await sharp(source)
      .resize({ width })
      .webp({ quality: 85 })
      .toFile(`public/images/${name}-${width}.webp`)
  }
  console.log(
    name,
    await sharp(source)
      .metadata()
      .then(({ width, height }) => ({ width, height })),
  )
}
