import { Link } from 'react-router'
import type { FormEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import {
  getPeruDistrictOptions,
  getPeruProvinceOptions,
  isValidPeruLocation,
  peruDepartments,
} from '../../content/peru'
import { formatPEN } from '../../services/currency'
import {
  quoteShipping,
  type CheckoutAddress,
  type CheckoutContact,
  type CheckoutMode,
  type DeliveryMethod,
} from '../../services/checkout-service'
import { useCheckout } from './checkout-context'

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
          Tus datos.
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
  const provinceOptions = getPeruProvinceOptions(draft.address.department)
  const districtOptions = getPeruDistrictOptions(draft.address.province)
  const quote = quoteShipping(
    draft.address.department,
    draft.deliveryMethod,
    subtotalCents,
    draft.address.province,
    draft.address.district,
  )
  const inProvince =
    Boolean(draft.address.department.trim()) &&
    quoteShipping(
      draft.address.department,
      'motorizado',
      subtotalCents,
      draft.address.province,
      draft.address.district,
    ).kind !== 'quoted'

  function updateAddress(field: keyof CheckoutAddress, value: string) {
    setDraft((current) => ({
      ...current,
      address:
        field === 'department'
          ? {
              ...current.address,
              department: value,
              province: '',
              district: '',
            }
          : field === 'province'
            ? { ...current.address, province: value, district: '' }
            : { ...current.address, [field]: value },
      deliveryMethod:
        field === 'department' &&
        quoteShipping(value, 'motorizado', subtotalCents).kind === 'unavailable'
          ? 'courier'
          : current.deliveryMethod,
    }))
  }

  function chooseDelivery(method: DeliveryMethod) {
    setDraft((current) => ({ ...current, deliveryMethod: method }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTrimmedValidity(event.currentTarget)) return
    if (
      !isValidPeruLocation(
        draft.address.department,
        draft.address.province,
        draft.address.district,
      )
    )
      return
    if (quote.kind !== 'quoted') return
    setDraft((current) => ({
      ...current,
      address: {
        department: current.address.department.trim(),
        province: current.address.province.trim(),
        district: current.address.district.trim(),
        street: current.address.street.trim(),
        reference: current.address.reference.trim(),
      },
    }))
    onNext()
  }

  return (
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-step-heading">
        <p className="eyebrow">02 / 03</p>
        <h2 id="checkout-step-title" tabIndex={-1}>
          A dónde lo enviamos.
        </h2>
        <p>Entrega a domicilio en Perú.</p>
      </div>

      <div className="checkout-fields">
        <div className="checkout-field">
          <label htmlFor="checkout-department">Departamento</label>
          <select
            id="checkout-department"
            name="address-level1"
            autoComplete="address-level1"
            required
            value={draft.address.department}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateAddress('department', event.target.value)
            }}
          >
            <option value="">Selecciona un departamento</option>
            {peruDepartments.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
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
            onChange={(event) => {
              event.currentTarget.setCustomValidity('')
              updateAddress('province', event.target.value)
            }}
          >
            <option value="">Selecciona una provincia</option>
            {provinceOptions.map((province) => (
              <option key={province.value} value={province.value}>
                {province.label}
              </option>
            ))}
          </select>
        </div>
        <div className="checkout-field">
          <label htmlFor="checkout-district">Distrito</label>
          <select
            id="checkout-district"
            name="address-level3"
            autoComplete="address-level3"
            required
            disabled={!draft.address.province}
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
            disabled={inProvince}
            onChange={() => chooseDelivery('motorizado')}
          />
          <span>
            <strong>Motorizado</strong>
            <small>
              {inProvince
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
            {draft.address.department.trim()
              ? 'Sin tarifa disponible'
              : 'Completa el departamento'}
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
