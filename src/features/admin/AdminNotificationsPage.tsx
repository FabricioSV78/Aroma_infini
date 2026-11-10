import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import {
  adminNotificationError,
  adminPushCapabilities,
  disableAdminPush,
  enableAdminPush,
  getAdminPushStatus,
  inspectAdminPushSubscription,
  testAdminPush,
  type AdminPushStatus,
} from '../../services/admin-notifications'
import { AdminPageHeader } from './AdminShared'
import './admin-notifications.css'

export function AdminNotificationsPage() {
  const [capability, setCapability] = useState(adminPushCapabilities)
  const [status, setStatus] = useState<AdminPushStatus | null>(null)
  const [subscriptionState, setSubscriptionState] = useState<
    'missing' | 'current' | 'outdated'
  >('missing')
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'enable' | 'disable' | 'test' | null>(
    null,
  )
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const syncBrowser = () => setCapability(adminPushCapabilities())
    window.addEventListener('focus', syncBrowser)
    void getAdminPushStatus()
      .then(async (result) => {
        const browserState = await inspectAdminPushSubscription(
          result.publicKey,
        )
        if (mounted.current) {
          setStatus(result)
          setSubscriptionState(browserState)
        }
      })
      .catch((cause: unknown) => {
        if (mounted.current) setError(adminNotificationError(cause))
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })
    return () => {
      mounted.current = false
      window.removeEventListener('focus', syncBrowser)
    }
  }, [])

  async function refreshStatus() {
    if (lock.current) return
    lock.current = true
    setLoading(true)
    setError('')
    try {
      const result = await getAdminPushStatus()
      setStatus(result)
      setSubscriptionState(await inspectAdminPushSubscription(result.publicKey))
      setCapability(adminPushCapabilities())
    } catch (cause) {
      setError(adminNotificationError(cause))
    } finally {
      lock.current = false
      setLoading(false)
    }
  }

  async function run(next: 'enable' | 'disable' | 'test') {
    if (lock.current || !status) return
    lock.current = true
    setAction(next)
    setError('')
    setMessage('')
    try {
      if (next === 'enable') {
        await enableAdminPush(status)
        setStatus(await getAdminPushStatus())
        setSubscriptionState('current')
        setMessage('Notificaciones activadas en este dispositivo.')
      } else if (next === 'disable') {
        await disableAdminPush()
        setStatus(await getAdminPushStatus())
        setSubscriptionState('missing')
        setMessage('Notificaciones desactivadas en este dispositivo.')
      } else {
        await testAdminPush()
        setMessage(
          'Prueba programada. Revisa las notificaciones de este dispositivo; puede tardar cerca de un minuto.',
        )
      }
    } catch (cause) {
      setError(adminNotificationError(cause))
    } finally {
      lock.current = false
      setAction(null)
      setCapability(adminPushCapabilities())
    }
  }

  const needsInstall = capability.ios && !capability.standalone
  const registered = status?.currentDevice?.enabled === true
  const enabled =
    registered &&
    subscriptionState === 'current' &&
    capability.permission === 'granted'
  const blocked = capability.permission === 'denied'
  const canActivate =
    capability.supported &&
    !needsInstall &&
    !blocked &&
    status?.configured === true
  const permissionLabel =
    capability.permission === 'granted'
      ? 'Permitidas'
      : blocked
        ? 'Bloqueadas'
        : capability.permission === 'unsupported'
          ? 'No compatible'
          : 'Sin solicitar'
  const deviceLabel = enabled ? 'Activadas' : 'Desactivadas'
  const busy = loading || action !== null

  return (
    <div className="admin-page admin-notifications-page">
      <AdminPageHeader
        eyebrow="Configuración"
        title="Notificaciones"
        description="Recibe avisos de pedidos confirmados en este dispositivo."
      />
      <section
        className="admin-notification-device"
        aria-labelledby="admin-device-title"
        aria-busy={busy}
      >
        <div className="admin-notification-section-heading">
          <div className="admin-notification-heading-icon">
            <Icon name="bell" aria-hidden="true" />
          </div>
          <div>
            <h2 id="admin-device-title">Este dispositivo</h2>
            <p>La activación es independiente en cada móvil o navegador.</p>
          </div>
          <span
            className={`admin-badge admin-badge--${enabled ? 'success' : 'neutral'}`}
          >
            {loading ? 'Consultando…' : deviceLabel}
          </span>
        </div>
        <dl className="admin-notification-device-status">
          <div>
            <dt>Permiso del navegador</dt>
            <dd>{permissionLabel}</dd>
          </div>
          <div>
            <dt>Servicio de avisos</dt>
            <dd>
              {loading
                ? 'Consultando…'
                : status?.configured
                  ? 'Disponible'
                  : status
                    ? 'Pendiente de configuración'
                    : 'Sin consultar'}
            </dd>
          </div>
          <div>
            <dt>Instalación</dt>
            <dd>
              {capability.standalone ? 'App instalada' : 'Abierto en navegador'}
            </dd>
          </div>
        </dl>
        {needsInstall ? (
          <p className="admin-notification-guidance">
            <Icon name="alert" aria-hidden="true" />
            En iPhone o iPad, añade el panel a la pantalla de inicio y ábrelo
            desde su icono. Requiere iOS/iPadOS 16.4 o posterior.
          </p>
        ) : !capability.supported ? (
          <p className="admin-notification-guidance">
            <Icon name="alert" aria-hidden="true" />
            {!capability.secure
              ? 'Abre el panel mediante HTTPS para usar notificaciones.'
              : 'Este navegador no admite notificaciones push. Prueba con un navegador actualizado.'}
          </p>
        ) : blocked ? (
          <p className="admin-notification-guidance">
            <Icon name="alert" aria-hidden="true" />
            Las notificaciones están bloqueadas. Permítelas en los ajustes de
            este sitio y pulsa Actualizar estado.
          </p>
        ) : status && !status.configured ? (
          <p className="admin-notification-guidance">
            El envío push todavía no está configurado en este entorno. Puedes
            seguir consultando los pedidos desde la campana.
          </p>
        ) : null}
        <div className="admin-notification-actions">
          {!enabled ? (
            <button
              type="button"
              className="button button--primary"
              disabled={busy || !canActivate}
              onClick={() => {
                void run('enable')
              }}
            >
              {action === 'enable'
                ? 'Activando…'
                : registered
                  ? 'Reactivar notificaciones'
                  : 'Activar notificaciones'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button button--primary"
                disabled={busy || !status?.configured || blocked}
                onClick={() => {
                  void run('test')
                }}
              >
                {action === 'test' ? 'Programando…' : 'Enviar prueba'}
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => {
                  void run('disable')
                }}
              >
                {action === 'disable'
                  ? 'Desactivando…'
                  : 'Desactivar en este dispositivo'}
              </button>
            </>
          )}
          {registered && !enabled && (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => {
                void run('disable')
              }}
            >
              {action === 'disable'
                ? 'Desactivando…'
                : 'Desactivar en este dispositivo'}
            </button>
          )}
          <button
            type="button"
            className="admin-notification-link"
            disabled={busy}
            onClick={() => {
              void refreshStatus()
            }}
          >
            Actualizar estado
          </button>
        </div>
        {error && (
          <p className="admin-notification-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="admin-notification-success" role="status">
            {message}
          </p>
        )}
        <p className="admin-notification-footnote">
          Solo se solicita permiso cuando pulsas Activar. Los avisos no incluyen
          datos personales del cliente. Una prueba aceptada no garantiza que el
          sistema operativo la muestre.
        </p>
      </section>
      <section
        className="admin-notification-install"
        aria-labelledby="admin-install-title"
      >
        <h2 id="admin-install-title">Instalar Aroma Infini Admin</h2>
        <div className="admin-notification-install-guides">
          <div>
            <h3>Android y escritorio</h3>
            <p>
              Abre el menú del navegador y elige <strong>Instalar app</strong> o{' '}
              <strong>Añadir a pantalla de inicio</strong>. Después abre el
              panel e inicia sesión.
            </p>
          </div>
          <div>
            <h3>iPhone y iPad</h3>
            <p>
              En Safari, pulsa{' '}
              <strong>Compartir → Añadir a pantalla de inicio</strong>. Abre
              Aroma Infini Admin desde su icono y activa las notificaciones.
            </p>
          </div>
        </div>
        <p className="admin-notification-footnote">
          Sin conexión, con el dispositivo apagado o con restricciones del
          sistema, los avisos pueden demorarse o no mostrarse. La campana
          mantiene el registro de pedidos confirmados.
        </p>
      </section>
    </div>
  )
}
