import { useRef, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import {
  ManagedSiteImage,
  ManagedSiteSource,
} from '../../components/ManagedSiteImage'
import type { AuthSignUpInput } from '../../types/auth'
import { PasswordField } from './PasswordField'
import { AdminAuthShell } from './AdminAuthShell'
import './auth.css'

export type AuthView = 'login' | 'register'
export type AuthField = keyof AuthSignUpInput
export type AuthValues = Record<AuthField, string>
export interface AuthScreenProps {
  view: AuthView
  audience: 'customer' | 'admin'
  values: AuthValues
  onChange: (field: AuthField, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
  fieldErrors: Partial<Record<AuthField, string>>
  message: { tone: 'error' | 'success' | 'info'; text: string } | null
  onDismissMessage: () => void
  loginHref: string
  registerHref: string
  recoverHref: string
  unavailable: boolean
}

export function AuthScreen(props: AuthScreenProps) {
  const submitRef = useRef<HTMLButtonElement>(null)
  const {
    audience,
    view,
    values,
    onChange,
    onSubmit,
    busy,
    fieldErrors,
    message,
  } = props
  const admin = audience === 'admin'
  const customerAccess = !admin && (view === 'login' || view === 'register')
  const title = customerAccess
    ? 'Mi cuenta'
    : admin
      ? 'Acceso administrativo'
      : 'Inicia sesión'
  const description = admin ? 'Ingresa con tu cuenta autorizada.' : null
  const form = (
    <section className="auth-form-panel" aria-labelledby="auth-title">
      {customerAccess && (
        <nav className="auth-tabs" aria-label="Acceso a tu cuenta">
          <Link
            to={props.loginHref}
            aria-current={view === 'login' ? 'page' : undefined}
          >
            Iniciar sesión
          </Link>
          <Link
            to={props.registerHref}
            aria-current={view === 'register' ? 'page' : undefined}
          >
            Crear cuenta
          </Link>
        </nav>
      )}
      <div className="auth-form-content">
        <header
          className={`auth-form-heading${customerAccess ? ' sr-only' : ''}`}
        >
          <h1 id="auth-title" tabIndex={-1}>
            {title}
          </h1>
          {description && <p>{description}</p>}
        </header>
        {props.unavailable && admin && (
          <p className="auth-availability" id="auth-availability">
            No se puede iniciar sesión en este momento.
          </p>
        )}
        <form
          className="auth-form"
          onSubmit={onSubmit}
          noValidate
          aria-busy={busy}
        >
          {view === 'register' && (
            <div className="auth-name-row">
              {(
                [
                  ['firstName', 'Nombres', 'given-name'],
                  ['lastName', 'Apellidos', 'family-name'],
                ] as const
              ).map(([field, label, autoComplete]) => (
                <div className="auth-field" key={field}>
                  <label htmlFor={`auth-${field}`}>{label}</label>
                  <input
                    id={`auth-${field}`}
                    name={field}
                    autoComplete={autoComplete}
                    value={values[field]}
                    maxLength={80}
                    onChange={(event) => onChange(field, event.target.value)}
                    required
                    disabled={busy}
                    aria-invalid={Boolean(fieldErrors[field])}
                    aria-describedby={
                      fieldErrors[field] ? `auth-${field}-error` : undefined
                    }
                  />
                  {fieldErrors[field] && (
                    <p id={`auth-${field}-error`} className="auth-field-error">
                      {fieldErrors[field]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div
            className={`auth-contact-row${view === 'register' ? ' auth-contact-row--register' : ''}`}
          >
            <div className="auth-field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={values.email}
                maxLength={254}
                onChange={(event) => onChange('email', event.target.value)}
                required
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? 'auth-email-error' : undefined
                }
              />
              {fieldErrors.email && (
                <p id="auth-email-error" className="auth-field-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            {view === 'register' && (
              <div className="auth-field">
                <label htmlFor="auth-phone">Celular</label>
                <input
                  id="auth-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={values.phone}
                  maxLength={9}
                  pattern="9[0-9]{8}"
                  onChange={(event) => onChange('phone', event.target.value)}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={
                    fieldErrors.phone ? 'auth-phone-error' : undefined
                  }
                />
                {fieldErrors.phone && (
                  <p id="auth-phone-error" className="auth-field-error">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>
            )}
          </div>
          <PasswordField
            key={`${view}-password`}
            id="auth-password"
            label="Contraseña"
            value={values.password}
            onChange={(value) => onChange('password', value)}
            error={fieldErrors.password}
            fresh={view !== 'login'}
            disabled={busy}
          />
          {view === 'register' && (
            <p className="auth-password-hint" id="auth-password-hint">
              Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.
            </p>
          )}
          {view === 'login' && (
            <Link className="auth-recover" to={props.recoverHref}>
              ¿Olvidaste tu contraseña?
            </Link>
          )}
          <button
            ref={submitRef}
            className="button button--primary auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Procesando…'
              : view === 'login'
                ? 'Iniciar sesión'
                : 'Crear cuenta'}
            {busy && <span className="auth-spinner" aria-hidden="true" />}
          </button>
        </form>
        {view === 'register' && (
          <p className="auth-legal">
            Consulta nuestros <Link to="/terminos">términos</Link> y la{' '}
            <Link to="/privacidad">política de privacidad</Link>.
          </p>
        )}
      </div>
    </section>
  )
  const feedback = message && (
    <Dialog
      open
      id="auth-feedback"
      title={
        message.tone === 'error'
          ? 'No pudimos continuar'
          : admin
            ? 'Sobre tu acceso'
            : 'Sobre tu cuenta'
      }
      descriptionId="auth-feedback-description"
      returnFocusRef={submitRef}
      onClose={props.onDismissMessage}
      className="auth-feedback-dialog"
    >
      <p
        id="auth-feedback-description"
        className={`auth-feedback-copy auth-feedback-copy--${message.tone}`}
        role={message.tone === 'error' ? 'alert' : 'status'}
      >
        {message.text}
      </p>
      <div className="auth-feedback-actions">
        <button
          type="button"
          className="button button--primary"
          onClick={props.onDismissMessage}
        >
          Entendido
        </button>
      </div>
    </Dialog>
  )
  return admin ? (
    <AdminAuthShell feedback={feedback}>{form}</AdminAuthShell>
  ) : (
    <>
      <article className="auth-page container">
        <nav className="auth-breadcrumb" aria-label="Ruta de navegación">
          <Link to="/">Inicio</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Mi cuenta</span>
        </nav>
        <div
          className={`auth-customer-layout${view === 'login' || view === 'register' ? ' auth-customer-layout--editorial' : ''}`}
        >
          {(view === 'login' || view === 'register') && (
            <figure className="auth-editorial" aria-hidden="true">
              <picture>
                <ManagedSiteSource
                  slot="auth.customer.mobile"
                  media="(max-width: 760px)"
                  sizes="(max-width: 392px) 360px, (max-width: 472px) calc(100vw - 32px), 440px"
                />
                <ManagedSiteImage
                  slot="auth.customer.desktop"
                  // Cover uses the portrait's full scaled width before cropping.
                  sizes="(max-width: 1023px) 459px, 427px"
                  alt=""
                  width="1024"
                  height="1536"
                  decoding="async"
                />
              </picture>
            </figure>
          )}
          {form}
        </div>
      </article>
      {feedback}
    </>
  )
}
