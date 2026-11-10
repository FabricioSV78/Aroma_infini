import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import {
  accountRecovery,
  AccountRecoveryError,
  type RecoveryCodeStatus,
} from '../../services/account-recovery'
import { PasswordField } from '../auth/PasswordField'
import { useAuth } from '../auth/useAuth'
import '../auth/auth.css'
import '../auth/recovery-code.css'

export function RecoveryCodeSettings() {
  const auth = useAuth()
  const userId = auth.session?.user.id
  const customer =
    auth.status === 'authenticated' && auth.session?.user.role === 'customer'
  return customer && userId ? (
    <RecoveryCodeSettingsContent key={userId} userId={userId} />
  ) : null
}

function RecoveryCodeSettingsContent({ userId }: { userId: string }) {
  const [status, setStatus] = useState<RecoveryCodeStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  const submitting = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const owner = useRef(userId)

  useEffect(() => {
    const controller = new AbortController()
    void accountRecovery
      .status(userId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
      })
    return () => controller.abort()
  }, [userId, reload])

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!busy && passwordError)
      document.getElementById('recovery-current-password')?.focus()
  }, [busy, passwordError])

  const close = useCallback(() => {
    if (submitting.current) return
    if (code && !saved) {
      setGeneralError(
        'Guarda el código y marca la confirmación antes de continuar.',
      )
      return
    }
    setOpen(false)
    setPassword('')
    setCode('')
    setGeneralError('')
    setPasswordError('')
  }, [code, saved])

  function start() {
    setPassword('')
    setPasswordError('')
    setGeneralError('')
    setCode('')
    setSaved(false)
    setNotice('')
    setOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || submitting.current || code) return
    if (!password) {
      setPasswordError('Escribe tu contraseña actual.')
      return
    }
    const controller = new AbortController()
    request.current = controller
    submitting.current = true
    setBusy(true)
    setPasswordError('')
    setGeneralError('')
    try {
      const issued = await accountRecovery.issue(
        userId,
        password,
        controller.signal,
      )
      if (controller.signal.aborted || owner.current !== userId) return
      setPassword('')
      setCode(issued)
      setSaved(false)
      setStatus({ hasCode: true, createdAt: null })
      setNotice('Código de recuperación creado.')
    } catch (error) {
      if (controller.signal.aborted || owner.current !== userId) return
      const reason =
        error instanceof AccountRecoveryError
          ? error.code
          : 'service_unavailable'
      if (reason === 'invalid_current_password')
        setPasswordError('La contraseña actual no es correcta.')
      else
        setGeneralError(
          reason === 'rate_limit'
            ? 'Has realizado varios intentos. Espera unos minutos antes de continuar.'
            : reason === 'session_required'
              ? 'Tu sesión cambió. Inicia sesión de nuevo.'
              : reason === 'recovery_not_supported'
                ? 'Esta cuenta no puede utilizar códigos de recuperación.'
                : reason === 'recovery_status_unknown'
                  ? 'No pudimos confirmar la creación. No reutilices el código anterior; vuelve a iniciar sesión para crear uno nuevo.'
                  : 'No pudimos crear el código. Revisa tu conexión e inténtalo de nuevo.',
        )
    } finally {
      submitting.current = false
      if (!controller.signal.aborted) setBusy(false)
      if (request.current === controller) request.current = null
    }
  }

  return (
    <section
      id="recuperacion"
      className="account-recovery-settings"
      aria-labelledby="account-recovery-title"
    >
      <div className="account-recovery-heading">
        <div>
          <h2 id="account-recovery-title">Recuperación de acceso</h2>
          <p>
            Crea un código y guárdalo en un lugar seguro. Podrás usarlo para
            recuperar tu contraseña si la olvidas.
          </p>
        </div>
        <button
          ref={trigger}
          type="button"
          className="button button--secondary"
          onClick={start}
          disabled={!status || busy}
        >
          {status?.hasCode ? 'Reemplazar código' : 'Crear código'}
        </button>
      </div>
      {loadError ? (
        <div className="recovery-inline-status" role="status">
          <span>No pudimos consultar el código de recuperación.</span>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setStatus(null)
              setLoadError(false)
              setReload((value) => value + 1)
            }}
          >
            Reintentar
          </button>
        </div>
      ) : !status ? (
        <p role="status">Consultando recuperación…</p>
      ) : (
        <p className="account-field-help">
          {status.hasCode
            ? 'Ya tienes un código activo. Si creas uno nuevo, el anterior dejará de funcionar.'
            : 'Aún no has creado tu código de recuperación.'}
        </p>
      )}
      {notice && !open && <p role="status">{notice}</p>}
      {open && (
        <Dialog
          open
          id="account-recovery-code"
          title={
            code
              ? 'Guarda tu código'
              : status?.hasCode
                ? 'Reemplazar código'
                : 'Crear código'
          }
          onClose={close}
          closeDisabled={busy}
          returnFocusRef={trigger}
          className="recovery-code-dialog"
        >
          {code ? (
            <RecoveryCodeReceipt
              code={code}
              saved={saved}
              onSaved={setSaved}
              onComplete={close}
              error={generalError}
            />
          ) : (
            <form
              className="auth-form"
              noValidate
              onSubmit={(event) => void submit(event)}
              aria-busy={busy}
            >
              <p className="account-field-help">
                {status?.hasCode
                  ? 'El nuevo código reemplazará al anterior. Confirma tu contraseña actual.'
                  : 'Confirma tu contraseña. El código se mostrará una sola vez.'}
              </p>
              <PasswordField
                id="recovery-current-password"
                label="Contraseña actual"
                value={password}
                onChange={(value) => {
                  setPassword(value)
                  setPasswordError('')
                }}
                error={passwordError}
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
                  onClick={close}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={busy}
                >
                  {busy ? 'Creando…' : 'Crear código'}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </section>
  )
}

/** The secret is rendered only for this receipt; it is never saved by the app. */
export function RecoveryCodeReceipt({
  code,
  saved,
  onSaved,
  onComplete,
  error,
  completeLabel = 'Continuar',
}: {
  code: string
  saved: boolean
  onSaved: (value: boolean) => void
  onComplete: () => void
  error?: string
  completeLabel?: string
}) {
  const [copyStatus, setCopyStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyStatus('Código copiado.')
    } catch {
      setCopyStatus('No pudimos copiarlo. Puedes seleccionarlo o descargarlo.')
    }
  }
  function download() {
    const content = `AROMA INFINI — CÓDIGO DE RECUPERACIÓN\n\n${code}\n\nGuárdalo en un lugar privado fuera de la web. Es de un solo uso y reemplaza cualquier código anterior.\nNo compartas este código.\n`
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'aroma-infini-codigo-recuperacion.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="recovery-code-receipt">
      <p>
        Guárdalo en un lugar privado fuera de esta web. Es de un solo uso y no
        podremos volver a mostrarlo.
      </p>
      <code
        className="recovery-code"
        aria-label="Tu nuevo código de recuperación"
      >
        {code}
      </code>
      <div className="recovery-code-tools">
        <button type="button" className="text-link" onClick={() => void copy()}>
          Copiar código
        </button>
        <button type="button" className="text-link" onClick={download}>
          Descargar código
        </button>
      </div>
      {copyStatus && (
        <p role="status" className="account-field-help">
          {copyStatus}
        </p>
      )}
      <label className="recovery-code-confirm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => onSaved(event.target.checked)}
        />{' '}
        Ya guardé el código
      </label>
      {error && (
        <p role="alert" className="auth-field-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button button--primary"
        disabled={!saved}
        onClick={onComplete}
      >
        {completeLabel}
      </button>
    </div>
  )
}
