import { useEffect, useEffectEvent, useRef, useState } from 'react'

interface HeroVideoProps {
  source: string
  poster: string
  downloadAllowed: boolean
  playing: boolean
  onEnded: () => void
  onUnavailable: () => void
  maximumDurationMs: number
}

/** Only the active campaign mounts this player; posters do not depend on it. */
export function HeroVideo({
  source,
  poster,
  downloadAllowed,
  playing,
  onEnded,
  onUnavailable,
  maximumDurationMs,
}: HeroVideoProps) {
  const element = useRef<HTMLVideoElement>(null)
  const cancelPendingPlay = useRef<(() => void) | null>(null)
  const [painted, setPainted] = useState(false)
  const unavailable = useEffectEvent(onUnavailable)

  useEffect(
    function synchronizePlayback() {
      const video = element.current
      if (!video) return
      let cancelled = false
      if (!downloadAllowed) {
        video.pause()
        video.removeAttribute('src')
        video.load()
        return
      }
      if (!playing) {
        video.pause()
        return
      }
      if (video.getAttribute('src') !== source) video.src = source
      if (video.currentTime * 1000 >= maximumDurationMs) video.currentTime = 0
      const cancel = () => {
        cancelled = true
      }
      cancelPendingPlay.current = cancel
      void video
        .play()
        .then(() => {
          if (cancelled) video.pause()
        })
        .catch(() => {
          if (!cancelled) unavailable()
        })
      return () => {
        cancel()
        if (cancelPendingPlay.current === cancel)
          cancelPendingPlay.current = null
        video.pause()
      }
    },
    [source, downloadAllowed, playing, maximumDurationMs],
  )

  useEffect(function disposePlayer() {
    const video = element.current
    return () => {
      if (!video) return
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  return (
    <video
      ref={element}
      className={`hero-video${painted ? ' is-painted' : ''}`}
      muted
      playsInline
      preload="none"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setPainted(true)}
      onEnded={onEnded}
      onTimeUpdate={(event) => {
        if (event.currentTarget.currentTime * 1000 < maximumDurationMs) return
        // pause() can reject a pending play() before React commits playing=false.
        // Mark this intentional interruption before that rejection is handled.
        cancelPendingPlay.current?.()
        event.currentTarget.pause()
        onEnded()
      }}
      onError={onUnavailable}
    />
  )
}
