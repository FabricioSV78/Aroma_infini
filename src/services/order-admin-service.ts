import type {
  AdminOrder,
  AdminOrderStatus,
  AdminSaveResult,
} from '../types/admin'
import type {
  BulkOrderStatusResult,
  OrderHistoryEntry,
  OrderOperator,
} from '../types/order-workflow'
import type { Database, Json } from '../types/database.generated'
import { adminService as local, applyRemoteOrders } from './admin-service'
import { isRemoteCatalog } from './catalog-source'
import { adminAuthService as authService } from './auth-service'
import { requireAdminSupabaseClient as requireSupabaseClient } from './supabase-client'
import { verifySupabaseUser } from './verified-auth-user'
import { readAdminPageBatches } from './admin-page-batches'
import { UserFacingError } from './admin-messages'
import type { AdminOrderListQuery } from '../domain/admin-list-query'
import type { AdminCustomerList, AdminOrderList, AdminOrderSelection, AdminDashboardData } from '../types/admin-lists'
import { adminListAccess } from './admin-list-access'
import { createAdminProtectedReads } from './admin-protected-read'
import { isProductionEnvironment } from './runtime-environment'
import { notifyAdminOrdersChanged } from '../domain/order-events'
import { invalidatePublicQueryCache } from './public-query-cache'

import {
  invalidOrderResponse as invalid,
  orderResponseObject as object,
  orderResponseText as text,
  orderResponseInteger as integer,
  orderResponseUuid as uuid,
  parseAdminOrder,
  parseOrderHistory,
  parseAdminOrderSelection,
} from './order-response'
export {
  parseAdminOrder,
  parseAccountOrder,
  parseOrderHistory,
} from './order-response'

interface Actor {
  userId: string
  token: string
  generation: number
  accessRevision: number
}
let generation = 0,
  loadedOwner: string | null = null,
  pending: Promise<void> | undefined
let loadRevision = 0
let loadedAt = -Infinity
const pageReads = createAdminProtectedReads()
function owner(): string | null {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    !state.session.mfaRequired &&
    state.session.intent === 'account'
    ? state.session.user.id
    : null
}
let previousOwner = owner()
if (isRemoteCatalog)
  authService.subscribe(() => {
    const next = owner()
    if (next !== previousOwner) {
      previousOwner = next
      generation++
      loadRevision++
      loadedOwner = null
      loadedAt = -Infinity
      pending = undefined
      pageReads.invalidate()
      applyRemoteOrders([], [])
    }
  })
function sessionError(): never {
  adminListAccess.invalidate()
  pageReads.invalidate()
  generation++
  loadRevision++
  loadedOwner = null
  loadedAt = -Infinity
  pending = undefined
  applyRemoteOrders([], [])
  throw new UserFacingError(
    'orders-session',
    'Tu sesión administrativa cambió. Vuelve a iniciar sesión antes de gestionar pedidos.',
  )
}
async function actor(): Promise<Actor> {
  const userId = owner(),
    started = generation, accessRevision = adminListAccess.getSnapshot()
  if (!userId) sessionError()
  const client = requireSupabaseClient(),
    session = await client.auth.getSession()
  if (session.error || session.data.session?.user.id !== userId) sessionError()
  const token = session.data.session.access_token
  const verified = await verifySupabaseUser(token, 'admin')
  if (verified.error || verified.data.user?.id !== userId) sessionError()
  const result = { userId, token, generation: started, accessRevision }
  await stillActor(result)
  return result
}
async function stillActor(expected: Actor) {
  const session = await requireSupabaseClient().auth.getSession()
  if (
    expected.generation !== generation ||
    expected.accessRevision !== adminListAccess.getSnapshot() ||
    owner() !== expected.userId ||
    session.error ||
    session.data.session?.user.id !== expected.userId
  )
    sessionError()
}
function check(error: { code?: string } | null, responseStatus: number) {
  if (!error) return
  if (
    responseStatus === 401 ||
    responseStatus === 403 ||
    error.code === '42501'
  )
    sessionError()
  if (error.code === 'PT409' || error.code === '40001')
    throw new UserFacingError(
      'conflict',
      'El pedido cambió en otra sesión. Tus cambios se conservan; revisa la versión actual antes de guardar.',
    )
  if (['22023', '23514', '23502', '22P02'].includes(error.code ?? ''))
    throw new UserFacingError(
      'validation',
      'Revisa el estado y los datos de entrega antes de guardar.',
    )
  throw new UserFacingError(
    'network',
    'No pudimos confirmar los pedidos. Conserva tus cambios y vuelve a intentar.',
  )
}
/** A successful mutation already contains canonical server records. Do not
 * turn a later list refresh failure into a false report that saving failed. */
function confirmMutationOrders(records: unknown, history: unknown = []) {
  if (
    !Array.isArray(records) ||
    records.length > 1000 ||
    !Array.isArray(history)
  )
    invalid()
  const updates = records.map(parseAdminOrder),
    events = history.map(parseOrderHistory)
  if (new Set(updates.map((order) => order.reference)).size !== updates.length)
    invalid()
  const snapshot = local.getSnapshot(),
    index = new Map(updates.map((order) => [order.reference, order]))
  const orders = snapshot.orders.map((current) => {
    const next = index.get(current.reference)
    if (next) index.delete(current.reference)
    return next && (next.version ?? 0) >= (current.version ?? 0)
      ? next
      : current
  })
  // Mutations can return a record absent from a cached filtered/older list.
  orders.push(...index.values())
  const mergedHistory = new Map(
    snapshot.orderHistory.map((entry) => [entry.id, entry]),
  )
  for (const entry of events) mergedHistory.set(entry.id, entry)
  applyRemoteOrders(orders, [...mergedHistory.values()])
}
function invalidateOrderReads() {
  loadRevision++
  pending = undefined
  pageReads.invalidate()
}

type OrderReadRpc = 'admin_order_list' | 'admin_customer_list'
async function readProtectedPage<N extends OrderReadRpc>(
  name: N,
  args: Database['api']['Functions'][N]['Args'],
) {
  const started = generation
  const result = await pageReads.read(JSON.stringify([name, args]), current =>
    requireSupabaseClient().rpc(name, args)
      .setHeader('Authorization', `Bearer ${current.token}`),
  ).catch((error: unknown) => {
    if (error instanceof UserFacingError && error.code === 'session') sessionError()
    throw error
  })
  const current = { ...result.actor, generation: started }
  await stillActor(current)
  check(result.value.error, result.value.status)
  return { current, data: result.value.data }
}
async function command<Result>(
  request: () => PromiseLike<Result>,
): Promise<Result> {
  invalidateOrderReads()
  try {
    return await request()
  } finally {
    invalidateOrderReads()
  }
}
export async function loadAdminOrders(force = false): Promise<void> {
  if (!isRemoteCatalog) return
  const current = await actor()
  if (!force && loadedOwner === current.userId && Date.now() - loadedAt < 5000)
    return
  if (!force && pending) return pending
  const expectedLoad = ++loadRevision
  const operation = (async () => {
    const orders: AdminOrder[] = [],
      history: OrderHistoryEntry[] = []
    const { pages, total } = await readAdminPageBatches(
      async (offset) => {
        await stillActor(current)
        const response = await requireSupabaseClient()
          .rpc('admin_orders', { p_limit: 100, p_offset: offset })
          .setHeader('Authorization', `Bearer ${current.token}`)
        await stillActor(current)
        check(response.error, response.status)
        const page = object(response.data)
        if (
          !Array.isArray(page.orders) ||
          page.orders.length > 100 ||
          !Array.isArray(page.orderHistory) ||
          (integer(page.total) > 0 && page.orders.length === 0)
        )
          invalid()
        return page
      },
      (page) => page.total,
      invalid,
    )
    for (const [index, page] of pages.entries()) {
      if (
        !Array.isArray(page.orders) ||
        !Array.isArray(page.orderHistory) ||
        page.orders.length > 100
      )
        invalid()
      const count = integer(page.total)
      if (
        count > 10000 ||
        count !== total ||
        (index * 100 < count && !page.orders.length)
      )
        invalid()
      orders.push(...page.orders.map(parseAdminOrder))
      history.push(...page.orderHistory.map(parseOrderHistory))
    }
    if (
      orders.length !== total ||
      new Set(orders.map((order) => order.reference)).size !== orders.length
    )
      invalid()
    await stillActor(current)
    if (expectedLoad !== loadRevision) return
    applyRemoteOrders(orders, [
      ...new Map(history.map((entry) => [entry.id, entry])).values(),
    ])
    loadedOwner = current.userId
    loadedAt = Date.now()
  })()
  pending = operation
  try {
    await operation
  } finally {
    if (pending === operation) pending = undefined
  }
}

/** Route-scoped responses never replace/label the shared complete snapshot. */
export async function readAdminOrderList(
  query: AdminOrderListQuery, page: number, limit = 20,
): Promise<AdminOrderList> {
  const { current, data } = await readProtectedPage('admin_order_list', {
    p_query: query as Json, p_page: page, p_limit: limit,
  })
  return parseOrderPage(data, current, limit)
}
function parseOrderPage(value: unknown, current: Actor, limit: number): AdminOrderList {
  const data = object(value), counts = object(data.counts)
  if (!Array.isArray(data.orders) || data.orders.length > limit) invalid()
  const customer = data.customer === null ? null : object(data.customer)
  return {
    ownerId: current.userId,
    accessRevision: current.accessRevision,
    orders: data.orders.map(parseAdminOrder), total: integer(data.total),
    customer: customer ? { id: text(customer.id, 64), name: text(customer.name, 200), email: text(customer.email, 254), phone: text(customer.phone, 30) } : null,
    counts: { received: integer(counts.received), preparing: integer(counts.preparing), shipped: integer(counts.shipped), delivered: integer(counts.delivered) },
  }
}

export async function readAdminOrderSelection(query: AdminOrderListQuery): Promise<AdminOrderSelection[]> {
  const { data: response } = await readProtectedPage('admin_order_list', {
    p_query: query as Json, p_mode: 'selection',
  })
  const data = object(response)
  if (!Array.isArray(data.selection) || data.selection.length !== integer(data.total) || data.selection.length > 10000) invalid()
  const records = data.selection.map(parseAdminOrderSelection)
  if (new Set(records.map(r => r.reference)).size !== records.length) invalid()
  return records
}

/** Full lines/history are needed only by an explicit detail/PDF request. */
export async function loadAdminOrdersByReferences(references: readonly string[]): Promise<void> {
  if (!isRemoteCatalog) return
  const ids = [...new Set(references)]
  for (let index = 0; index < ids.length; index += 100) {
    const { data: response } = await readProtectedPage('admin_order_list', {
      p_query: { references: ids.slice(index, index + 100) }, p_mode: 'details', p_limit: 100,
    })
    const data = object(response)
    if (!Array.isArray(data.orders) || data.orders.length > 100 || !Array.isArray(data.orderHistory)) invalid()
    const requested = new Set(ids.slice(index, index + 100)), found = new Set(data.orders.map(value => parseAdminOrder(value).reference))
    if (found.size !== data.orders.length || [...found].some(reference => !requested.has(reference))) invalid()
    const missing = new Set([...requested].filter(reference => !found.has(reference)))
    if (missing.size) {
      const snapshot = local.getSnapshot()
      applyRemoteOrders(snapshot.orders.filter(order => !missing.has(order.reference)), snapshot.orderHistory.filter(event => !missing.has(event.reference)))
    }
    confirmMutationOrders(data.orders, data.orderHistory)
  }
}

export async function readAdminCustomerList(search: string, page: number): Promise<AdminCustomerList> {
  const { current, data: response } = await readProtectedPage('admin_customer_list', {
    p_search: search, p_page: page, p_limit: 25,
  })
  const data = object(response)
  if (!Array.isArray(data.customers) || data.customers.length > 25) invalid()
  return { ownerId: current.userId, accessRevision: current.accessRevision, total: integer(data.total), customers: data.customers.map(value => {
    const c = object(value)
    return { id: text(c.id, 64), name: text(c.name, 200), email: text(c.email, 254), phone: text(c.phone, 30), province: text(c.province, 100), district: text(c.district, 100), orderCount: integer(c.orderCount) }
  }) }
}
export async function readAdminOrdersDashboard(): Promise<Pick<AdminDashboardData, 'ownerId' | 'accessRevision' | 'recentOrders' | 'toPrepare' | 'counts'>> {
  const { current, data: response } = await readProtectedPage('admin_order_list', {
    p_mode: 'dashboard', p_limit: 4,
    p_query: { includeSimulation: !isProductionEnvironment },
  })
  const data = object(response), counts = object(data.counts)
  if (!Array.isArray(data.orders) || data.orders.length > 4) invalid()
  return { ownerId: current.userId, accessRevision: current.accessRevision, recentOrders: data.orders.map(parseAdminOrder), toPrepare: integer(data.toPrepare),
    counts: { received: integer(counts.received), preparing: integer(counts.preparing), shipped: integer(counts.shipped), delivered: integer(counts.delivered) } }
}

export interface OrderMutationOptions {
  deliveryConfirmed?: boolean
  expectedVersions?: Record<string, number>
  operationId?: string
  source?: 'individual' | 'bulk'
  listContext?: { query: AdminOrderListQuery; page: number; limit: number }
}
export const orderAdminService = {
  async setOrderStatus(
    reference: string,
    target: AdminOrderStatus,
    options: OrderMutationOptions = {},
  ): Promise<AdminSaveResult & { page?: AdminOrderList }> {
    if (!isRemoteCatalog) return local.setOrderStatus(reference, target)
    const result = await orderAdminService.bulkSetOrderStatus(
      [reference],
      target,
      undefined,
      undefined,
      { ...options, source: 'individual' },
    )
    if (result.kind === 'validation') return result
    const issue = result.errors[0] ?? result.skipped[0]
    return issue && !result.updated.length
      ? { kind: 'validation', message: issue.message }
      : { kind: 'saved', page: result.page }
  },
  async bulkSetOrderStatus(
    references: string[],
    target: AdminOrderStatus,
    operator?: OrderOperator,
    expectedStatuses?: Record<string, AdminOrderStatus>,
    options: OrderMutationOptions = {},
  ): Promise<BulkOrderStatusResult & { page?: AdminOrderList }> {
    if (!isRemoteCatalog)
      return local.bulkSetOrderStatus(
        references,
        target,
        operator,
        expectedStatuses,
      )
    const current = await actor(),
      snapshot = local.getSnapshot()
    const changes = [...new Set(references)].map((reference) => {
      const order = snapshot.orders.find((item) => item.reference === reference)
      return {
        reference,
        expectedVersion:
          options.expectedVersions?.[reference] ?? order?.version ?? 0,
      }
    })
    if (!changes.length || changes.length > 100)
      return {
        kind: 'validation',
        message: 'Selecciona entre uno y cien pedidos por operación.',
      }
    const response = await command(() =>
      requireSupabaseClient()
        .rpc(options.listContext ? 'admin_set_order_statuses_page' : 'admin_set_order_statuses', {
          p_changes: changes as Json,
          p_status: target,
          p_operation_id: options.operationId ?? crypto.randomUUID(),
          p_delivery_confirmed: options.deliveryConfirmed === true,
          p_source: options.source ?? 'bulk',
          ...(options.listContext ? {
            p_query: options.listContext.query as Json,
            p_page: options.listContext.page,
            p_limit: options.listContext.limit,
          } : {}),
        })
        .setHeader('Authorization', `Bearer ${current.token}`),
    )
    await stillActor(current)
    check(response.error, response.status)
    const data = object(response.data)
    if (
      data.kind !== 'updated' ||
      !Array.isArray(data.updated) ||
      !Array.isArray(data.skipped) ||
      !Array.isArray(data.errors)
    )
      invalid()
    const issue = (value: unknown) => {
      const item = object(value)
      return {
        reference: text(item.reference, 64),
        message: text(item.message, 500),
      }
    }
    const result: BulkOrderStatusResult = {
      kind: 'updated',
      operationId: uuid(data.operationId),
      updated: data.updated.map((value) => text(value, 64)),
      skipped: data.skipped.map(issue),
      errors: data.errors.map(issue),
    }
    const resultReferences = [
      ...result.updated,
      ...result.skipped.map((item) => item.reference),
      ...result.errors.map((item) => item.reference),
    ]
    if (
      resultReferences.length !== changes.length ||
      new Set(resultReferences).size !== resultReferences.length ||
      resultReferences.some(
        (reference) =>
          !changes.some((change) => change.reference === reference),
      )
    )
      invalid()
    confirmMutationOrders(data.orders, data.orderHistory)
    if (result.updated.length) {
      notifyAdminOrdersChanged()
      // Cancellation can restore stock and completed orders affect ranking.
      // Publish only a refresh signal, never the order or customer payload.
      invalidatePublicQueryCache(true)
    }
    return { ...result, ...(options.listContext ? { page: parseOrderPage(data.page, current, options.listContext.limit) } : {}) }
  },
  async saveOrderDelivery(
    reference: string,
    details: {
      customerName: string
      customerEmail: string
      phone: string
      street: string
      department?: string
      province?: string
      district?: string
    },
    expectedVersion?: number,
  ): Promise<AdminSaveResult> {
    if (!isRemoteCatalog) return local.saveOrderDelivery(reference, details)
    const current = await actor(),
      order = local
        .getSnapshot()
        .orders.find((item) => item.reference === reference)
    if (!order)
      return { kind: 'validation', message: 'El pedido ya no está disponible.' }
    const response = await command(() =>
      requireSupabaseClient()
        .rpc('admin_save_order_delivery', {
          p_reference: reference,
          p_expected_version: expectedVersion ?? order.version ?? 0,
          p_address: {
            ...order.address,
            street: details.street,
            department: details.department ?? order.address.department,
            province: details.province ?? order.address.province,
            district: details.district ?? order.address.district,
          } as Json,
          p_contact_phone: details.phone,
          p_alternate_recipient: (order.alternateRecipient as Json) ?? null,
        })
        .setHeader('Authorization', `Bearer ${current.token}`),
    )
    await stillActor(current)
    check(response.error, response.status)
    confirmMutationOrders([object(response.data).order])
    notifyAdminOrdersChanged()
    return { kind: 'saved' }
  },
}
