import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import {
  adminNotificationError,
  adminNotifications,
} from '../../services/admin-notifications'
import './admin-notifications.css'

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function AdminNotificationBell() {
  const state = useSyncExternalStore(
    adminNotifications.subscribe,
    adminNotifications.getSnapshot,
  )
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    void adminNotifications.refresh()
  }, [])

  async function markRead(ids: string[] | 'all') {
    if (working) return
    setWorking(true)
    setError('')
    try {
      await adminNotifications.markRead(ids)
    } catch (cause) {
      setError(adminNotificationError(cause))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="admin-notification-trigger"
        aria-label={`Notificaciones${state.loaded ? `: ${state.unreadCount} sin leer` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true)
          void adminNotifications.refresh()
        }}
      >
        <Icon name="bell" aria-hidden="true" />
        {state.unreadCount > 0 && (
          <span aria-hidden="true">
            {state.unreadCount > 99 ? '99+' : state.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Notificaciones"
          id="admin-notification-center"
          className="admin-notification-dialog"
          returnFocusRef={trigger}
        >
          <div className="admin-notification-toolbar">
            <span>
              {state.loaded
                ? `${state.unreadCount} sin leer`
                : 'Centro de pedidos'}
            </span>
            <button
              type="button"
              className="admin-notification-link"
              disabled={state.loading}
              onClick={() => {
                void adminNotifications.refresh(true)
              }}
            >
              {state.loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
          {(error || state.error) && (
            <p className="admin-notification-error" role="alert">
              {error || state.error}
            </p>
          )}
          {state.loading && !state.loaded && (
            <p className="admin-notification-empty" role="status">
              Cargando notificaciones…
            </p>
          )}
          {state.loaded && state.items.length === 0 && (
            <div className="admin-notification-empty">
              <Icon name="bell" aria-hidden="true" />
              <p>No hay notificaciones por ahora.</p>
              <small>Los pedidos confirmados aparecerán aquí.</small>
            </div>
          )}
          {state.items.length > 0 && (
            <ul className="admin-notification-list">
              {state.items.map((item) => (
                <li key={item.id} className={item.read ? '' : 'is-unread'}>
                  <Link
                    to={`/admin/pedidos/${encodeURIComponent(item.orderReference)}`}
                    onClick={() => {
                      setOpen(false)
                      if (!item.read)
                        void adminNotifications
                          .markRead([item.id])
                          .catch(() => undefined)
                    }}
                  >
                    <span
                      className="admin-notification-dot"
                      aria-hidden="true"
                    />
                    <span>
                      <strong>Nuevo pedido confirmado</strong>
                      <span>{item.orderReference}</span>
                      <time dateTime={item.createdAt}>
                        {dateFormat.format(new Date(item.createdAt))}
                      </time>
                    </span>
                    <Icon name="arrow" aria-hidden="true" />
                  </Link>
                  {!item.read && (
                    <button
                      type="button"
                      className="admin-notification-link admin-notification-read"
                      disabled={working}
                      onClick={() => {
                        void markRead([item.id])
                      }}
                    >
                      Marcar como leída
                      <span className="sr-only">: {item.orderReference}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="admin-notification-footer">
            {state.unreadCount > 0 && (
              <button
                type="button"
                className="admin-notification-link"
                disabled={working}
                onClick={() => {
                  void markRead('all')
                }}
              >
                {working ? 'Guardando…' : 'Marcar todas como leídas'}
              </button>
            )}
            <Link to="/admin/notificaciones" onClick={() => setOpen(false)}>
              Configurar notificaciones <Icon name="arrow" aria-hidden="true" />
            </Link>
          </div>
          <p className="admin-notification-footnote">
            Se muestran las 20 notificaciones más recientes. Usa Actualizar para
            consultar nuevos pedidos.
          </p>
        </Dialog>
      )}
    </>
  )
}
