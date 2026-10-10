const maxVideoBytes = 10 * 1024 * 1024

function waitForVideo(
  element: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
  ready: () => boolean,
): Promise<void> {
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('No se pudo leer el video. Prueba con otro MP4.'))
    }, 12000)
    function cleanup() {
      window.clearTimeout(timer)
      element.removeEventListener(eventName, done)
      element.removeEventListener('error', failed)
    }
    function done() {
      cleanup()
      resolve()
    }
    function failed() {
      cleanup()
      reject(new Error('No se pudo abrir el video. Prueba con otro MP4.'))
    }
    element.addEventListener(eventName, done, { once: true })
    element.addEventListener('error', failed, { once: true })
  })
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el video.'))
    reader.readAsDataURL(file)
  })
}

export async function prepareVideoFile(file: File) {
  if (file.type !== 'video/mp4')
    throw new Error('Elige un video MP4 compatible con los navegadores.')
  if (file.size === 0 || file.size > maxVideoBytes)
    throw new Error('El video debe pesar entre 1 byte y 10 MB.')

  const objectUrl = URL.createObjectURL(file)
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
    )
    if (
      !Number.isFinite(element.duration) ||
      element.duration < 2 ||
      element.duration > 60
    )
      throw new Error('El video debe durar entre 2 y 60 segundos.')
    if (Math.min(element.videoWidth, element.videoHeight) < 480)
      throw new Error('El lado más corto del video debe medir 480 px o más.')
    await waitForVideo(
      element,
      'loadeddata',
      () => element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    )
    const targetTime = Math.min(0.3, element.duration / 2)
    if (Math.abs(element.currentTime - targetTime) > 0.02) {
      element.currentTime = targetTime
      await waitForVideo(element, 'seeked', () => !element.seeking)
    }

    const scale = Math.min(
      1,
      960 / Math.max(element.videoWidth, element.videoHeight),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(element.videoWidth * scale)
    canvas.height = Math.round(element.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo crear la vista previa del video.')
    context.drawImage(element, 0, 0, canvas.width, canvas.height)
    const poster = canvas.toDataURL('image/webp', 0.8)
    if (!poster.startsWith('data:image/webp;base64,'))
      throw new Error('No se pudo crear la vista previa del video.')
    const video = await readDataUrl(file)
    if (!video.startsWith('data:video/mp4;base64,'))
      throw new Error('No se pudo preparar el video MP4.')
    return { video, poster }
  } finally {
    element.pause()
    element.removeAttribute('src')
    element.load()
    URL.revokeObjectURL(objectUrl)
  }
}
