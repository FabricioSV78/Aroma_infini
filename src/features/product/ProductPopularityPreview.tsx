import { useEffect, useState } from 'react'
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
  const [visible, setVisible] = useState(false)

  useEffect(function showProductNotice() {
    const showTimer = window.setTimeout(() => setVisible(true), 1000)
    return () => window.clearTimeout(showTimer)
  }, [])

  useEffect(
    function dismissProductNotice() {
      if (!visible) return
      const dismissTimer = window.setTimeout(() => setVisible(false), 7000)
      return () => window.clearTimeout(dismissTimer)
    },
    [visible],
  )

  if (!visible) return null

  return (
    <aside
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
          <i aria-hidden="true" /> Selección <span className="brand-label">Aroma Infini</span>
        </span>
        <p>{bestseller ? 'Entre los más vendidos' : productName}</p>
        <p>{description}</p>
      </div>
      <button
        type="button"
        aria-label={`Cerrar aviso sobre ${productName}`}
        onClick={() => setVisible(false)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  )
}
