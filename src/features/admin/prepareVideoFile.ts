import { UserFacingError } from '../../services/admin-messages'

const maxVideoBytes = 20 * 1024 * 1024

function waitForVideo(
  element: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
  ready: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(
        new UserFacingError(
          'video-read',
          'No se pudo leer el video. Prueba con otro MP4.',
        ),
      )
    }, 12000)
    function cleanup() {
      window.clearTimeout(timer)
      element.removeEventListener(eventName, done)
      element.removeEventListener('error', failed)
      signal?.removeEventListener('abort', failed)
    }
    function done() {
      cleanup()
      resolve()
    }
    function failed() {
      cleanup()
      reject(
        new UserFacingError(
          'video-read',
          'No se pudo abrir el video. Prueba con otro MP4.',
        ),
      )
    }
    element.addEventListener(eventName, done, { once: true })
    element.addEventListener('error', failed, { once: true })
    signal?.addEventListener('abort', failed, { once: true })
    if (signal?.aborted) failed()
  })
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(
        new UserFacingError(
          'video-read',
          'No se pudo leer el video. Prueba con otro MP4.',
        ),
      )
    reader.readAsDataURL(file)
  })
}

export async function prepareVideoFile(file: File, signal?: AbortSignal) {
  if (file.type !== 'video/mp4')
    throw new UserFacingError(
      'video-format',
      'Elige un video MP4 compatible con los navegadores.',
    )
  if (file.size === 0 || file.size > maxVideoBytes)
    throw new UserFacingError(
      'video-size',
      'El video original debe pesar entre 1 byte y 20 MB.',
    )

  const { prepareNativeVideo } =
    await import('../../services/native-video-preparation')
  const prepared = await prepareNativeVideo(file, signal)
  const objectUrl = URL.createObjectURL(prepared.main.blob)
  const element = document.createElement('video')
  element.preload = 'auto'
  element.muted = true
  element.playsInline = true
  try {
    element.src = objectUrl
    await waitForVideo(
      element,
      'loadedmetadata',
      () => element.readyState >= HTMLMediaElement.HAVE_METADATA,
      signal,
    )
    if (
      !Number.isFinite(element.duration) ||
      element.duration < 2 ||
      element.duration > 60
    )
      throw new UserFacingError(
        'video-duration',
        'El video debe durar entre 2 y 60 segundos.',
      )
    if (
      Math.min(element.videoWidth, element.videoHeight) < 480 ||
      Math.max(element.videoWidth, element.videoHeight) > 4096
    )
      throw new UserFacingError(
        'video-dimensions',
        'El video debe medir entre 480 y 4096 px por lado.',
      )
    await waitForVideo(
      element,
      'loadeddata',
      () => element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      signal,
    )
    const targetTime = Math.min(0.3, element.duration / 2)
    if (Math.abs(element.currentTime - targetTime) > 0.02) {
      element.currentTime = targetTime
      await waitForVideo(element, 'seeked', () => !element.seeking, signal)
    }

    const scale = Math.min(
      1,
      1600 / Math.max(element.videoWidth, element.videoHeight),
    )
    if (Math.min(element.videoWidth, element.videoHeight) * scale < 320)
      throw new UserFacingError(
        'video-dimensions',
        'Elige un video con una proporción menos panorámica para generar su portada.',
      )
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(element.videoWidth * scale)
    canvas.height = Math.round(element.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context)
      throw new UserFacingError(
        'video-preview',
        'No se pudo crear la vista previa del video. Prueba con otro MP4.',
      )
    context.drawImage(element, 0, 0, canvas.width, canvas.height)
    const poster = canvas.toDataURL('image/webp', 0.8)
    if (!poster.startsWith('data:image/webp;base64,'))
      throw new UserFacingError(
        'video-preview',
        'No se pudo crear la vista previa del video. Prueba con otro MP4.',
      )
    const video = await readDataUrl(prepared.main.blob)
    if (!video.startsWith('data:video/mp4;base64,'))
      throw new UserFacingError(
        'video-read',
        'No se pudo preparar el video. Prueba con otro MP4.',
      )
    let mobilePoster: string | undefined
    let mobileVideo: string | undefined
    if (prepared.mobile) {
      mobileVideo = await readDataUrl(prepared.mobile.blob)
      canvas.width = prepared.mobile.width
      canvas.height = prepared.mobile.height
      context.drawImage(element, 0, 0, canvas.width, canvas.height)
      mobilePoster = canvas.toDataURL('image/webp', 0.8)
      if (!mobilePoster.startsWith('data:image/webp;base64,'))
        throw new UserFacingError(
          'video-preview',
          'No se pudo crear la portada de la versión móvil.',
        )
    }
    if (signal?.aborted)
      throw new UserFacingError(
        'video-cancelled',
        'La preparación del video se detuvo.',
      )
    return {
      video,
      poster,
      ...(mobileVideo && mobilePoster ? { mobileVideo, mobilePoster } : {}),
      optimization: prepared.optimization,
    }
  } finally {
    element.pause()
    element.removeAttribute('src')
    element.load()
    URL.revokeObjectURL(objectUrl)
  }
}
