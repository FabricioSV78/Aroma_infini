import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router'
import {
  AuthScreen,
  type AuthField,
  type AuthScreenProps,
  type AuthValues,
  type AuthView,
} from './AuthScreen'
import {
  authPath,
  safeAuthReturn,
  type AuthAudience,
} from '../../domain/auth-navigation'
import { authService } from '../../services/auth-service'
import { AuthError, authErrorMessage } from '../../services/auth-errors'
import { SeoManager } from '../../seo/SeoManager'
import { useAuth } from './useAuth'
import { AdminMfa } from './AdminMfa'

const empty: AuthValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  password: '',
}

function AuthForm({
  view,
  audience,
}: {
  view: AuthView
  audience: AuthAudience
}) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const target = safeAuthReturn(params.get('returnTo'), audience)
  const [values, setValues] = useState<AuthValues>(empty)
  const [errors, setErrors] = useState<AuthScreenProps['fieldErrors']>({})
  const [message, setMessage] = useState<AuthScreenProps['message']>(null)
  const [dismissedContext, setDismissedContext] = useState('')
  const [saving, setBusy] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function change(field: AuthField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage(null)
  }
  function validate() {
    const next: AuthScreenProps['fieldErrors'] = {}
    if (view === 'register') {
      if (!values.firstName.trim()) next.firstName = 'Escribe tus nombres.'
      if (!values.lastName.trim()) next.lastName = 'Escribe tus apellidos.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = 'Escribe un correo electrónico válido.'
    if (view === 'register' && !/^9[0-9]{8}$/.test(values.phone.trim()))
      next.phone = 'Escribe un celular de 9 dígitos que empiece con 9.'
    if (!values.password) next.password = 'Escribe tu contraseña.'
    if (view === 'register' && values.password && values.password.length < 12)
      next.password = 'Usa al menos 12 caracteres.'
    setErrors(next)
    const field = Object.keys(next)[0]
    if (field) {
      document.getElementById(`auth-${field}`)?.focus()
      return false
    }
    return true
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !validate()) return
    busy.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (view === 'login') {
        const session = await authService.signIn({
          email: values.email.trim(),
          password: values.password,
        })
        if (audience === 'admin' && session?.user.role !== 'admin')
          throw new AuthError('permission')
        if (audience === 'admin' && session?.mfaRequired) {
          if (mounted.current)
            setValues((current) => ({ ...current, password: '' }))
          return
        }
        if (mounted.current) navigate(target, { replace: true })
      } else if (view === 'register') {
        await authService.signUp({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          phone: values.phone.trim(),
          email: values.email.trim(),
          password: values.password,
        })
        if (mounted.current) {
          setValues((current) => ({ ...current, password: '' }))
          navigate(target, { replace: true })
        }
      }
    } catch (error) {
      if (
        mounted.current &&
        error instanceof AuthError &&
        (error.code === 'password' || error.code === 'email')
      ) {
        const field = error.code
        setErrors((current) => ({
          ...current,
          [field]: authErrorMessage(error),
        }))
        document.getElementById(`auth-${field}`)?.focus()
      } else if (mounted.current)
        setMessage({
          tone: 'error',
          text:
            error instanceof AuthError &&
            error.code === 'unavailable' &&
            audience === 'admin'
              ? 'No se puede iniciar sesión en este momento. Vuelve a intentarlo más tarde.'
              : authErrorMessage(error),
        })
    } finally {
      busy.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const hasAccess =
    auth.status === 'authenticated' &&
    auth.session?.intent === 'account' &&
    (audience === 'customer' ||
      (auth.session.user.role === 'admin' && auth.session.mfaRequired !== true))
  if (hasAccess) return <Navigate to={target} replace />
  const contextualMessage: AuthScreenProps['message'] =
    auth.status === 'expired'
      ? { tone: 'info', text: auth.message }
      : auth.status === 'error'
        ? { tone: 'error', text: auth.message }
        : audience === 'admin' &&
            auth.session?.intent === 'account' &&
            auth.session.user.role === 'customer'
          ? {
              tone: 'error',
              text: 'Tu cuenta no tiene acceso administrativo. Puedes utilizar Mi cuenta en la tienda.',
            }
          : null
  const contextualMessageKey = contextualMessage
    ? `${contextualMessage.tone}:${contextualMessage.text}`
    : ''
  function dismissMessage() {
    setMessage(null)
    setDismissedContext(contextualMessageKey)
  }
  if (
    audience === 'admin' &&
    auth.status === 'authenticated' &&
    auth.session?.intent === 'account' &&
    auth.session.user.role === 'admin' &&
    auth.session.mfaRequired
  )
    return <AdminMfa key={auth.session.user.id} target={target} />
  return (
    <AuthScreen
      view={view}
      audience={audience}
      values={values}
      onChange={change}
      onSubmit={(event) => void submit(event)}
      busy={saving}
      fieldErrors={errors}
      message={
        message ??
        (contextualMessageKey === dismissedContext ? null : contextualMessage)
      }
      onDismissMessage={dismissMessage}
      loginHref={authPath(audience, 'login', target)}
      registerHref={authPath(audience, 'register', target)}
      recoverHref={authPath(audience, 'recover', target)}
      unavailable={!authService.configured}
    />
  )
}

export function AuthLinkState({
  title,
  description,
  href,
  label,
}: {
  title: string
  description: string
  href: string
  label: string
}) {
  return (
    <section className="auth-status-page container">
      <div>
        <p className="eyebrow">Aroma Infini · Mi cuenta</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="button button--primary" to={href}>
          {label}
        </Link>
      </div>
    </section>
  )
}

export function AuthPage({
  view = 'login',
  audience = 'customer',
}: {
  view?: AuthView
  audience?: AuthAudience
}) {
  const location = useLocation()
  return (
    <>
      <SeoManager />
      <AuthForm
        key={`${location.pathname}:${location.search}`}
        view={view}
        audience={audience}
      />
    </>
  )
}

export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const audience = params.get('audience') === 'admin' ? 'admin' : 'customer'
  const target = safeAuthReturn(params.get('returnTo'), audience)
  useEffect(() => {
    // Legacy email links never establish a session. Remove credentials from
    // both query and fragment without adopting or exchanging any token.
    window.history.replaceState(window.history.state, '', '/auth/callback')
  }, [])
  return (
    <>
      <SeoManager />
      <AuthLinkState
        title="Este enlace ya no está disponible"
        description="Recupera tu acceso con tu código de recuperación."
        href={authPath(audience, 'recover', target)}
        label="Recuperar acceso"
      />
    </>
  )
}
