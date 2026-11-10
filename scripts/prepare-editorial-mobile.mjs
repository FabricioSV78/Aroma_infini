/* global document, MediaRecorder, FileReader, requestAnimationFrame, cancelAnimationFrame */
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

// Derive the mobile film from the same original and 5–17s excerpt as desktop.
// Download the original listed in public/videos/README.md before running.
const origin = process.env.VIDEO_PREPARE_ORIGIN ?? 'http://127.0.0.1:5173'
const source = process.argv[2] ?? 'artifacts/perfume-wide-source.mp4'
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.route('**/__prepare-editorial-mobile', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  )
  await page.goto(`${origin}/__prepare-editorial-mobile`)
  const result = await page.evaluate(
    async (sourceUrl) => {
      const video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      const loaded = new Promise((resolve, reject) => {
        video.onloadeddata = resolve
        video.onerror = () =>
          reject(new Error('Could not read the original film.'))
      })
      video.src = sourceUrl
      await loaded
      const from = 5
      const to = 17
      if (video.duration < to || video.videoHeight < 900)
        throw new Error(
          'Use the original 4096 × 1974 film, not a smaller export.',
        )
      video.currentTime = from
      await new Promise((resolve) => {
        video.onseeked = resolve
      })

      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 900
      const context = canvas.getContext('2d')
      const cropWidth = video.videoHeight * (canvas.width / canvas.height)
      // Keep the face and bottle in the same frame throughout the excerpt.
      const cropX = Math.min(
        video.videoWidth - cropWidth,
        Math.max(0, video.videoWidth * 0.585 - cropWidth / 2),
      )
      const drawFrame = () =>
        context.drawImage(
          video,
          cropX,
          0,
          cropWidth,
          video.videoHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        )
      drawFrame()
      const poster = canvas.toDataURL('image/webp', 0.9).split(',')[1]
      const stream = canvas.captureStream(30)
      const mimeType = 'video/mp4;codecs=avc1.420033'
      if (!MediaRecorder.isTypeSupported(mimeType))
        throw new Error('Use Chrome with H.264 MP4 recording support.')
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1800000,
      })
      const chunks = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      const finished = new Promise((resolve, reject) => {
        recorder.onstop = resolve
        recorder.onerror = reject
      })
      let frame = 0
      function draw() {
        drawFrame()
        if (video.currentTime >= to) {
          recorder.stop()
          video.pause()
          return
        }
        frame = requestAnimationFrame(draw)
      }
      recorder.start()
      await video.play()
      draw()
      await finished
      cancelAnimationFrame(frame)
      stream.getTracks().forEach((track) => track.stop())
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(new Blob(chunks, { type: 'video/mp4' }))
      })
      return { data, poster }
    },
    new URL(source.replaceAll('\\', '/'), `${origin}/`).href,
  )
  await writeFile(
    'public/videos/perfume-editorial-mobile.mp4',
    Buffer.from(result.data, 'base64'),
  )
  await writeFile(
    'public/videos/perfume-editorial-mobile.webp',
    Buffer.from(result.poster, 'base64'),
  )
  console.log('Created the matching 720 × 900 mobile film and poster.')
} finally {
  await browser.close()
}
