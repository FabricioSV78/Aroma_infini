import { useRef, useState, type UIEvent } from 'react'
import type { ProductGalleryView } from '../../types/catalog'

interface ProductGalleryProps {
  name: string
  views: ProductGalleryView[]
}

export function ProductGallery({ name, views }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  function selectMobileView(index: number) {
    setActiveIndex(index)
    const track = trackRef.current
    if (!track) return
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: 'smooth',
    })
  }

  function readScrollPosition(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget
    const next = Math.min(
      views.length - 1,
      Math.max(0, Math.round(track.scrollLeft / track.clientWidth)),
    )
    setActiveIndex(next)
  }

  return (
    <section
      className="product-gallery"
      aria-label={`Galería de ${name}`}
      aria-roledescription="carrusel"
    >
      <div className="product-gallery-layout">
        <div className="product-thumbnails" aria-label="Vistas del producto">
          {views.map((view, index) => (
            <button
              key={`${view.image}-${view.framing}`}
              type="button"
              className="product-thumbnail"
              aria-label={`Ver imagen ${index + 1} de ${views.length}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => setActiveIndex(index)}
            >
              <img
                src={`/images/${view.image}-480.webp`}
                width={480}
                height={600}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <div
          ref={trackRef}
          className="product-gallery-track"
          onScroll={readScrollPosition}
        >
          {views.map((view, index) => (
            <figure
              key={`${view.image}-${view.framing}`}
              className={`product-gallery-frame product-gallery-frame--${view.framing}${
                activeIndex === index ? ' is-active' : ''
              }`}
              aria-hidden={activeIndex !== index ? 'true' : undefined}
            >
              <img
                src={`/images/${view.image}-480.webp`}
                srcSet={`/images/${view.image}-480.webp 480w, /images/${view.image}-960.webp 960w`}
                sizes="(min-width: 1024px) 52vw, 100vw"
                width={960}
                height={1200}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
                decoding="async"
                alt={view.alt}
              />
            </figure>
          ))}
        </div>
      </div>
      <div className="product-gallery-mobile-controls">
        <p aria-live="polite">
          {String(activeIndex + 1).padStart(2, '0')}
          <span aria-hidden="true"> / </span>
          <span className="sr-only"> de </span>
          {String(views.length).padStart(2, '0')}
        </p>
        <div aria-label="Cambiar vista">
          {views.map((view, index) => (
            <button
              key={`${view.image}-${view.framing}`}
              type="button"
              aria-label={`Ver imagen ${index + 1} de ${views.length}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => selectMobileView(index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
