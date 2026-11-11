import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

// Native H.264 encoding depends on the browser/OS. Compression and cancellation
// exercise real codecs when available and explicitly skip otherwise. Set
// AROMA_REQUIRE_VIDEO_CODECS=true to require those capabilities on a codec runner.
// The original-file fallback below always runs and never needs MediaRecorder.
async function requireCompressionCodecs(page: Page) {
  await page.goto('/')
  const capability = await page.evaluate(async () => {
    const mime = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
    if (
      typeof MediaRecorder === 'undefined' ||
      !MediaRecorder.isTypeSupported(mime)
    )
      return {
        supported: false,
        reason:
          'Este navegador no puede generar la muestra real MP4 H.264 con audio AAC mediante MediaRecorder.',
      }
    if (typeof VideoEncoder === 'undefined')
      return {
        supported: false,
        reason: 'Este navegador no expone un codificador WebCodecs H.264.',
      }
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec: 'avc1.420028',
        width: 1920,
        height: 1080,
        bitrate: 3_200_000,
        framerate: 24,
        avc: { format: 'avc' },
      })
      return {
        supported: result.supported === true,
        reason: result.supported
          ? ''
          : 'El codificador nativo de este navegador no admite AVC H.264 a 1920 × 1080.',
      }
    } catch {
      return {
        supported: false,
        reason:
          'El navegador no pudo verificar un codificador nativo AVC H.264 a 1920 × 1080.',
      }
    }
  })
  if (process.env.AROMA_REQUIRE_VIDEO_CODECS === 'true')
    expect(
      capability.supported,
      capability.reason ||
        'Se requieren códecs nativos de video en este entorno.',
    ).toBe(true)
  test.skip(!capability.supported, capability.reason)
}

async function sourceVideo(page: Page) {
  await page.goto('/')
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    const context = canvas.getContext('2d')!
    const noise = document.createElement('canvas')
    noise.width = 240
    noise.height = 135
    const noiseContext = noise.getContext('2d')!
    const image = noiseContext.createImageData(noise.width, noise.height)
    const pixels = new Uint32Array(image.data.buffer)
    let seed = 1789
    function draw() {
      for (let index = 0; index < pixels.length; index++) {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        pixels[index] = (seed & 0xffffff) | 0xff000000
      }
      noiseContext.putImageData(image, 0, 0)
      context.imageSmoothingEnabled = false
      context.drawImage(noise, 0, 0, 1920, 1080)
    }
    draw()
    const stream = canvas.captureStream(24)
    const audio = new AudioContext()
    await audio.resume()
    const destination = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator()
    const volume = audio.createGain()
    oscillator.frequency.value = 440
    volume.gain.value = 0.15
    oscillator.connect(volume)
    volume.connect(destination)
    oscillator.start()
    destination.stream
      .getAudioTracks()
      .forEach((track) => stream.addTrack(track))
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 128000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    const done = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = reject
    })
    recorder.start()
    const frames = window.setInterval(draw, 1000 / 24)
    await new Promise((resolve) => window.setTimeout(resolve, 3300))
    clearInterval(frames)
    recorder.stop()
    await done
    oscillator.stop()
    stream.getTracks().forEach((track) => track.stop())
    await audio.close()
    const file = new File(chunks, 'real-browser-source.mp4', {
      type: 'video/mp4',
    })
    ;(globalThis as unknown as { fixtureVideo: File }).fixtureVideo = file
    return file.size
  })
}

test('El navegador comprime el mismo video y conserva audio, cuadros y una versión móvil', async ({
  page,
}, testInfo) => {
  await requireCompressionCodecs(page)
  const originalBytes = await sourceVideo(page)
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => /\/mediabunny\.js(?:\?|$)/.test(entry.name))
        .map((entry) => entry.name),
    ),
  ).toEqual([])
  const result = await page.evaluate(async () => {
    const modulePath = '/src/features/admin/prepareVideoFile.ts'
    const { prepareVideoFile } = await import(modulePath)
    const source = (globalThis as unknown as { fixtureVideo: File })
      .fixtureVideo
    const prepared = await prepareVideoFile(source)
    const bunnyPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /\/mediabunny\.js(?:\?|$)/.test(name))
    if (!bunnyPath) throw new Error('The real codec module was not loaded')
    const bunny = await import(bunnyPath)
    async function inspect(blob: Blob) {
      const input = new bunny.Input({
        source: new bunny.BlobSource(blob),
        formats: [bunny.MP4],
      })
      try {
        const video = await input.getPrimaryVideoTrack()
        const audio = await input.getAudioTracks()
        let rms = 0
        if (audio.length) {
          const sample = await new bunny.AudioSampleSink(audio[0]).getSample(
            0.5,
          )
          if (sample) {
            const data = sample.toAudioBuffer().getChannelData(0)
            rms = Math.sqrt(
              data.reduce(
                (sum: number, value: number) => sum + value * value,
                0,
              ) / data.length,
            )
            sample.close()
          }
        }
        return {
          width: await video.getDisplayWidth(),
          height: await video.getDisplayHeight(),
          duration: await video.computeDuration(),
          frames: (await video.computePacketStats()).packetCount,
          audioTracks: audio.length,
          rms,
          bytes: blob.size,
        }
      } finally {
        input.dispose()
      }
    }
    const main = await inspect(await (await fetch(prepared.video)).blob())
    const mobile = prepared.mobileVideo
      ? await inspect(await (await fetch(prepared.mobileVideo)).blob())
      : null
    return {
      source: await inspect(source),
      main,
      mobile,
      optimization: prepared.optimization,
      poster: prepared.poster.startsWith('data:image/webp;base64,'),
      mobilePoster: prepared.mobilePoster?.startsWith(
        'data:image/webp;base64,',
      ),
    }
  })
  expect(result.optimization.status).toBe('optimized')
  expect(result.main.bytes).toBeLessThan(originalBytes)
  expect(result.main.width).toBe(1920)
  expect(result.main.height).toBe(1080)
  expect(result.main.frames).toBe(result.source.frames)
  expect(result.main.duration).toBeCloseTo(result.source.duration, 1)
  expect(result.main.audioTracks).toBe(1)
  expect(result.main.rms).toBeGreaterThan(0.01)
  expect(result.mobile).not.toBeNull()
  expect(result.mobile?.width).toBe(1080)
  expect(result.mobile?.height).toBe(606)
  expect(result.mobile?.bytes).toBeLessThan(result.main.bytes)
  expect(result.mobile?.audioTracks).toBe(1)
  expect(result.mobile?.rms).toBeGreaterThan(0.01)
  expect(result.poster).toBe(true)
  expect(result.mobilePoster).toBe(true)
  const metrics = {
    originalBytes,
    main: result.main,
    mobile: result.mobile,
    source: result.source,
    optimization: result.optimization,
  }
  await writeFile(
    testInfo.outputPath('compression-metrics.json'),
    JSON.stringify(metrics, null, 2),
    'utf8',
  )
  console.info(JSON.stringify(metrics))
})

test('Un navegador sin codificador conserva el MP4 verificado y explica que no se comprimió', async ({
  page,
}) => {
  await page.goto('/')
  const bytes = await page.evaluate(async () => {
    const response = await fetch('/videos/perfume-editorial-mobile.mp4')
    if (!response.ok)
      throw new Error('The compatible MP4 fallback fixture could not be read')
    const file = new File(
      [await response.blob()],
      'perfume-editorial-mobile.mp4',
      { type: 'video/mp4' },
    )
    ;(globalThis as unknown as { fixtureVideo: File }).fixtureVideo = file
    return file.size
  })
  const result = await page.evaluate(async () => {
    Object.defineProperty(globalThis, 'VideoEncoder', {
      value: undefined,
      configurable: true,
    })
    const modulePath = '/src/features/admin/prepareVideoFile.ts'
    const { prepareVideoFile } = await import(modulePath)
    const source = (globalThis as unknown as { fixtureVideo: File })
      .fixtureVideo
    const prepared = await prepareVideoFile(source)
    const output = await (await fetch(prepared.video)).blob()
    const digest = async (blob: Blob) =>
      [
        ...new Uint8Array(
          await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
        ),
      ]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    return {
      bytes: output.size,
      originalBytesPreserved: (await digest(source)) === (await digest(output)),
      optimization: prepared.optimization,
      mobile: Boolean(prepared.mobileVideo),
    }
  })
  expect(result.bytes).toBe(bytes)
  expect(result.originalBytesPreserved).toBe(true)
  expect(result.optimization.status).toBe('unsupported')
  expect(result.optimization.message).toContain('original verificado')
  expect(result.mobile).toBe(false)
})

test('Cancelar detiene la conversión y permite volver a preparar el archivo', async ({
  page,
}) => {
  await requireCompressionCodecs(page)
  await sourceVideo(page)
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/native-video-preparation.ts'
    const { prepareNativeVideo } = await import(modulePath)
    const controller = new AbortController()
    controller.abort()
    let early: unknown = null
    try {
      await prepareNativeVideo(
        new File(['x'], 'cancelado.mp4', { type: 'video/mp4' }),
        controller.signal,
      )
    } catch (error) {
      early = error instanceof Error && 'code' in error ? error.code : null
    }
    const active = new AbortController()
    const source = (globalThis as unknown as { fixtureVideo: File })
      .fixtureVideo
    const preparing = prepareNativeVideo(source, active.signal)
    window.setTimeout(() => active.abort(), 75)
    let during: unknown = null
    try {
      await preparing
    } catch (error) {
      during = error instanceof Error && 'code' in error ? error.code : null
    }
    const retry = await prepareNativeVideo(source)
    return { early, during, retry: retry.optimization.status }
  })
  expect(result).toEqual({
    early: 'video-cancelled',
    during: 'video-cancelled',
    retry: 'optimized',
  })
})
