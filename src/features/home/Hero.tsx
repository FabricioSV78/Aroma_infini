import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Link } from 'react-router'
import type { HomeHeroContent } from '../../types/home'
import type { Product } from '../../types/catalog'
import {
  getHeroFallback,
  orderedHeroContent,
  resolveHeroDestination,
} from '../../domain/hero-content'
import { Icon } from '../../components/ui/Icon'
import { HERO_SLIDE_INTERVAL_MS, useHeroRotation } from './useHeroRotation'
import { HeroVideo } from './HeroVideo'
import { headingText } from '../../utils/heading-text'
import { assetSource } from '../../services/asset-source'
import { imageSourceSet } from '../../services/image-source'
import {
  heroImageSource,
  heroImageSourceSet,
} from '../../services/hero-image-source'
import '../../styles/hero-video.css'

export const HERO_VIDEO_INTERVAL_MS = 15000
const mobileQuery =
  '(max-width: 599px), (max-width: 1023px) and (min-height: 501px)'
function subscribeViewport(onChange: () => void) {
  const query = matchMedia(mobileQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const mobileViewport = () => matchMedia(mobileQuery).matches

interface HeroProps {
  content: HomeHeroContent[]
  products?: readonly Product[]
  complementsEnabled?: boolean
}

export function Hero({
  content,
  products = [],
  complementsEnabled = false,
}: HeroProps) {
  const slides = orderedHeroContent(content, true)
  if (!slides.length) return null
  // Added/removed/reordered campaigns get their own request/decode lifecycle.
  return (
    <HeroCarousel
      key={slides.map((slide) => slide.id).join('|')}
      content={slides}
      products={products}
      complementsEnabled={complementsEnabled}
    />
  )
}

function HeroCarousel({
  content,
  products = [],
  complementsEnabled = false,
}: HeroProps) {
  const slides = content.map((slide) => {
    const fallback = getHeroFallback(slide.fallbackIndex)
    return {
      ...fallback,
      ...slide,
      image: slide.fallbackIndex === null ? slide.id : fallback.image,
      title: slide.title.split('\n').filter(Boolean).map(headingText),
    }
  })
  const mobile = useSyncExternalStore(
    subscribeViewport,
    mobileViewport,
    () => false,
  )
  const [active, setActive] = useState(0)
  const [preparedCount, setPreparedCount] = useState(1)
  const [readySlides, setReadySlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [failedSlides, setFailedSlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [videoFailures, setVideoFailures] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [videoPaused, setVideoPaused] = useState<ReadonlySet<string>>(
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
  const current = slides[active]

  function advance() {
    for (let offset = 1; offset < slides.length; offset++) {
      const index = (active + offset) % slides.length
      const image = images.current[index]
      if (readySlides.has(index) && image?.complete && image.naturalWidth > 0) {
        requested.current = index
        setActive(index)
        break
      }
    }
  }
  const rotation = useHeroRotation({
    element: heroRef,
    ready: readySlides.size > 1,
    active,
    intervalMs:
      current.mediaType === 'video' && !videoFailures.has(current.id)
        ? HERO_VIDEO_INTERVAL_MS
        : HERO_SLIDE_INTERVAL_MS,
    onAdvance: advance,
  })

  useEffect(function trackHeroMount() {
    mounted.current = true
    return () => {
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
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = requestAnimationFrame(() =>
            setPreparedCount((previous) => Math.max(previous, 2)),
          )
        })
      } else
        setPreparedCount((previous) =>
          Math.max(previous, Math.min(index + 2, slides.length)),
        )
    } catch {
      // A responsive source switch can interrupt decode; a later load retries.
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
    if (event.pointerType === 'touch')
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
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y
    if (Math.abs(dx) >= 48 && Math.abs(dx) >= Math.abs(dy) * 1.25)
      selectSlide(
        (requested.current + (dx < 0 ? 1 : -1) + slides.length) % slides.length,
      )
  }

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
      {slides.length > 1 ? (
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
                key={slide.id}
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
      ) : null}
      <div className="hero-stage">
        {slides.map((slide, index) => {
          const isActive = index === active
          const Heading = isActive ? 'h1' : 'h2'
          const videoCampaign = slide.mediaType === 'video'
          const mobileImage = videoCampaign
            ? slide.mobileVideo
              ? slide.mobilePoster
              : slide.poster
            : (slide.mobileImage ?? slide.desktopImage)
          const desktopImage = videoCampaign ? slide.poster : slide.desktopImage
          const source =
            mobile && slide.mobileVideo ? slide.mobileVideo : slide.video
          const selectedPoster = mobile ? mobileImage : desktopImage
          const destination = resolveHeroDestination(slide.destination, {
            products,
            complementsEnabled,
          })
          const canDownload = !rotation.reducedMotion && !rotation.saveData
          const playing =
            rotation.environmentActive &&
            canDownload &&
            !videoPaused.has(slide.id)
          return (
            <div
              key={slide.id}
              className={`hero-slide ${isActive ? 'is-active' : ''}`}
              data-tone={slide.tone}
              data-layout={slide.layout}
              data-campaign={slide.image}
              data-media-type={slide.mediaType}
              data-has-copy={
                slide.showText ||
                Boolean(slide.showButton && destination.href && slide.cta)
              }
              data-default-image={
                !videoCampaign &&
                !slide.desktopImage &&
                slide.fallbackIndex !== null
              }
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${slides.length}`}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              {index < preparedCount && !failedSlides.has(index) ? (
                <div className="hero-image">
                  <picture>
                    <source
                      media={mobileQuery}
                      srcSet={
                        mobileImage
                          ? (imageSourceSet(mobileImage, [480, 780, 1024]) ??
                            assetSource(mobileImage))
                          : heroImageSourceSet(
                              slide.image,
                              'mobile',
                              [480, 780, 1024],
                            )
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
                          Math.max(
                            previous,
                            Math.min(index + 2, slides.length),
                          ),
                        )
                        if (requested.current === index) {
                          requested.current = active
                          setImageError(
                            'No se pudo cargar esta fotografía. Puedes volver a intentarlo.',
                          )
                        }
                      }}
                      src={assetSource(
                        desktopImage ??
                          heroImageSource(slide.image, 'desktop', 1536),
                      )}
                      srcSet={
                        desktopImage
                          ? imageSourceSet(desktopImage, [960, 1536, 2048])
                          : heroImageSourceSet(
                              slide.image,
                              'desktop',
                              [960, 1536, 2048],
                            )
                      }
                      sizes="100vw"
                      width={2048}
                      height={1152}
                      alt={slide.alt}
                      fetchPriority={index === 0 ? 'high' : 'low'}
                      decoding="async"
                    />
                  </picture>
                  {isActive &&
                  videoCampaign &&
                  source &&
                  selectedPoster &&
                  readySlides.has(index) &&
                  !videoFailures.has(slide.id) ? (
                    <HeroVideo
                      key={source}
                      source={assetSource(source)}
                      poster={assetSource(selectedPoster)}
                      downloadAllowed={canDownload}
                      playing={playing}
                      onEnded={() => {
                        if (rotation.playing) advance()
                        else
                          setVideoPaused((previous) =>
                            new Set(previous).add(slide.id),
                          )
                      }}
                      maximumDurationMs={HERO_VIDEO_INTERVAL_MS}
                      onUnavailable={() =>
                        setVideoFailures((previous) =>
                          new Set(previous).add(slide.id),
                        )
                      }
                    />
                  ) : null}
                </div>
              ) : null}
              {slide.showText || (slide.showButton && destination.href) ? (
                <div className="hero-copy" data-show-text={slide.showText}>
                  {slide.showText ? (
                    <div className="hero-copy-heading">
                      {slide.eyebrow ? (
                        <p className="eyebrow">{slide.eyebrow}</p>
                      ) : null}
                      {slide.title.length ? (
                        <Heading className="hero-title">
                          {slide.title.map((line, lineIndex) => (
                            <span key={lineIndex}>{line}</span>
                          ))}
                        </Heading>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="hero-copy-details">
                    {slide.showText && slide.description ? (
                      <p className="hero-description">{slide.description}</p>
                    ) : null}
                    {slide.showButton && destination.href && slide.cta ? (
                      <Link
                        className="button button--primary hero-cta"
                        to={destination.href}
                        onPointerEnter={(event) => {
                          if (event.pointerType === 'mouse')
                            rotation.setHovered(true)
                        }}
                        onPointerLeave={() => rotation.setHovered(false)}
                      >
                        {slide.cta}
                        <Icon name="arrow" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {isActive && videoCampaign && canDownload && source ? (
                <button
                  type="button"
                  className="hero-video-toggle"
                  aria-label={
                    videoPaused.has(slide.id) || videoFailures.has(slide.id)
                      ? 'Reproducir video de campaña'
                      : 'Pausar video de campaña'
                  }
                  onClick={() => {
                    if (videoFailures.has(slide.id))
                      setVideoFailures((previous) => {
                        const next = new Set(previous)
                        next.delete(slide.id)
                        return next
                      })
                    else
                      setVideoPaused((previous) => {
                        const next = new Set(previous)
                        if (next.has(slide.id)) next.delete(slide.id)
                        else next.add(slide.id)
                        return next
                      })
                  }}
                >
                  <Icon
                    name={
                      videoPaused.has(slide.id) || videoFailures.has(slide.id)
                        ? 'play'
                        : 'pause'
                    }
                  />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {slides.length > 1 ? (
        <div
          className="hero-navigation"
          role="group"
          aria-label="Navegar campañas"
        >
          <button
            type="button"
            aria-label="Diapositiva anterior"
            onPointerEnter={handleNavigationPointerEnter}
            onPointerLeave={() => rotation.setHovered(false)}
            onClick={() =>
              selectSlide(
                (requested.current - 1 + slides.length) % slides.length,
              )
            }
          >
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            aria-label="Diapositiva siguiente"
            onPointerEnter={handleNavigationPointerEnter}
            onPointerLeave={() => rotation.setHovered(false)}
            onClick={() => selectSlide((requested.current + 1) % slides.length)}
          >
            <Icon name="chevron" />
          </button>
        </div>
      ) : null}
      <p
        className="sr-only"
        role="status"
        aria-live={rotation.playing ? 'off' : 'polite'}
        aria-atomic="true"
      >
        Diapositiva {active + 1} de {slides.length}:{' '}
        {current.title.join(' ') || current.alt}
        {imageError && ` ${imageError}`}
      </p>
    </section>
  )
}
