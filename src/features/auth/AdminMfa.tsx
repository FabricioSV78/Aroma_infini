import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { authService } from '../../services/auth-service'
import { AuthError, authErrorMessage } from '../../services/auth-errors'
import type { AuthMfaFactor } from '../../types/auth'
import { AdminAuthShell } from './AdminAuthShell'

export function AdminMfa({ target }: { target: string }) {
  const navigate = useNavigate()
  const [factors, setFactors] = useState<AuthMfaFactor[] | null>(null)
  const [factorId, setFactorId] = useState('')
  const [enrollment, setEnrollment] = useState<{
    id: string
    qrCode: string
    secret: string
  } | null>(null)
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const locked = useRef(false)
  const mounted = useRef(true)
  const submit = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let live = true
    void authService
      .listMfaFactors()
      .then((result) => {
        if (!live) return
        const verified = result.filter((factor) => factor.status === 'verified')
        setFactors(verified)
        setFactorId(verified[0]?.id ?? '')
      })
      .catch((reason) => {
        if (live) {
          setError(authErrorMessage(reason))
          setLoadFailed(true)
        }
      })
    return () => {
      live = false
    }
  }, [attempt])
  async function enroll() {
    if (locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    try {
      const result = await authService.enrollMfa()
      if (mounted.current) {
        setEnrollment(result)
        setFactorId(result.id)
      }
    } catch (reason) {
      if (mounted.current) setError(authErrorMessage(reason))
    } finally {
      locked.current = false
      if (mounted.current) setSaving(false)
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Escribe el código de 6 dígitos.')
      document.getElementById('auth-mfa-code')?.focus()
      return
    }
    locked.current = true
    setSaving(true)
    setError('')
    setFieldError('')
    try {
      await authService.verifyMfa({ factorId, code })
      if (mounted.current) navigate(target, { replace: true })
    } catch (reason) {
      if (!mounted.current) return
      if (reason instanceof AuthError && reason.code === 'mfa') {
        setFieldError(authErrorMessage(reason))
        document.getElementById('auth-mfa-code')?.focus()
      } else setError(authErrorMessage(reason))
    } finally {
      locked.current = false
      if (mounted.current) setSaving(false)
    }
  }
  async function leave() {
    if (locked.current) return
    try {
      await authService.signOut()
    } catch (reason) {
      if (mounted.current) setError(authErrorMessage(reason))
    }
  }
  const feedback = error ? (
    <Dialog
      open
      id="auth-mfa-feedback"
      title="No pudimos continuar"
      onClose={() => setError('')}
      returnFocusRef={submit}
      className="auth-feedback-dialog"
    >
      <p role="alert">{error}</p>
      <div className="auth-feedback-actions">
        <button className="button button--primary" onClick={() => setError('')}>
          Entendido
        </button>
      </div>
    </Dialog>
  ) : null
  return (
    <AdminAuthShell feedback={feedback}>
      <section
        className="auth-form-panel auth-mfa"
        aria-labelledby="auth-title"
      >
        <header className="auth-form-heading">
          <h1 id="auth-title" tabIndex={-1}>
            Verificación en dos pasos
          </h1>
          <p>Confirma tu acceso con una aplicación autenticadora.</p>
          <p>
            Tu aplicación se configura una sola vez. Al verificar, este
            navegador podrá recordarse durante 60 días; cada nuevo inicio
            seguirá pidiendo tu contraseña.
          </p>
        </header>
        {factors === null ? (
          <div role="status">
            <p>Comprobando verificación…</p>
            {loadFailed && (
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setLoadFailed(false)
                  setAttempt((value) => value + 1)
                }}
              >
                Volver a intentar
              </button>
            )}
          </div>
        ) : (
          <>
            {factors.length === 0 && !enrollment && (
              <>
                <p>
                  Activa la verificación para proteger el acceso administrativo.
                </p>
                <button
                  ref={submit}
                  type="button"
                  className="button button--primary auth-submit"
                  disabled={saving}
                  onClick={() => void enroll()}
                >
                  {saving ? 'Preparando…' : 'Activar verificación en dos pasos'}
                </button>
              </>
            )}
            {enrollment && (
              <div className="auth-mfa-setup">
                <p>
                  Escanea el código QR con tu aplicación autenticadora y escribe
                  el código que aparezca.
                </p>
                <img
                  src={enrollment.qrCode}
                  width="200"
                  height="200"
                  alt="Código QR para configurar tu aplicación autenticadora"
                />
                <details>
                  <summary>Configurar con clave manual</summary>
                  <code>{enrollment.secret}</code>
                </details>
              </div>
            )}
            {factorId && (
              <form
                className="auth-form"
                onSubmit={(event) => void verify(event)}
                noValidate
                aria-busy={saving}
              >
                {factors.length > 1 && (
                  <div className="auth-field">
                    <label htmlFor="auth-mfa-factor">
                      Aplicación autenticadora
                    </label>
                    <select
                      id="auth-mfa-factor"
                      value={factorId}
                      disabled={saving}
                      onChange={(event) => {
                        setFactorId(event.target.value)
                        setCode('')
                        setFieldError('')
                      }}
                    >
                      {factors.map((factor, index) => (
                        <option key={factor.id} value={factor.id}>
                          {factor.friendlyName || `Autenticador ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="auth-field">
                  <label htmlFor="auth-mfa-code">Código de verificación</label>
                  <input
                    id="auth-mfa-code"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      setFieldError('')
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    disabled={saving}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? 'auth-mfa-error' : undefined}
                  />
                  {fieldError && (
                    <p id="auth-mfa-error" className="auth-field-error">
                      {fieldError}
                    </p>
                  )}
                </div>
                <button
                  ref={submit}
                  type="submit"
                  className="button button--primary auth-submit"
                  disabled={saving}
                >
                  {saving ? 'Verificando…' : 'Verificar y continuar'}
                </button>
              </form>
            )}
          </>
        )}
        <button
          type="button"
          className="auth-back"
          disabled={saving}
          onClick={() => void leave()}
        >
          Usar otra cuenta
        </button>
      </section>
    </AdminAuthShell>
  )
}
