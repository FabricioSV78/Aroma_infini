import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Link } from 'react-router'
import { heroSlides } from '../../content/home'
import type { HomeHeroContent } from '../../content/home-editor'
import { Icon } from '../../components/ui/Icon'
import { useHeroRotation } from './useHeroRotation'

export function Hero({ content }: { content: HomeHeroContent[] }) {
  const slides = heroSlides.map((slide, index) => ({
    ...slide,
    ...content[index],
    title: content[index]?.title.split('\n') ?? slide.title,
  }))
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
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  )
  const rotation = useHeroRotation({
    element: heroRef,
    ready: readySlides.size > 1,
    active,
    onAdvance() {
      for (let offset = 1; offset < slides.length; offset++) {
        const index = (active + offset) % slides.length
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
          Math.max(previous, Math.min(index + 2, slides.length)),
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

  function handleNavigationPointerEnter(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === 'mouse') rotation.setHovered(true)
  }

  function handleNavigationPointerLeave() {
    rotation.setHovered(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      selectSlide(
        (requested.current +
          (event.key === 'ArrowLeft' ? -1 : 1) +
          slides.length) %
          slides.length,
      )
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || start.pointerId !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    selectSlide(
      (requested.current + (dx < 0 ? 1 : -1) + slides.length) % slides.length,
    )
  }

  const current = slides[active]
  return (
    <section
      ref={heroRef}
      className="hero"
      aria-roledescription="carrusel"
      aria-label="Selección editorial"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null
      }}
      onFocusCapture={() => rotation.setPaused(true)}
    >
      <div
        className="hero-accessibility hero-position"
        role="group"
        aria-label="Controles de campañas"
        aria-description="Al seleccionar una campaña, el cambio automático se detiene."
      >
        <div className="hero-position-tracks">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.image}
              aria-label={`Ver campaña ${index + 1}`}
              aria-pressed={active === index}
              className={index === active ? 'is-current' : ''}
              onClick={() => selectSlide(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className="hero-stage">
        {slides.map((slide, index) => {
          const isActive = index === active
          const Heading = isActive ? 'h1' : 'h2'
          return (
            <div
              key={slide.image}
              className={`hero-slide ${isActive ? 'is-active' : ''}`}
              data-tone={slide.tone}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${slides.length}`}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              {index < preparedCount && !failedSlides.has(index) && (
                <picture className="hero-image">
                  <source
                    media="(max-width: 599px), (max-width: 1023px) and (min-height: 501px)"
                    srcSet={
                      slide.mobileImage ??
                      slide.desktopImage ??
                      `/images/${slide.image}-mobile-480.webp 480w, /images/${slide.image}-mobile-780.webp 780w, /images/${slide.image}-mobile-1024.webp 1024w`
                    }
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
                        Math.max(previous, Math.min(index + 2, slides.length)),
                      )
                      if (requested.current === index) {
                        requested.current = active
                        setImageError(
                          'No se pudo cargar esta fotografía. Puedes volver a intentarlo.',
                        )
                      }
                    }}
                    src={
                      slide.desktopImage ??
                      `/images/${slide.image}-desktop-1536.webp`
                    }
                    srcSet={
                      slide.desktopImage
                        ? undefined
                        : `/images/${slide.image}-desktop-960.webp 960w, /images/${slide.image}-desktop-1536.webp 1536w, /images/${slide.image}-desktop-2048.webp 2048w`
                    }
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
                  {slide.title.map((line, lineIndex) => (
                    <span key={lineIndex}>{line}</span>
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
        className="hero-navigation"
        role="group"
        aria-label="Navegar campañas"
      >
        <button
          type="button"
          aria-label="Diapositiva anterior"
          onPointerEnter={handleNavigationPointerEnter}
          onPointerLeave={handleNavigationPointerLeave}
          onClick={() =>
            selectSlide((requested.current - 1 + slides.length) % slides.length)
          }
        >
          <Icon name="chevron" />
        </button>
        <button
          type="button"
          aria-label="Diapositiva siguiente"
          onPointerEnter={handleNavigationPointerEnter}
          onPointerLeave={handleNavigationPointerLeave}
          onClick={() => selectSlide((requested.current + 1) % slides.length)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <p
        className="sr-only"
        role="status"
        aria-live={rotation.playing ? 'off' : 'polite'}
        aria-atomic="true"
      >
        Diapositiva {active + 1} de {slides.length}: {current.title.join(' ')}
        {imageError && ` ${imageError}`}
      </p>
    </section>
  )
}
