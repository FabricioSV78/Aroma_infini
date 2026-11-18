import './admin-operations.css'
import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAdminListData } from './useAdminListData'
import type { AdminCustomerList } from '../../types/admin-lists'
import { getPeruDistrictLabel, getPeruProvinceLabel } from '../../content/peru'
import { type AdminOrder } from '../../services/admin-service'
import { AdminPagination } from './AdminPagination'
import { AdminPageHeader } from './AdminShared'
import {
  getCommercialOrders,
  getCommercialCustomerRecords,
} from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { EmptyState } from '../../components/ui/EmptyState'

function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

export function AdminCustomersPage() {
  const state = useAdminStore()
  const remote = useAdminListData<AdminCustomerList>()
  const [params, setParams] = useSearchParams()
  const currentQuery = params.get('q') ?? ''
  const [draft, setDraft] = useState({ base: currentQuery, value: currentQuery })
  const search = remote && draft.base !== currentQuery ? currentQuery : draft.value
  const setSearch = (value: string) => setDraft({ base: currentQuery, value })
  useEffect(() => {
    if (!remote || search === currentQuery) return
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      next.delete('page')
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      setParams(next, { replace: true })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [remote, search, currentQuery, params, setParams])
  const { orderCountByCustomer, latestOrderByCustomer } = useMemo(() => {
    const orderCountByCustomer = new Map<string, number>()
    const latestOrderByCustomer = new Map<string, AdminOrder>()
    if (remote) return { orderCountByCustomer: new Map(remote.customers.map(c => [c.id, c.orderCount])), latestOrderByCustomer }
    getCommercialOrders(state.orders).forEach((order) => {
      orderCountByCustomer.set(
        order.customerId,
        (orderCountByCustomer.get(order.customerId) ?? 0) + 1,
      )
      const latest = latestOrderByCustomer.get(order.customerId)
      if (!latest || Date.parse(order.placedAt) > Date.parse(latest.placedAt))
        latestOrderByCustomer.set(order.customerId, order)
    })
    return { orderCountByCustomer, latestOrderByCustomer }
  }, [remote, state.orders])
  const customerSearchRows = useMemo(
    () => remote ? [] :
      getCommercialCustomerRecords(state.customers, state.orders)
        .map((customer) => {
          const address = latestOrderByCustomer.get(customer.id)?.address
          return {
            customer,
            text: searchText(
              `${customer.name} ${customer.email} ${customer.phone} ${address?.province ? getPeruProvinceLabel(address.province) : ''} ${address?.district ? getPeruDistrictLabel(address.district) : ''}`,
            ),
          }
        })
        .sort((first, second) =>
          first.customer.name.localeCompare(second.customer.name, 'es'),
        ),
    [remote, state.customers, state.orders, latestOrderByCustomer],
  )
  const query = searchText(search)
  const customers = useMemo(
    () => remote?.customers ??
      customerSearchRows
        .filter((row) => !query || row.text.includes(query))
        .map((row) => row.customer),
    [remote, customerSearchRows, query],
  )
  const total = remote?.total ?? customers.length
  const pagination = useAdminPagination(customers, 25, remote?.total)
  return (
    <div className="admin-page admin-customers-page">
      <AdminPageHeader
        eyebrow="Operación"
        title="Clientes"
        description="Consulta los clientes y su historial de pedidos."
      />
      <div className="admin-customer-toolbar">
        <label>
          Buscar cliente
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, correo, celular o ubicación"
          />
        </label>
        <div className="admin-customer-result" role="status" aria-live="polite">
          {total} {total === 1 ? 'cliente' : 'clientes'}
          {search ? (
            <button type="button" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          ) : null}
        </div>
      </div>
      {customers.length ? (
        <p className="admin-customers-location-note">
          La provincia y el distrito corresponden al pedido más reciente de cada
          cliente.
        </p>
      ) : null}
      {customers.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Clientes</caption>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Correo</th>
                <th scope="col">Celular</th>
                <th scope="col">Provincia</th>
                <th scope="col">Distrito</th>
                <th scope="col">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((customer) => {
                const address = remote ? remote.customers.find(c => c.id === customer.id) : latestOrderByCustomer.get(customer.id)?.address
                return (
                  <tr key={customer.id}>
                    <th scope="row">
                      <span className="admin-cell-label">Cliente</span>
                      {customer.name}
                    </th>
                    <td>
                      <span className="admin-cell-label">Correo</span>
                      {customer.email}
                    </td>
                    <td>
                      <span className="admin-cell-label">Celular</span>
                      {customer.phone}
                    </td>
                    <td>
                      <span className="admin-cell-label">Provincia</span>
                      {address?.province
                        ? getPeruProvinceLabel(address.province)
                        : '—'}
                    </td>
                    <td>
                      <span className="admin-cell-label">Distrito</span>
                      {address?.district
                        ? getPeruDistrictLabel(address.district)
                        : '—'}
                    </td>
                    <td>
                      <span className="admin-cell-label">Pedidos</span>
                      <span className="admin-customer-orders">
                        <strong>
                          {orderCountByCustomer.get(customer.id) ?? 0}
                        </strong>
                        {(orderCountByCustomer.get(customer.id) ?? 0) > 0 ? (
                          <Link
                            to={`/admin/pedidos?cliente=${encodeURIComponent(customer.id)}`}
                            aria-label={`Ver pedidos de ${customer.name}`}
                          >
                            Ver pedidos
                          </Link>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {!customers.length ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon={query ? 'search' : 'user'}
          title={query ? 'No encontramos clientes' : 'Aún no hay clientes'}
          description={
            query
              ? 'Prueba con otro nombre, correo, celular o ubicación.'
              : 'Los clientes aparecerán después de completar una compra.'
          }
        >
          {query ? (
            <button type="button" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          ) : null}
        </EmptyState>
      ) : null}
      <AdminPagination
        label="clientes"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </div>
  )
}
