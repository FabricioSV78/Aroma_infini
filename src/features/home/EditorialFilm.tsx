import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { editorialFilm } from '../../content/editorial-film'
import { Icon } from '../../components/ui/Icon'

function subscribeViewport(onChange: () => void) {
  const query = matchMedia('(min-width: 768px)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const wideViewport = () => matchMedia('(min-width: 768px)').matches

export function EditorialFilm() {
  const wide = useSyncExternalStore(
    subscribeViewport,
    wideViewport,
    () => false,
  )
  const source = wide ? editorialFilm.src : editorialFilm.mobileSrc
  const poster = wide ? editorialFilm.poster : editorialFilm.mobilePoster
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

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
        motion.matches ||
        connection?.saveData
      ) {
        element.pause()
        return
      }
      if (element.getAttribute('src') !== source) element.src = source
      void element
        .play()
        .then(() => {
          if (disposed || !inView || document.hidden || motion.matches)
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
  }, [source])

  return (
    <section className="editorial-film" aria-labelledby="editorial-film-title">
      <div className="editorial-film-inner container">
        <div className="editorial-film-copy">
          <p className="eyebrow">El ritual del perfume</p>
          <h2 id="editorial-film-title">
            Un gesto.
            <br />
            Algo muy tuyo.
          </h2>
          <p>
            Hay pequeños momentos que cambian el día. Elegir un aroma, sentirlo
            en la piel y hacerlo parte de ti.
          </p>
          <Link className="text-link" to="/tienda">
            Encuentra tu perfume <Icon name="arrow" />
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
            onError={() => {
              setFailed(true)
            }}
          />
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
