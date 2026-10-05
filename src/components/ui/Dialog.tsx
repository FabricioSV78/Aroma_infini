import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { IconButton } from './IconButton'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  id: string
  children: ReactNode
  className?: string
}
export function Dialog({
  open,
  onClose,
  title,
  id,
  children,
  className = '',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0)
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  useLayoutEffect(
    function synchronizeDialog() {
      const dialog = ref.current
      if (!dialog || !open) return
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const scrollX = window.scrollX
      const scrollY = window.scrollY
      dialog.showModal()
      if (window.scrollX !== scrollX || window.scrollY !== scrollY)
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
      return () => {
        dialog.close()
        document.body.style.overflow = previousOverflow
      }
    },
    [open],
  )
  return (
    <dialog
      id={id}
      ref={ref}
      aria-labelledby={`${id}-title`}
      className={`dialog ${className}`}
      onKeyDown={keepFocusInside}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id={`${id}-title`}>{title}</h2>
          <IconButton label="Cerrar" icon="close" onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  )
}
