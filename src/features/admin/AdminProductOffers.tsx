import { variantLabel } from '../../domain/product-type'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import type { AdminProduct } from '../../services/admin-service'
import { catalogAdminService as adminService } from '../../services/catalog-admin-service'
import { loadAdminProductsByIds, readAdminCatalogChoices } from '../../services/catalog-admin-service'
import { isRemoteCatalog } from '../../services/catalog-source'
import type { AdminCatalogChoice } from '../../types/admin-catalog-reads'
import { useRevalidator } from 'react-router'
import { useAdminOfferCollection } from './useAdminOfferCollection'
import { formatPEN } from '../../services/currency'
import {
  getNextProductDiscountChange,
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
  expectedVersion?: number
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
    expectedVersion: record.version,
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
  const remote = useAdminOfferCollection()
  const revalidator = useRevalidator()
  const [draft, setDraft] = useState<OfferDraft | null>(null)
  const [originalDraft, setOriginalDraft] = useState<OfferDraft | null>(null)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saveAction, setSaveAction] = useState<'finish' | 'create-another'>(
    'finish',
  )
  const [now, setNow] = useState(() => Date.now())
  const [choices, setChoices] = useState<AdminCatalogChoice[]>([])
  const [selectedRecord, setSelectedRecord] = useState<AdminProduct | null>(null)
  const selectionRevision = useRef(0)
  const choicesRevision = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const productRef = useRef<HTMLSelectElement>(null)
  const focusProductAfterSave = useRef(false)
  const sectionRef = useRef<HTMLElement>(null)
  const removingRef = useRef(false)
  const persistence = useAdminSave({ catalog: true })
  const records = isRemoteCatalog ? remote.products : state.products
  useEffect(() => () => {
    selectionRevision.current++
    choicesRevision.current++
  }, [])
  useEffect(() => {
    if (
      !focusProductAfterSave.current ||
      persistence.saving ||
      persistence.persistenceFailed
    )
      return
    // Wait for React to remove inert before focusing the next product.
    const frame = window.requestAnimationFrame(() => {
      productRef.current?.focus()
      focusProductAfterSave.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [draft, persistence.saving, persistence.persistenceFailed])
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
    const next = getNextProductDiscountChange(
      records.map(({ product }) => product),
      now,
    )
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
  }, [records, now])

  const brandsById = useMemo(
    () => new Map([...state.brands, ...remote.brands].map((brand) => [brand.id, brand])),
    [state.brands, remote.brands],
  )
  const productsById = useMemo(
    () => new Map([...records, ...(selectedRecord ? [selectedRecord] : [])].map((record) => [record.product.id, record])),
    [records, selectedRecord],
  )
  const sortedProducts = useMemo(
    () =>
      [...records].sort((a, b) => {
        const brandA = brandsById.get(a.product.brandId)?.name ?? ''
        const brandB = brandsById.get(b.product.brandId)?.name ?? ''
        return `${brandA} ${a.product.name}`.localeCompare(
          `${brandB} ${b.product.name}`,
          'es',
        )
      }),
    [records, brandsById],
  )
  const offeredProducts = useMemo(
    () => sortedProducts.filter((record) => record.product.discount),
    [sortedProducts],
  )
  const availableProducts = useMemo(
    () => sortedProducts.filter((record) => !record.product.discount),
    [sortedProducts],
  )
  const selectedProduct = draft ? productsById.get(draft.productId) : undefined
  const totalOffers = isRemoteCatalog ? remote.total : offeredProducts.length
  const availableCount = isRemoteCatalog ? remote.availableCount : availableProducts.length
  const selectedProductId = draft?.productId
  // Keep a just-saved product available until persistence confirms its save.
  const selectableProducts = useMemo(
    () =>
      isEditing && selectedProduct
        ? [selectedProduct]
        : sortedProducts.filter(
            (record) =>
              !record.product.discount ||
              record.product.id === selectedProductId,
          ),
    [isEditing, selectedProduct, sortedProducts, selectedProductId],
  )
  const productOptions = useMemo(
    () => isRemoteCatalog
      ? (isEditing && selectedProduct
          ? [{id: selectedProduct.product.id, name: selectedProduct.product.name,
              brandName: brandsById.get(selectedProduct.product.brandId)?.name ?? ''}]
          : choices).map(choice => <option key={choice.id} value={choice.id}>
            {choice.brandName ? `${choice.brandName} · ` : ''}{choice.name}
          </option>)
      : selectableProducts.map((record) => {
        const brand = brandsById.get(record.product.brandId)?.name
        return (
          <option key={record.product.id} value={record.product.id}>
            {brand ? `${brand} · ` : ''}
            {record.product.name}
          </option>
        )
      }),
    [selectableProducts, brandsById, choices, isEditing, selectedProduct],
  )
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
    selectionRevision.current++
    setError('')
    setSelectedRecord(next.productId ? productsById.get(next.productId) ?? null : null)
    setDraft(next)
    setOriginalDraft({ ...next })
    if (isRemoteCatalog && !next.productId) void loadChoices()
    window.requestAnimationFrame(() => headingRef.current?.focus())
  }

  async function loadChoices() {
    const started = ++choicesRevision.current
    try {
      const first = await readAdminCatalogChoices({ withoutOffer: true, page: 1, limit: 100 })
      const items = [...first.items]
      // The existing native selector and its keyboard type-ahead require all
      // names. Fetch identities only on explicit creation, never product DTOs.
      if (first.total > 10000) throw new Error('Hay demasiadas opciones para este selector.')
      for (let page = 2; items.length < first.total; page++) {
        if (started !== choicesRevision.current) return
        const next = await readAdminCatalogChoices({ withoutOffer: true, page, limit: 100 })
        if (next.ownerId !== first.ownerId || next.accessRevision !== first.accessRevision ||
            next.total !== first.total || !next.items.length ||
            next.items.some(item => items.some(previous => previous.id === item.id)))
          throw new Error('La lista de productos cambió. Vuelve a abrir la oferta para actualizarla.')
        items.push(...next.items)
      }
      if (started === choicesRevision.current) setChoices(items)
    } catch (error) {
      if (started === choicesRevision.current) notice.error(error)
    }
  }

  async function selectProduct(id: string) {
    const started = ++selectionRevision.current
    setSelectedRecord(null)
    setDraft(current => current ? { ...current, productId: id,
      expectedVersion: isRemoteCatalog ? undefined : productsById.get(id)?.version } : current)
    if (!isRemoteCatalog || !id) return
    try {
      const [record] = await loadAdminProductsByIds([id])
      if (started !== selectionRevision.current) return
      if (!record || record.product.discount) {
        setError('El producto ya no está disponible para crear esta oferta. Actualiza la selección.')
        return
      }
      setSelectedRecord(record)
      setError('')
      setDraft(current => current?.productId === id ? { ...current, expectedVersion: record.version } : current)
    } catch (error) {
      if (started === selectionRevision.current) notice.error(error)
    }
  }

  function refreshOffers() {
    if (isRemoteCatalog) void revalidator.revalidate()
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
    selectionRevision.current++
    choicesRevision.current++
    setSelectedRecord(null)
    setOriginalDraft(null)
    setPreviewOpen(false)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (persistence.saving || persistence.persistenceFailed) return
    if (!draft || !selectedProduct || !parsedDiscount) {
      setError('Elige un producto y revisa el importe del descuento.')
      return
    }
    const createAnother =
      !isEditing &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
        'create-another'
    setSaveAction(createAnother ? 'create-another' : 'finish')
    setError('')
    const result = await persistence.save(
      () =>
        adminService.saveProductDiscount(
          draft.productId,
          parsedDiscount,
          draft.expectedVersion,
        ),
      () => {
        refreshOffers()
        if (createAnother) {
          focusProductAfterSave.current = true
          setDraft({ ...emptyDraft })
          setOriginalDraft({ ...emptyDraft })
          setError('')
          selectionRevision.current++
          setSelectedRecord(null)
          if (isRemoteCatalog) void loadChoices()
        } else {
          setDraft(null)
          setOriginalDraft(null)
        }
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
        adminService.saveProductDiscount(
          record.product.id,
          {
            ...discount,
            active: !discount.active,
          },
          record.version,
        ),
      () => {
        refreshOffers()
        notice.toast(
          `Oferta de ${record.product.name} ${discount.active ? 'desactivada' : 'activada'}.`,
        )
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function remove(record: AdminProduct, fromEditor = false) {
    if (
      persistence.saving ||
      persistence.persistenceFailed ||
      removingRef.current
    )
      return
    removingRef.current = true
    try {
      if (
        !(await notice.confirm({
          title: fromEditor
            ? `¿Retirar la oferta de ${record.product.name}?`
            : `¿Eliminar la oferta de ${record.product.name}?`,
          description:
            'El producto volverá a su precio habitual. Sus presentaciones y existencias se conservarán.',
          confirmLabel: fromEditor ? 'Retirar oferta' : 'Eliminar oferta',
          destructive: true,
        }))
      )
        return
      setError('')
      const result = await persistence.save(
        () =>
          adminService.saveProductDiscount(
            record.product.id,
            null,
            fromEditor ? draft?.expectedVersion : record.version,
          ),
        () => {
          refreshOffers()
          if (fromEditor) {
            setDraft(null)
            setOriginalDraft(null)
            setPreviewOpen(false)
          }
          notice.toast(
            `Oferta de ${record.product.name} ${fromEditor ? 'retirada' : 'eliminada'}.`,
          )
          window.requestAnimationFrame(() => sectionRef.current?.focus())
        },
      )
      if (result?.kind === 'validation') setError(result.message)
    } finally {
      removingRef.current = false
    }
  }

  return (
    <section
      className="admin-offers"
      aria-label="Ofertas de productos"
      ref={sectionRef}
      tabIndex={-1}
    >
      <div className="admin-offers-toolbar">
        <p>
          {totalOffers}{' '}
          {totalOffers === 1
            ? 'producto con oferta'
            : 'productos con oferta'}
        </p>
        {!draft && availableCount > 0 ? (
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
                ref={productRef}
                value={draft.productId}
                disabled={isEditing}
                onChange={(event) => void selectProduct(event.target.value)}
                required
              >
                <option value="">Selecciona un producto</option>
                {productOptions}
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
              name="afterSave"
              value="finish"
              disabled={
                persistence.saving ||
                persistence.persistenceFailed ||
                Boolean(previewError) ||
                !selectedProduct
              }
              aria-busy={persistence.saving && saveAction === 'finish'}
            >
              {persistence.saving && saveAction === 'finish'
                ? 'Guardando…'
                : 'Guardar oferta'}
            </button>
            {!isEditing ? (
              <button
                className="button button--secondary"
                type="submit"
                name="afterSave"
                value="create-another"
                disabled={
                  persistence.saving ||
                  persistence.persistenceFailed ||
                  Boolean(previewError) ||
                  !selectedProduct
                }
                aria-busy={
                  persistence.saving && saveAction === 'create-another'
                }
              >
                {persistence.saving && saveAction === 'create-another'
                  ? 'Guardando…'
                  : 'Guardar y crear otra'}
              </button>
            ) : null}
            {isEditing ? (
              <button
                className="admin-offers-remove"
                type="button"
                disabled={persistence.saving || persistence.persistenceFailed}
                onClick={() =>
                  selectedProduct && void remove(selectedProduct, true)
                }
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
            const brand = brandsById.get(record.product.brandId)?.name
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
                  <button
                    type="button"
                    className="admin-offers-delete"
                    aria-label={`Eliminar oferta de ${record.product.name}`}
                    disabled={
                      persistence.saving || persistence.persistenceFailed
                    }
                    onClick={() => void remove(record)}
                  >
                    Eliminar oferta
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {isRemoteCatalog && !draft && remote.canLoadMore ? <div ref={remote.sentinel} aria-hidden="true" /> : null}
    </section>
  )
}
