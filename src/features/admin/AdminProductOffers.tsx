import { variantLabel } from '../../domain/product-type'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { adminService, type AdminProduct } from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import {
  getProductDiscountStatus,
  getVariantPrice,
  validateProductDiscount,
} from '../../services/product-discounts'
import type { ProductDiscount } from '../../types/catalog'
import { AdminBadge } from './AdminShared'
import { useAdminNotice } from './AdminNoticeProvider'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import './admin-product-offers.css'

interface OfferDraft {
  productId: string
  type: ProductDiscount['type']
  amount: string
  active: boolean
  startsAt: string
  endsAt: string
}

const emptyDraft: OfferDraft = {
  productId: '',
  type: 'percent',
  amount: '10',
  active: true,
  startsAt: '',
  endsAt: '',
}

function toDatetimeLocal(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function toUtcIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function draftFrom(record: AdminProduct): OfferDraft {
  const discount = record.product.discount!
  return {
    productId: record.product.id,
    type: discount.type,
    amount: String(
      discount.type === 'fixed' ? discount.value / 100 : discount.value,
    ),
    active: discount.active,
    startsAt: toDatetimeLocal(discount.startsAt),
    endsAt: toDatetimeLocal(discount.endsAt),
  }
}

function discountFrom(draft: OfferDraft): ProductDiscount | null {
  const amount = draft.amount.trim()
  const valid =
    draft.type === 'percent'
      ? /^\d+$/.test(amount)
      : /^\d+(?:\.\d{1,2})?$/.test(amount)
  if (!valid) return null
  const numericValue = Number(amount)
  if (!Number.isFinite(numericValue)) return null
  return {
    active: draft.active,
    type: draft.type,
    value:
      draft.type === 'fixed' ? Math.round(numericValue * 100) : numericValue,
    startsAt: toUtcIso(draft.startsAt),
    endsAt: toUtcIso(draft.endsAt),
  }
}

function statusMeta(status: ReturnType<typeof getProductDiscountStatus>) {
  switch (status) {
    case 'active':
      return { label: 'En oferta', tone: 'success' as const }
    case 'scheduled':
      return { label: 'Programada', tone: 'info' as const }
    case 'expired':
      return { label: 'Vencida', tone: 'warning' as const }
    case 'inactive':
      return { label: 'Desactivada', tone: 'neutral' as const }
    default:
      return { label: 'Revisar', tone: 'danger' as const }
  }
}

function offerLabel(discount: ProductDiscount) {
  return discount.type === 'percent'
    ? `${discount.value} % de descuento`
    : `${formatPEN(discount.value)} de descuento`
}

function previewProduct(record: AdminProduct, discount: ProductDiscount) {
  return {
    ...record.product,
    discount: { ...discount, active: true, startsAt: '', endsAt: '' },
  }
}

export function AdminProductOffers() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const [draft, setDraft] = useState<OfferDraft | null>(null)
  const [originalDraft, setOriginalDraft] = useState<OfferDraft | null>(null)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const persistence = useAdminSave()
  const isEditing = Boolean(draft && originalDraft?.productId)
  const dirty = Boolean(
    draft &&
    originalDraft &&
    JSON.stringify(draft) !== JSON.stringify(originalDraft),
  )
  useUnsavedChanges(
    dirty || persistence.saving || persistence.persistenceFailed,
  )
  useEffect(() => {
    const next = state.products
      .flatMap(({ product }) => {
        const discount = product.discount
        return discount?.active ? [discount.startsAt, discount.endsAt] : []
      })
      .filter(Boolean)
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value) && value > now)
      .sort((first, second) => first - second)[0]
    const timer =
      next === undefined
        ? undefined
        : window.setTimeout(
            () => setNow(Date.now()),
            Math.min(next - now + 1, 2_147_483_647),
          )
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [state.products, now])

  const sortedProducts = [...state.products].sort((a, b) => {
    const brandA =
      state.brands.find((brand) => brand.id === a.product.brandId)?.name ?? ''
    const brandB =
      state.brands.find((brand) => brand.id === b.product.brandId)?.name ?? ''
    return `${brandA} ${a.product.name}`.localeCompare(
      `${brandB} ${b.product.name}`,
      'es',
    )
  })
  const offeredProducts = sortedProducts.filter(
    (record) => record.product.discount,
  )
  const availableProducts = sortedProducts.filter(
    (record) => !record.product.discount,
  )
  const selectedProduct = draft
    ? state.products.find((record) => record.product.id === draft.productId)
    : undefined
  const parsedDiscount = draft ? discountFrom(draft) : null
  const previewError =
    draft && selectedProduct
      ? parsedDiscount
        ? validateProductDiscount(
            parsedDiscount,
            selectedProduct.product.variants,
          )
        : 'Ingresa un porcentaje entero o un importe en soles con hasta dos decimales.'
      : null
  const variants =
    selectedProduct?.product.variants
      .filter((variant) => variant.active !== false)
      .sort((a, b) => (a.ml ?? 0) - (b.ml ?? 0)) ?? []

  function openEditor(next: OfferDraft) {
    setError('')
    setDraft(next)
    setOriginalDraft({ ...next })
    window.requestAnimationFrame(() => headingRef.current?.focus())
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Descartar los cambios de la oferta?',
        description: 'La oferta conservará su última versión guardada.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        destructive: true,
      }))
    )
      return
    setDraft(null)
    setOriginalDraft(null)
    setPreviewOpen(false)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !selectedProduct || !parsedDiscount) {
      setError('Elige un producto y revisa el importe del descuento.')
      return
    }
    setError('')
    const result = await persistence.save(
      () => adminService.saveProductDiscount(draft.productId, parsedDiscount),
      () => {
        setDraft(null)
        setOriginalDraft(null)
        setPreviewOpen(false)
        notice.toast(`Oferta de ${selectedProduct.product.name} guardada.`)
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function toggle(record: AdminProduct) {
    const discount = record.product.discount
    if (!discount) return
    setError('')
    const result = await persistence.save(
      () =>
        adminService.saveProductDiscount(record.product.id, {
          ...discount,
          active: !discount.active,
        }),
      () =>
        notice.toast(
          `Oferta de ${record.product.name} ${discount.active ? 'desactivada' : 'activada'}.`,
        ),
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function remove() {
    if (persistence.saving || persistence.persistenceFailed) return
    if (!draft || !selectedProduct || !isEditing) return
    if (
      !(await notice.confirm({
        title: `¿Retirar la oferta de ${selectedProduct.product.name}?`,
        description:
          'El producto volverá a su precio habitual. Sus presentaciones y existencias se conservarán.',
        confirmLabel: 'Retirar oferta',
        destructive: true,
      }))
    )
      return
    setError('')
    const result = await persistence.save(
      () => adminService.saveProductDiscount(draft.productId, null),
      () => {
        setDraft(null)
        setOriginalDraft(null)
        setPreviewOpen(false)
        notice.toast(`Oferta de ${selectedProduct.product.name} retirada.`)
      },
    )
    if (result?.kind === 'validation') setError(result.message)
  }

  return (
    <section className="admin-offers" aria-label="Ofertas de productos">
      <div className="admin-offers-toolbar">
        <p>
          {offeredProducts.length}{' '}
          {offeredProducts.length === 1
            ? 'producto con oferta'
            : 'productos con oferta'}
        </p>
        {!draft && availableProducts.length > 0 ? (
          <button
            className="button button--primary"
            type="button"
            disabled={persistence.saving || persistence.persistenceFailed}
            onClick={() => openEditor({ ...emptyDraft })}
          >
            Crear oferta de producto
          </button>
        ) : null}
      </div>

      {draft ? (
        <form
          className="admin-offers-editor"
          onSubmit={save}
          aria-busy={persistence.saving}
          inert={persistence.saving || persistence.persistenceFailed}
        >
          <header className="admin-offers-editor-heading">
            <div>
              <span className="eyebrow">Precio por presentación</span>
              <h2 ref={headingRef} tabIndex={-1}>
                {isEditing ? 'Editar oferta' : 'Nueva oferta'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void closeEditor()}
              disabled={persistence.saving || persistence.persistenceFailed}
            >
              Cancelar
            </button>
          </header>
          <div className="admin-offers-fields">
            <label className="admin-offers-product-field">
              Producto
              <select
                value={draft.productId}
                disabled={isEditing}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, productId: event.target.value }
                      : current,
                  )
                }
                required
              >
                <option value="">Selecciona un producto</option>
                {(isEditing && selectedProduct
                  ? [selectedProduct]
                  : availableProducts
                ).map((record) => {
                  const brand = state.brands.find(
                    (item) => item.id === record.product.brandId,
                  )?.name
                  return (
                    <option key={record.product.id} value={record.product.id}>
                      {brand ? `${brand} · ` : ''}
                      {record.product.name}
                    </option>
                  )
                })}
              </select>
            </label>
            <label>
              Tipo de descuento
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          type: event.target.value as ProductDiscount['type'],
                          amount:
                            event.target.value === 'percent' ? '10' : '10.00',
                        }
                      : current,
                  )
                }
              >
                <option value="percent">Porcentaje</option>
                <option value="fixed">Importe fijo</option>
              </select>
            </label>
            <label>
              {draft.type === 'percent' ? 'Descuento (%)' : 'Descuento (S/)'}
              <input
                type="number"
                inputMode="decimal"
                min={draft.type === 'percent' ? '1' : '0.01'}
                max={draft.type === 'percent' ? '99' : undefined}
                step={draft.type === 'percent' ? '1' : '0.01'}
                value={draft.amount}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, amount: event.target.value }
                      : current,
                  )
                }
                required
              />
            </label>
            <label>
              Inicio (opcional)
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, startsAt: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              Fin (opcional)
              <input
                type="datetime-local"
                min={draft.startsAt || undefined}
                value={draft.endsAt}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, endsAt: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="admin-offers-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, active: event.target.checked }
                      : current,
                  )
                }
              />
              Oferta habilitada
            </label>
          </div>
          <p className="admin-offers-price-note">
            El precio habitual se edita en Productos. El precio en oferta se
            calcula para cada presentación según este descuento.
          </p>
          {previewError ? (
            <p className="admin-form-error" role="alert">
              {previewError}
            </p>
          ) : null}
          {selectedProduct && !previewError ? (
            <button
              className="button button--secondary admin-offers-preview-button"
              type="button"
              disabled={persistence.saving || persistence.persistenceFailed}
              onClick={() => setPreviewOpen(true)}
            >
              Ver precios finales por presentación
            </button>
          ) : null}
          {error ? (
            <p className="admin-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="admin-offers-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={
                persistence.saving ||
                persistence.persistenceFailed ||
                Boolean(previewError) ||
                !selectedProduct
              }
              aria-busy={persistence.saving}
            >
              {persistence.saving ? 'Guardando…' : 'Guardar oferta'}
            </button>
            {isEditing ? (
              <button
                className="admin-offers-remove"
                type="button"
                disabled={persistence.saving || persistence.persistenceFailed}
                onClick={() => void remove()}
              >
                Retirar oferta
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <Dialog
        open={
          previewOpen &&
          Boolean(selectedProduct && parsedDiscount && !previewError)
        }
        onClose={() => setPreviewOpen(false)}
        id="admin-offers-price-preview"
        title="Precios por presentación"
        className="admin-offers-preview-dialog"
      >
        {selectedProduct && parsedDiscount ? (
          <div className="admin-offers-preview-list">
            {variants.map((variant) => {
              const price = getVariantPrice(
                previewProduct(selectedProduct, parsedDiscount),
                variant,
              )
              return (
                <div key={variant.id}>
                  <span>
                    {variantLabel(variant)}
                    {variant.stock < 1 ? ' · Agotado' : ''}
                  </span>
                  <s>{formatPEN(price.originalCents)}</s>
                  <span>− {formatPEN(price.discountCents)}</span>
                  <strong>{formatPEN(price.finalCents)}</strong>
                </div>
              )
            })}
          </div>
        ) : null}
      </Dialog>

      <AdminSaveFeedback {...persistence} />
      {!draft && !offeredProducts.length ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon="percent"
          title="Aún no hay productos en oferta"
          description="Selecciona un producto para definir su descuento y ver el precio final de cada presentación."
        />
      ) : null}
      {error && !draft ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {offeredProducts.length && !draft ? (
        <ul className="admin-offers-list">
          {offeredProducts.map((record) => {
            const discount = record.product.discount!
            const status = statusMeta(
              getProductDiscountStatus(discount, now, record.product.variants),
            )
            const activeVariants = record.product.variants
              .filter((variant) => variant.active !== false)
              .sort((a, b) => (a.ml ?? 0) - (b.ml ?? 0))
            const brand = state.brands.find(
              (item) => item.id === record.product.brandId,
            )?.name
            return (
              <li key={record.product.id}>
                <div className="admin-offers-list-heading">
                  <div>
                    <small>{brand}</small>
                    <strong>{record.product.name}</strong>
                    <span>{offerLabel(discount)}</span>
                  </div>
                  <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                </div>
                <div className="admin-offers-list-prices">
                  {activeVariants.map((variant) => {
                    const price = getVariantPrice(record.product, variant, now)
                    return (
                      <span key={variant.id}>
                        {variantLabel(variant)} ·{' '}
                        {price.discountActive ? (
                          <>
                            <s>{formatPEN(price.originalCents)}</s>{' '}
                            <strong>{formatPEN(price.finalCents)}</strong>
                          </>
                        ) : (
                          formatPEN(price.originalCents)
                        )}
                      </span>
                    )
                  })}
                </div>
                <div className="admin-offers-list-actions">
                  <button
                    type="button"
                    disabled={
                      persistence.saving || persistence.persistenceFailed
                    }
                    onClick={() => openEditor(draftFrom(record))}
                  >
                    Editar oferta
                  </button>
                  <button
                    type="button"
                    disabled={
                      persistence.saving || persistence.persistenceFailed
                    }
                    onClick={() => void toggle(record)}
                  >
                    {discount.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
