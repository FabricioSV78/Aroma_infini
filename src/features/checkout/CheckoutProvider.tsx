import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router'
import type { ResolvedCart } from '../../services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
  persistDemoCheckout,
  type CheckoutContact,
  type MockOrder,
} from '../../services/checkout-service'
import { CheckoutContext, type CheckoutContextValue } from './checkout-context'
import { saveTrackingRecord } from '../../services/order-tracking-service'
import { useAccount } from '../account/account-context'
import { useCart } from '../cart/cart-context'
import { isRemoteCatalog } from '../../services/catalog-source'
import {
  checkoutQuery,
  createCheckoutOperation,
  requestCheckoutQuote,
  submitSimulatedOrder,
  type CheckoutOperation,
  type ServerCheckoutQuote,
} from '../../services/checkout-server'
import { useStorefrontSnapshot } from '../../services/offer-price-clock'
import { authService } from '../../services/auth-service'
import { UserFacingError } from '../../services/admin-messages'
import { canSimulateCheckout } from '../../services/runtime-environment'
import { useAuth } from '../auth/useAuth'
import {
  clearCheckoutAttempt,
  fingerprintCheckoutAttempt,
  rememberCheckoutAttempt,
  restoreCheckoutAttempt,
} from '../../services/checkout-attempt'

function checkoutIdentity() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated'
    ? (state.session?.user.id ?? null)
    : null
}

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(createCheckoutDraft)
  const [order, setOrder] = useState<MockOrder | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [pendingQuote, setPendingQuote] = useState<ServerCheckoutQuote | null>(
    null,
  )
  const {
    addCheckoutOrder,
    active: accountActive,
    profile,
    status: accountStatus,
  } = useAccount()
  const auth = useAuth()
  const ownerId =
    auth.status === 'authenticated' && auth.session?.intent === 'account'
      ? auth.session.user.id
      : null
  const accountEmail =
    auth.status === 'authenticated' ? (auth.session?.user.email ?? '') : ''
  const editedContactFields = useRef(new Set<keyof CheckoutContact>())
  const setContactField = useCallback(
    (field: keyof CheckoutContact, value: string) => {
      editedContactFields.current.add(field)
      setDraft((current) => ({
        ...current,
        contact: { ...current.contact, [field]: value },
      }))
    },
    [],
  )
  const { items } = useCart()
  const location = useLocation()
  const snapshot = useStorefrontSnapshot()
  const [revision, setRevision] = useState(0)
  const [quoteState, setQuoteState] = useState<{
    key: string
    quote: ServerCheckoutQuote | null
    error: string
  }>({ key: '', quote: null, error: '' })
  const queryKey = JSON.stringify(checkoutQuery(items, draft))
  const catalogKey = JSON.stringify(
    snapshot.products
      .filter((record) =>
        record.product.variants.some((variant) =>
          items.some((item) => item.variantId === variant.id),
        ),
      )
      .map(({ product }) => ({
        id: product.id,
        variants: product.variants,
        discount: product.discount,
      })),
  )
  const quoteKey = queryKey + catalogKey + JSON.stringify(snapshot.shipping)
  const currentDraft = useRef(draft)
  const currentItems = useRef(items)
  useEffect(() => {
    currentDraft.current = draft
    currentItems.current = items
  }, [draft, items])
  const operation = useRef<{ key: string; value: CheckoutOperation } | null>(
    null,
  )
  const operationGeneration = useRef(0)
  useEffect(() => {
    const identityResolved = () => {
      const { status } = authService.getSnapshot()
      return status !== 'checking' && status !== 'error'
    }
    let previous = checkoutIdentity()
    let identityKnown = identityResolved()
    return authService.subscribe(() => {
      const next = checkoutIdentity()
      const wasKnown = identityKnown
      if (identityResolved()) identityKnown = true
      if (previous === next) return
      previous = next
      operationGeneration.current += 1
      // The first verified identity after a reload can resume its own receipt.
      // A failed initial verification has not resolved that identity yet.
      // Logout, expiry or another owner must immediately discard that receipt.
      if (wasKnown) clearCheckoutAttempt()
      editedContactFields.current.clear()
      operation.current = null
      setPendingConfirmation(false)
      setPendingQuote(null)
      setOrder(null)
      setDraft(createCheckoutDraft())
    })
  }, [])
  useEffect(() => {
    if (!accountActive || !ownerId || draft.mode !== 'demo-account') return
    const available: CheckoutContact = {
      firstName: accountStatus === 'ready' ? profile.firstName : '',
      lastName: accountStatus === 'ready' ? profile.lastName : '',
      phone: accountStatus === 'ready' ? profile.phone : '',
      email: accountStatus === 'ready' ? profile.email : accountEmail,
    }
    setDraft((current) => {
      const state = authService.getSnapshot()
      if (
        current.mode !== 'demo-account' ||
        state.status !== 'authenticated' ||
        state.session?.user.id !== ownerId
      )
        return current
      const contact = { ...current.contact }
      let changed = false
      for (const field of [
        'firstName',
        'lastName',
        'email',
        'phone',
      ] as const) {
        const value = available[field].trim()
        if (
          value &&
          !contact[field].trim() &&
          !editedContactFields.current.has(field)
        ) {
          contact[field] = value
          changed = true
        }
      }
      return changed ? { ...current, contact } : current
    })
  }, [
    accountActive,
    ownerId,
    draft.mode,
    accountStatus,
    accountEmail,
    profile.firstName,
    profile.lastName,
    profile.email,
    profile.phone,
  ])
  const inFlight = useRef(false)
  const requestNumber = useRef(0)
  const remoteActive =
    canSimulateCheckout &&
    isRemoteCatalog &&
    location.pathname === '/checkout' &&
    items.length > 0
  useEffect(() => {
    if (!remoteActive || pendingConfirmation) return
    const controller = new AbortController(),
      request = ++requestNumber.current
    const timer = window.setTimeout(() => {
      void requestCheckoutQuote(
        currentItems.current,
        currentDraft.current,
        undefined,
        controller.signal,
      )
        .then((quote) => {
          if (!controller.signal.aborted && request === requestNumber.current)
            setQuoteState({ key: quoteKey, quote, error: '' })
        })
        .catch((error) => {
          if (!controller.signal.aborted && request === requestNumber.current)
            setQuoteState({
              key: quoteKey,
              quote: null,
              error:
                error instanceof Error
                  ? error.message
                  : 'No pudimos actualizar el resumen.',
            })
        })
    }, 150)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [remoteActive, quoteKey, revision, pendingConfirmation])
  const serverQuote = pendingConfirmation
    ? pendingQuote
    : remoteActive && quoteState.key === quoteKey
      ? quoteState.quote
      : null
  const quoteError =
    remoteActive && quoteState.key === quoteKey ? quoteState.error : ''
  const quoteLoading = remoteActive && !serverQuote && !quoteError
  const refreshQuote = useCallback(() => {
    setQuoteState({ key: '', quote: null, error: '' })
    setRevision((value) => value + 1)
  }, [])
  useEffect(() => {
    if (!remoteActive || pendingConfirmation) return
    const update = () => {
      if (document.visibilityState === 'visible') refreshQuote()
    }
    const timer = window.setInterval(update, 60000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [remoteActive, refreshQuote, pendingConfirmation])

  const completeOrder = useCallback(
    async (cart: ResolvedCart) => {
      if (!canSimulateCheckout)
        throw new UserFacingError(
          'checkout-unavailable',
          'El pago en línea no está disponible en este momento.',
        )
      if (isRemoteCatalog) {
        if (
          inFlight.current ||
          (!pendingConfirmation &&
            (!serverQuote || quoteLoading || serverQuote.totalCents === null))
        )
          return null
        inFlight.current = true
        try {
          const key = JSON.stringify({
            query: checkoutQuery(items, draft),
            contact: draft.contact,
            address: draft.address,
            alternateRecipient: draft.alternateRecipient,
            quoteHash: serverQuote?.quoteHash,
            mode: draft.mode,
          })
          if (
            !pendingConfirmation &&
            (!operation.current || operation.current.key !== key)
          ) {
            if (!serverQuote) return null
            const generation = operationGeneration.current
            const candidate = createCheckoutOperation(items, draft, serverQuote)
            const fingerprint = await fingerprintCheckoutAttempt(
              candidate,
              draft.mode,
              checkoutIdentity(),
            )
            if (generation !== operationGeneration.current)
              throw new UserFacingError(
                'checkout-session',
                'Tu sesión cambió. Revisa Mis pedidos antes de volver a intentar.',
              )
            operation.current = {
              key,
              value: restoreCheckoutAttempt(fingerprint, candidate),
            }
            rememberCheckoutAttempt(fingerprint, operation.current.value)
          }
          if (!operation.current) return null
          const submitted = operation.current
          if (!pendingConfirmation) setPendingQuote(serverQuote)
          setPendingConfirmation(true)
          const result = await submitSimulatedOrder(
            submitted.value,
            draft.mode === 'demo-account',
          )
          if (operation.current !== submitted)
            throw new UserFacingError(
              'checkout-session',
              'Tu sesión cambió. Revisa Mis pedidos antes de volver a intentar.',
            )
          saveTrackingRecord(result)
          addCheckoutOrder(result)
          setOrder(result)
          clearCheckoutAttempt(submitted.value.operationId)
          editedContactFields.current.clear()
          setDraft(createCheckoutDraft())
          operation.current = null
          setPendingConfirmation(false)
          return result
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            [
              'checkout-validation',
              'checkout-rate-limit',
              'checkout-session',
              'checkout-unavailable',
              'checkout-origin',
            ].includes(String(error.code))
          ) {
            if (operation.current)
              clearCheckoutAttempt(operation.current.value.operationId)
            operation.current = null
            setPendingConfirmation(false)
          }
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'checkout-conflict'
          ) {
            if (operation.current)
              clearCheckoutAttempt(operation.current.value.operationId)
            operation.current = null
            setPendingConfirmation(false)
            refreshQuote()
          }
          throw error
        } finally {
          inFlight.current = false
        }
      }
      const result = createMockOrder(cart, draft)
      if (!result) return null
      if (!(await persistDemoCheckout(result))) return null
      saveTrackingRecord(result)
      addCheckoutOrder(result)
      setOrder(result)
      editedContactFields.current.clear()
      setDraft(createCheckoutDraft())
      return result
    },
    [
      addCheckoutOrder,
      draft,
      items,
      serverQuote,
      quoteLoading,
      refreshQuote,
      pendingConfirmation,
    ],
  )

  const value = useMemo<CheckoutContextValue>(
    () => ({
      draft,
      setDraft,
      setContactField,
      order,
      completeOrder,
      serverQuote,
      quoteLoading,
      quoteError,
      pendingConfirmation,
      refreshQuote,
    }),
    [
      completeOrder,
      draft,
      order,
      serverQuote,
      quoteLoading,
      quoteError,
      pendingConfirmation,
      refreshQuote,
      setContactField,
    ],
  )

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  )
}
