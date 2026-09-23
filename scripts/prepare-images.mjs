import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// Ejecución explícita: node scripts/prepare-images.mjs <directorio-de-originales>
const source = process.argv[2]
if (!source)
  throw new Error(
    'Indica el directorio de originales documentado en docs/ASSETS.md.',
  )
const assets = {
  hero: 'exec-3edd4e14-942f-4805-a0db-10b5dfeeaa02.png',
  cedre: 'exec-b066f681-bd42-4c7a-b959-c11d3efadde0.png',
  petale: 'exec-4bbdfe84-57b2-4b0b-8845-db8d810088b5.png',
  sillage: 'exec-b0ab8358-ac36-4243-998d-5db8be240833.png',
  ambre: 'exec-042236bc-7017-40e1-a1a3-e16bb16a7305.png',
}
await mkdir('public/images', { recursive: true })
for (const [name, file] of Object.entries(assets)) {
  for (const width of [
    480,
    960,
    ...(name === 'hero' || name === 'sillage' ? [1536] : []),
  ]) {
    await sharp(resolve(source, file))
      .resize({ width })
      .webp({ quality: 82 })
      .toFile(`public/images/${name}-${width}.webp`)
  }
}
