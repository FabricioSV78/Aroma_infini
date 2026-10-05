import sharp from 'sharp'
import { readdir, stat } from 'node:fs/promises'
const directory =
  'C:/Users/12alf/.codex/generated_images/01a0df84-1423-7943-aa4b-88a19e600595'
const files = await Promise.all(
  (await readdir(directory))
    .filter((f) => f.endsWith('.png'))
    .map(async (name) => ({
      name,
      time: (await stat(directory + '/' + name)).mtimeMs,
    })),
)
const generated = files.sort((a, b) => a.time - b.time).slice(4)
const jobs = []
for (const id of [
  'cedre',
  'petale',
  'sillage',
  'ambre',
  'neroli',
  'iris',
  'figue',
  'santal',
]) {
  for (const suffix of [
    'detail',
    'back',
    ...(['neroli', 'iris', 'figue', 'santal'].includes(id)
      ? ['alternate']
      : []),
  ])
    jobs.push(id + '-' + suffix)
}
for (let i = 0; i < Math.min(jobs.length, generated.length); i++) {
  for (const width of [480, 960])
    await sharp(directory + '/' + generated[i].name)
      .resize({ width })
      .webp({ quality: 88 })
      .toFile('public/images/' + jobs[i] + '-' + width + '.webp')
  console.log(jobs[i] + ': ' + generated[i].name)
}
const tiles = []
const ids = [
  'cedre',
  'petale',
  'sillage',
  'ambre',
  'neroli',
  'iris',
  'figue',
  'santal',
]
for (let row = 0; row < 8; row++)
  for (let col = 0; col < 4; col++) {
    try {
      tiles.push({
        input: await sharp(
          'public/images/' +
            ids[row] +
            ['', '-alternate', '-detail', '-back'][col] +
            '-480.webp',
        )
          .resize(160, 200, { fit: 'contain', background: '#fff' })
          .toBuffer(),
        left: col * 160,
        top: row * 200,
      })
    } catch (error) {
      throw new Error(`Missing gallery image for ${ids[row]}`, { cause: error })
    }
  }
await sharp({
  create: { width: 640, height: 1600, channels: 3, background: '#ddd' },
})
  .composite(tiles)
  .png()
  .toFile('artifacts/gallery-contact-sheet.png')
