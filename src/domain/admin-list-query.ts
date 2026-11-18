export interface AdminProductListQuery {
  search?: string
  stock?: string
  visibility?: string
}
export interface AdminOrderListQuery {
  search?: string
  status?: string
  customer?: string
  from?: string
  until?: string
  references?: string[]
}
export function adminListPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 2147483647) : 1
}
export function adminProductListQuery(params: URLSearchParams): AdminProductListQuery {
  return {
    search: (params.get('q') ?? '').trim().slice(0, 200),
    stock: ['alert', 'out', 'healthy'].includes(params.get('stock') ?? '')
      ? params.get('stock')! : 'all',
    visibility: ['active', 'inactive', 'pending-images'].includes(params.get('visibilidad') ?? '')
      ? params.get('visibilidad')! : 'all',
  }
}
export function adminOrderListQuery(params: URLSearchParams): AdminOrderListQuery {
  // Reviewing failed rows must still find an order whose state changed in a
  // competing session. The legacy review action bypasses the previous filters.
  if (params.get('revisar')) return { references: params.get('revisar')!.split(',') }
  return {
    search: (params.get('q') ?? '').trim().slice(0, 200),
    status: ['atencion', 'received', 'preparing', 'shipped', 'delivered'].includes(params.get('preparacion') ?? '')
      ? params.get('preparacion')! : 'all',
    customer: (params.get('cliente') ?? '').slice(0, 64),
    from: params.get('desde') ?? '',
    until: params.get('hasta') ?? '',
  }
}
