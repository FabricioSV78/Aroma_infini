import type { CheckoutOperation } from './checkout-server'
import type { CheckoutMode } from './checkout-service'

export const CHECKOUT_ATTEMPT_STORAGE_KEY = 'aroma-infini:checkout-attempt:v1'
export const CHECKOUT_ATTEMPT_LIFETIME = 24 * 60 * 60 * 1000

interface AttemptReceipt {
  version: 1
  fingerprint: string
  operationId: string
  trackingToken: string
  quoteHash: string
  createdAt: number
}

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function tabStorage(): AttemptStorage | undefined {
  try {
    return window.sessionStorage
  } catch {
    // The in-memory operation still supports retries if storage is blocked.
    return undefined
  }
}

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const digest = /^[a-f0-9]{64}$/i
const quoteHash = /^[a-f0-9]{32,128}$/i

/** An opaque, owner-scoped fingerprint; never persist the checkout or Auth. */
export async function fingerprintCheckoutAttempt(
  operation: CheckoutOperation,
  mode: CheckoutMode,
  ownerId: string | null,
): Promise<string> {
  const { expectedQuoteHash: _quote, ...input } = operation.checkout
  void _quote
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ownerId, mode, input }),
  )
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readAttempt(
  storage: AttemptStorage | undefined,
  now: number,
): AttemptReceipt | null {
  try {
    const raw = storage?.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid attempt')
    const record = value as Partial<AttemptReceipt>
    if (
      record.version !== 1 ||
      typeof record.fingerprint !== 'string' ||
      !digest.test(record.fingerprint) ||
      typeof record.operationId !== 'string' ||
      !uuid.test(record.operationId) ||
      typeof record.trackingToken !== 'string' ||
      !digest.test(record.trackingToken) ||
      typeof record.quoteHash !== 'string' ||
      !quoteHash.test(record.quoteHash) ||
      typeof record.createdAt !== 'number' ||
      !Number.isSafeInteger(record.createdAt) ||
      record.createdAt > now ||
      now - record.createdAt >= CHECKOUT_ATTEMPT_LIFETIME
    )
      throw new Error('Invalid or expired attempt')
    return record as AttemptReceipt
  } catch {
    clearCheckoutAttempt(undefined, storage)
    return null
  }
}

/**
 * A tab-private retry receipt, not a saved form or public cache. The tracking
 * capability authorizes only this receipt; no session/access token is stored.
 * Re-entering exactly the same details can reconstruct the original command.
 */
export function restoreCheckoutAttempt(
  fingerprint: string,
  candidate: CheckoutOperation,
  storage = tabStorage(),
  now = Date.now(),
): CheckoutOperation {
  const receipt = readAttempt(storage, now)
  if (!receipt || receipt.fingerprint !== fingerprint) return candidate
  return {
    operationId: receipt.operationId,
    trackingToken: receipt.trackingToken,
    checkout: {
      ...candidate.checkout,
      expectedQuoteHash: receipt.quoteHash,
    },
  }
}

export function rememberCheckoutAttempt(
  fingerprint: string,
  operation: CheckoutOperation,
  storage = tabStorage(),
  now = Date.now(),
): void {
  const existing = readAttempt(storage, now)
  const receipt: AttemptReceipt = {
    version: 1,
    fingerprint,
    operationId: operation.operationId,
    trackingToken: operation.trackingToken,
    quoteHash: String(operation.checkout.expectedQuoteHash),
    // Retrying must not extend the lifetime of an unresolved receipt forever.
    createdAt:
      existing?.operationId === operation.operationId
        ? existing.createdAt
        : now,
  }
  try {
    storage?.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(receipt))
  } catch {
    // Preserve the current operation in memory; do not drop an entered form.
  }
}

/** An old completion must never delete the receipt of a newer intention. */
export function clearCheckoutAttempt(
  operationId?: string,
  storage = tabStorage(),
): void {
  try {
    if (operationId) {
      const raw = storage?.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
      if (!raw) return
      const value: unknown = JSON.parse(raw)
      if (
        value &&
        typeof value === 'object' &&
        'operationId' in value &&
        value.operationId !== operationId
      )
        return
    }
    storage?.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  } catch {
    // Storage can become unavailable while the page is open.
  }
}
