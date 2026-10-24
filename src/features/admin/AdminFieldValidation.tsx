import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
interface FieldError {
  control: Field
  label: HTMLLabelElement
  id: string
  message: string
  describedBy: string | null
  ariaLabel: string | null
}

function validationText(field: Field) {
  if (field.validity.valueMissing) return 'Completa este campo.'
  if (field.validity.typeMismatch)
    return field instanceof HTMLInputElement && field.type === 'email'
      ? 'Escribe un correo válido.'
      : 'Revisa el formato de este campo.'
  if (field.validity.rangeUnderflow)
    return `El valor mínimo es ${field.getAttribute('min')}.`
  if (field.validity.rangeOverflow)
    return `El valor máximo es ${field.getAttribute('max')}.`
  if (field.validity.stepMismatch)
    return 'Revisa los decimales de este importe.'
  if (field.validity.patternMismatch)
    return 'Usa el formato indicado debajo del campo.'
  return 'Revisa el valor de este campo.'
}

function restore(error: FieldError) {
  error.control.removeAttribute('aria-invalid')
  if (error.describedBy === null)
    error.control.removeAttribute('aria-describedby')
  else error.control.setAttribute('aria-describedby', error.describedBy)
  if (error.ariaLabel === null) error.control.removeAttribute('aria-label')
  else error.control.setAttribute('aria-label', error.ariaLabel)
}

/** Keep native constraint rules, while presenting their errors next to each field. */
export function AdminFieldValidation({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<FieldError[]>([])
  const currentErrors = useRef<FieldError[]>([])
  const sequence = useRef(0)
  const focusFrame = useRef<number | null>(null)
  useEffect(
    () => () => {
      currentErrors.current.forEach(restore)
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    },
    [],
  )
  function invalid(event: FormEvent<HTMLDivElement>) {
    const field = event.target
    if (!(
      field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement ||
      field instanceof HTMLTextAreaElement
    ))
      return
    const label = field.labels?.[0]
    if (!label) return
    event.preventDefault()
    let error = currentErrors.current.find((item) => item.control === field)
    if (!error) {
      error = {
        control: field,
        label,
        id: `admin-field-error-${++sequence.current}`,
        message: validationText(field),
        describedBy: field.getAttribute('aria-describedby'),
        ariaLabel: field.getAttribute('aria-label'),
      }
      // The error is inside the visual label; keep its accessible name stable.
      if (!error.ariaLabel) {
        const labelCopy = label.cloneNode(true) as HTMLLabelElement
        labelCopy
          .querySelectorAll(
            'input, select, textarea, small, [aria-hidden="true"]',
          )
          .forEach((node) => node.remove())
        field.setAttribute(
          'aria-label',
          labelCopy.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        )
      }
      field.setAttribute(
        'aria-describedby',
        [error.describedBy, error.id].filter(Boolean).join(' '),
      )
      currentErrors.current = [
        ...currentErrors.current.filter((item) => item.control.isConnected),
        error,
      ]
    } else error.message = validationText(field)
    field.setAttribute('aria-invalid', 'true')
    setErrors([...currentErrors.current])
    if (focusFrame.current === null)
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = null
        const first = currentErrors.current.find(
          (item) => item.control.isConnected && !item.control.validity.valid,
        )
        first?.control.focus()
      })
  }
  function input(event: FormEvent<HTMLDivElement>) {
    const field = event.target
    const error = currentErrors.current.find((item) => item.control === field)
    if (!error || !error.control.validity.valid) return
    restore(error)
    currentErrors.current = currentErrors.current.filter(
      (item) => item !== error,
    )
    setErrors([...currentErrors.current])
  }
  return (
    <div
      className="admin-field-validation"
      onInvalidCapture={invalid}
      onInputCapture={input}
      onChangeCapture={input}
    >
      {children}
      {errors
        .filter((error) => error.control.isConnected)
        .map((error) =>
          createPortal(
            <small id={error.id} className="admin-field-error" role="alert">
              {error.message}
            </small>,
            error.label,
            error.id,
          ),
        )}
    </div>
  )
}
