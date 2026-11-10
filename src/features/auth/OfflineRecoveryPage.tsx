import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import {
  authPath,
  safeAuthReturn,
  type AuthAudience,
} from '../../domain/auth-navigation'
import {
  accountRecovery,
  AccountRecoveryError,
  isRecoveryCode,
} from '../../services/account-recovery'
import { SeoManager } from '../../seo/SeoManager'
import { RecoveryCodeReceipt } from '../account/RecoveryCodeSettings'
import { AdminAuthShell } from './AdminAuthShell'
import { PasswordField } from './PasswordField'
import './auth.css'
import './recovery-code.css'

type RecoveryField = 'email' | 'code' | 'password' | 'confirmation'

export function OfflineRecoveryPage({
  audience = 'customer',
  returnTo,
}: {
  audience?: AuthAudience
  returnTo?: string | null
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const target = safeAuthReturn(returnTo ?? params.get('returnTo'), audience)
  const login = authPath(audience, 'login', target)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<Partial<Record<RecoveryField, string>>>(
    {},
  )
  const [generalError, setGeneralError] = useState('')
  const [busy, setBusy] = useState(false)
  const [replacementCode, setReplacementCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [reviewRequired, setReviewRequired] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const submitButton = useRef<HTMLButtonElement>(null)

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (busy) return
    const first = (['email', 'code', 'password', 'confirmation'] as const).find(
      (field) => errors[field],
    )
    if (first) document.getElementById(`offline-recovery-${first}`)?.focus()
  }, [busy, errors])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || reviewRequired) return
    const next: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)
      next.email = 'Escribe un correo electrónico válido.'
    if (!isRecoveryCode(code))
      next.code = 'Introduce tu código de recuperación completo.'
    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    )
      next.password =
        'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.'
    if (password !== confirmation)
      next.confirmation = 'Las contraseñas deben coincidir.'
    setErrors(next)
    setGeneralError('')
    if (Object.keys(next).length) return
    const operation = new AbortController()
    controller.current = operation
    sending.current = true
    setBusy(true)
    try {
      const issued = await accountRecovery.recover({
        email,
        recoveryCode: code,
        newPassword: password,
        signal: operation.signal,
      })
      if (operation.signal.aborted) return
      setPassword('')
      setConfirmation('')
      setCode('')
      setReplacementCode(issued)
      setSaved(false)
    } catch (error) {
      if (operation.signal.aborted) return
      const reason =
        error instanceof AccountRecoveryError
          ? error.code
          : 'service_unavailable'
      if (reason === 'invalid_recovery')
        setErrors({
          code: 'El correo y el código no son válidos o el código ya fue utilizado.',
        })
      else if (reason === 'invalid_password')
        setErrors({
          password:
            'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.',
        })
      else {
        setGeneralError(
          reason === 'rate_limit'
            ? 'Has realizado varios intentos. Espera unos minutos antes de volver a intentar.'
            : reason === 'recovery_status_unknown'
              ? 'No pudimos confirmar el resultado. Prueba a iniciar sesión con tu nueva contraseña. Si no puedes acceder, solicita ayuda.'
              : 'No pudimos completar la recuperación. Revisa tu conexión e inténtalo de nuevo.',
        )
        if (reason === 'recovery_status_unknown') setReviewRequired(true)
      }
    } finally {
      sending.current = false
      if (!operation.signal.aborted) setBusy(false)
      if (controller.current === operation) controller.current = null
    }
  }

  const feedback = generalError && !replacementCode && (
    <Dialog
      open
      id="offline-recovery-error"
      title="No pudimos completar la recuperación"
      descriptionId="offline-recovery-error-description"
      onClose={() => setGeneralError('')}
      returnFocusRef={submitButton}
      className="auth-feedback-dialog"
    >
      <p
        id="offline-recovery-error-description"
        role="alert"
        className="auth-feedback-copy auth-feedback-copy--error"
      >
        {generalError}
      </p>
      <div className="account-email-actions">
        {reviewRequired && (
          <Link className="button button--secondary" to={login}>
            Iniciar sesión
          </Link>
        )}
        <button
          type="button"
          className="button button--primary"
          onClick={() => setGeneralError('')}
        >
          Entendido
        </button>
      </div>
    </Dialog>
  )

  const panel = (
    <section className="auth-form-panel" aria-labelledby="auth-title">
      <header className="auth-form-heading">
        <h1 id="auth-title">
          {audience === 'admin'
            ? 'Recuperar acceso administrativo'
            : replacementCode
              ? 'Contraseña actualizada'
              : 'Recuperar acceso'}
        </h1>
        <p>
          {audience === 'admin'
            ? 'El propietario del proyecto gestiona las credenciales administrativas directamente en Supabase.'
            : replacementCode
              ? 'Guarda el nuevo código antes de volver a iniciar sesión.'
              : 'Utiliza el código que guardaste en «Mi cuenta» para elegir una nueva contraseña.'}
        </p>
      </header>
      {audience === 'admin' ? (
        <>
          <p className="account-field-help">
            La recuperación de clientes no modifica cuentas administrativas ni
            elimina la verificación en dos pasos.
          </p>
          <Link className="auth-back" to={login}>
            Volver a iniciar sesión
          </Link>
        </>
      ) : replacementCode ? (
        <RecoveryCodeReceipt
          code={replacementCode}
          saved={saved}
          onSaved={setSaved}
          onComplete={() => navigate(login, { replace: true })}
          completeLabel="Volver a iniciar sesión"
        />
      ) : (
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-busy={busy}
        >
          <div className="auth-field">
            <label htmlFor="offline-recovery-email">Correo electrónico</label>
            <input
              id="offline-recovery-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setErrors((current) => ({ ...current, email: undefined }))
              }}
              required
              disabled={busy}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'offline-recovery-email-error' : undefined
              }
            />
            {errors.email && (
              <p id="offline-recovery-email-error" className="auth-field-error">
                {errors.email}
              </p>
            )}
          </div>
          <div className="auth-field">
            <label htmlFor="offline-recovery-code">
              Código de recuperación
            </label>
            <input
              id="offline-recovery-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={150}
              value={code}
              onChange={(event) => {
                setCode(event.target.value)
                setErrors((current) => ({ ...current, code: undefined }))
              }}
              required
              disabled={busy}
              aria-invalid={Boolean(errors.code)}
              aria-describedby={
                errors.code ? 'offline-recovery-code-error' : undefined
              }
            />
            {errors.code && (
              <p id="offline-recovery-code-error" className="auth-field-error">
                {errors.code}
              </p>
            )}
          </div>
          <PasswordField
            id="offline-recovery-password"
            label="Nueva contraseña"
            fresh
            value={password}
            onChange={(value) => {
              setPassword(value)
              setErrors((current) => ({ ...current, password: undefined }))
            }}
            error={errors.password}
            disabled={busy}
          />
          <PasswordField
            id="offline-recovery-confirmation"
            label="Confirmar contraseña"
            fresh
            value={confirmation}
            onChange={(value) => {
              setConfirmation(value)
              setErrors((current) => ({ ...current, confirmation: undefined }))
            }}
            error={errors.confirmation}
            disabled={busy}
          />
          <p id="auth-password-hint" className="auth-password-hint">
            Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.
          </p>
          <button
            ref={submitButton}
            className="button button--primary auth-submit"
            type="submit"
            disabled={busy || reviewRequired}
          >
            {busy ? 'Actualizando…' : 'Guardar nueva contraseña'}
          </button>
          <Link className="auth-back" to={login}>
            Volver a iniciar sesión
          </Link>
        </form>
      )}
      <div className="offline-recovery-help">
        <p>
          {audience === 'admin'
            ? 'Si necesitas asistencia, contacta con el responsable de Aroma Infini.'
            : '¿No conservas tu código? Solicita ayuda para revisar tu acceso.'}
        </p>
        <Link to="/contacto">Contactar con Aroma Infini</Link>
      </div>
    </section>
  )

  return (
    <>
      <SeoManager />
      {audience === 'admin' ? (
        <AdminAuthShell>{panel}</AdminAuthShell>
      ) : (
        <article className="auth-page container">
          <nav className="auth-breadcrumb" aria-label="Ruta de navegación">
            <Link to="/">Inicio</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Recuperar acceso</span>
          </nav>
          <div className="offline-recovery-layout">{panel}</div>
        </article>
      )}
      {feedback}
    </>
  )
}
