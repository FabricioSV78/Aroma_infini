import { useRef, useState } from 'react'
import { contactQrUrl } from '../../domain/contact-qr'
import { useAdminNotice } from './AdminNoticeProvider'

export function AdminContactQr() {
  const siteUrl = import.meta.env.VITE_SITE_URL
  const url = contactQrUrl(siteUrl)
  const notice = useAdminNotice()
  const [downloading, setDownloading] = useState<'svg' | 'png' | null>(null)
  const pending = useRef(false)

  async function download(format: 'svg' | 'png') {
    if (!url || pending.current) return
    pending.current = true
    setDownloading(format)
    try {
      const { downloadContactQr } = await import('../../services/contact-qr')
      await downloadContactQr(siteUrl, format)
      notice.toast(
        'QR descargado. Comprueba una impresión antes de enviar a imprenta.',
      )
    } catch {
      notice.show({
        kind: 'error',
        title: 'No se pudo descargar el QR',
        description:
          'Vuelve a intentar. Los datos de la tienda no han cambiado.',
        primary: { label: 'Entendido' },
      })
    } finally {
      pending.current = false
      setDownloading(null)
    }
  }

  return (
    <section
      className="admin-card contact-qr"
      aria-labelledby="contact-qr-title"
    >
      <h2 id="contact-qr-title">QR de Contacto</h2>
      {url ? (
        <>
          <p className="muted">
            Para las tarjetas de presentación de la tienda.
          </p>
          <p className="contact-qr-url">{url}</p>
        </>
      ) : (
        <p className="muted" id="contact-qr-unavailable">
          Disponible al configurar el dominio definitivo. No se generan QR de
          prueba.
        </p>
      )}
      <div className="contact-qr-actions" aria-busy={Boolean(downloading)}>
        {(['svg', 'png'] as const).map((format) => (
          <button
            key={format}
            type="button"
            className="button button--secondary"
            disabled={!url || Boolean(downloading)}
            aria-describedby={
              url ? 'contact-qr-print' : 'contact-qr-unavailable'
            }
            onClick={() => void download(format)}
          >
            {downloading === format
              ? 'Preparando…'
              : `Descargar ${format.toUpperCase()}`}
          </button>
        ))}
      </div>
      {url && (
        <p className="muted contact-qr-print" id="contact-qr-print">
          SVG recomendado para imprenta. Usa al menos 25 × 25 mm y conserva el
          margen blanco.
        </p>
      )}
    </section>
  )
}
