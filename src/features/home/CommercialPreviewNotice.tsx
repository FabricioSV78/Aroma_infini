import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'

const previewSignals = [
  {
    eyebrow: 'Más explorado · ejemplo',
    copy: 'Pétale Nu está entre los aromas más visitados de esta demostración.',
    to: '/producto/petale-nu',
  },
  {
    eyebrow: 'Novedad · ejemplo',
    copy: 'Bois Clair se presenta como una incorporación editorial de muestra.',
    to: '/producto/bois-clair',
  },
  {
    eyebrow: 'Stock bajo · ejemplo',
    copy: 'Así se comunicarían las últimas unidades cuando el inventario real lo confirme.',
    to: '/producto/petale-nu',
  },
] as const

const previewSeenKey = 'aroma-infini:commercial-preview-seen:v1'

export function CommercialPreviewNotice() {
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(previewSeenKey) === 'true') return
    } catch {
      // El ejemplo sigue disponible aunque el navegador bloquee sessionStorage.
    }
    const timer = window.setTimeout(() => {
      setVisible(true)
      try {
        sessionStorage.setItem(previewSeenKey, 'true')
      } catch {
        // La vista previa sigue siendo operable sin persistencia local.
      }
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) return null
  const signal = previewSignals[active]

  function dismiss() {
    setVisible(false)
  }

  return (
    <aside
      className="commercial-preview-notice"
      aria-label="Vista previa de avisos comerciales"
    >
      <div className="commercial-preview-meta">
        <span>Vista previa</span>
        <span aria-label={`Ejemplo ${active + 1} de ${previewSignals.length}`}>
          0{active + 1} / 0{previewSignals.length}
        </span>
      </div>
      <div
        className="commercial-preview-message"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Aviso comercial de ejemplo"
      >
        <p className="commercial-preview-eyebrow">{signal.eyebrow}</p>
        <p>{signal.copy}</p>
      </div>
      <div className="commercial-preview-actions">
        <Link to={signal.to} onClick={dismiss}>
          Ver producto <Icon name="arrow" />
        </Link>
        <button
          type="button"
          onClick={() =>
            setActive((current) => (current + 1) % previewSignals.length)
          }
        >
          Siguiente ejemplo
        </button>
      </div>
      <button
        className="commercial-preview-close"
        type="button"
        aria-label="Cerrar vista previa"
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  )
}
