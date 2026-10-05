import { mkdir, writeFile } from 'node:fs/promises'

const families = [
  ['DM Sans', 'dm-sans', 'dmsans'],
  ['Manrope', 'manrope', 'manrope'],
  ['Work Sans', 'work-sans', 'worksans'],
  ['Source Sans 3', 'source-sans-3', 'sourcesans3'],
]
await mkdir('public/fonts', { recursive: true })
for (const [family, slug, directory] of families) {
  const response = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@300..800&display=swap`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      },
    },
  )
  if (!response.ok) throw new Error(`Font CSS: ${response.status}`)
  const css = await response.text()
  const url = [...css.matchAll(/url\((https:[^)]+)\)/g)].at(-1)?.[1]
  if (!url) throw new Error(`No font asset for ${family}`)
  const asset = await fetch(url)
  if (!asset.ok) throw new Error(`Font asset: ${asset.status}`)
  const bytes = Buffer.from(await asset.arrayBuffer())
  if (bytes.toString('ascii', 0, 4) !== 'wOF2')
    throw new Error('Expected WOFF2')
  const license = await fetch(
    `https://raw.githubusercontent.com/google/fonts/main/ofl/${directory}/OFL.txt`,
  )
  if (!license.ok) throw new Error(`License: ${license.status}`)
  await writeFile(`public/fonts/${slug}-latin-variable.woff2`, bytes)
  await writeFile(`public/fonts/${slug}-OFL.txt`, await license.text())
  console.log(`${family}: ${bytes.length} bytes`)
}
