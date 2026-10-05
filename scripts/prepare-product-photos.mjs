import sharp from 'sharp'
const sources = {
  neroli:
    'C:\\Users\\12alf\\.codex\\generated_images\\01a0df84-1423-7943-aa4b-88a19e600595\\exec-f1b5f37a-d600-402f-89ea-9af665836389.png',
  iris: 'C:\\Users\\12alf\\.codex\\generated_images\\01a0df84-1423-7943-aa4b-88a19e600595\\exec-eea7fe59-23ff-4f6a-8b6d-b71a6c764967.png',
  figue:
    'C:\\Users\\12alf\\.codex\\generated_images\\01a0df84-1423-7943-aa4b-88a19e600595\\exec-5e7c4f79-7fa9-4402-810a-b82ac4490a16.png',
  santal:
    'C:\\Users\\12alf\\.codex\\generated_images\\01a0df84-1423-7943-aa4b-88a19e600595\\exec-01601d98-6806-4a1c-a949-768a4104cb68.png',
}
for (const [id, source] of Object.entries(sources)) {
  for (const width of [480, 960])
    await sharp(source)
      .resize({ width })
      .webp({ quality: 88 })
      .toFile(`public/images/${id}-${width}.webp`)
}
