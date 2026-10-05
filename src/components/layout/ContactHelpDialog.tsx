import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { contactDetails } from '../../content/institutional'
import { buildWhatsAppUrl } from '../../utils/whatsapp'
import { Icon } from '../ui/Icon'

interface ContactHelpDialogProps {
  open: boolean
  onClose: (restoreFocus?: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function ContactHelpDialog({
  open,
  onClose,
  triggerRef,
}: ContactHelpDialogProps) {
  const [question, setQuestion] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const whatsappUrl = buildWhatsAppUrl(contactDetails.whatsappNumber, question)
  const hasWhatsApp = Boolean(buildWhatsAppUrl(contactDetails.whatsappNumber))

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose(true)
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, onClose, triggerRef])

  if (!open) return null

  return (
    <section
      id="help"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="help-title"
      className="contact-help-panel"
    >
      <div className="contact-help-panel-heading">
        <div>
          <p className="brand-label">Aroma Infini · Ayuda</p>
          <h2 id="help-title">¿En qué podemos ayudarte?</h2>
        </div>
        <button
          type="button"
          className="contact-help-close"
          aria-label="Cerrar ayuda"
          onClick={() => onClose(true)}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="contact-help-panel-content">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (whatsappUrl)
              window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
          }}
        >
          <label htmlFor="help-question">Tu consulta</label>
          <textarea
            id="help-question"
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Escribe aquí tu duda…"
            rows={3}
            maxLength={1000}
          />
          {!hasWhatsApp && (
            <p className="contact-help-hint" role="status">
              El número de WhatsApp aún no está configurado.
            </p>
          )}
          <button
            type="submit"
            className="button button--primary"
            disabled={!whatsappUrl}
          >
            Enviar por WhatsApp <Icon name="arrow" />
          </button>
        </form>
        <Link
          className="contact-help-more"
          to="/contacto"
          onClick={() => onClose()}
        >
          Más opciones de ayuda <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
