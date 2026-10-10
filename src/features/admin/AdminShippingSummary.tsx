import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruProvinceLabel,
} from '../../content/peru'
import {
  hasCompleteOrderDelivery,
  type AdminOrder,
} from '../../services/admin-service'

interface AdminShippingSummaryProps {
  order: AdminOrder
  legacyPhone?: string
}

export function AdminShippingSummary({
  order,
  legacyPhone,
}: AdminShippingSummaryProps) {
  const phone = order.contactPhone ?? legacyPhone ?? ''
  const street =
    order.address.street === 'Dirección registrada'
      ? ''
      : order.address.street?.trim()
  const ready = hasCompleteOrderDelivery(order, legacyPhone)
  const recipient = order.alternateRecipient?.name || order.customerName

  return (
    <details className="admin-shipping-summary-panel">
      <summary>Resumen de envío</summary>
      <div className="admin-shipping-summary-content">
        <div
          className="admin-shipping-sheet"
          aria-label="Resumen para el envío"
        >
          <header className="admin-shipping-sheet-heading">
            <strong>AROMA INFINI</strong>
            <span>Pedido {order.reference}</span>
          </header>
          <div className="admin-shipping-sheet-recipient">
            <span className="admin-shipping-sheet-label">Destinatario</span>
            <strong>{recipient}</strong>
            {order.alternateRecipient ? (
              <span>DNI: {order.alternateRecipient.dni}</span>
            ) : null}
            <span>
              Cel.: {phone && phone !== '—' ? phone : 'Por completar'}
            </span>
          </div>
          <address className="admin-shipping-sheet-address">
            <span className="admin-shipping-sheet-label">
              Dirección de entrega
            </span>
            <strong>{street || 'Por completar'}</strong>
            <span>
              {order.address.district
                ? getPeruDistrictLabel(order.address.district)
                : 'Distrito por completar'}
            </span>
            <span>
              {order.address.province
                ? getPeruProvinceLabel(order.address.province)
                : 'Provincia por completar'}{' '}
              ·{' '}
              {order.address.department
                ? getPeruDepartmentLabel(order.address.department)
                : 'Departamento por completar'}
            </span>
          </address>
          {order.address.reference?.trim() ? (
            <div className="admin-shipping-sheet-reference">
              <span className="admin-shipping-sheet-label">Referencia</span>
              <span>{order.address.reference}</span>
            </div>
          ) : null}
          <div className="admin-shipping-sheet-method">
            {order.deliveryMethod === 'motorizado' ? 'Motorizado' : 'Courier'}
          </div>
        </div>
        <div className="admin-shipping-summary-actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={!ready}
            onClick={() => window.print()}
          >
            Imprimir resumen
          </button>
          {!ready ? (
            <p role="status">
              Completa el nombre, contacto y ubicación de entrega antes de
              imprimir.
            </p>
          ) : null}
        </div>
      </div>
    </details>
  )
}
