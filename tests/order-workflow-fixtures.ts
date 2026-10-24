import type { Page } from '@playwright/test'
import type { AdminOrder, AdminState } from '../src/services/admin-service'
import { persistedAdminState } from './product-import-fixtures'

export const workflowOperator = {
  name: 'Responsable de prueba',
  verified: false,
  id: null,
} as const

export interface WorkflowOrderOverride {
  index: number
  status?: AdminOrder['status']
  paymentStatus?: AdminOrder['paymentStatus']
  incompleteDelivery?: boolean
  placedAt?: string
}

/** Browser-local, synthetic orders. Never calls a remote order API. */
export async function seedWorkflowOrders(
  page: Page,
  count: number,
  overrides: WorkflowOrderOverride[] = [],
) {
  await page.goto('/admin/pedidos')
  const references = await page.evaluate(
    async ({ total, patches }) => {
      const adminPath = '/src/services/admin-service.ts'
      const persistencePath = '/src/services/admin-persistence.ts'
      const { adminService, hydrateAdminStore } = (await import(
        adminPath
      )) as typeof import('../src/services/admin-service')
      const { writeAdminState } = (await import(
        persistencePath
      )) as typeof import('../src/services/admin-persistence')
      await hydrateAdminStore()
      await adminService.flush()
      const snapshot = structuredClone(adminService.getSnapshot())
      const template = snapshot.orders[0]
      if (!template) throw new Error('La prueba necesita un pedido base.')
      const orders = Array.from({ length: total }, (_, index): AdminOrder => {
        const patch = patches.find((item) => item.index === index)
        return {
          ...structuredClone(template),
          reference: `AI-TEST-${String(index + 1).padStart(4, '0')}`,
          customerId: `workflow-customer-${index + 1}`,
          customerName: `Ana Operación ${index + 1}`,
          customerEmail: `pedido${index + 1}@example.invalid`,
          contactPhone: '999888777',
          placedAt: patch?.placedAt ?? '2026-10-21T15:00:00.000Z',
          status: patch?.status ?? 'received',
          paymentStatus: patch?.paymentStatus ?? 'approved',
          address: {
            department: 'lima',
            province: '1501',
            district: '150122',
            street: patch?.incompleteDelivery ? '' : 'Calle Los Olivos 123',
          },
        }
      })
      const fixture = Object.assign(snapshot, {
        orders,
        orderBatches: [],
        orderHistory: [],
      })
      await writeAdminState(fixture)
      return orders.map((order) => order.reference)
    },
    { total: count, patches: overrides },
  )
  await page.reload()
  return references
}

export function workflowSnapshot(page: Page): Promise<AdminState> {
  return persistedAdminState(page)
}

export const workflowViewports = [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const
