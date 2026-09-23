import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { heroSlides } from '../../content/home'
import { Icon } from '../../components/ui/Icon'
import { useHeroRotation } from './useHeroRotation'

export function Hero() {
  const [active, setActive] = useState(0)
  const [preparedCount, setPreparedCount] = useState(1)
  const [readySlides, setReadySlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [failedSlides, setFailedSlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [imageError, setImageError] = useState('')
  const images = useRef<(HTMLImageElement | null)[]>([])
  const requested = useRef(0)
  const frame = useRef(0)
  const mounted = useRef(true)
  const heroRef = useRef<HTMLElement>(null)
  const rotation = useHeroRotation({
    element: heroRef,
    ready: readySlides.size > 1,
    active,
    onAdvance() {
      for (let offset = 1; offset < heroSlides.length; offset++) {
        const index = (active + offset) % heroSlides.length
        const image = images.current[index]
        if (
          readySlides.has(index) &&
          image?.complete &&
          image.naturalWidth > 0
        ) {
          requested.current = index
          setActive(index)
          break
        }
      }
    },
  })

  useEffect(function trackHeroMount() {
    mounted.current = true
    return function cancelHeroPreparation() {
      mounted.current = false
      cancelAnimationFrame(frame.current)
    }
  }, [])

  async function revealWhenReady(index: number, image: HTMLImageElement) {
    try {
      await image.decode()
      if (!mounted.current) return
      setReadySlides((previous) => new Set(previous).add(index))
      if (requested.current === index) setActive(index)
      if (index === 0) {
        // Let the priority image paint before requesting the remaining campaigns.
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = requestAnimationFrame(() =>
            setPreparedCount((previous) => Math.max(previous, 2)),
          )
        })
      } else {
        setPreparedCount((previous) =>
          Math.max(previous, Math.min(index + 2, heroSlides.length)),
        )
      }
    } catch {
      // A responsive source change may interrupt decode; the next load retries.
    }
  }

  function selectSlide(index: number) {
    rotation.setPaused(true)
    requested.current = index
    setImageError('')
    setFailedSlides((previous) => {
      const next = new Set(previous)
      next.delete(index)
      return next
    })
    setPreparedCount((previous) => Math.max(previous, index + 1))
    const image = images.current[index]
    if (image?.complete && image.naturalWidth > 0)
      void revealWhenReady(index, image)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      selectSlide(
        (requested.current +
          (event.key === 'ArrowLeft' ? -1 : 1) +
          heroSlides.length) %
          heroSlides.length,
      )
    }
  }

  const current = heroSlides[active]
  return (
    <section
      ref={heroRef}
      className="hero"
      aria-roledescription="carrusel"
      aria-label="Selección editorial"
      onKeyDown={handleKeyDown}
      onFocusCapture={() => rotation.setPaused(true)}
    >
      <div
        className="hero-accessibility"
        role="group"
        aria-label="Controles de campañas"
      >
        <button
          type="button"
          disabled={rotation.reducedMotion}
          onClick={() => rotation.setPaused((previous) => !previous)}
        >
          {rotation.reducedMotion
            ? 'Cambio automático desactivado por movimiento reducido'
            : rotation.paused
              ? 'Reanudar cambio automático'
              : 'Pausar cambio automático'}
        </button>
        {heroSlides.map((slide, index) => (
          <button
            type="button"
            key={slide.image}
            aria-label={`Ver campaña ${index + 1}`}
            aria-pressed={active === index}
            onClick={() => selectSlide(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <div className="hero-stage">
        {heroSlides.map((slide, index) => {
          const isActive = index === active
          const Heading = isActive ? 'h1' : 'h2'
          return (
            <div
              key={slide.image}
              className={`hero-slide ${isActive ? 'is-active' : ''}`}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${heroSlides.length}`}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              {index < preparedCount && !failedSlides.has(index) && (
                <picture className="hero-image">
                  <source
                    media="(max-width: 1023px)"
                    srcSet={`/images/${slide.image}-mobile-480.webp 480w, /images/${slide.image}-mobile-780.webp 780w, /images/${slide.image}-mobile-1024.webp 1024w`}
                    sizes="100vw"
                    width={1024}
                    height={1536}
                  />
                  <img
                    ref={(image) => {
                      images.current[index] = image
                    }}
                    onLoad={(event) => {
                      void revealWhenReady(index, event.currentTarget)
                    }}
                    onError={() => {
                      setFailedSlides((previous) =>
                        new Set(previous).add(index),
                      )
                      setReadySlides((previous) => {
                        const next = new Set(previous)
                        next.delete(index)
                        return next
                      })
                      setPreparedCount((previous) =>
                        Math.max(
                          previous,
                          Math.min(index + 2, heroSlides.length),
                        ),
                      )
                      if (requested.current === index) {
                        requested.current = active
                        setImageError(
                          'No se pudo cargar esta fotografía. Puedes volver a intentarlo.',
                        )
                      }
                    }}
                    src={`/images/${slide.image}-desktop-1536.webp`}
                    srcSet={`/images/${slide.image}-desktop-960.webp 960w, /images/${slide.image}-desktop-1536.webp 1536w, /images/${slide.image}-desktop-2048.webp 2048w`}
                    sizes="100vw"
                    width={2048}
                    height={1152}
                    alt={slide.alt}
                    fetchPriority={index === 0 ? 'high' : 'low'}
                    decoding="async"
                  />
                </picture>
              )}
              <div className="hero-copy">
                <p className="eyebrow">{slide.eyebrow}</p>
                <Heading className="hero-title">
                  {slide.title.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </Heading>
                <p className="hero-description">{slide.description}</p>
                <Link
                  className="button button--primary hero-cta"
                  to={slide.to}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') rotation.setHovered(true)
                  }}
                  onPointerLeave={() => rotation.setHovered(false)}
                >
                  {slide.cta}
                  <Icon name="arrow" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
      <div
        className={`hero-position ${rotation.playing ? 'hero-position--playing' : ''}`}
        aria-hidden="true"
      >
        <span>
          0{active + 1} / 0{heroSlides.length}
        </span>
        <div className="hero-position-tracks">
          {heroSlides.map((slide, index) => (
            <span
              key={slide.image}
              className={index === active ? 'is-current' : ''}
            />
          ))}
        </div>
      </div>
      <p
        className="sr-only"
        role="status"
        aria-live={rotation.playing ? 'off' : 'polite'}
        aria-atomic="true"
      >
        Diapositiva {active + 1} de {heroSlides.length}:{' '}
        {current.title.join(' ')}
        {imageError && ` ${imageError}`}
      </p>
    </section>
  )
}
