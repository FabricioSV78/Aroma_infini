import type { OrderStatus } from './commerce'

/** Local historical entries remain unverified; remote actors come from Auth. */
export interface OrderOperator {
  name: string
  verified: boolean
  id: string | null
}

export interface OrderHistoryEntry {
  id: string
  reference: string
  fromStatus: OrderStatus
  toStatus: OrderStatus
  changedAt: string
  operator: OrderOperator
  operationId: string
  source: 'individual' | 'bulk'
}

export interface OrderActionIssue {
  reference: string
  message: string
}

export type BulkOrderStatusResult =
  | {
      kind: 'updated'
      operationId: string
      updated: string[]
      skipped: OrderActionIssue[]
      errors: OrderActionIssue[]
    }
  | { kind: 'validation'; message: string }
