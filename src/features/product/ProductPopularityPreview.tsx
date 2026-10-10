import { useEffect, useRef, useState } from 'react'
import { imageSource } from '../../services/image-source'

interface ProductPopularityPreviewProps {
  productImage: string
  productName: string
  description: string
  bestseller: boolean
}

export function ProductPopularityPreview({
  productImage,
  productName,
  description,
  bestseller,
}: ProductPopularityPreviewProps) {
  const [ready, setReady] = useState(false)
  const [galleryPassed, setGalleryPassed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const noticeRef = useRef<HTMLElement>(null)
  const dismissTimer = useRef<number | undefined>(undefined)

  useEffect(function showProductNotice() {
    const showTimer = window.setTimeout(() => setReady(true), 1000)
    return () => window.clearTimeout(showTimer)
  }, [])

  useEffect(() => {
    const gallery = document.querySelector('.product-gallery')
    if (!gallery) return
    const updatePosition = () => {
      setGalleryPassed(gallery.getBoundingClientRect().bottom <= 80)
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [])

  useEffect(() => {
    if (
      dismissed ||
      !ready ||
      !galleryPassed ||
      dismissTimer.current !== undefined
    )
      return
    const startWhenVisible = () => {
      if (window.matchMedia('(max-width: 1399px)').matches) {
        const bounds = noticeRef.current?.getBoundingClientRect()
        if (!bounds || bounds.top >= window.innerHeight || bounds.bottom <= 0)
          return
      }
      dismissTimer.current = window.setTimeout(() => setDismissed(true), 7000)
      window.removeEventListener('scroll', startWhenVisible)
      window.removeEventListener('resize', startWhenVisible)
    }
    window.addEventListener('scroll', startWhenVisible, { passive: true })
    window.addEventListener('resize', startWhenVisible)
    startWhenVisible()
    return () => {
      window.removeEventListener('scroll', startWhenVisible)
      window.removeEventListener('resize', startWhenVisible)
    }
  }, [ready, galleryPassed, dismissed])

  useEffect(() => () => window.clearTimeout(dismissTimer.current), [])

  if (!ready || !galleryPassed || dismissed) return null

  return (
    <aside
      ref={noticeRef}
      className="product-popularity-preview"
      aria-label={`Sobre ${productName}`}
    >
      <img
        src={imageSource(productImage)}
        width={480}
        height={600}
        decoding="async"
        alt=""
      />
      <div className="product-popularity-preview-message" role="status">
        <span>
          <i aria-hidden="true" /> Selección{' '}
          <span className="brand-label">Aroma Infini</span>
        </span>
        <p>{bestseller ? 'Entre los más vendidos' : productName}</p>
        <p>{description}</p>
      </div>
      <button
        type="button"
        aria-label={`Cerrar aviso sobre ${productName}`}
        onClick={() => {
          window.clearTimeout(dismissTimer.current)
          setDismissed(true)
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  )
}
