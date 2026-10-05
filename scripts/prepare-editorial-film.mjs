/* global document, MediaRecorder, FileReader, requestAnimationFrame, cancelAnimationFrame */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/')
  const preview = await page.evaluate(async () => {
    const video = document.createElement('video')
    video.src = '/artifacts/perfume-wide-source.mp4'
    video.muted = true
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve
      video.onerror = reject
    })
    const sheet = document.createElement('canvas')
    sheet.width = 1200
    sheet.height = 580
    const context = sheet.getContext('2d')
    for (const [index, time] of [1, 5, 9, 13, 17, 21].entries()) {
      video.currentTime = time
      await new Promise((resolve) => {
        video.onseeked = resolve
      })
      context.drawImage(
        video,
        (index % 3) * 400,
        Math.floor(index / 3) * 290,
        400,
        193,
      )
      context.fillStyle = '#fff'
      context.fillText(
        `${time}s`,
        (index % 3) * 400 + 10,
        Math.floor(index / 3) * 290 + 220,
      )
    }
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      sheet: sheet.toDataURL('image/webp', 0.9).split(',')[1],
    }
  })
  await writeFile(
    'artifacts/film-candidates.webp',
    Buffer.from(preview.sheet, 'base64'),
  )
  console.log({
    width: preview.width,
    height: preview.height,
    duration: preview.duration,
  })
  if (process.argv.includes('--encode')) {
    const result = await page.evaluate(async () => {
      const video = document.createElement('video')
      video.src = '/artifacts/perfume-wide-source.mp4'
      video.muted = true
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve
        video.onerror = reject
      })
      video.currentTime = 5
      await new Promise((resolve) => {
        video.onseeked = resolve
      })
      const canvas = document.createElement('canvas')
      canvas.width = 1920
      canvas.height = 926
      const context = canvas.getContext('2d')
      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/mp4;codecs=avc1.420033',
        videoBitsPerSecond: 4500000,
      })
      const chunks = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      let frame = 0
      const finished = new Promise((resolve) => {
        recorder.onstop = resolve
      })
      function draw() {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        if (video.currentTime >= 17) {
          recorder.stop()
          video.pause()
          return
        }
        frame = requestAnimationFrame(draw)
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const poster = canvas.toDataURL('image/webp', 0.9).split(',')[1]
      recorder.start()
      await video.play()
      draw()
      await finished
      cancelAnimationFrame(frame)
      stream.getTracks().forEach((track) => track.stop())
      const data = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(new Blob(chunks, { type: 'video/mp4' }))
      })
      return { data, poster }
    })
    await writeFile(
      'public/videos/perfume-editorial-wide.mp4',
      Buffer.from(result.data, 'base64'),
    )
    await writeFile(
      'public/videos/perfume-editorial-wide.webp',
      Buffer.from(result.poster, 'base64'),
    )
  }
} finally {
  await browser.close()
}
