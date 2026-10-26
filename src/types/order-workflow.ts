import type { OrderStatus } from './commerce'

/** Internal audit actor. Historical entries are kept; authentication is not connected yet. */
export interface OrderOperator {
  name: string
  verified: false
  id: null
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
