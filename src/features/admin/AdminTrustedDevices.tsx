import { useEffect, useRef, useState } from 'react'
import {
  listAdminDevices,
  revokeAdminDevice,
  type AdminTrustedDevice,
} from '../../services/admin-device-service'
import { authService } from '../../services/auth-service'
import { useAuth } from '../auth/useAuth'
import { useAdminNotice } from './AdminNoticeProvider'
import type { AuthSession } from '../../types/auth'

const date = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' })

export function AdminTrustedDevices() {
  const { session } = useAuth()
  return (
    <AdminTrustedDevicesPanel
      key={session?.user.id ?? 'anonymous'}
      session={session}
    />
  )
}

function AdminTrustedDevicesPanel({
  session,
}: {
  session: AuthSession | null
}) {
  const notice = useAdminNotice()
  const [devices, setDevices] = useState<AdminTrustedDevice[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const locked = useRef(false)
  const owner = session?.user.id
  const secure = window.location.protocol === 'https:'

  useEffect(
    function loadTrustedDevices() {
      let active = true
      const current = authService.getSnapshot().session
      if (!secure || !current || current.user.id !== owner) return
      void listAdminDevices(current)
        .then((items) => {
          if (active) setDevices(items)
        })
        .catch(() => {
          if (active)
            setError(
              'No pudimos consultar los dispositivos de confianza. Vuelve a intentar desde el panel con HTTPS.',
            )
        })
      return () => {
        active = false
      }
    },
    [owner, attempt, secure],
  )

  async function revoke(device: AdminTrustedDevice) {
    if (!session || locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const revoked = await revokeAdminDevice(session, device.id)
      if (!revoked) {
        setDevices(await listAdminDevices(session))
        return
      }
      setDevices(
        (items) => items?.filter((item) => item.id !== device.id) ?? null,
      )
      notice.toast(
        'Confianza revocada. Este dispositivo volverá a pedir el código de la aplicación.',
      )
      // Revoking this browser also withdraws its server-side trusted session.
      // A genuine AAL2 session can continue; AAL1 returns to verification.
      if (device.current) await authService.refresh()
    } catch {
      setError('No pudimos revocar la confianza. Vuelve a intentar.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  return (
    <section
      className="admin-card admin-trusted-devices-card"
      aria-labelledby="admin-trusted-devices-title"
      aria-busy={busy}
    >
      <h2 id="admin-trusted-devices-title">Dispositivos de confianza</h2>
      <p className="muted">
        Después de verificar el código, este navegador se recuerda durante 60
        días. Cada inicio de sesión sigue pidiendo tu contraseña. La confianza
        pertenece solo a tu cuenta.
      </p>
      {!secure ? (
        <p className="muted">
          Consulta y administra estos dispositivos desde el panel con HTTPS.
        </p>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => {
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Actualizar dispositivos
          </button>
        </>
      ) : devices === null ? (
        <p>Consultando dispositivos…</p>
      ) : devices.length === 0 ? (
        <p>No tienes dispositivos de confianza activos.</p>
      ) : (
        <ul className="admin-trusted-devices">
          {devices.map((device) => (
            <li key={device.id}>
              <div>
                <strong>{device.label}</strong>{' '}
                {device.current && (
                  <span className="admin-badge admin-badge--neutral">
                    Este dispositivo
                  </span>
                )}
                <p className="muted">
                  Válido hasta el {date.format(new Date(device.expiresAt))}.
                  Último uso: {date.format(new Date(device.lastUsedAt))}.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                aria-label={`Revocar confianza de ${device.label}`}
                onClick={() => void revoke(device)}
              >
                Revocar confianza
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
