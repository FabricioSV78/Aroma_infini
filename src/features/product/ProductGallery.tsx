import { useEffect, useRef, useState, type UIEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import type { ProductGalleryView } from '../../types/catalog'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { PRODUCT_GALLERY_SIZES } from '../../domain/product-gallery'

interface ProductGalleryProps {
  name: string
  views: ProductGalleryView[]
}

interface GalleryPhotoProps {
  image: string
  alt: string
  priority: 'high' | 'low'
  thumbnail?: boolean
}

function GalleryPhoto({
  image,
  alt,
  priority,
  thumbnail = false,
}: GalleryPhotoProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<'pending' | 'ready' | 'error'>('pending')

  useEffect(() => {
    const photo = ref.current
    if (!photo) return
    let active = true
    let revision = 0
    function failed() {
      revision++
      if (active) setState('error')
    }
    function loaded() {
      const current = ++revision
      void photo!.decode().then(
        () => {
          if (active && current === revision) setState('ready')
        },
        () => {
          // A responsive candidate can change while a previous decode is
          // pending. Its own load/error event remains authoritative.
          if (active && current === revision && !photo!.naturalWidth) failed()
        },
      )
    }
    photo.addEventListener('load', loaded)
    photo.addEventListener('error', failed)
    // A preload or the browser cache can complete before React attaches this
    // effect. Do not leave an already decoded photograph behind a placeholder.
    if (photo.complete) {
      if (photo.naturalWidth) loaded()
      else failed()
    }
    return () => {
      active = false
      revision++
      photo.removeEventListener('load', loaded)
      photo.removeEventListener('error', failed)
    }
  }, [])

  return (
    <>
      <span
        className="product-photo-placeholder"
        data-image-placeholder=""
        data-state={state}
        role={state === 'error' && !thumbnail ? 'img' : undefined}
        aria-label={
          state === 'error' && !thumbnail
            ? `Imagen no disponible: ${alt}`
            : undefined
        }
        aria-hidden={state === 'error' && !thumbnail ? undefined : true}
      >
        <Icon name="scent" />
        {state === 'error' && !thumbnail ? (
          <span>Imagen no disponible</span>
        ) : null}
      </span>
      <img
        ref={ref}
        className="product-gallery-photo"
        data-state={state}
        src={imageSource(image)}
        srcSet={imageSourceSet(image, [480, 960])}
        // Thumbnail and full view intentionally share the gallery's candidate:
        // each photo already needs this rendition, so no extra 480 px download
        // or authoritative manifest request is needed just for its thumbnail.
        sizes={PRODUCT_GALLERY_SIZES}
        width={thumbnail ? 480 : 960}
        height={thumbnail ? 600 : 1200}
        loading={priority === 'high' && !thumbnail ? 'eager' : 'lazy'}
        fetchPriority={priority}
        decoding="async"
        alt={state === 'error' ? '' : alt}
        aria-hidden={state === 'error' ? true : undefined}
        aria-busy={state === 'pending' ? true : undefined}
      />
    </>
  )
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
      className={`product-gallery${views.length === 1 ? ' product-gallery--single' : ''}`}
      aria-label={`Galería de ${name}`}
      aria-roledescription="carrusel"
    >
      <div className="product-gallery-layout">
        <div className="product-thumbnails" aria-label="Vistas del producto">
          {views.map((view, index) => (
            <button
              key={index}
              type="button"
              className="product-thumbnail"
              aria-label={`Ver imagen ${index + 1} de ${views.length}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => setActiveIndex(index)}
            >
              <GalleryPhoto
                key={view.image}
                image={view.image}
                alt=""
                priority="low"
                thumbnail
              />
              <span aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
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
              key={index}
              className={`product-gallery-frame product-gallery-frame--${view.framing}${
                activeIndex === index ? ' is-active' : ''
              }`}
              aria-hidden={activeIndex !== index ? 'true' : undefined}
            >
              <GalleryPhoto
                key={view.image}
                image={view.image}
                priority={index === 0 || index === activeIndex ? 'high' : 'low'}
                alt={view.alt.trim() || `Vista ${index + 1} de ${name}`}
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
