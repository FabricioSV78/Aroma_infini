import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import { Dialog } from '../../components/ui/Dialog'
import {
  AccountEmailChangeError,
  changeAccountEmail,
} from '../../services/account-email-change'
import { PasswordField } from '../auth/PasswordField'
import { useAuth } from '../auth/useAuth'
import '../auth/auth.css'

interface ChangeEmailDialogProps {
  currentEmail: string
  onClose: () => void
  onChanged: () => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

export function ChangeEmailDialog({
  currentEmail,
  onClose,
  onChanged,
  returnFocusRef,
}: ChangeEmailDialogProps) {
  const auth = useAuth()
  const owner = useRef(auth.session?.user.id)
  const operation = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  )
  const [generalError, setGeneralError] = useState('')
  const [reviewRequired, setReviewRequired] = useState(false)

  useEffect(() => {
    if (
      auth.status !== 'authenticated' ||
      auth.session?.user.id !== owner.current ||
      auth.session?.intent !== 'account'
    ) {
      operation.current?.abort()
      setPassword('')
      onClose()
    }
  }, [auth.status, auth.session?.user.id, auth.session?.intent, onClose])

  useEffect(() => () => operation.current?.abort(), [])

  useEffect(() => {
    if (busy) return
    const id = errors.email
      ? 'account-new-email'
      : errors.password
        ? 'account-email-password'
        : null
    if (id) document.getElementById(id)?.focus()
  }, [busy, errors])

  function close() {
    if (sending.current) return
    setPassword('')
    onClose()
    if (reviewRequired) onChanged()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || reviewRequired) return
    const next: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = 'Escribe un correo electrónico válido.'
    else if (email.trim().toLowerCase() === currentEmail.toLowerCase())
      next.email = 'Escribe un correo diferente al actual.'
    if (!password) next.password = 'Escribe tu contraseña actual.'
    setErrors(next)
    setGeneralError('')
    if (next.email || next.password) {
      document
        .getElementById(
          next.email ? 'account-new-email' : 'account-email-password',
        )
        ?.focus()
      return
    }
    const userId = owner.current
    if (!userId) return onClose()
    const controller = new AbortController()
    operation.current = controller
    sending.current = true
    setBusy(true)
    try {
      await changeAccountEmail({
        userId,
        email,
        currentPassword: password,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setPassword('')
      onClose()
      onChanged()
    } catch (error) {
      if (controller.signal.aborted) return
      const code =
        error instanceof AccountEmailChangeError
          ? error.code
          : 'service_unavailable'
      if (code === 'invalid_current_password') {
        setErrors({ password: 'La contraseña actual no es correcta.' })
        document.getElementById('account-email-password')?.focus()
      } else if (code === 'email_unavailable' || code === 'invalid_email') {
        setErrors({
          email:
            code === 'email_unavailable'
              ? 'Este correo no está disponible. Usa otro.'
              : 'Escribe un correo electrónico válido.',
        })
        document.getElementById('account-new-email')?.focus()
      } else
        setGeneralError(
          code === 'rate_limit'
            ? 'Has realizado varios intentos. Espera unos minutos antes de continuar.'
            : code === 'session_required' || code === 'account_changed'
              ? 'Tu sesión cambió. Inicia sesión de nuevo para continuar.'
              : code === 'mfa_required'
                ? 'Completa la verificación en dos pasos para continuar.'
                : code === 'change_status_unknown'
                  ? 'No pudimos confirmar el cambio. Revisa el correo de tu cuenta antes de volver a intentarlo.'
                  : code === 'permission_denied'
                    ? 'No pudimos verificar el acceso para cambiar este correo.'
                    : 'No pudimos cambiar tu correo. Revisa tu conexión e inténtalo de nuevo.',
        )
      if (code === 'change_status_unknown') setReviewRequired(true)
    } finally {
      if (!controller.signal.aborted) {
        sending.current = false
        setBusy(false)
      }
      if (operation.current === controller) operation.current = null
    }
  }

  return (
    <Dialog
      open
      id="account-change-email"
      title="Cambiar correo"
      onClose={close}
      closeDisabled={busy}
      descriptionId="account-change-email-description"
      returnFocusRef={returnFocusRef}
      className="account-change-email-dialog"
    >
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => void submit(event)}
        aria-busy={busy}
      >
        <p id="account-change-email-description" className="account-field-help">
          Confirma tu contraseña actual para usar un nuevo correo.
        </p>
        <div className="auth-field">
          <label htmlFor="account-new-email">Nuevo correo</label>
          <input
            id="account-new-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((current) => ({ ...current, email: undefined }))
            }}
            disabled={busy}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={
              errors.email ? 'account-new-email-error' : undefined
            }
            required
          />
          {errors.email && (
            <p id="account-new-email-error" className="auth-field-error">
              {errors.email}
            </p>
          )}
        </div>
        <PasswordField
          id="account-email-password"
          label="Contraseña actual"
          value={password}
          onChange={(value) => {
            setPassword(value)
            setErrors((current) => ({ ...current, password: undefined }))
          }}
          error={errors.password}
          disabled={busy}
        />
        {generalError && (
          <p role="alert" className="auth-field-error">
            {generalError}
          </p>
        )}
        <div className="account-email-actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={
              reviewRequired
                ? () => {
                    setPassword('')
                    onClose()
                    onChanged()
                  }
                : close
            }
          >
            {reviewRequired ? 'Revisar mis datos' : 'Cancelar'}
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || reviewRequired}
          >
            {busy ? 'Guardando…' : 'Guardar correo'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
