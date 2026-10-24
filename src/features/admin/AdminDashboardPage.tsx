import { variantLabel } from '../../domain/product-type'
import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/ui/Icon'
import { formatPEN } from '../../services/currency'
import { AdminBadge, AdminPageHeader } from './AdminShared'
import {
  adminOrderStatusMeta,
  adminPaymentStatusMeta,
  getInventoryAlerts,
  getProductInventory,
  type AdminTone,
} from './admin-utils'
import { useAdminStore } from './useAdminStore'

interface DashboardMetric {
  label: string
  value: number
  detail: string
  action: string
  ariaLabel?: string
  to: string
  icon: IconName
  tone: AdminTone
}

export function AdminDashboardPage() {
  const state = useAdminStore()
  const activeBrandIds = new Set(
    state.brands.filter((brand) => brand.active).map((brand) => brand.id),
  )
  const activeProducts = state.products.filter(
    (record) => record.active && activeBrandIds.has(record.product.brandId),
  )
  const inventoryAlerts = getInventoryAlerts(state.products)
  const totalStock = activeProducts.reduce(
    (total, record) => total + getProductInventory(record).totalStock,
    0,
  )
  const ordersToPrepare = state.orders.filter(
    (order) =>
      order.paymentStatus === 'approved' &&
      ['received', 'preparing'].includes(order.status),
  )
  const shipmentsInProgress = state.orders.filter(
    (order) => order.status === 'shipped',
  )
  const recentOrders = [...state.orders]
    .sort(
      (first, second) =>
        new Date(second.placedAt).getTime() -
          new Date(first.placedAt).getTime() ||
        first.reference.localeCompare(second.reference),
    )
    .slice(0, 4)

  const metrics: DashboardMetric[] = [
    {
      label: 'Pedidos por preparar',
      value: ordersToPrepare.length,
      detail: 'Aprobados y aún no enviados',
      action: 'Ver pedidos',
      to: '/admin/pedidos?preparacion=atencion',
      icon: 'orders',
      tone: ordersToPrepare.length ? 'info' : 'success',
    },
    {
      label: 'Alertas de stock',
      value: inventoryAlerts.length,
      detail: 'Presentaciones bajas o agotadas',
      action: 'Ver alertas',
      to: '/admin/productos?stock=alert',
      icon: 'alert',
      tone: inventoryAlerts.some((item) => item.tone === 'danger')
        ? 'danger'
        : inventoryAlerts.length
          ? 'warning'
          : 'success',
    },
    {
      label: 'Envíos en curso',
      value: shipmentsInProgress.length,
      detail: 'Pedidos despachados por entregar',
      action: 'Ver envíos',
      ariaLabel: 'Envíos en curso: ver detalle',
      to: '/admin/pedidos?preparacion=shipped',
      icon: 'truck',
      tone: shipmentsInProgress.length ? 'info' : 'success',
    },
    {
      label: 'Unidades disponibles',
      value: totalStock,
      detail: 'En presentaciones activas',
      action: 'Ver productos',
      to: '/admin/productos',
      icon: 'package',
      tone: totalStock ? 'success' : 'neutral',
    },
  ]

  const orderCounts = {
    received: state.orders.filter((order) => order.status === 'received')
      .length,
    preparing: state.orders.filter((order) => order.status === 'preparing')
      .length,
    shipped: state.orders.filter((order) => order.status === 'shipped').length,
    delivered: state.orders.filter((order) => order.status === 'delivered')
      .length,
  }

  return (
    <div className="admin-page admin-dashboard">
      <AdminPageHeader
        eyebrow="Dashboard"
        title="Resumen del negocio"
        description="Prioridades que requieren atención hoy."
      />

      <section
        className="admin-metric-grid"
        aria-label="Indicadores operativos"
      >
        {metrics.map((metric) => (
          <article
            className={`admin-metric-card admin-metric-card--${metric.tone}`}
            key={metric.label}
          >
            <span className="admin-metric-icon" aria-hidden="true">
              <Icon name={metric.icon} />
            </span>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
            <Link
              to={metric.to}
              aria-label={
                metric.ariaLabel ??
                `${metric.action}: ${metric.label.toLowerCase()}`
              }
            >
              {metric.action} <Icon name="arrow" />
            </Link>
          </article>
        ))}
      </section>

      <section
        className="admin-quick-links"
        aria-labelledby="quick-links-title"
      >
        <h2 id="quick-links-title">Acciones rápidas</h2>
        <div>
          <Link to="/admin/productos/nuevo">
            <Icon name="package" aria-hidden="true" />
            <span>Crear producto</span>
            <Icon name="arrow" aria-hidden="true" />
          </Link>
          <Link to="/admin/home" aria-label="Editar contenido del Home">
            <Icon name="home" aria-hidden="true" />
            <span>Editar Home</span>
            <Icon name="arrow" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="admin-dashboard-grid">
        <section
          className="admin-dashboard-panel admin-inventory-alerts"
          aria-labelledby="inventory-alerts-title"
        >
          <header>
            <div className="admin-panel-title">
              <span className="admin-panel-icon admin-panel-icon--danger">
                <Icon name="alert" />
              </span>
              <div>
                <h2 id="inventory-alerts-title">Inventario por reponer</h2>
                <p>Presentaciones en o debajo de su umbral.</p>
              </div>
            </div>
            <Link to="/admin/productos?stock=alert">Ver inventario</Link>
          </header>
          {inventoryAlerts.length ? (
            <ul>
              {inventoryAlerts.slice(0, 5).map((item) => (
                <li key={item.variantId}>
                  <div>
                    <strong>{item.productName}</strong>
                    <span>{variantLabel(item)}</span>
                  </div>
                  <div className="admin-stock-alert-value">
                    <AdminBadge tone={item.tone}>
                      {item.stock === 0 ? 'Agotado' : `${item.stock} unidades`}
                    </AdminBadge>
                    <small>Umbral: {item.threshold}</small>
                  </div>
                  <Link
                    to={`/admin/productos/${item.productId}#product-variants-title`}
                    state={{ returnTo: '/admin' }}
                    aria-label={`Editar stock de ${item.productName}, ${variantLabel(item)}`}
                  >
                    Editar
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-panel-empty">
              <Icon name="check" />
              <p>No hay presentaciones con alerta de stock.</p>
            </div>
          )}
        </section>

        <section
          className="admin-dashboard-panel admin-order-overview"
          aria-labelledby="order-overview-title"
        >
          <header>
            <div className="admin-panel-title">
              <span className="admin-panel-icon admin-panel-icon--info">
                <Icon name="orders" />
              </span>
              <div>
                <h2 id="order-overview-title">Flujo de pedidos</h2>
              </div>
            </div>
          </header>
          <dl>
            <div>
              <dt>Nuevos</dt>
              <dd>
                <Link
                  to="/admin/pedidos?preparacion=received"
                  aria-label={`Ver ${orderCounts.received} pedidos nuevos`}
                >
                  {orderCounts.received}
                  <Icon name="arrow" aria-hidden="true" />
                </Link>
              </dd>
            </div>
            <div>
              <dt>En preparación</dt>
              <dd>
                <Link
                  to="/admin/pedidos?preparacion=preparing"
                  aria-label={`Ver ${orderCounts.preparing} pedidos en preparación`}
                >
                  {orderCounts.preparing}
                  <Icon name="arrow" aria-hidden="true" />
                </Link>
              </dd>
            </div>
            <div>
              <dt>Enviados</dt>
              <dd>
                <Link
                  to="/admin/pedidos?preparacion=shipped"
                  aria-label={`Ver ${orderCounts.shipped} pedidos enviados`}
                >
                  {orderCounts.shipped}
                  <Icon name="arrow" aria-hidden="true" />
                </Link>
              </dd>
            </div>
            <div>
              <dt>Entregados</dt>
              <dd>
                <Link
                  to="/admin/pedidos?preparacion=delivered"
                  aria-label={`Ver ${orderCounts.delivered} pedidos entregados`}
                >
                  {orderCounts.delivered}
                  <Icon name="arrow" aria-hidden="true" />
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        className="admin-dashboard-panel admin-recent-orders"
        aria-labelledby="recent-orders-title"
      >
        <header>
          <div className="admin-panel-title">
            <span className="admin-panel-icon admin-panel-icon--info">
              <Icon name="clock" />
            </span>
            <div>
              <h2 id="recent-orders-title">Pedidos recientes</h2>
            </div>
          </div>
          <Link to="/admin/pedidos">Ver todos</Link>
        </header>
        {recentOrders.length ? (
          <ul>
            {recentOrders.map((order) => {
              const orderStatus = adminOrderStatusMeta[order.status]
              const paymentStatus = adminPaymentStatusMeta[order.paymentStatus]
              return (
                <li key={order.reference}>
                  <div>
                    <strong>{order.reference}</strong>
                    <span>{order.customerName}</span>
                  </div>
                  <span className="admin-order-date">
                    <span className="sr-only">Fecha: </span>
                    {new Intl.DateTimeFormat('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    }).format(new Date(order.placedAt))}
                  </span>
                  <AdminBadge
                    tone={orderStatus.tone}
                    className="admin-order-preparation"
                  >
                    <span className="sr-only">Preparación: </span>
                    {orderStatus.label}
                  </AdminBadge>
                  <AdminBadge
                    tone={paymentStatus.tone}
                    className="admin-order-payment"
                  >
                    <span className="sr-only">Pago: </span>
                    {paymentStatus.label}
                  </AdminBadge>
                  <strong className="admin-order-total">
                    <span className="sr-only">Total: </span>
                    {formatPEN(order.totalCents)}
                  </strong>
                  <Link
                    to={`/admin/pedidos/${order.reference}`}
                    state={{ returnTo: '/admin' }}
                    aria-label={`Ver pedido ${order.reference}`}
                  >
                    Ver pedido
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="admin-dashboard-empty">Todavía no hay pedidos.</p>
        )}
      </section>
    </div>
  )
}
