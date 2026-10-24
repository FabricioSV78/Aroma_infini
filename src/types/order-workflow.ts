import type { OrderStatus } from './commerce'

/** Self-declared local operator. Authentication is not connected yet. */
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

export interface OrderBatch {
  id: string
  code: string
  name: string
  orderReferences: string[]
  createdAt: string
  operator: OrderOperator
  archived: boolean
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

export type CreateOrderBatchResult =
  { kind: 'saved'; batch: OrderBatch } | { kind: 'validation'; message: string }

export interface OrderBatchUpdate {
  name?: string
  orderReferences?: string[]
  archived?: boolean
}
