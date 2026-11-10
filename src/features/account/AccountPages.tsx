import { variantLabel } from '../../domain/product-type'
import { RecoveryCodeSettings } from './RecoveryCodeSettings'
import { authFeatures } from '../../domain/auth-policy'
import { formatBrandName } from '../../utils/brand-name'
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruDistrictOptions,
  getPeruProvinceOptions,
  getPeruProvinceLabel,
  peruDepartments,
  getDeliveryArea,
  deliveryAreas,
} from '../../content/peru'
import {
  accountStatusLabels,
  emptyAccountAddress,
  type AccountAddress,
  type AccountProfile,
} from '../../services/account-service'
import { formatPEN } from '../../services/currency'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { isShippingDestinationEnabled } from '../../services/shipping-rates'
import { shippingService } from '../../services/shipping-service'
import { useFavorites } from '../favorites/favorites-context'
import { FavoritesCollection } from '../favorites/FavoritesCollection'
import { AccountOrderTimeline } from './AccountOrderTimeline'
import { useAccount } from './account-context'
import { AuthError, authErrorMessage } from '../../services/auth-errors'
import { Dialog } from '../../components/ui/Dialog'
import { ChangeEmailDialog } from './ChangeEmailDialog'
import { useAuth } from '../auth/useAuth'
import { AddressLocationPicker } from './AddressLocationPicker'

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function reportTrimmedValidity(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>(
    '[data-trim-required]',
  ))
    input.setCustomValidity(input.value.trim() ? '' : 'Completa este campo.')
  return form.reportValidity()
}

export function AccountOverviewPage() {
  const auth = useAuth()
  const { profile, address, orders, ordersAvailable } = useAccount()
  const { favoriteCount, persistence: favoritesPersistence } = useFavorites()
  const latestOrder = orders[0]
  return (
    <section className="account-section" aria-labelledby="account-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Resumen</p>
        <h1 id="account-title">
          {profile.firstName.trim()
            ? `Hola, ${profile.firstName}`
            : 'Mi cuenta'}
        </h1>
        <p>Todo lo necesario para continuar descubriendo.</p>
      </header>
      <div className="account-overview-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="overview-orders-title">
          <span>
            {ordersAvailable ? String(orders.length).padStart(2, '0') : '—'}
          </span>
          <h2 id="overview-orders-title">Mis pedidos</h2>
          <p className={latestOrder ? 'account-overview-status' : undefined}>
            {!ordersAvailable
              ? 'El historial no está disponible por el momento.'
              : latestOrder
                ? `Último estado: ${accountStatusLabels[latestOrder.status]}.`
                : 'Todavía no hay pedidos.'}
          </p>
          <Link className="text-link" to="/cuenta/pedidos">
            Ver mis pedidos <Icon name="arrow" />
          </Link>
        </section>
        <section aria-labelledby="overview-address-title">
          <span>{address ? '01' : '00'}</span>
          <h2 id="overview-address-title">Dirección</h2>
          <p>
            {address
              ? `${getPeruDistrictLabel(address.district)}, ${getPeruDepartmentLabel(address.department)}`
              : 'Sin dirección guardada.'}
          </p>
          <Link className="text-link" to="/cuenta/direcciones">
            Gestionar dirección <Icon name="arrow" />
          </Link>
        </section>
        <section aria-labelledby="overview-favorites-title">
          <span>{String(favoriteCount).padStart(2, '0')}</span>
          <h2 id="overview-favorites-title">Favoritos</h2>
          <p>
            {favoritesPersistence === 'account'
              ? 'Productos guardados en tu cuenta.'
              : 'Aromas guardados en este navegador.'}
          </p>
          <Link className="text-link" to="/cuenta/favoritos">
            Ver favoritos <Icon name="arrow" />
          </Link>
        </section>
      </div>
      {auth.session?.user.role === 'customer' && (
        <p className="account-recovery-reminder">
          Protege tu acceso sin correos.{' '}
          <Link to="/cuenta/datos#recuperacion" className="text-link">
            Guarda tu código de recuperación <Icon name="arrow" />
          </Link>
        </p>
      )}
    </section>
  )
}

export function AccountFavoritesPage() {
  const { persistence } = useFavorites()
  return (
    <section
      className="account-section"
      aria-labelledby="account-favorites-title"
    >
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Tu selección personal</p>
        <h1 id="account-favorites-title">Favoritos</h1>
        <p>
          {persistence === 'account'
            ? 'Productos guardados en tu cuenta.'
            : 'Aromas guardados en este navegador.'}
        </p>
      </header>
      <FavoritesCollection />
    </section>
  )
}

export function AccountDataPage() {
  const { profile, updateProfile, reload } = useAccount()
  const [form, setForm] = useState<AccountProfile>(profile)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [changingEmail, setChangingEmail] = useState(false)
  const changeEmailTrigger = useRef<HTMLButtonElement>(null)
  const closeEmailChange = useCallback(() => setChangingEmail(false), [])
  const profileHasChanges =
    form.firstName.trim() !== profile.firstName ||
    form.lastName.trim() !== profile.lastName ||
    form.phone.trim() !== profile.phone

  function update(field: keyof AccountProfile, value: string) {
    setSaved(false)
    if (field === 'email') setEmailError('')
    setForm((current) => ({ ...current, [field]: value }))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !reportTrimmedValidity(event.currentTarget)) return
    setSaving(true)
    setSaveError('')
    setEmailError('')
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: profile.email,
        phone: form.phone.trim(),
      })
      setSaved(true)
    } catch (error) {
      if (
        error instanceof AuthError &&
        ['email', 'email-change'].includes(error.code)
      ) {
        setEmailError(authErrorMessage(error))
        document.getElementById('account-email')?.focus()
      } else setSaveError(authErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="account-section" aria-labelledby="account-data-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Perfil</p>
        <h1 id="account-data-title">Mis datos</h1>
        <p>Revisa y actualiza tu información de contacto.</p>
      </header>
      <form
        className="account-form"
        onSubmit={(event) => void submit(event)}
        onInput={(event) => {
          if (event.target instanceof HTMLInputElement)
            event.target.setCustomValidity('')
        }}
        data-scroll-reveal="copy"
      >
        <div className="account-fields">
          <div className="account-field">
            <label htmlFor="account-first-name">Nombre</label>
            <input
              id="account-first-name"
              autoComplete="given-name"
              maxLength={80}
              value={form.firstName}
              onChange={(event) => update('firstName', event.target.value)}
              required
              data-trim-required
            />
          </div>
          <div className="account-field">
            <label htmlFor="account-last-name">Apellido</label>
            <input
              id="account-last-name"
              autoComplete="family-name"
              maxLength={80}
              value={form.lastName}
              onChange={(event) => update('lastName', event.target.value)}
              required
              data-trim-required
            />
          </div>
          <div className="account-field">
            <label htmlFor="account-email">Correo electrónico</label>
            <input
              id="account-email"
              autoComplete="email"
              type="email"
              maxLength={254}
              readOnly
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'account-email-error' : undefined}
              value={profile.email}
              required
            />
            {emailError && (
              <p id="account-email-error" className="auth-field-error">
                {emailError}
              </p>
            )}
            {authFeatures.emailChange && (
              <>
                <button
                  ref={changeEmailTrigger}
                  className="text-link"
                  type="button"
                  disabled={saving || profileHasChanges}
                  onClick={() => setChangingEmail(true)}
                  aria-describedby={
                    profileHasChanges ? 'account-email-save-first' : undefined
                  }
                >
                  Cambiar correo
                </button>
                {profileHasChanges && (
                  <p
                    id="account-email-save-first"
                    className="account-field-help"
                  >
                    Guarda tus cambios antes de cambiar el correo.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="account-field">
            <label htmlFor="account-phone">Celular</label>
            <input
              id="account-phone"
              autoComplete="tel"
              type="tel"
              maxLength={20}
              inputMode="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              pattern={'\\+?[0-9 ]{7,20}'}
              required
            />
          </div>
        </div>
        <div className="account-form-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <p role="status" aria-live="polite">
            {saved ? 'Cambios guardados.' : ''}
          </p>
        </div>
      </form>
      <RecoveryCodeSettings />
      {changingEmail && (
        <ChangeEmailDialog
          currentEmail={profile.email}
          onClose={closeEmailChange}
          onChanged={reload}
          returnFocusRef={changeEmailTrigger}
        />
      )}
      {saveError && (
        <Dialog
          open
          id="account-save-error"
          title="No pudimos guardar"
          onClose={() => setSaveError('')}
        >
          <p role="alert">{saveError}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setSaveError('')}
          >
            Entendido
          </button>
        </Dialog>
      )}
    </section>
  )
}

export function AccountAddressesPage() {
  const { address, saveAddress, removeAddress } = useAccount()
  const shipping = useSyncExternalStore(
    shippingService.subscribe,
    shippingService.getSnapshot,
  )
  const provincesEnabled = shipping.provinceShippingEnabled
  const [form, setForm] = useState<AccountAddress>(
    address ?? emptyAccountAddress(),
  )
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [addressError, setAddressError] = useState(false)
  const [locationNeedsReview, setLocationNeedsReview] = useState(false)
  const savedArea = getDeliveryArea(form.department)
  const area = savedArea?.province === form.province ? savedArea : undefined
  const departmentValue = provincesEnabled
    ? peruDepartments.some((department) => department.value === form.department)
      ? form.department
      : ''
    : (area?.department ?? '')
  const provinceOptions = provincesEnabled
    ? getPeruProvinceOptions(departmentValue)
    : []
  const provinceValue = provincesEnabled
    ? provinceOptions.some((province) => province.value === form.province)
      ? form.province
      : ''
    : (area?.province ?? '')
  const districtOptions = provinceValue
    ? getPeruDistrictOptions(provinceValue)
    : []
  const districtValue = districtOptions.some(
    (district) => district.value === form.district,
  )
    ? form.district
    : ''

  function update(
    field: Exclude<
      keyof AccountAddress,
      'department' | 'province' | 'location'
    >,
    value: string,
  ) {
    setMessage('')
    setAddressError(false)
    const destinationChanged =
      (field === 'district' || field === 'street') && form[field] !== value
    if (destinationChanged && form.location) setLocationNeedsReview(true)
    setForm((current) => ({
      ...current,
      [field]: value,
      location: destinationChanged ? null : current.location,
    }))
  }
  function updateArea(department: string) {
    const selected = provincesEnabled ? undefined : getDeliveryArea(department)
    if (form.location) setLocationNeedsReview(true)
    setForm((current) => ({
      ...current,
      department: provincesEnabled ? department : (selected?.department ?? ''),
      province: selected?.province ?? '',
      district: '',
      location: null,
    }))
    setMessage('')
    setAddressError(false)
  }
  function updateProvince(province: string) {
    if (form.location) setLocationNeedsReview(true)
    setForm((current) => ({
      ...current,
      province,
      district: '',
      location: null,
    }))
    setMessage('')
    setAddressError(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !reportTrimmedValidity(event.currentTarget)) return
    if (
      !isShippingDestinationEnabled(
        shipping,
        form.department,
        form.province,
        form.district,
      )
    ) {
      setAddressError(true)
      setMessage(
        provincesEnabled
          ? 'Selecciona un departamento, provincia y distrito válidos.'
          : 'Selecciona una zona y un distrito de Lima o Callao válidos.',
      )
      return
    }
    setSaving(true)
    try {
      await saveAddress({
        id: form.id,
        label: form.label.trim(),
        recipient: form.recipient.trim(),
        department: form.department,
        province: form.province,
        district: form.district.trim(),
        street: form.street.trim(),
        reference: form.reference.trim(),
        location: form.location ?? null,
      })
      setAddressError(false)
      setMessage('Dirección guardada.')
      setAdding(false)
    } catch (error) {
      setAddressError(true)
      setMessage(authErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  async function remove() {
    if (saving) return
    setSaving(true)
    try {
      await removeAddress()
      setAddressError(false)
      setMessage('Dirección eliminada.')
      setAdding(false)
    } catch (error) {
      setAddressError(true)
      setMessage(authErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  function restore() {
    const restored = emptyAccountAddress()
    setForm(restored)
    setAdding(true)
    setAddressError(false)
    setLocationNeedsReview(false)
    setMessage('')
  }

  return (
    <section
      className="account-section"
      aria-labelledby="account-address-title"
    >
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Entrega</p>
        <h1 id="account-address-title">Direcciones</h1>
        <p>
          {provincesEnabled
            ? 'Revisa y actualiza tus datos de entrega.'
            : 'Revisa y actualiza tus datos de entrega en Lima o Callao.'}
        </p>
      </header>
      {!address && !adding ? (
        <EmptyState
          className="account-empty"
          title="No hay una dirección guardada"
          description="Puedes volver a añadir una dirección cuando la necesites."
          icon="truck"
        >
          <button
            className="button button--secondary"
            type="button"
            onClick={restore}
          >
            Añadir dirección
          </button>
        </EmptyState>
      ) : (
        <form
          className="account-form"
          onSubmit={(event) => void submit(event)}
          onInput={(event) => {
            if (event.target instanceof HTMLInputElement)
              event.target.setCustomValidity('')
          }}
          data-scroll-reveal="copy"
        >
          {address &&
          !isShippingDestinationEnabled(
            shipping,
            address.department,
            address.province,
            address.district,
          ) ? (
            <p className="account-form-note" role="status">
              {provincesEnabled
                ? 'La dirección guardada necesita una ubicación válida. Confirma el departamento, provincia, distrito, calle y referencia antes de guardar.'
                : 'La dirección guardada está fuera de la cobertura actual. Elige Lima o Callao y confirma la calle y referencia antes de guardar.'}
            </p>
          ) : null}
          <div className="account-fields">
            <div className="account-field">
              <label htmlFor="account-address-label">
                Etiqueta de la dirección
              </label>
              <input
                id="account-address-label"
                placeholder="Casa, Oficina…"
                maxLength={80}
                aria-describedby="account-address-label-help"
                value={form.label}
                onChange={(event) => update('label', event.target.value)}
                required
                data-trim-required
              />
              <p className="account-field-help" id="account-address-label-help">
                Por ejemplo: Casa u Oficina.
              </p>
            </div>
            <div className="account-field">
              <label htmlFor="account-recipient">Nombre de quien recibe</label>
              <input
                id="account-recipient"
                placeholder="Nombres y apellidos"
                autoComplete="shipping name"
                maxLength={160}
                aria-describedby="account-recipient-help"
                value={form.recipient}
                onChange={(event) => update('recipient', event.target.value)}
                required
                data-trim-required
              />
              <p className="account-field-help" id="account-recipient-help">
                Puede ser tú u otra persona.
              </p>
            </div>
            <div className="account-field">
              <label htmlFor="account-zone">
                {provincesEnabled ? 'Departamento' : 'Zona de entrega'}
              </label>
              <select
                id="account-zone"
                value={departmentValue}
                onChange={(event) => updateArea(event.target.value)}
                required
              >
                <option value="">
                  {provincesEnabled
                    ? 'Selecciona un departamento'
                    : 'Selecciona una zona'}
                </option>
                {(provincesEnabled
                  ? peruDepartments.map((option) => ({
                      department: option.value,
                      label: option.label,
                    }))
                  : deliveryAreas
                ).map((option) => (
                  <option key={option.department} value={option.department}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {provincesEnabled ? (
              <div className="account-field">
                <label htmlFor="account-province">Provincia</label>
                <select
                  id="account-province"
                  value={provinceValue}
                  onChange={(event) => updateProvince(event.target.value)}
                  required
                  disabled={!departmentValue}
                >
                  <option value="">Selecciona una provincia</option>
                  {provinceOptions.map((province) => (
                    <option key={province.value} value={province.value}>
                      {province.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="account-field">
              <label htmlFor="account-district">Distrito</label>
              <select
                id="account-district"
                value={districtValue}
                onChange={(event) => update('district', event.target.value)}
                required
                disabled={!provinceValue}
              >
                <option value="">Selecciona un distrito</option>
                {districtOptions.map((district) => (
                  <option key={district.value} value={district.value}>
                    {district.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="account-field account-field--wide">
              <label htmlFor="account-street">Dirección</label>
              <input
                id="account-street"
                autoComplete="shipping street-address"
                value={form.street}
                onChange={(event) => update('street', event.target.value)}
                required
                data-trim-required
              />
            </div>
            <div className="account-field account-field--wide">
              <label htmlFor="account-reference">
                Referencia <span>Opcional</span>
              </label>
              <input
                id="account-reference"
                value={form.reference}
                onChange={(event) => update('reference', event.target.value)}
              />
            </div>
          </div>
          <AddressLocationPicker
            value={form.location}
            disabled={saving}
            onChange={(location) => {
              setForm((current) => ({ ...current, location }))
              setMessage('')
              setAddressError(false)
              setLocationNeedsReview(false)
            }}
          />
          {locationNeedsReview ? (
            <p className="account-field-help" role="status">
              Cambiaste la dirección. Vuelve a marcar su ubicación si deseas
              incluirla.
            </p>
          ) : null}
          <div className="account-form-actions account-form-actions--split">
            <button
              className="button button--primary"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar dirección'}
            </button>
            {address ? (
              <button
                className="account-remove"
                type="button"
                onClick={() => void remove()}
                disabled={saving}
              >
                Eliminar dirección
              </button>
            ) : (
              <button
                className="account-remove"
                type="button"
                onClick={() => setAdding(false)}
                disabled={saving}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
      <p
        className="account-form-message"
        role={addressError ? 'alert' : 'status'}
        aria-live={addressError ? 'assertive' : 'polite'}
      >
        {message}
      </p>
    </section>
  )
}

export function AccountOrdersPage() {
  const { orders, ordersAvailable } = useAccount()
  const visibleOrders = orders
  return (
    <section className="account-section" aria-labelledby="account-orders-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Historial</p>
        <h1 id="account-orders-title">Mis pedidos</h1>
        <p>Consulta el detalle y el estado de cada pedido.</p>
      </header>
      {!ordersAvailable ? (
        <EmptyState
          className="account-empty"
          title="Historial no disponible"
          description="No puedes consultar tus pedidos aquí por el momento. Vuelve a intentarlo más adelante."
          icon="orders"
        />
      ) : visibleOrders.length ? (
        <ul className="account-order-list" data-scroll-reveal="stagger">
          {visibleOrders.map((order) => (
            <li key={order.reference}>
              <div>
                <span>{dateFormatter.format(new Date(order.placedAt))}</span>
                <strong>{order.reference}</strong>
                {order.simulation ? (
                  <small>Modo prueba · sin cobro real</small>
                ) : null}
              </div>
              <div>
                <span>
                  {order.lines.length}{' '}
                  {order.lines.length === 1 ? 'producto' : 'productos'}
                </span>
                <strong>{formatPEN(order.totalCents)}</strong>
              </div>
              <span className="account-order-status">
                {accountStatusLabels[order.status]}
              </span>
              <Link
                className="text-link"
                to={`/cuenta/pedidos/${order.reference}`}
              >
                Ver pedido <Icon name="arrow" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="account-empty"
          title="Aún no hay pedidos"
          description="Cuando completes el checkout con esta cuenta aparecerán aquí."
          icon="orders"
        >
          <Link className="text-link" to="/tienda">
            Explorar perfumes <Icon name="arrow" />
          </Link>
        </EmptyState>
      )}
    </section>
  )
}

export function AccountOrderDetailPage() {
  const { reference = '' } = useParams()
  const { orders, ordersAvailable } = useAccount()
  if (!ordersAvailable)
    return (
      <section className="account-section">
        <EmptyState
          title="Historial no disponible"
          description="No puedes consultar este pedido por el momento."
          icon="orders"
        />
      </section>
    )
  const order = orders.find((item) => item.reference === reference)
  if (!order)
    return (
      <section
        className="account-section account-empty"
        aria-labelledby="missing-order-title"
      >
        <p className="eyebrow">Pedido no encontrado</p>
        <h1 id="missing-order-title">No encontramos ese pedido</h1>
        <Link className="text-link" to="/cuenta/pedidos">
          Volver a mis pedidos <Icon name="arrow" />
        </Link>
      </section>
    )
  return (
    <section
      className="account-section"
      aria-labelledby="account-order-detail-title"
    >
      <Link className="account-back" to="/cuenta/pedidos">
        ← Mis pedidos
      </Link>
      <header
        className="account-heading account-order-heading"
        data-scroll-reveal="copy"
      >
        <div>
          <p className="eyebrow">{order.reference}</p>
          <h1 id="account-order-detail-title">
            {accountStatusLabels[order.status]}
          </h1>
        </div>
        <p>{dateFormatter.format(new Date(order.placedAt))}</p>
      </header>
      <AccountOrderTimeline status={order.status} />
      {order.simulation ? (
        <p className="account-field-hint">
          Pedido de prueba: no se realizó un cobro ni se reservó inventario.
        </p>
      ) : null}
      <div className="account-order-detail-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="order-products-title">
          <h2 id="order-products-title">Productos</h2>
          <ul className="account-order-lines">
            {order.lines.map((line) => (
              <li key={line.variantId}>
                <div className="account-order-product">
                  <Link
                    className="account-order-product-image"
                    to={`/producto/${line.productSlug}`}
                    aria-label={`Ver ${line.name}`}
                  >
                    <img
                      src={imageSource(line.image)}
                      srcSet={imageSourceSet(line.image, [480, 960])}
                      sizes="88px"
                      width={480}
                      height={600}
                      loading="lazy"
                      decoding="async"
                      alt=""
                    />
                  </Link>
                  <div>
                    <span>{formatBrandName(line.brand)}</span>
                    <strong>
                      <Link to={`/producto/${line.productSlug}`}>
                        {line.name}
                      </Link>
                    </strong>
                    <small>
                      {variantLabel(line)} · Cant. {line.quantity}
                    </small>
                  </div>
                </div>
                <span className="account-order-line-price">
                  {formatPEN(line.unitPriceCents * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="account-order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPEN(order.subtotalCents)}</dd>
            </div>
            {order.discountCents ? (
              <div>
                <dt>Descuento</dt>
                <dd>−{formatPEN(order.discountCents)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Envío</dt>
              <dd>
                {order.shippingCents
                  ? formatPEN(order.shippingCents)
                  : 'Gratis'}
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatPEN(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
        <section
          className="account-order-delivery"
          aria-labelledby="order-delivery-title"
        >
          <h2 id="order-delivery-title">Entrega</h2>
          <strong>{order.address.recipient}</strong>
          <p>{order.address.street}</p>
          <p>
            {getPeruDistrictLabel(order.address.district)},{' '}
            {getPeruProvinceLabel(order.address.province)},{' '}
            {getPeruDepartmentLabel(order.address.department)}
          </p>
          <p>
            {order.deliveryMethod === 'courier' ? 'Courier' : 'Motorizado'} ·
            Perú
          </p>
        </section>
      </div>
    </section>
  )
}

export function AccountPaymentsPage() {
  const { orders, ordersAvailable } = useAccount()
  return (
    <section
      className="account-section"
      aria-labelledby="account-payments-title"
    >
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Información de pagos</p>
        <h1 id="account-payments-title">Pagos</h1>
        <p>Consulta el historial de importes asociados a tus pedidos.</p>
      </header>
      <div className="account-payment-provider" data-scroll-reveal="copy">
        <div>
          <span>Método indicado</span>
          <strong>Mercado Pago</strong>
        </div>
        <p>Los datos de tarjeta no se muestran en esta sección.</p>
      </div>
      <section
        className="account-transactions"
        aria-labelledby="transactions-title"
        data-scroll-reveal="copy"
      >
        <h2 id="transactions-title">Estado de pago de tus pedidos</h2>
        {!ordersAvailable ? (
          <EmptyState
            className="account-empty"
            title="Historial no disponible"
            description="No puedes consultar los pagos de tus pedidos aquí por el momento."
            headingLevel="h3"
          />
        ) : orders.length ? (
          <ul>
            {orders.map((order) => (
              <li key={order.reference}>
                <div>
                  <strong>{order.reference}</strong>
                  <span>{dateFormatter.format(new Date(order.placedAt))}</span>
                </div>
                <span>
                  {order.simulation
                    ? 'Prueba · sin cobro'
                    : {
                        pending: 'Pendiente de pago',
                        approved: 'Pago confirmado',
                        rejected: 'Pago rechazado',
                        refunded: 'Reembolsado',
                      }[order.payment.status]}
                </span>
                <strong>{formatPEN(order.totalCents)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="account-empty"
            title="No hay pagos registrados"
            headingLevel="h3"
          >
            <Link className="text-link" to="/cuenta/pedidos">
              Ver mis pedidos <Icon name="arrow" />
            </Link>
          </EmptyState>
        )}
      </section>
    </section>
  )
}
