import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { editorialFilm } from '../../content/editorial-film'
import type { HomeFilmContent } from '../../content/home-editor'
import { Icon } from '../../components/ui/Icon'

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
  const source =
    content.video ?? (wide ? editorialFilm.src : editorialFilm.mobileSrc)
  const poster =
    content.poster ?? (wide ? editorialFilm.poster : editorialFilm.mobilePoster)
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = failedSource === source
  const [playback, setPlayback] = useState<'auto' | 'paused' | 'playing'>(
    'auto',
  )
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const element = video.current
    const target = frame.current
    if (!element || !target) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean }
      }
    ).connection
    let inView = false
    let disposed = false

    function synchronize() {
      if (!element) return
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
            {content.title.split('\n').map((line, index) => (
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
          <img
            src={poster}
            alt={failed ? editorialFilm.description : ''}
            width={wide ? 1920 : 720}
            height={wide ? 926 : 1280}
            loading="lazy"
          />
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
          {!failed && (
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
          {failed && (
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
