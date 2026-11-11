import { MEDIA_VIDEO_MAX_BYTES } from '../domain/media'
import { UserFacingError } from './admin-messages'

export interface VideoOptimizationInfo {
  status: 'optimized' | 'original' | 'unsupported'
  originalBytes: number
  mainBytes: number
  mobileBytes?: number
  message: string
}
export interface PreparedVideoRendition {
  blob: Blob
  width: number
  height: number
  durationMs: number
}
export interface PreparedVideoRenditions {
  main: PreparedVideoRendition
  mobile?: PreparedVideoRendition
  optimization: VideoOptimizationInfo
}
export const VIDEO_ORIGINAL_MAX_BYTES = 20 * 1024 * 1024

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new UserFacingError(
      'video-cancelled',
      'La preparación del video se detuvo. Selecciónalo de nuevo cuando quieras continuar.',
    )
}
function dimensions(width: number, height: number, maximum: number) {
  const scale = Math.min(1, maximum / Math.max(width, height))
  const target = {
    width: Math.floor((width * scale) / 2) * 2,
    height: Math.floor((height * scale) / 2) * 2,
  }
  return Math.min(target.width, target.height) >= 480 ? target : null
}
function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`
}

/** Loaded only by an explicit admin video upload. Conversion preserves source
 * timestamps and all audio tracks; it never records browser playback or crops. */
export async function prepareNativeVideo(
  file: File,
  signal?: AbortSignal,
): Promise<PreparedVideoRenditions> {
  cancelled(signal)
  if (file.type !== 'video/mp4')
    throw new UserFacingError(
      'video-format',
      'Elige un video MP4 compatible con los navegadores.',
    )
  if (!file.size || file.size > VIDEO_ORIGINAL_MAX_BYTES)
    throw new UserFacingError(
      'video-size',
      'El video original debe pesar entre 1 byte y 20 MB.',
    )
  const { inspectMp4 } = await import('../../worker/media-mp4')
  let original: PreparedVideoRendition | null = null
  if (file.size <= MEDIA_VIDEO_MAX_BYTES) {
    try {
      original = { blob: file, ...inspectMp4(await file.arrayBuffer()) }
    } catch {
      /* An incompatible source must be converted successfully. */
    }
  }
  const bunny = await import('mediabunny')
  const probe = new bunny.Input({
    source: new bunny.BlobSource(file),
    formats: [bunny.MP4],
  })
  const stopProbe = () => probe.dispose()
  signal?.addEventListener('abort', stopProbe, { once: true })
  try {
    const tracks = await probe.getTracks()
    const videos = await probe.getVideoTracks()
    const audios = await probe.getAudioTracks()
    if (
      videos.length !== 1 ||
      tracks.length !== videos.length + audios.length ||
      tracks.length > 4
    )
      throw new UserFacingError(
        'video-tracks',
        'Elige un MP4 con un solo video y audio compatible, sin pistas adicionales.',
      )
    const video = videos[0]
    const width = await video.getDisplayWidth(),
      height = await video.getDisplayHeight()
    const duration = await probe.computeDuration()
    if (!Number.isFinite(duration) || duration < 2 || duration > 60)
      throw new UserFacingError(
        'video-duration',
        'El video debe durar entre 2 y 60 segundos.',
      )
    if (Math.min(width, height) < 480 || Math.max(width, height) > 4096)
      throw new UserFacingError(
        'video-dimensions',
        'El video debe medir entre 480 y 4096 px por lado.',
      )
    cancelled(signal)
    const mainSize = dimensions(width, height, 1920)
    const mobileSize = dimensions(width, height, 1080)
    const budget =
      Math.floor((9 * 1024 * 1024 * 8) / duration) - audios.length * 160_000
    const mainBitrate = Math.max(450_000, Math.min(3_200_000, budget))
    let main = original,
      mobile: PreparedVideoRendition | undefined
    let unsupported = false
    async function convert(
      size: { width: number; height: number },
      bitrate: number,
    ) {
      cancelled(signal)
      const input = new bunny.Input({
        source: new bunny.BlobSource(file),
        formats: [bunny.MP4],
      })
      const target = new bunny.BufferTarget()
      const output = new bunny.Output({
        target,
        format: new bunny.Mp4OutputFormat({ fastStart: 'in-memory' }),
      })
      let conversion:
        Awaited<ReturnType<typeof bunny.Conversion.init>> | undefined
      const deadline = AbortSignal.any([
        AbortSignal.timeout(180000),
        ...(signal ? [signal] : []),
      ])
      const stop = () => {
        void conversion?.cancel().catch(() => {})
        input.dispose()
      }
      deadline.addEventListener('abort', stop, { once: true })
      try {
        conversion = await bunny.Conversion.init({
          input,
          output,
          tracks: 'all',
          showWarnings: false,
          tags: {},
          video: {
            ...size,
            fit: 'contain',
            codec: 'avc',
            quality: new bunny.Quality({ bitrate, bitrateMode: 'variable' }),
            forceTranscode: true,
            allowTransformationMetadata: false,
            keyFrameInterval: 2,
          },
          audio: { codec: 'aac' },
        })
        if (
          !conversion.isValid ||
          conversion.discardedTracks.length ||
          conversion.utilizedTracks.length !== tracks.length
        )
          throw new Error('Video conversion would discard source tracks')
        cancelled(deadline)
        await conversion.execute()
        cancelled(deadline)
        if (
          !target.buffer ||
          !target.buffer.byteLength ||
          target.buffer.byteLength > MEDIA_VIDEO_MAX_BYTES
        )
          throw new Error('Prepared video exceeds output limit')
        const metadata = inspectMp4(target.buffer)
        if (
          metadata.width !== size.width ||
          metadata.height !== size.height ||
          Math.abs(metadata.durationMs / 1000 - duration) > 0.15
        )
          throw new Error('Prepared video changed source timing or dimensions')
        // Verify that all original audio tracks survived muxing, including AAC
        // copies that require no browser audio encoder.
        const verified = new bunny.Input({
          source: new bunny.BlobSource(
            new Blob([target.buffer], { type: 'video/mp4' }),
          ),
          formats: [bunny.MP4],
        })
        try {
          if (
            (await verified.getAudioTracks()).length !== audios.length ||
            (await verified.getVideoTracks()).length !== 1
          )
            throw new Error('Prepared tracks differ from source')
        } finally {
          verified.dispose()
        }
        return {
          blob: new Blob([target.buffer], { type: 'video/mp4' }),
          ...metadata,
        }
      } finally {
        deadline.removeEventListener('abort', stop)
        if (conversion && conversion.state !== 'done')
          await conversion.cancel().catch(() => {})
        if (output.state !== 'finalized' && output.state !== 'canceled')
          await output.cancel().catch(() => {})
        input.dispose()
      }
    }
    try {
      if (!mainSize)
        throw new Error('Video shape cannot be reduced without cropping')
      const candidate = await convert(mainSize, mainBitrate)
      if (!original || candidate.blob.size < original.blob.size)
        main = candidate
      if (
        main &&
        mobileSize &&
        (mobileSize.width < main.width || mobileSize.height < main.height)
      ) {
        const candidate = await convert(
          mobileSize,
          Math.min(1_400_000, Math.floor(mainBitrate * 0.55)),
        )
        if (candidate.blob.size < main.blob.size) mobile = candidate
      }
    } catch (error) {
      cancelled(signal)
      if (!main)
        throw new UserFacingError(
          'video-compression',
          'Este navegador no pudo preparar un MP4 H.264 conservando todas sus pistas. Usa un navegador actualizado o un MP4 H.264 de hasta 10 MB.',
        )
      unsupported = true
      // A validated main rendition remains usable if only the optional mobile
      // conversion failed. No audio or video track is silently discarded.
      if (error instanceof UserFacingError && error.code === 'video-cancelled')
        throw error
    }
    if (!main)
      throw new UserFacingError(
        'video-compression',
        'No pudimos preparar el video. Prueba con otro MP4 H.264 de hasta 10 MB.',
      )
    const changed = main.blob !== file
    const message = changed
      ? `Video preparado: ${mb(file.size)} → ${mb(main.blob.size)}.${mobile ? ` Versión móvil: ${mb(mobile.blob.size)}.` : ''}`
      : unsupported
        ? 'Este navegador no pudo comprimir el video conservando todas sus pistas. Se conserva el MP4 H.264 original verificado.'
        : `El original ya es más ligero que la nueva exportación; se conserva.${mobile ? ` Se generó una versión móvil de ${mb(mobile.blob.size)}.` : ''}`
    return {
      main,
      mobile,
      optimization: {
        status: changed
          ? 'optimized'
          : unsupported
            ? 'unsupported'
            : 'original',
        originalBytes: file.size,
        mainBytes: main.blob.size,
        ...(mobile ? { mobileBytes: mobile.blob.size } : {}),
        message,
      },
    }
  } catch (error) {
    cancelled(signal)
    throw error
  } finally {
    signal?.removeEventListener('abort', stopProbe)
    probe.dispose()
  }
}
