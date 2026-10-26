import { useId } from 'react'
import { Icon, type IconName } from '../../components/ui/Icon'
import {
  ORDER_STATUSES,
  getOrderTransitionError,
} from '../../domain/order-workflow'
import type { AdminOrder, AdminOrderStatus } from '../../services/admin-service'
import { adminOrderStatusMeta } from './admin-utils'
import './order-status-picker.css'

const stepIcons: Record<AdminOrderStatus, IconName> = {
  received: 'orders',
  preparing: 'package',
  shipped: 'truck',
  delivered: 'check',
}

interface OrderStatusPickerProps {
  order: AdminOrder
  value: AdminOrderStatus
  onChange: (status: AdminOrderStatus) => void
  disabled: boolean
  legacyPhone?: string
}

export function OrderStatusPicker({
  order,
  value,
  onChange,
  disabled,
  legacyPhone,
}: OrderStatusPickerProps) {
  const id = useId()
  const currentIndex = ORDER_STATUSES.indexOf(order.status)
  const changed = value !== order.status
  const paymentBlocked = order.paymentStatus !== 'approved'
  return (
    <>
      <fieldset className="admin-order-state-picker" disabled={disabled}>
        <legend>Preparación del pedido</legend>
        <span
          className="admin-order-state-position"
          aria-label={`Estado ${currentIndex + 1} de 4`}
        >
          {currentIndex + 1}
          <span aria-hidden="true"> / 4</span>
        </span>
        <div className="admin-order-state-options">
          {ORDER_STATUSES.map((step, index) => {
            const current = step === order.status
            const selected = step === value
            const error = getOrderTransitionError(order, step, legacyPhone)
            const unavailable = !current && Boolean(error)
            const missingDelivery =
              !paymentBlocked &&
              step === 'shipped' &&
              Math.abs(index - currentIndex) === 1 &&
              Boolean(error)
            return (
              <label
                key={step}
                className={`admin-order-state-option${selected ? ' is-selected' : ''}${current ? ' is-current' : ''}${index < currentIndex ? ' is-complete' : ''}${unavailable ? ' is-unavailable' : ''}`}
              >
                <input
                  type="radio"
                  name="orderPreparation"
                  value={step}
                  aria-label={adminOrderStatusMeta[step].label}
                  aria-describedby={
                    unavailable ? `${id}-${step}-reason` : undefined
                  }
                  checked={selected}
                  disabled={unavailable}
                  onChange={() => onChange(step)}
                />
                <span className="admin-order-state-icon">
                  <Icon
                    name={
                      index < currentIndex && !selected
                        ? 'check'
                        : stepIcons[step]
                    }
                  />
                </span>
                <span className="admin-order-state-label">
                  <strong>{adminOrderStatusMeta[step].label}</strong>
                  {missingDelivery ? (
                    <small>Faltan datos de entrega</small>
                  ) : null}
                </span>
                {current ? (
                  <span className="admin-order-state-tag">Actual</span>
                ) : selected ? (
                  <Icon name="check" className="admin-order-state-choice" />
                ) : !unavailable ? (
                  <Icon name="chevron" className="admin-order-state-choice" />
                ) : null}
                {unavailable ? (
                  <span id={`${id}-${step}-reason`} className="sr-only">
                    {error}
                  </span>
                ) : null}
              </label>
            )
          })}
        </div>
      </fieldset>
      {paymentBlocked ? (
        <p className="admin-order-state-help">
          <Icon name="card" />
          <span>El pago debe estar aprobado para cambiar el estado.</span>
        </p>
      ) : null}
      {changed ? (
        <div className="admin-order-state-preview">
          <p role="status">
            <span>{adminOrderStatusMeta[order.status].label}</span>
            <Icon name="arrow" />
            <strong>{adminOrderStatusMeta[value].label}</strong>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(order.status)}
          >
            Deshacer
          </button>
        </div>
      ) : null}
    </>
  )
}
