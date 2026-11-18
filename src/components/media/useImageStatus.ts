import { useEffect, useRef, useState } from 'react'

export type ImageStatus = 'pending' | 'ready' | 'error'

/** Observe the rendered image rather than downloading a second copy. The image
 * keeps its native paint timing while decode controls only the placeholder. */
export function useImageStatus(source: string, sourceSet?: string) {
  const ref = useRef<HTMLImageElement>(null)
  const [snapshot, setSnapshot] = useState<{
    source: string
    sourceSet?: string
    state: ImageStatus
    errorAspectRatio?: string
  }>(() => ({
    source,
    sourceSet,
    state: 'pending' as ImageStatus,
  }))

  useEffect(
    function observeImage() {
      const image = ref.current
      if (!image) return
      let active = true
      let revision = 0

      function update(state: ImageStatus) {
        if (active) setSnapshot({ source, sourceSet, state })
      }
      function failed() {
        if (image!.hasAttribute('data-media-fallback')) return
        revision++
        if (active) {
          const bounds = image!.getBoundingClientRect()
          setSnapshot({ source, sourceSet, state: 'error', errorAspectRatio:
            bounds.width > 0 && bounds.height > 0 ? `${bounds.width} / ${bounds.height}` : undefined })
        }
      }
      function loaded() {
        // A local error illustration is not a successful retry of the original
        // photograph. Keep the error state until the requested source changes.
        if (image!.hasAttribute('data-media-fallback')) return
        const current = ++revision
        const candidate = image!.currentSrc
        void image!.decode().then(
          () => {
            if (
              active &&
              current === revision &&
              image!.currentSrc === candidate &&
              image!.naturalWidth > 0
            )
              update('ready')
          },
          () => {
            // Changing a responsive candidate can cancel the previous decode.
            // Its own load/error event remains authoritative.
            if (
              active &&
              current === revision &&
              image!.currentSrc === candidate
            ) {
              // Some browsers reject decode even though the completed image
              // is valid and already painted. Do not leave it busy forever.
              if (image!.complete && image!.naturalWidth > 0) update('ready')
              else if (!image!.naturalWidth) failed()
            }
          },
        )
      }

      image.addEventListener('load', loaded)
      image.addEventListener('error', failed)
      // Cached/preloaded images can finish before the effect subscribes.
      if (image.complete) {
        if (image.naturalWidth) loaded()
        else failed()
      }
      return () => {
        active = false
        revision++
        image.removeEventListener('load', loaded)
        image.removeEventListener('error', failed)
      }
    },
    [source, sourceSet],
  )

  return {
    ref,
    errorAspectRatio:
      snapshot.source === source && snapshot.sourceSet === sourceSet
        ? snapshot.errorAspectRatio : undefined,
    state:
      snapshot.source === source && snapshot.sourceSet === sourceSet
        ? snapshot.state
        : ('pending' as const),
  }
}
