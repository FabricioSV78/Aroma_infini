import { useEffect, useState } from 'react'

interface ProductPopularityPreviewProps {
  productImage: string
  productName: string
  productSlug: string
}

interface ProductInterestMessage {
  label: string
  copy: string
}

const productMessages: Record<string, ProductInterestMessage> = {
  'bois-clair': {
    label: 'Uno de los más elegidos',
    copy: 'Bois Clair destaca entre quienes prefieren aromas amaderados y frescos.',
  },
  'petale-nu': {
    label: 'Entre los más vendidos',
    copy: 'Pétale Nu es uno de los favoritos de nuestra selección floral.',
  },
  'vert-silence': {
    label: 'Muy visitado',
    copy: 'Vert Silence está despertando especial interés por su perfil verde y preciso.',
  },
  'ambre-lent': {
    label: 'Uno de los más buscados',
    copy: 'Ambre Lent atrae a quienes buscan una estela cálida y envolvente.',
  },
}

const fallbackMessages: ProductInterestMessage[] = [
  {
    label: 'Muy visitado',
    copy: 'Este perfume está despertando especial interés en nuestra selección.',
  },
  {
    label: 'Uno de los favoritos',
    copy: 'Una elección destacada entre quienes exploran nuevos aromas.',
  },
  {
    label: 'Entre los más elegidos',
    copy: 'Un perfume que está llamando la atención de nuestra comunidad.',
  },
]

function getProductMessage(productSlug: string) {
  const knownMessage = productMessages[productSlug]
  if (knownMessage) return knownMessage
  const messageIndex = [...productSlug].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return fallbackMessages[messageIndex % fallbackMessages.length]
}

export function ProductPopularityPreview({
  productImage,
  productName,
  productSlug,
}: ProductPopularityPreviewProps) {
  const [visible, setVisible] = useState(false)
  const message = getProductMessage(productSlug)

  useEffect(() => {
    const seenKey = `aroma-infini:product-interest-notice:${productSlug}:v2`
    try {
      if (sessionStorage.getItem(seenKey) === 'true') return
    } catch {
      // El aviso sigue disponible aunque el navegador bloquee sessionStorage.
    }
    const timer = window.setTimeout(() => {
      setVisible(true)
      try {
        sessionStorage.setItem(seenKey, 'true')
      } catch {
        // El aviso sigue siendo operable sin persistencia local.
      }
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [productSlug])

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), 7200)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <aside
      className="product-popularity-preview"
      aria-label={`Interés en ${productName}`}
    >
      <img
        src={`/images/${productImage}-480.webp`}
        width={480}
        height={600}
        loading="eager"
        decoding="async"
        alt=""
      />
      <div
        className="product-popularity-preview-message"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          <i aria-hidden="true" /> Selección Aroma Infini
        </span>
        <p>{message.label}</p>
        <p>{message.copy}</p>
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
