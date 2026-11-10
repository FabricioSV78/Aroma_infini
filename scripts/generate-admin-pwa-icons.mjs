import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

// Raster outputs derive from the approved vector, including a safe maskable area.
const logo = await sharp('public/brand/logo-on-dark.svg')
  .resize({ width: 400 })
  .png()
  .toBuffer()
await mkdir('public/admin/icons', { recursive: true })
for (const [name, size, width] of [
  ['icon-192.png', 192, 142],
  ['icon-512.png', 512, 380],
  ['icon-maskable.png', 512, 300],
  ['apple-touch-icon.png', 180, 132],
]) {
  const layer = await sharp(logo).resize({ width }).toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#003935' },
  })
    .composite([{ input: layer, gravity: 'centre' }])
    .png()
    .toFile(`public/admin/icons/${name}`)
}
const badge = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill="white" d="M48 6 9 87h15l8-19h32l8 19h15L48 6Zm0 28 11 23H37l11-23Z"/></svg>',
)
await sharp(badge).png().toFile('public/admin/icons/badge.png')
console.log('Five administrative PWA icons generated from the existing brand.')
