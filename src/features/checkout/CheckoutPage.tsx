import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { Spinner } from '../../components/ui/Spinner'
import { getPeruDistrictLabel, getPeruProvinceLabel } from '../../content/peru'
import { resolveCart } from '../../services/commerce-service'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import {
  calculateCheckout,
  evaluatePromotion,
  getDeliveryZoneLabel,
  simulatePayment,
  type PaymentScenario,
  type PromotionResult,
} from '../../services/checkout-service'
import { formatPEN } from '../../services/currency'
import { useCart } from '../cart/cart-context'
import { CheckoutContactForm, CheckoutDeliveryForm } from './CheckoutForms'
import { CheckoutSummary } from './CheckoutSummary'
import { useCheckout } from './checkout-context'

type CheckoutStep = 'datos' | 'entrega' | 'revision'
type PaymentStatus = 'ready' | 'processing' | 'rejected' | 'error'
type PromotionState = PromotionResult

const steps: { id: CheckoutStep; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'entrega', label: 'Entrega' },
  { id: 'revision', label: 'Revisión' },
]

function initialStep(
  contact: {
    firstName: string
    lastName: string
    email: string
    phone: string
  },
  address: {
    department: string
    province: string
    district: string
    street: string
  },
): CheckoutStep {
  const hasContact = Object.values(contact).every((value) => value.trim())
  if (!hasContact) return 'datos'
  return [
    address.department,
    address.province,
    address.district,
    address.street,
  ].every((value) => value.trim())
    ? 'revision'
    : 'entrega'
}

export function CheckoutPage() {
  useOfferPriceRevision()
  const { items, clearCart } = useCart()
  const { draft, setDraft, completeOrder } = useCheckout()
  const cart = resolveCart(items)
  const amount = calculateCheckout(cart, draft)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showTestControls = searchParams.get('demo') === '1'
  const [step, setStep] = useState<CheckoutStep>(() =>
    initialStep(draft.contact, draft.address),
  )
  const [promotionState, setPromotionState] = useState<PromotionState | null>(
    () =>
      draft.appliedPromotion
        ? evaluatePromotion(
            draft.appliedPromotion,
            cart.subtotalCents,
            cart.productDiscountCents > 0,
          )
        : null,
  )
  const [promotionExpanded, setPromotionExpanded] = useState(
    draft.appliedPromotion !== null,
  )
  const [paymentScenario, setPaymentScenario] =
    useState<PaymentScenario>('approved')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('ready')
  const promotionRequest = useRef(0)
  const paymentRequest = useRef(0)
  const finalized = useRef(false)
  const paymentInFlight = useRef(false)
  const shownPromotionState =
    draft.appliedPromotion && cart.productDiscountCents > 0
      ? evaluatePromotion(draft.appliedPromotion, cart.subtotalCents, true)
      : promotionState

  useEffect(
    function focusCheckoutStep() {
      document
        .getElementById('checkout-step-title')
        ?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
    },
    [step],
  )

  useEffect(function cancelPendingCheckoutTasks() {
    return function cancelTasks() {
      promotionRequest.current += 1
      paymentRequest.current += 1
    }
  }, [])

  function goToStep(next: CheckoutStep) {
    if (paymentInFlight.current) return
    paymentRequest.current += 1
    setPaymentStatus('ready')
    setStep(next)
  }

  function applyPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (paymentInFlight.current) return
    const result = evaluatePromotion(
      draft.promotionInput,
      cart.subtotalCents,
      cart.productDiscountCents > 0,
    )
    setPromotionState(result)
    setDraft((current) => ({
      ...current,
      appliedPromotion: result.kind === 'applied' ? result.code : null,
    }))
  }

  async function runPayment() {
    if (paymentInFlight.current || finalized.current) return
    if (draft.appliedPromotion && cart.productDiscountCents > 0) {
      setPromotionState(
        evaluatePromotion(draft.appliedPromotion, cart.subtotalCents, true),
      )
      setDraft((current) => ({ ...current, appliedPromotion: null }))
      return
    }
    if (
      paymentStatus === 'processing' ||
      paymentInFlight.current ||
      finalized.current ||
      cart.needsAttention ||
      amount.totalCents === null
    )
      return
    const request = ++paymentRequest.current
    paymentInFlight.current = true
    setPaymentStatus('processing')
    try {
      const outcome = await simulatePayment(paymentScenario)
      if (request !== paymentRequest.current || finalized.current) return
      if (outcome !== 'approved') {
        setPaymentStatus(outcome)
        return
      }
      const order = await completeOrder(cart)
      if (request !== paymentRequest.current || finalized.current) return
      if (!order) {
        setPaymentStatus('error')
        return
      }
      finalized.current = true
      clearCart()
      navigate('/checkout/confirmacion')
    } catch {
      if (request === paymentRequest.current) setPaymentStatus('error')
    } finally {
      paymentInFlight.current = false
    }
  }

  if (
    paymentStatus !== 'processing' &&
    (!cart.lines.length || cart.needsAttention)
  )
    return (
      <section
        className="store-page checkout-page checkout-unavailable container"
        data-scroll-reveal="fade"
      >
        <p className="eyebrow">Tu selección</p>
        <h1>
          {cart.lines.length ? 'Revisa tu carrito' : 'Tu selección está vacía'}
        </h1>
        <p>
          {cart.lines.length
            ? 'Corrige las presentaciones señaladas antes de continuar.'
            : 'Elige un perfume para continuar.'}
        </p>
        <Link
          className="button button--primary"
          to={cart.lines.length ? '/carrito' : '/tienda'}
        >
          {cart.lines.length ? 'Revisar carrito' : 'Explorar perfumes'}{' '}
          <Icon name="arrow" />
        </Link>
      </section>
    )

  return (
    <div className="store-page checkout-page container">
      <nav
        className="checkout-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <Link to="/carrito">Carrito</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Checkout</span>
      </nav>
      <header className="checkout-heading" data-scroll-reveal="copy">
        <h1>Finaliza tu selección</h1>
        <p>Revisa tus datos y la entrega antes de continuar.</p>
      </header>

      <ol
        className="checkout-progress"
        aria-label="Progreso del checkout"
        data-scroll-reveal="stagger"
      >
        {steps.map((item, index) => (
          <li
            key={item.id}
            aria-current={step === item.id ? 'step' : undefined}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>

      <div className="checkout-layout" data-scroll-reveal="stagger">
        <div className="checkout-main">
          {step === 'datos' ? (
            <CheckoutContactForm onNext={() => goToStep('entrega')} />
          ) : null}
          {step === 'entrega' ? (
            <CheckoutDeliveryForm
              subtotalCents={cart.subtotalCents}
              onNext={() => goToStep('revision')}
              onBack={() => goToStep('datos')}
            />
          ) : null}
          {step === 'revision' ? (
            <section
              className="checkout-review"
              aria-labelledby="checkout-step-title"
            >
              <div className="checkout-step-heading">
                <p className="eyebrow">03 / 03</p>
                <h2 id="checkout-step-title" tabIndex={-1}>
                  Revisa tu pedido
                </h2>
              </div>

              <div className="checkout-review-detail">
                <div>
                  <h3>Contacto</h3>
                  <p>
                    {draft.contact.firstName} {draft.contact.lastName}
                  </p>
                  <p>
                    {draft.contact.email} · {draft.contact.phone}
                  </p>
                  <button
                    className="text-link"
                    type="button"
                    disabled={paymentStatus === 'processing'}
                    onClick={() => goToStep('datos')}
                  >
                    Editar datos
                  </button>
                </div>
                <div>
                  <h3>Entrega</h3>
                  <p>
                    {draft.address.street},{' '}
                    {getPeruDistrictLabel(draft.address.district)}
                  </p>
                  <p>
                    {getPeruProvinceLabel(draft.address.province)},{' '}
                    {getDeliveryZoneLabel(draft.address.department)} · Perú
                  </p>
                  {draft.address.reference ? (
                    <p>Ref.: {draft.address.reference}</p>
                  ) : null}
                  {draft.alternateRecipient ? (
                    <p>
                      Recibe: {draft.alternateRecipient.name} · DNI{' '}
                      {draft.alternateRecipient.dni}
                    </p>
                  ) : null}
                  <p>
                    {draft.deliveryMethod === 'courier'
                      ? 'Courier'
                      : 'Motorizado'}{' '}
                    ·{' '}
                    {amount.shipping.kind === 'quoted'
                      ? amount.shipping.estimate
                      : 'Por confirmar'}
                  </p>
                  <button
                    className="text-link"
                    type="button"
                    disabled={paymentStatus === 'processing'}
                    onClick={() => goToStep('entrega')}
                  >
                    Editar entrega
                  </button>
                </div>
              </div>

              <details
                className="checkout-promotion"
                open={promotionExpanded}
                onToggle={(event) =>
                  setPromotionExpanded(event.currentTarget.open)
                }
              >
                <summary>¿Tienes un código de descuento?</summary>
                <form onSubmit={applyPromotion}>
                  <label className="sr-only" htmlFor="checkout-promotion-code">
                    Código de descuento
                  </label>
                  <input
                    id="checkout-promotion-code"
                    name="promotion-code"
                    autoComplete="off"
                    maxLength={30}
                    placeholder="Código de descuento"
                    disabled={paymentStatus === 'processing'}
                    value={draft.promotionInput}
                    onChange={(event) => {
                      promotionRequest.current += 1
                      setPromotionState(null)
                      const value = event.target.value
                      setDraft((current) => ({
                        ...current,
                        promotionInput: value,
                        appliedPromotion:
                          current.appliedPromotion ===
                          value.trim().toUpperCase()
                            ? current.appliedPromotion
                            : null,
                      }))
                    }}
                  />
                  <button
                    className="button button--secondary"
                    type="submit"
                    disabled={paymentStatus === 'processing'}
                  >
                    Aplicar
                  </button>
                </form>
                {shownPromotionState ? (
                  <p
                    className="checkout-promotion-message"
                    role={
                      [
                        'error',
                        'not-found',
                        'inactive',
                        'not-started',
                        'expired',
                        'limit-reached',
                        'minimum-not-met',
                        'incompatible',
                      ].includes(shownPromotionState.kind)
                        ? 'alert'
                        : 'status'
                    }
                  >
                    {shownPromotionState.message}
                  </p>
                ) : null}
              </details>

              <section
                className="checkout-gateway"
                aria-labelledby="checkout-gateway-title"
              >
                <h3 id="checkout-gateway-title">Resumen de tu selección</h3>
                <p>
                  Al continuar, la selección se guardará en este navegador. No
                  se realizará ningún cobro.
                </p>
              </section>

              {showTestControls ? (
                <div className="checkout-simulation-settings">
                  <label htmlFor="checkout-scenario">
                    Estado de validación
                  </label>
                  <select
                    id="checkout-scenario"
                    value={paymentScenario}
                    onChange={(event) => {
                      paymentRequest.current += 1
                      setPaymentScenario(event.target.value as PaymentScenario)
                      setPaymentStatus('ready')
                    }}
                    disabled={paymentStatus === 'processing'}
                  >
                    <option value="approved">Aprobado</option>
                    <option value="rejected">Rechazado</option>
                    <option value="error">Error</option>
                  </select>
                  <small>Control de validación local.</small>
                </div>
              ) : null}

              {paymentStatus === 'processing' ? (
                <InlineStatus className="checkout-payment-message" busy>
                  Guardando tu selección…
                </InlineStatus>
              ) : null}
              {paymentStatus === 'rejected' ? (
                <p className="checkout-payment-message" role="alert">
                  No se pudo registrar la selección. Puedes volver a intentarlo.
                </p>
              ) : null}
              {paymentStatus === 'error' ? (
                <p className="checkout-payment-message" role="alert">
                  Ocurrió un error. Vuelve a intentarlo.
                </p>
              ) : null}
              <div className="checkout-payment-action">
                <div>
                  <span>Total</span>
                  <strong>
                    {amount.totalCents === null
                      ? 'Pendiente'
                      : formatPEN(amount.totalCents)}
                  </strong>
                </div>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={
                    paymentStatus === 'processing' || amount.totalCents === null
                  }
                  onClick={() => void runPayment()}
                  aria-busy={paymentStatus === 'processing'}
                >
                  {paymentStatus === 'processing'
                    ? 'Procesando…'
                    : paymentStatus === 'ready'
                      ? 'Guardar selección'
                      : 'Reintentar'}
                  {paymentStatus === 'processing' ? (
                    <Spinner />
                  ) : (
                    <Icon name="arrow" />
                  )}
                </button>
              </div>
            </section>
          ) : null}
        </div>
        <CheckoutSummary cart={cart} draft={draft} />
      </div>
    </div>
  )
}
