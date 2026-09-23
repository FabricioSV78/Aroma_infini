import { useEffect } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { useCart } from './cart-context'

export function CartNotice() {
  const { notice, dismissNotice } = useCart()
  useEffect(
    function dismissCartNotice() {
      if (!notice) return
      const timeout = window.setTimeout(dismissNotice, 4200)
      return () => window.clearTimeout(timeout)
    },
    [dismissNotice, notice],
  )
  if (!notice) return null
  return (
    <div className="cart-notice" role="status">
      <span>{notice.message}</span>
      <Link to="/carrito" onClick={dismissNotice}>
        Ver carrito <Icon name="arrow" />
      </Link>
      <button type="button" onClick={dismissNotice} aria-label="Cerrar confirmación">
        ×
      </button>
    </div>
  )
}
