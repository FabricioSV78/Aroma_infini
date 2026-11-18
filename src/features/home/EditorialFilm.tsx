import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { LoadingImage } from '../../components/media/LoadingImage'
import { editorialFilm } from '../../content/editorial-film'
import type { HomeFilmContent } from '../../content/home-editor'
import { Icon } from '../../components/ui/Icon'
import { headingText } from '../../utils/heading-text'
import { assetSource } from '../../services/asset-source'
import { useDesktopVideo } from '../../components/media/useDesktopVideo'
import { filmVisualSources } from '../../domain/film-visuals'

function subscribeViewport(onChange: () => void) {
  const query = matchMedia('(min-width: 768px)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const wideViewport = () => matchMedia('(min-width: 768px)').matches

export function EditorialFilm({ content }: { content: HomeFilmContent }) {
  const wide = useSyncExternalStore(
    subscribeViewport,
    wideViewport,
    () => false,
  )
  const desktopVideo = useDesktopVideo()
  const visuals = filmVisualSources(content)
  const source = desktopVideo ? assetSource(visuals.video) : null
  const selectedPoster = desktopVideo ? visuals.desktop : visuals.mobile
  const poster = selectedPoster ? assetSource(selectedPoster) : undefined
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = source !== null && failedSource === source
  const [playback, setPlayback] = useState<'auto' | 'paused' | 'playing'>(
    'auto',
  )
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const element = video.current
    const target = frame.current
    if (!element || !target || !source) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean }
      }
    ).connection
    let inView = false
    let disposed = false

    function synchronize() {
      if (!element || !source) return
      if (
        !inView ||
        document.hidden ||
        playback === 'paused' ||
        (playback === 'auto' && (motion.matches || connection?.saveData))
      ) {
        element.pause()
        return
      }
      if (element.getAttribute('src') !== source) element.src = source
      void element
        .play()
        .then(() => {
          if (
            disposed ||
            !inView ||
            document.hidden ||
            (playback === 'auto' && motion.matches)
          )
            element.pause()
        })
        .catch(() => {
          /* Keep the poster if the browser blocks autoplay. */
        })
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.intersectionRatio >= 0.35
        synchronize()
      },
      { threshold: [0, 0.35] },
    )
    observer.observe(target)
    motion.addEventListener('change', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    return () => {
      disposed = true
      observer.disconnect()
      motion.removeEventListener('change', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
      element.pause()
    }
  }, [source, playback])

  useEffect(
    function releaseVideoSource() {
      const element = video.current
      return () => {
        if (!element) return
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
    },
    [source],
  )

  return (
    <section
      className="editorial-film"
      id="ritual"
      aria-labelledby="editorial-film-title"
    >
      <div className="editorial-film-inner container">
        <div className="editorial-film-copy">
          <p className="eyebrow">{content.eyebrow}</p>
          <h2 id="editorial-film-title">
            {headingText(content.title)
              .split('\n')
              .map((line, index) => (
                <span key={index}>
                  {index > 0 && <br />}
                  {line}
                </span>
              ))}
          </h2>
          <p>{content.description}</p>
          <Link className="text-link" to="/tienda">
            {content.cta} <Icon name="arrow" />
          </Link>
        </div>
        <div className="editorial-film-media" ref={frame}>
          <LoadingImage
            src={poster}
            alt={!desktopVideo || failed ? editorialFilm.description : ''}
            width={wide ? 1920 : 720}
            height={wide ? 926 : 900}
            loading="lazy"
          />
          {source ? (
            <video
              key={source}
              ref={video}
              muted
              playsInline
              loop
              preload="none"
              aria-label={editorialFilm.description}
              poster={poster}
              hidden={failed}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => {
                setFailedSource(source)
              }}
            />
          ) : null}
          {source && !failed && (
            <button
              type="button"
              className="editorial-film-toggle"
              aria-label={
                playing
                  ? 'Pausar video editorial'
                  : 'Reproducir video editorial'
              }
              onClick={() => setPlayback(playing ? 'paused' : 'playing')}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
          )}
          {source && failed && (
            <p className="editorial-film-fallback" role="status">
              El video no está disponible. Puedes seguir explorando la
              colección.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
