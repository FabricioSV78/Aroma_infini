import {
  accountStatusLabels,
  accountStatusOrder,
  type AccountOrderStatus,
} from '../../services/account-service'

export function AccountOrderTimeline({
  status,
}: {
  status: AccountOrderStatus
}) {
  const currentIndex = accountStatusOrder.indexOf(status)
  return (
    <ol className="account-order-timeline" aria-label="Estado del pedido">
      {accountStatusOrder.map((step, index) => (
        <li
          key={step}
          className={index <= currentIndex ? 'is-complete' : undefined}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          {accountStatusLabels[step]}
        </li>
      ))}
    </ol>
  )
}
