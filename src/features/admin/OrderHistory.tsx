import { adminOrderStatusMeta } from './admin-utils'
import { useAdminStore } from './useAdminStore'
import './admin-order-history.css'

const historyDate = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function OrderHistory({ reference }: { reference: string }) {
  const state = useAdminStore()
  const history = state.orderHistory
    .filter((entry) => entry.reference === reference)
    .sort(
      (first, second) =>
        Date.parse(second.changedAt) - Date.parse(first.changedAt),
    )

  return (
    <section className="admin-order-history" aria-label="Historial del pedido">
      <h2>Historial de estados</h2>
      {history.length ? (
        <ol>
          {history.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>
                  {adminOrderStatusMeta[entry.fromStatus].label} →{' '}
                  {adminOrderStatusMeta[entry.toStatus].label}
                </strong>
                <time dateTime={entry.changedAt}>
                  {historyDate.format(new Date(entry.changedAt))}
                </time>
              </div>
              <p>
                {entry.source === 'bulk'
                  ? 'Acción masiva'
                  : 'Cambio individual'}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-data-note">
          Aún no hay cambios de estado registrados. Los estados anteriores a
          esta función no tienen historial.
        </p>
      )}
    </section>
  )
}
