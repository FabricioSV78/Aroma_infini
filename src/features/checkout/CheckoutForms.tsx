import { Link } from 'react-router'
import { useSyncExternalStore, type FormEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import {
  getPeruDistrictOptions,
  getPeruProvinceOptions,
  getDeliveryArea,
} from '../../content/peru'
import { formatPEN } from '../../services/currency'
import {
  isValidAlternateRecipient,
  getDeliveryZoneOptions,
  quoteShipping,
  type CheckoutAddress,
  type CheckoutContact,
  type CheckoutMode,
  type DeliveryMethod,
} from '../../services/checkout-service'
import { useCheckout } from './checkout-context'
import { shippingService } from '../../services/shipping-service'
import { isShippingDestinationEnabled } from '../../services/shipping-rates'

interface ContactFormProps {
  onNext: () => void
}

interface DeliveryFormProps {
  subtotalCents: number
  onNext: () => void
  onBack: () => void
}

function reportTrimmedValidity(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>(
    '[data-trim-required]',
  )) {
    input.setCustomValidity(input.value.trim() ? '' : 'Completa este campo.')
  }
  return form.reportValidity()
}

export function CheckoutContactForm({ onNext }: ContactFormProps) {
  const { draft, setDraft } = useCheckout()

  function chooseMode(mode: CheckoutMode) {
    setDraft((current) => ({
      ...current,
      mode,
      contact: current.contact,
    }))
  }

  function updateContact(field: keyof CheckoutContact, value: string) {
    setDraft((current) => ({
      ...current,
      contact: { ...current.contact, [field]: value },
    }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTrimmedValidity(event.currentTarget)) return
    setDraft((current) => ({
      ...current,
      contact: {
        firstName: current.contact.firstName.trim(),
        lastName: current.contact.lastName.trim(),
        email: current.contact.email.trim(),
        phone: current.contact.phone.trim(),
      },
    }))
    onNext()
  }

  return (
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-step-heading">
        <p className="eyebrow">01 / 03</p>
        <h2 id="checkout-step-title" tabIndex={-1}>
          Tus datos
        </h2>
      </div>

      <fieldset className="checkout-options checkout-entry-options">
        <legend>Cómo quieres continuar</legend>
        <label className="checkout-option">
          <input
            type="radio"
            name="checkout-mode"
            value="guest"
            checked={draft.mode === 'guest'}
            onChange={() => chooseMode('guest')}
          />
          <span>
            <strong>Como invitado</strong>
            <small>Sin crear una cuenta</small>
          </span>
        </label>
        <label className="checkout-option">
          <input
            type="radio"
            name="checkout-mode"
            value="demo-account"
            checked={draft.mode === 'demo-account'}
            onChange={() => chooseMode('demo-account')}
          />
          <span>
            <strong>Con mi cuenta</strong>
            <small>Guarda la selección en Mis pedidos</small>
          </span>
        </label>
      </fieldset>

      <div className="checkout-fields">
        <div className="checkout-field">
          <label htmlFor="checkout-first-name">Nombre</label>
          <input
            id="checkout-first-name"
            name="given-name"
            autoComplete="given-name"
            required
            data-trim-required
            maxLength={60}
            value={draft.contact.firstName}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateContact('firstName', event.target.value)
            }}
          />
        </div>
        <div className="checkout-field">
          <label htmlFor="checkout-last-name">Apellido</label>
          <input
            id="checkout-last-name"
            name="family-name"
            autoComplete="family-name"
            required
            data-trim-required
            maxLength={60}
            value={draft.contact.lastName}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateContact('lastName', event.target.value)
            }}
          />
        </div>
        <div className="checkout-field">
          <label htmlFor="checkout-email">Correo electrónico</label>
          <input
            id="checkout-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            data-trim-required
            maxLength={254}
            value={draft.contact.email}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateContact('email', event.target.value)
            }}
          />
        </div>
        <div className="checkout-field">
          <label htmlFor="checkout-phone">Celular</label>
          <input
            id="checkout-phone"
            name="tel"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            pattern="9[0-9]{8}"
            title="Ingresa un celular peruano de 9 dígitos que comience con 9."
            required
            data-trim-required
            maxLength={9}
            value={draft.contact.phone}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateContact('phone', event.target.value)
            }}
          />
          <small>9 dígitos, sin prefijo de país.</small>
        </div>
      </div>

      <div className="checkout-actions">
        <Link className="text-link" to="/carrito">
          Volver al carrito
        </Link>
        <button className="button button--primary" type="submit">
          Continuar a entrega <Icon name="arrow" />
        </button>
      </div>
    </form>
  )
}

export function CheckoutDeliveryForm({
  subtotalCents,
  onNext,
  onBack,
}: DeliveryFormProps) {
  const { draft, setDraft } = useCheckout()
  const shipping = useSyncExternalStore(
    shippingService.subscribe,
    shippingService.getSnapshot,
  )
  const savedArea = getDeliveryArea(draft.address.department)
  const area =
    savedArea?.province === draft.address.province ? savedArea : undefined
  const provinceOptions = shipping.provinceShippingEnabled
    ? getPeruProvinceOptions(draft.address.department)
    : []
  const districtOptions = shipping.provinceShippingEnabled
    ? getPeruDistrictOptions(draft.address.province)
    : area
      ? getPeruDistrictOptions(area.province)
      : []
  const quote = quoteShipping(
    draft.address.department,
    draft.deliveryMethod,
    subtotalCents,
    draft.address.province,
    draft.address.district,
  )
  const motorizadoUnavailable =
    quoteShipping(
      draft.address.department,
      'motorizado',
      subtotalCents,
      draft.address.province,
      draft.address.district,
    ).kind !== 'quoted'

  function updateAddress(
    field: Exclude<keyof CheckoutAddress, 'department' | 'province'>,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      address: { ...current.address, [field]: value },
      deliveryMethod:
        field === 'district' &&
        current.deliveryMethod === 'motorizado' &&
        quoteShipping(
          current.address.department,
          'motorizado',
          subtotalCents,
          current.address.province,
          value,
        ).kind !== 'quoted'
          ? 'courier'
          : current.deliveryMethod,
    }))
  }

  function updateArea(department: string) {
    const selected = getDeliveryArea(department)
    setDraft((current) => ({
      ...current,
      address: {
        ...current.address,
        department: selected?.department ?? '',
        province: selected?.province ?? '',
        district: '',
      },
      deliveryMethod: 'courier',
    }))
  }

  function updateDepartment(department: string) {
    setDraft((current) => ({
      ...current,
      address: { ...current.address, department, province: '', district: '' },
      deliveryMethod: 'courier',
    }))
  }

  function updateProvince(province: string) {
    setDraft((current) => ({
      ...current,
      address: { ...current.address, province, district: '' },
      deliveryMethod: 'courier',
    }))
  }

  function chooseDelivery(method: DeliveryMethod) {
    setDraft((current) => ({ ...current, deliveryMethod: method }))
  }

  function setAlternateRecipient(enabled: boolean) {
    setDraft((current) => ({
      ...current,
      alternateRecipient: enabled ? { name: '', dni: '' } : null,
    }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTrimmedValidity(event.currentTarget)) return
    if (
      !isShippingDestinationEnabled(
        shipping,
        draft.address.department,
        draft.address.province,
        draft.address.district,
      )
    )
      return
    if (quote.kind !== 'quoted') return
    if (
      draft.alternateRecipient &&
      !isValidAlternateRecipient(draft.alternateRecipient)
    )
      return
    setDraft((current) => ({
      ...current,
      address: {
        department: current.address.department.trim(),
        province: current.address.province.trim(),
        district: current.address.district.trim(),
        street: current.address.street.trim(),
        reference: current.address.reference.trim(),
      },
      alternateRecipient: current.alternateRecipient
        ? {
            name: current.alternateRecipient.name.trim(),
            dni: current.alternateRecipient.dni.trim(),
          }
        : null,
    }))
    onNext()
  }

  return (
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-step-heading">
        <p className="eyebrow">02 / 03</p>
        <h2 id="checkout-step-title" tabIndex={-1}>
          A dónde lo enviamos
        </h2>
        <p>
          {shipping.provinceShippingEnabled
            ? 'Elige departamento, provincia y distrito para ver la tarifa.'
            : 'Por ahora entregamos en Lima y Callao. Elige tu zona y distrito para ver la tarifa.'}
        </p>
      </div>

      <div className="checkout-fields">
        {shipping.provinceShippingEnabled ? (
          <>
            <div className="checkout-field">
              <label htmlFor="checkout-department">Departamento</label>
              <select
                id="checkout-department"
                name="address-level1"
                autoComplete="address-level1"
                required
                value={draft.address.department}
                onChange={(event) => updateDepartment(event.target.value)}
              >
                <option value="">Selecciona un departamento</option>
                {getDeliveryZoneOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-province">Provincia</label>
              <select
                id="checkout-province"
                name="address-level2"
                autoComplete="address-level2"
                required
                disabled={!draft.address.department}
                value={draft.address.province}
                onChange={(event) => updateProvince(event.target.value)}
              >
                <option value="">Selecciona una provincia</option>
                {provinceOptions.map((province) => (
                  <option key={province.value} value={province.value}>
                    {province.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="checkout-field checkout-field--wide">
            <label htmlFor="checkout-zone">Zona de entrega</label>
            <select
              id="checkout-zone"
              name="address-level1"
              autoComplete="address-level1"
              required
              value={area?.department ?? ''}
              onChange={(event) => updateArea(event.target.value)}
            >
              <option value="">Selecciona una zona</option>
              {getDeliveryZoneOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="checkout-field checkout-field--wide">
          <label htmlFor="checkout-district">Distrito de entrega</label>
          <select
            id="checkout-district"
            name="address-level3"
            autoComplete="address-level3"
            required
            disabled={
              shipping.provinceShippingEnabled ? !draft.address.province : !area
            }
            value={draft.address.district}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateAddress('district', event.target.value)
            }}
          >
            <option value="">Selecciona un distrito</option>
            {districtOptions.map((district) => (
              <option key={district.value} value={district.value}>
                {district.label}
              </option>
            ))}
          </select>
        </div>
        <div className="checkout-field checkout-field--wide">
          <label htmlFor="checkout-street">Dirección</label>
          <input
            id="checkout-street"
            name="street-address"
            autoComplete="street-address"
            required
            data-trim-required
            maxLength={150}
            value={draft.address.street}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateAddress('street', event.target.value)
            }}
          />
        </div>
        <div className="checkout-field checkout-field--wide">
          <label htmlFor="checkout-reference">
            Referencia <span>(opcional)</span>
          </label>
          <input
            id="checkout-reference"
            name="address-reference"
            autoComplete="off"
            maxLength={120}
            value={draft.address.reference}
            onChange={(event) => updateAddress('reference', event.target.value)}
          />
        </div>
      </div>

      <fieldset className="checkout-recipient">
        <legend>Persona que recibe</legend>
        <label className="checkout-recipient-toggle">
          <input
            type="checkbox"
            checked={draft.alternateRecipient !== null}
            onChange={(event) =>
              setAlternateRecipient(event.currentTarget.checked)
            }
            aria-controls={
              draft.alternateRecipient ? 'checkout-recipient-fields' : undefined
            }
          />
          <span>¿Otra persona recibirá el pedido?</span>
        </label>
        {draft.alternateRecipient ? (
          <div
            className="checkout-fields checkout-recipient-fields"
            id="checkout-recipient-fields"
          >
            <div className="checkout-field">
              <label htmlFor="checkout-recipient-name">
                Nombre de quien recibe
              </label>
              <input
                id="checkout-recipient-name"
                name="alternate-recipient-name"
                autoComplete="off"
                required
                data-trim-required
                minLength={2}
                maxLength={100}
                value={draft.alternateRecipient.name}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('')
                  const name = event.target.value
                  setDraft((current) => ({
                    ...current,
                    alternateRecipient: current.alternateRecipient
                      ? { ...current.alternateRecipient, name }
                      : null,
                  }))
                }}
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-recipient-dni">
                DNI de quien recibe
              </label>
              <input
                id="checkout-recipient-dni"
                name="alternate-recipient-dni"
                autoComplete="off"
                inputMode="numeric"
                pattern="[0-9]{8}"
                title="Ingresa los 8 dígitos del DNI."
                required
                maxLength={8}
                value={draft.alternateRecipient.dni}
                onChange={(event) => {
                  const dni = event.target.value
                  setDraft((current) => ({
                    ...current,
                    alternateRecipient: current.alternateRecipient
                      ? { ...current.alternateRecipient, dni }
                      : null,
                  }))
                }}
              />
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="checkout-options checkout-delivery-options">
        <legend>Modalidad de entrega</legend>
        <label className="checkout-option">
          <input
            type="radio"
            name="delivery-method"
            value="courier"
            checked={draft.deliveryMethod === 'courier'}
            onChange={() => chooseDelivery('courier')}
          />
          <span>
            <strong>Courier</strong>
            <small>Tarifa según la ubicación</small>
          </span>
        </label>
        <label className="checkout-option">
          <input
            type="radio"
            name="delivery-method"
            value="motorizado"
            checked={draft.deliveryMethod === 'motorizado'}
            disabled={motorizadoUnavailable}
            onChange={() => chooseDelivery('motorizado')}
          />
          <span>
            <strong>Motorizado</strong>
            <small>
              {motorizadoUnavailable
                ? 'No disponible para la ubicación elegida'
                : 'Disponible según ubicación'}
            </small>
          </span>
        </label>
      </fieldset>

      <div className="checkout-delivery-quote" role="status">
        <span>Entrega estimada</span>
        {quote.kind === 'quoted' ? (
          <strong>
            {quote.free ? 'Envío gratis' : formatPEN(quote.feeCents)}
          </strong>
        ) : (
          <strong>
            {quote.kind === 'pending'
              ? 'Selecciona tu distrito'
              : 'Sin tarifa disponible'}
          </strong>
        )}
        {quote.kind === 'quoted' ? <small>{quote.estimate}</small> : null}
      </div>
      <p className="checkout-footnote">
        Se muestran las opciones disponibles para la ubicación seleccionada.
      </p>

      <div className="checkout-actions">
        <button className="text-link" type="button" onClick={onBack}>
          Volver a datos
        </button>
        <button
          className="button button--primary"
          type="submit"
          disabled={quote.kind !== 'quoted'}
        >
          Revisar selección <Icon name="arrow" />
        </button>
      </div>
    </form>
  )
}
