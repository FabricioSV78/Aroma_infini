import { OlfactoryProfile } from '../product/OlfactoryProfile'
import { productSlug, normalizeSku } from '../../domain/product-identity'
import { getProductPhotoStatus } from '../../domain/product-photos'
import {
  hasProductMainImage,
  hasProductStock,
} from '../../domain/product-publication'
import {
  getProductType,
  isPerfume,
  PRODUCT_TYPES,
  variantLabel,
} from '../../domain/product-type'
import { ProductDetailPreview } from '../product/ProductPage'
import {
  getEditorialPrimaryFamily,
  getProductOlfactoryFamilies,
  OLFACTORY_FAMILIES,
  type OlfactoryFamily,
} from '../../domain/olfactory-family'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { Dialog } from '../../components/ui/Dialog'
import { NoteBottleIcon } from '../../components/ui/NoteBottleIcon'
import {
  adminService,
  createAdminProductDetail,
  getStoreProducts,
  type AdminGender,
  type AdminProduct,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { getVariantPrice } from '../../services/product-discounts'
import { imageSource } from '../../services/image-source'
import type { ProductVariant } from '../../types/catalog'
import { AdminPagination } from './AdminPagination'
import { AdminBadge, AdminPageHeader, AdminStatus } from './AdminShared'
import {
  getInventoryAlerts,
  getProductInventory,
  getVariantInventory,
} from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { AdminProductPhotos } from './AdminProductPhotos'
import { AdminProductImport } from './AdminProductImport'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminNotice } from './AdminNoticeProvider'

function productPrice(record: AdminProduct) {
  const active = record.product.variants.filter(
    (variant) => variant.active !== false,
  )
  if (!active.length) return 'Sin precio'
  const lowest = active
    .map((variant) => getVariantPrice(record.product, variant))
    .sort((a, b) => a.finalCents - b.finalCents)[0]
  return lowest.discountActive ? (
    <span className="admin-product-offer-price">
      <s>{formatPEN(lowest.originalCents)}</s>
      <strong>{formatPEN(lowest.finalCents)}</strong>
      <AdminBadge tone="success">Oferta</AdminBadge>
    </span>
  ) : (
    formatPEN(lowest.finalCents)
  )
}

export function AdminProductsPage() {
  const state = useAdminStore()
  const notice = useAdminNotice()
  const [pageSize, setPageSize] = useState(() =>
    window.matchMedia('(max-width: 767px)').matches ? 4 : 12,
  )
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)')
    const updatePageSize = () => setPageSize(mobile.matches ? 4 : 12)
    mobile.addEventListener('change', updatePageSize)
    return () => mobile.removeEventListener('change', updatePageSize)
  }, [])
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const confirmingVisibility = useRef(false)
  const visibilityPersistence = useAdminSave()
  const search = params.get('q') ?? ''
  const stockFilter = ['alert', 'out', 'healthy'].includes(
    params.get('stock') ?? '',
  )
    ? (params.get('stock') as 'alert' | 'out' | 'healthy')
    : 'all'
  const visibilityFilter = ['active', 'inactive', 'pending-images'].includes(
    params.get('visibilidad') ?? '',
  )
    ? (params.get('visibilidad') as 'active' | 'inactive' | 'pending-images')
    : 'all'
  const saved = params.get('guardado') === '1'
  const normalizedSearch = search.trim().toLocaleLowerCase('es')
  const activeProducts = state.products.filter((record) => record.active)
  const activeInventory = activeProducts.map(getProductInventory)
  const totalStock = activeInventory.reduce(
    (total, inventory) => total + inventory.totalStock,
    0,
  )
  const productsWithAlerts = new Set(
    getInventoryAlerts(state.products).map((item) => item.productId),
  ).size
  const soldOutProducts = state.products.filter(
    (record) => getProductInventory(record).fullyOutOfStock,
  ).length
  const productRows = state.products.map((record) => ({
    record,
    brand: state.brands.find((item) => item.id === record.product.brandId),
    inventory: getProductInventory(record),
  }))
  const products = productRows
    .filter(({ record, brand, inventory }) => {
      const matchesSearch =
        `${record.product.name} ${record.product.sku ?? ''} ${brand?.name ?? ''} ${record.product.variants.map((variant) => variant.sku ?? '').join(' ')}`
          .toLocaleLowerCase('es')
          .includes(normalizedSearch)
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'alert' && inventory.alerts.length > 0) ||
        (stockFilter === 'out' && inventory.fullyOutOfStock) ||
        (stockFilter === 'healthy' &&
          !inventory.fullyOutOfStock &&
          inventory.alerts.length === 0)
      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'active' && record.active) ||
        (visibilityFilter === 'inactive' && !record.active) ||
        (visibilityFilter === 'pending-images' && !hasProductMainImage(record))
      return matchesSearch && matchesStock && matchesVisibility
    })
    .sort((first, second) => {
      const firstHasAlert = first.inventory.alerts.length > 0
      const secondHasAlert = second.inventory.alerts.length > 0
      return (
        Number(secondHasAlert) - Number(firstHasAlert) ||
        first.record.product.name.localeCompare(
          second.record.product.name,
          'es',
        )
      )
    })
  const pagination = useAdminPagination(products, pageSize)
  const hasFilters =
    Boolean(search) || stockFilter !== 'all' || visibilityFilter !== 'all'

  function clearFilters() {
    setParams({})
  }

  async function changeProductVisibility(record: AdminProduct) {
    if (
      confirmingVisibility.current ||
      visibilityPersistence.saving ||
      visibilityPersistence.persistenceFailed
    )
      return
    if (record.active) {
      confirmingVisibility.current = true
      try {
        const confirmed = await notice.confirm({
          title: `¿Desactivar ${record.product.name}?`,
          description:
            'Dejará de aparecer en la tienda hasta que lo actives de nuevo.',
          confirmLabel: 'Desactivar producto',
          cancelLabel: 'Mantener activo',
        })
        if (!confirmed) return
      } finally {
        confirmingVisibility.current = false
      }
    }
    if (saved) {
      const next = new URLSearchParams(params)
      next.delete('guardado')
      setParams(next, { replace: true })
    }
    const result = await visibilityPersistence.save(
      () => adminService.setProductActive(record.product.id, !record.active),
      () => {
        const updatedRecord = adminService
          .getSnapshot()
          .products.find((item) => item.product.id === record.product.id)
        if (
          updatedRecord?.active &&
          !state.features.complementsEnabled &&
          !isPerfume(record.product)
        ) {
          notice.show({
            kind: 'info',
            title: 'Complemento preparado',
            description:
              'Se mostrará en la tienda cuando habilites Complementos desde el contenido del Home.',
            primary: { label: 'Entendido' },
          })
        } else {
          notice.toast(
            `${record.product.name} ${updatedRecord?.active ? 'activado' : 'desactivado'}.`,
          )
        }
      },
    )
    if (result?.kind === 'validation') {
      notice.show({
        kind: 'warning',
        title: 'No se pudo cambiar la visibilidad',
        description: result.message,
        primary: { label: 'Revisar producto' },
      })
    }
  }

  return (
    <div className="admin-page admin-products-page">
      <AdminPageHeader
        eyebrow="Tienda"
        title="Productos"
        description="Controla la tienda, las presentaciones y el inventario desde un solo lugar."
        action={{ label: 'Nuevo producto', to: '/admin/productos/nuevo' }}
      />
      <AdminProductImport />
      <AdminSaveFeedback {...visibilityPersistence} />

      <section
        className="admin-inventory-summary"
        aria-label="Resumen de inventario"
      >
        <div>
          <span>Productos registrados</span>
          <strong>{state.products.length}</strong>
        </div>
        <div>
          <span>Unidades en productos activos</span>
          <strong>{totalStock}</strong>
        </div>
        <Link
          className="is-warning"
          to="/admin/productos?stock=alert"
          aria-label={`Ver ${productsWithAlerts} ${productsWithAlerts === 1 ? 'producto con alerta de inventario' : 'productos con alertas de inventario'}`}
        >
          <span>Con alertas</span>
          <strong>{productsWithAlerts}</strong>
        </Link>
        <Link
          className="is-danger"
          to="/admin/productos?stock=out"
          aria-label={`Ver ${soldOutProducts} ${soldOutProducts === 1 ? 'producto agotado' : 'productos agotados'}`}
        >
          <span>Agotados</span>
          <strong>{soldOutProducts}</strong>
        </Link>
      </section>

      <form
        className="admin-filter-bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const next = new URLSearchParams()
          const query = data.get('q')?.toString().trim()
          const stock = data.get('stock')?.toString()
          const visibility = data.get('visibilidad')?.toString()
          if (query) next.set('q', query)
          if (stock && stock !== 'all') next.set('stock', stock)
          if (visibility && visibility !== 'all')
            next.set('visibilidad', visibility)
          setParams(next)
        }}
      >
        <div className="admin-filter-fields">
          <label htmlFor="admin-product-search">
            Buscar producto, marca o SKU
            <input
              id="admin-product-search"
              name="q"
              key={search}
              defaultValue={search}
              type="search"
              placeholder="Nombre, marca o SKU"
            />
          </label>
          <label>
            Estado de stock
            <select name="stock" key={stockFilter} defaultValue={stockFilter}>
              <option value="all">Todos</option>
              <option value="alert">Con alertas</option>
              <option value="out">Agotados</option>
              <option value="healthy">Sin alertas</option>
            </select>
          </label>
          <label>
            Visibilidad
            <select
              name="visibilidad"
              key={visibilityFilter}
              defaultValue={visibilityFilter}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="pending-images">Pendientes de fotos</option>
            </select>
          </label>
          <button className="button button--primary" type="submit">
            <Icon name="search" /> Aplicar filtros
          </button>
        </div>
        <div className="admin-filter-result" aria-live="polite">
          <span>
            {products.length} {products.length === 1 ? 'producto' : 'productos'}
          </span>
          {hasFilters && products.length > 0 ? (
            <button type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>
      {products.length ? (
        <div className="admin-table-wrap admin-table-wrap--products">
          <table className="admin-table admin-table--products">
            <caption className="sr-only">Productos</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Inventario</th>
                <th scope="col">Precio desde</th>
                <th scope="col">Visibilidad</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map(({ record, brand, inventory }) => {
                const photos = getProductPhotoStatus(record)
                return (
                  <tr key={record.product.id}>
                    <th scope="row">
                      <span className="admin-cell-label">Producto</span>
                      <div className="admin-product-identity">
                        {record.product.image ? (
                          <img
                            src={imageSource(record.product.image)}
                            width={54}
                            height={68}
                            loading="lazy"
                            alt=""
                          />
                        ) : (
                          <span
                            className="admin-product-image-placeholder"
                            aria-hidden="true"
                          >
                            Sin foto
                          </span>
                        )}
                        <span>
                          <strong>{record.product.name}</strong>
                          <small>{brand?.name}</small>
                          <small>
                            SKU {record.product.sku} · {photos.count}/
                            {photos.expected} fotos
                          </small>
                        </span>
                      </div>
                    </th>
                    <td>
                      <span className="admin-cell-label">Inventario</span>
                      <ul className="admin-stock-list">
                        {inventory.variants.map((variant) => (
                          <li key={variant.variantId}>
                            <span>{variantLabel(variant)}</span>
                            <AdminBadge tone={variant.tone}>
                              {variant.stock} u. · {variant.label}
                            </AdminBadge>
                          </li>
                        ))}
                        {!inventory.variants.length ? (
                          <li>
                            <AdminBadge tone="danger">
                              Sin presentaciones activas
                            </AdminBadge>
                          </li>
                        ) : null}
                      </ul>
                    </td>
                    <td>
                      <span className="admin-cell-label">Precio desde</span>
                      {productPrice(record)}
                    </td>
                    <td>
                      <span className="admin-cell-label">Estado</span>
                      {!hasProductMainImage(record) ? (
                        <AdminBadge tone="warning">
                          Pendiente de fotos
                        </AdminBadge>
                      ) : !state.features.complementsEnabled &&
                        !isPerfume(record.product) ? (
                        <AdminBadge tone="neutral">Categoría oculta</AdminBadge>
                      ) : (
                        <AdminStatus active={record.active} />
                      )}
                    </td>
                    <td>
                      <span className="admin-cell-label">Acciones</span>
                      <div className="admin-row-actions">
                        <Link
                          to={`/admin/productos/${record.product.id}/fotos`}
                          aria-label={`Gestionar fotos de ${record.product.name}`}
                          state={{
                            returnTo: `${location.pathname}${location.search}`,
                            photoQueue: products
                              .filter(
                                ({ record: item }) =>
                                  getProductPhotoStatus(item).status !==
                                  'complete',
                              )
                              .map(({ record: item }) => item.product.id),
                          }}
                        >
                          Fotografías
                        </Link>
                        <Link
                          to={`/admin/productos/${record.product.id}${hasProductMainImage(record) ? '' : '#product-photos-title'}`}
                          state={{
                            returnTo: `${location.pathname}${location.search}`,
                          }}
                        >
                          {hasProductMainImage(record)
                            ? 'Editar'
                            : 'Subir fotos'}{' '}
                          <span className="sr-only">{record.product.name}</span>
                        </Link>
                        <button
                          type="button"
                          className={
                            record.active ? 'is-deactivate' : 'is-activate'
                          }
                          disabled={
                            visibilityPersistence.saving ||
                            visibilityPersistence.persistenceFailed
                          }
                          onClick={() => void changeProductVisibility(record)}
                        >
                          {record.active ? 'Desactivar' : 'Activar'}{' '}
                          <span className="sr-only">{record.product.name}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {products.length ? (
        <AdminPagination
          label="productos"
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          from={pagination.from}
          to={pagination.to}
          onPageChange={pagination.setPage}
        />
      ) : null}
      {!products.length ? (
        <div className="admin-empty">
          <Icon name={hasFilters ? 'search' : 'bag'} />
          <h2>
            {hasFilters ? 'No encontramos productos' : 'Aún no hay productos'}
          </h2>
          <p>
            {hasFilters
              ? 'Prueba con otra búsqueda o limpia los filtros aplicados.'
              : 'Crea el primer producto o usa la plantilla Excel para cargar varios.'}
          </p>
          {hasFilters ? (
            <button type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : (
            <Link
              className="button button--primary"
              to="/admin/productos/nuevo"
            >
              Crear producto
            </Link>
          )}
        </div>
      ) : null}
    </div>
  )
}

const noteFields = ['top', 'heart', 'base'] as const
type NoteField = (typeof noteFields)[number]
type NoteDraft = Record<NoteField, string>

function createNoteDraft(notes: AdminProduct['detail']['notes']): NoteDraft {
  return {
    top: notes.top.join(', '),
    heart: notes.heart.join(', '),
    base: notes.base.join(', '),
  }
}

function parseNoteDraft(notes: NoteDraft): AdminProduct['detail']['notes'] {
  const parse = (value: string) =>
    value
      .split(',')
      .map((note) => note.trim())
      .filter(Boolean)

  return {
    top: parse(notes.top),
    heart: parse(notes.heart),
    base: parse(notes.base),
  }
}

function cloneRecord(record: AdminProduct): AdminProduct {
  return {
    ...record,
    product: {
      ...record.product,
      olfactoryFamilies: record.product.olfactoryFamilies
        ? [...record.product.olfactoryFamilies]
        : record.product.olfactoryFamilies,
      variants: record.product.variants.map((variant) => ({ ...variant })),
    },
    detail: {
      ...record.detail,
      notes: {
        top: [...record.detail.notes.top],
        heart: [...record.detail.notes.heart],
        base: [...record.detail.notes.base],
      },
      gallery: record.detail.gallery.length
        ? record.detail.gallery.map((image) => ({ ...image }))
        : [{ image: '', alt: '', framing: 'full' }],
      recommendationIds: [...record.detail.recommendationIds],
    },
  }
}

function createProductDraft(brandId: string, complement = false): AdminProduct {
  const id = `product-${crypto.randomUUID().slice(0, 8)}`
  const product = {
    id,
    slug: '',
    name: '',
    productType: complement ? ('complemento' as const) : ('perfume' as const),
    brandId: complement ? '' : brandId,
    image: '',
    family: '',
    olfactoryFamily: null,
    olfactoryFamilies: [],
    variants: [
      {
        id: `${id}-50`,
        ml: complement ? null : 50,
        label: complement ? 'Unidad' : undefined,
        priceCents: 0,
        stock: 0,
        active: true,
      },
    ],
  }
  return {
    product,
    detail: createAdminProductDetail(product),
    active: false,
    gender: complement ? null : 'unisex',
    popularity: 999,
    newest: Date.now(),
    lowStockThreshold: 2,
  }
}

export function AdminProductFormPage() {
  const { id } = useParams()
  const state = useAdminStore()
  const notice = useAdminNotice()
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo =
    typeof location.state?.returnTo === 'string' &&
    (location.state.returnTo === '/admin' ||
      location.state.returnTo.startsWith('/admin/productos'))
      ? location.state.returnTo
      : '/admin/productos'
  const stored = id
    ? state.products.find((record) => record.product.id === id)
    : undefined
  const [form, setForm] = useState<AdminProduct>(() => {
    const defaultBrandId =
      state.brands.find((brand) => brand.active)?.id ??
      state.brands[0]?.id ??
      ''
    return stored
      ? cloneRecord(stored)
      : createProductDraft(
          defaultBrandId,
          new URLSearchParams(location.search).get('tipo') === 'complemento',
        )
  })
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(() =>
    createNoteDraft(form.detail.notes),
  )
  const [initialForm] = useState(form)
  const [initialNoteDraft] = useState(noteDraft)
  const [message, setMessage] = useState('')
  const [mediaBusy, setMediaBusy] = useState(false)
  const mediaUploadRef = useRef(false)
  const [showPreview, setShowPreview] = useState(false)
  const persistence = useAdminSave()
  const saving = persistence.saving
  const perfume = isPerfume(form.product)
  const editorialPrimaryFamily = getEditorialPrimaryFamily(form.product.family)
  const selectedFamilies = getProductOlfactoryFamilies(form.product)
  const relatedProducts = state.products.filter(
    (record) =>
      record.product.id !== form.product.id &&
      (record.active ||
        form.detail.recommendationIds.includes(record.product.id)),
  )
  const familyConflict = Boolean(
    selectedFamilies.length &&
    editorialPrimaryFamily &&
    !selectedFamilies.includes(editorialPrimaryFamily),
  )
  const editing = Boolean(id)
  useEffect(() => {
    if (location.hash !== '#product-photos-title') return
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById('product-photos-title')
      heading?.scrollIntoView({ block: 'start' })
      heading?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.hash])
  const autoSlug = useRef(!editing)
  const hasUnsavedChanges =
    form !== initialForm ||
    noteDraft !== initialNoteDraft ||
    mediaBusy ||
    saving ||
    persistence.persistenceFailed
  const allowNavigation = useRef(false)
  const confirmingNavigation = useRef(false)
  const blocker = useBlocker(
    () =>
      (hasUnsavedChanges || mediaUploadRef.current) && !allowNavigation.current,
  )

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (blocker.state !== 'blocked' || confirmingNavigation.current) return
    confirmingNavigation.current = true
    void notice
      .confirm({
        title: '¿Salir sin guardar?',
        description: 'Los cambios de este producto se perderán si sales ahora.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        destructive: true,
      })
      .then((confirmed) => {
        if (confirmed) blocker.proceed()
        else blocker.reset()
      })
      .finally(() => {
        confirmingNavigation.current = false
      })
  }, [blocker, notice])

  useEffect(() => {
    if (location.hash !== '#product-variants-title') return
    const timer = window.setTimeout(() => {
      const heading = document.getElementById('product-variants-title')
      heading?.scrollIntoView({ block: 'start' })
      heading?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [location.hash])

  if (editing && !stored)
    return (
      <div className="admin-page admin-empty">
        <p className="eyebrow">Producto no encontrado</p>
        <h1>No encontramos este producto</h1>
        <Link className="text-link" to="/admin/productos">
          Volver a productos <Icon name="arrow" />
        </Link>
      </div>
    )

  function updateProduct(
    field: 'name' | 'slug' | 'brandId' | 'family',
    value: string,
  ) {
    setMessage('')
    setForm((current) => {
      const product = {
        ...current.product,
        [field]: value,
        ...(field === 'name' && autoSlug.current
          ? { slug: productSlug(value) }
          : {}),
      }
      return {
        ...current,
        product,
        detail:
          field === 'name'
            ? {
                ...current.detail,
                gallery: current.detail.gallery.map((view, index) => {
                  const previousDefault =
                    index === 0
                      ? `Frasco de ${current.product.name}`
                      : `Vista alternativa de ${current.product.name}`
                  const nextDefault =
                    index === 0
                      ? `Frasco de ${product.name}`
                      : `Vista alternativa de ${product.name}`
                  return {
                    ...view,
                    alt:
                      view.alt.trim() && view.alt !== previousDefault
                        ? view.alt
                        : nextDefault,
                  }
                }),
              }
            : current.detail,
      }
    })
  }

  function updateVariant(
    variantId: string,
    field: keyof Pick<
      ProductVariant,
      'ml' | 'label' | 'sku' | 'priceCents' | 'stock' | 'active'
    >,
    value: number | boolean | string,
  ) {
    setMessage('')
    setForm((current) => ({
      ...current,
      product: {
        ...current.product,
        variants: current.product.variants.map((variant) =>
          variant.id === variantId ? { ...variant, [field]: value } : variant,
        ),
      },
    }))
  }

  function addVariant() {
    setForm((current) => {
      const usedSizes = new Set(
        current.product.variants.map((variant) => variant.ml),
      )
      const nextSize =
        [100, 150, 200, 30, 50, 75, 125].find((size) => !usedSizes.has(size)) ??
        Math.max(...[...usedSizes].map((size) => size ?? 0), 0) + 25
      return {
        ...current,
        product: {
          ...current.product,
          variants: [
            ...current.product.variants,
            {
              id: `${current.product.id}-${crypto.randomUUID().slice(0, 6)}`,
              ml: isPerfume(current.product) ? nextSize : null,
              label: isPerfume(current.product)
                ? undefined
                : `Presentación ${current.product.variants.length + 1}`,
              priceCents: 0,
              stock: 0,
              active: true,
            },
          ],
        },
      }
    })
  }

  function syncNoteDraft(note: NoteField) {
    setForm((current) => ({
      ...current,
      detail: {
        ...current.detail,
        notes: {
          ...current.detail.notes,
          [note]: parseNoteDraft(noteDraft)[note],
        },
      },
    }))
  }

  function showSaveError(text: string) {
    setMessage(text)
    window.requestAnimationFrame(() => {
      const notice = document.getElementById('admin-product-save-error')
      notice?.scrollIntoView({ block: 'center' })
      notice?.focus({ preventScroll: true })
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      mediaUploadRef.current ||
      mediaBusy ||
      saving ||
      persistence.persistenceFailed
    )
      return
    const productToSave = {
      ...form,
      detail: {
        ...form.detail,
        notes: parseNoteDraft(noteDraft),
      },
    }
    if (productToSave.detail.gallery.slice(1).some((view) => !view.image)) {
      showSaveError(
        'Sube una foto para cada vista añadida o quita la vista vacía.',
      )
      return
    }
    if (productToSave.active && !productToSave.detail.gallery[0]?.image) {
      showSaveError('Sube una fotografía principal antes de publicar.')
      return
    }
    setForm(productToSave)
    setMessage('')
    const result = await persistence.save(
      () => adminService.saveProduct(productToSave),
      () => {
        notice.toast('Producto guardado.')
        allowNavigation.current = true
        const destination = new URL(returnTo, window.location.origin)
        destination.searchParams.set('guardado', '1')
        navigate(`${destination.pathname}${destination.search}`)
      },
    )
    if (result?.kind === 'validation')
      notice.show({
        kind: 'warning',
        title: 'Revisa el producto',
        description: result.message,
        primary: { label: 'Volver a editar' },
      })
  }

  return (
    <div className="admin-page admin-editor-page">
      <Link className="admin-back" to={returnTo}>
        ← Volver
      </Link>
      <AdminPageHeader
        eyebrow={editing ? 'Editar producto' : 'Nuevo producto'}
        title={editing ? form.product.name : 'Crear producto'}
        description={
          editing
            ? `SKU ${form.product.sku ?? 'pendiente'} · Completa la ficha y guarda los cambios.`
            : 'El SKU del producto se asigna automáticamente al guardar.'
        }
      />
      <nav
        className="admin-editor-section-nav"
        aria-label="Secciones del producto"
      >
        <a href="#product-general-title">General</a>
        <a href="#product-photos-title">Fotografías</a>
        <a href="#product-content-title">{perfume ? 'Aroma' : 'Descripción'}</a>
        <a href="#product-variants-title">Presentaciones</a>
        <a href="#product-visibility-title">Visibilidad</a>
      </nav>
      <form
        className="admin-editor"
        onSubmit={submit}
        aria-busy={saving}
        inert={saving || persistence.persistenceFailed}
      >
        <section aria-labelledby="product-general-title">
          <header>
            <span>01</span>
            <div>
              <h2 id="product-general-title">Información general</h2>
            </div>
          </header>
          <div className="admin-fields admin-product-general-fields">
            <label>
              Tipo de producto
              <select
                value={getProductType(form.product)}
                aria-label="Tipo de producto"
                disabled={mediaBusy || saving}
                onChange={(event) => {
                  const nextType =
                    event.target.value === 'complemento'
                      ? 'complemento'
                      : 'perfume'
                  if (nextType === getProductType(form.product)) return
                  setForm((current) => ({
                    ...current,
                    gender: nextType === 'perfume' ? 'unisex' : null,
                    product: {
                      ...current.product,
                      productType: nextType,
                      family: '',
                      olfactoryFamilies: [],
                      olfactoryFamily: null,
                      variants: current.product.variants.map(
                        (variant, index) => ({
                          ...variant,
                          ml: nextType === 'perfume' ? 50 + index * 50 : null,
                          label:
                            nextType === 'perfume'
                              ? undefined
                              : index === 0
                                ? 'Unidad'
                                : `Presentación ${index + 1}`,
                        }),
                      ),
                    },
                    detail: {
                      ...current.detail,
                      shortDescription:
                        nextType === 'complemento' &&
                        current.detail.shortDescription ===
                          createAdminProductDetail(current.product)
                            .shortDescription
                          ? ''
                          : current.detail.shortDescription,
                      description:
                        nextType === 'complemento' &&
                        current.detail.description ===
                          createAdminProductDetail(current.product).description
                          ? ''
                          : current.detail.description,
                      olfactoryImage: null,
                      notes: { top: [], heart: [], base: [] },
                      intensity: nextType === 'perfume' ? 'Moderada' : null,
                      intensityLevel: nextType === 'perfume' ? 2 : null,
                      occasion: '',
                      season: '',
                    },
                  }))
                  setNoteDraft({ top: '', heart: '', base: '' })
                }}
              >
                {PRODUCT_TYPES.map((type) => (
                  <option value={type.value} key={type.value}>
                    {type.singular}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre
              <input
                value={form.product.name}
                onChange={(event) => updateProduct('name', event.target.value)}
                required
              />
            </label>
            <label>
              URL del producto
              <input
                value={form.product.slug}
                aria-label="URL del producto"
                onChange={(event) => {
                  autoSlug.current = false
                  updateProduct('slug', event.target.value.toLowerCase())
                }}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                aria-describedby="admin-product-slug-help"
                required
              />
              <small id="admin-product-slug-help">
                {editing
                  ? 'Cambiarla modifica el enlace público.'
                  : 'Se genera desde el nombre.'}{' '}
                Usa minúsculas, números y guiones.
              </small>
            </label>
            <label>
              Marca
              <select
                value={form.product.brandId}
                aria-label="Marca"
                onChange={(event) =>
                  updateProduct('brandId', event.target.value)
                }
                required={perfume}
              >
                <option value="">
                  {perfume ? 'Selecciona una marca' : 'Sin marca'}
                </option>
                {state.brands
                  .filter(
                    (brand) =>
                      brand.active || brand.id === form.product.brandId,
                  )
                  .map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
              </select>
            </label>
            {perfume && (
              <label>
                Género
                <select
                  value={form.gender ?? 'unisex'}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      gender: event.target.value as AdminGender,
                    }))
                  }
                >
                  <option value="hombre">Para él</option>
                  <option value="mujer">Para ella</option>
                  <option value="unisex">Unisex</option>
                </select>
              </label>
            )}
          </div>
        </section>

        <section aria-labelledby="product-photos-title">
          <header className="admin-product-photos-header">
            <span>02</span>
            <div>
              <h2 id="product-photos-title" tabIndex={-1}>
                Fotografías
              </h2>
              <p>
                La primera foto es la portada. La imagen olfativa se guarda
                aparte.
              </p>
            </div>
          </header>
          <AdminProductPhotos
            record={form}
            onChange={setForm}
            busy={saving || persistence.persistenceFailed}
            onBusyChange={(value) => {
              mediaUploadRef.current = value
              setMediaBusy(value)
            }}
          />
        </section>

        <section aria-labelledby="product-content-title">
          <header>
            <span>03</span>
            <div>
              <h2 id="product-content-title">
                {perfume ? 'Contenido olfativo' : 'Descripción del producto'}
              </h2>
              {perfume && (
                <p>Familia, notas y descripción visibles para el cliente.</p>
              )}
              {perfume && (
                <p id="finder-catalog-help">
                  El recomendador usa familias, intensidad y ocasión. Inicia el
                  perfil breve con una familia seleccionada y separa valores con
                  ·.
                </p>
              )}
            </div>
          </header>
          {perfume && (
            <>
              <div className="admin-olfactory-classification">
                <fieldset aria-describedby="admin-olfactory-family-help">
                  <legend>Familias olfativas</legend>
                  <div className="admin-olfactory-family-options">
                    {OLFACTORY_FAMILIES.map((family) => (
                      <label
                        key={family.value}
                        className={
                          selectedFamilies.includes(family.value)
                            ? 'is-selected'
                            : ''
                        }
                      >
                        <input
                          type="checkbox"
                          value={family.value}
                          checked={selectedFamilies.includes(family.value)}
                          aria-invalid={familyConflict || undefined}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setMessage('')
                            setForm((current) => {
                              const existing = getProductOlfactoryFamilies(
                                current.product,
                              )
                              const next: OlfactoryFamily[] = checked
                                ? [...existing, family.value]
                                : existing.filter(
                                    (value) => value !== family.value,
                                  )
                              return {
                                ...current,
                                product: {
                                  ...current.product,
                                  olfactoryFamilies: next,
                                  olfactoryFamily: next[0] ?? null,
                                },
                              }
                            })
                          }}
                        />
                        <span>{family.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p id="admin-olfactory-family-help">
                  Puedes elegir varias. Solo marca familias verificadas para
                  este perfume.
                </p>
                {familyConflict ? (
                  <p
                    className="admin-olfactory-classification__warning"
                    role="alert"
                  >
                    Las familias seleccionadas no coinciden con el inicio del
                    perfil aromático breve. Revisa ambos antes de guardar.
                  </p>
                ) : null}
              </div>
              <div className="admin-olfactory-editor">
                <OlfactoryProfile
                  family={form.product.family}
                  detail={form.detail}
                  image={form.detail.olfactoryImage ?? undefined}
                  editor={{
                    family: (
                      <input
                        aria-label="Perfil aromático breve"
                        aria-describedby="finder-catalog-help"
                        value={form.product.family}
                        onChange={(event) =>
                          updateProduct('family', event.target.value)
                        }
                        required
                      />
                    ),
                    intensity: (
                      <select
                        aria-label="Intensidad"
                        value={form.detail.intensityLevel ?? 2}
                        onChange={(event) => {
                          const level = Number(event.target.value)
                          if (level !== 1 && level !== 2 && level !== 3) return
                          setForm((current) => ({
                            ...current,
                            detail: {
                              ...current.detail,
                              intensityLevel: level,
                              intensity:
                                level === 1
                                  ? 'Suave'
                                  : level === 2
                                    ? 'Moderada'
                                    : 'Intensa',
                            },
                          }))
                        }}
                      >
                        <option value={1}>Suave</option>
                        <option value={2}>Moderada</option>
                        <option value={3}>Intensa</option>
                      </select>
                    ),
                    season: (
                      <input
                        aria-label="Temporada"
                        value={form.detail.season}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            detail: {
                              ...current.detail,
                              season: event.target.value,
                            },
                          }))
                        }
                      />
                    ),
                    occasion: (
                      <input
                        aria-label="Ocasión"
                        aria-describedby="finder-catalog-help"
                        value={form.detail.occasion}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            detail: {
                              ...current.detail,
                              occasion: event.target.value,
                            },
                          }))
                        }
                      />
                    ),
                    notes: (
                      <div className="admin-profile-notes">
                        {noteFields.map((note) => (
                          <label key={note}>
                            <span className="admin-profile-notes-heading">
                              <NoteBottleIcon stage={note} />
                              <span>
                                Notas de{' '}
                                {note === 'top'
                                  ? 'salida'
                                  : note === 'heart'
                                    ? 'corazón'
                                    : 'fondo'}
                              </span>
                            </span>
                            <input
                              value={noteDraft[note]}
                              onChange={(event) =>
                                setNoteDraft((current) => ({
                                  ...current,
                                  [note]: event.target.value,
                                }))
                              }
                              onBlur={() => syncNoteDraft(note)}
                            />
                          </label>
                        ))}
                        <small>
                          Separa las notas con comas. La primera de cada grupo
                          aparece en la evolución.
                        </small>
                        <p className="admin-evolution-preview">
                          {Object.values(parseNoteDraft(noteDraft))
                            .map((notes) => notes[0])
                            .filter(Boolean)
                            .join(' · ') ||
                            'Añade las notas para ver la evolución.'}
                        </p>
                      </div>
                    ),
                  }}
                />
              </div>
            </>
          )}
          <div className="admin-fields">
            <label className="admin-field-wide">
              Resumen de la ficha
              <textarea
                rows={2}
                value={form.detail.shortDescription}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    detail: {
                      ...current.detail,
                      shortDescription: event.target.value,
                    },
                  }))
                }
                required
              />
            </label>
            <label className="admin-field-wide">
              Descripción
              <textarea
                rows={5}
                value={form.detail.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    detail: {
                      ...current.detail,
                      description: event.target.value,
                    },
                  }))
                }
                required
              />
            </label>
          </div>
          <details className="admin-related-products">
            <summary>
              <span>También te puede gustar</span>
              <small>
                {form.detail.recommendationIds.length
                  ? `${form.detail.recommendationIds.length} de 4 seleccionados`
                  : 'Selección automática'}
              </small>
            </summary>
            <fieldset>
              <legend>
                Elige hasta 4 productos o deja la selección automática.
              </legend>
              <div className="admin-related-products__options">
                {relatedProducts.map((record) => {
                  const checked = form.detail.recommendationIds.includes(
                    record.product.id,
                  )
                  const brandName = state.brands.find(
                    (brand) => brand.id === record.product.brandId,
                  )?.name
                  return (
                    <label key={record.product.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={
                          !checked && form.detail.recommendationIds.length >= 4
                        }
                        onChange={(event) => {
                          const isChecked = event.target.checked
                          setForm((current) => ({
                            ...current,
                            detail: {
                              ...current.detail,
                              recommendationIds: isChecked
                                ? [
                                    ...current.detail.recommendationIds,
                                    record.product.id,
                                  ]
                                : current.detail.recommendationIds.filter(
                                    (id) => id !== record.product.id,
                                  ),
                            },
                          }))
                        }}
                      />
                      <span>
                        <strong>{record.product.name}</strong>
                        <small>
                          {brandName}
                          {record.active &&
                          (state.features.complementsEnabled ||
                            isPerfume(record.product))
                            ? ''
                            : ' · Oculto en tienda'}
                        </small>
                      </span>
                    </label>
                  )
                })}
              </div>
              {!relatedProducts.length ? (
                <p>No hay otros productos disponibles para relacionar.</p>
              ) : null}
            </fieldset>
          </details>
        </section>

        <section aria-labelledby="product-variants-title">
          <header>
            <span>04</span>
            <div>
              <h2 id="product-variants-title" tabIndex={-1}>
                Presentaciones
              </h2>
              <p>Precio y stock por presentación.</p>
            </div>
          </header>
          <div className="admin-threshold-control">
            <label htmlFor="admin-low-stock-threshold">
              Alerta por presentación desde
              <input
                id="admin-low-stock-threshold"
                type="number"
                min="0"
                step="1"
                value={form.lowStockThreshold}
                aria-describedby="admin-low-stock-help"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lowStockThreshold: Number(event.target.value),
                  }))
                }
              />
            </label>
            <p id="admin-low-stock-help">
              Avisa cuando cualquier presentación llega a estas unidades o
              menos.
            </p>
          </div>
          <div className="admin-variant-list">
            {form.product.variants.map((variant, index) => {
              const inventory = getVariantInventory(form, variant)
              return (
                <fieldset key={variant.id}>
                  <legend>Presentación {index + 1}</legend>
                  <div className="admin-variant-status">
                    <strong>{variantLabel(variant)}</strong>
                    <AdminBadge
                      tone={
                        variant.active === false ? 'neutral' : inventory.tone
                      }
                    >
                      {variant.active === false
                        ? 'Inactiva'
                        : `${inventory.stock} u. · ${inventory.label}`}
                    </AdminBadge>
                  </div>
                  {perfume ? (
                    <label>
                      Mililitros
                      <input
                        type="number"
                        min="1"
                        value={variant.ml ?? ''}
                        onChange={(event) =>
                          updateVariant(
                            variant.id,
                            'ml',
                            Number(event.target.value),
                          )
                        }
                        required
                      />
                    </label>
                  ) : (
                    <label>
                      Presentación
                      <input
                        value={variant.label ?? ''}
                        maxLength={80}
                        required
                        onChange={(event) =>
                          updateVariant(variant.id, 'label', event.target.value)
                        }
                        placeholder="Unidad, negro, estuche…"
                      />
                    </label>
                  )}
                  <label>
                    SKU de presentación (opcional)
                    <input
                      aria-label={`SKU de presentación ${variantLabel(variant)}`}
                      value={variant.sku ?? ''}
                      maxLength={64}
                      pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,63}"
                      onChange={(event) =>
                        updateVariant(variant.id, 'sku', event.target.value)
                      }
                      onBlur={(event) =>
                        updateVariant(
                          variant.id,
                          'sku',
                          normalizeSku(event.target.value),
                        )
                      }
                      placeholder="Código único"
                    />
                  </label>
                  <label>
                    Precio (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.priceCents / 100}
                      onChange={(event) =>
                        updateVariant(
                          variant.id,
                          'priceCents',
                          Math.round(Number(event.target.value) * 100),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Stock
                    <input
                      aria-label={`Stock de presentación ${variantLabel(variant)}`}
                      type="number"
                      min="0"
                      step="1"
                      value={variant.stock}
                      onChange={(event) =>
                        updateVariant(
                          variant.id,
                          'stock',
                          Number(event.target.value),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={variant.active !== false}
                      onChange={(event) =>
                        updateVariant(
                          variant.id,
                          'active',
                          event.target.checked,
                        )
                      }
                    />
                    Presentación disponible en tienda
                  </label>
                  {form.product.variants.length > 1 ? (
                    <button
                      type="button"
                      className="admin-remove"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          product: {
                            ...current.product,
                            variants: current.product.variants.filter(
                              (item) => item.id !== variant.id,
                            ),
                          },
                        }))
                      }
                    >
                      Quitar presentación de {variantLabel(variant)}
                    </button>
                  ) : null}
                </fieldset>
              )
            })}
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={addVariant}
          >
            Añadir presentación
          </button>
        </section>

        <section aria-labelledby="product-visibility-title">
          <header>
            <span>05</span>
            <div>
              <h2 id="product-visibility-title">Visibilidad</h2>
            </div>
          </header>
          <div className="admin-checks">
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              Producto activo en tienda
            </label>
            {!state.features.complementsEnabled && !perfume ? (
              <p className="admin-inline-warning" role="status">
                Complementos está desactivado. Puedes preparar este producto;
                permanecerá oculto hasta habilitar la categoría en{' '}
                <Link to="/admin/home">Contenido del Home → Categorías</Link>.
              </p>
            ) : null}
            {!hasProductMainImage(form) && (
              <p className="admin-inline-warning" role="status">
                Borrador pendiente de fotos. Sube una imagen principal antes de
                publicar.
              </p>
            )}
            {!hasProductStock(form.product) ? (
              <p className="admin-inline-warning" role="status">
                Sin stock disponible: se guardará desactivado. Para volver a
                mostrarlo, repón stock y activa el producto.
              </p>
            ) : null}
          </div>
        </section>

        {message ? (
          <p
            id="admin-product-save-error"
            className="admin-error"
            role="alert"
            tabIndex={-1}
          >
            {message}
          </p>
        ) : null}
        <div className="admin-editor-actions">
          {hasUnsavedChanges ? (
            <span className="admin-product-save-state">
              Cambios sin guardar
            </span>
          ) : null}
          <Link className="button button--secondary" to={returnTo}>
            Cancelar
          </Link>
          <button
            type="button"
            className="button button--secondary admin-product-preview-open"
            onClick={() => {
              if (!mediaUploadRef.current) setShowPreview(true)
            }}
            disabled={mediaBusy || saving}
          >
            Vista previa
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={mediaBusy || saving}
          >
            {saving ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </form>
      <AdminSaveFeedback {...persistence} />
      <Dialog
        id="admin-product-preview"
        className="admin-product-preview-dialog"
        title="Vista previa del producto"
        open={showPreview}
        onClose={() => setShowPreview(false)}
      >
        {showPreview ? (
          <ProductDetailPreview
            record={{
              product: form.product,
              detail: {
                ...form.detail,
                notes: parseNoteDraft(noteDraft),
              },
            }}
            brands={state.brands.filter(
              (brand) => brand.active || brand.id === form.product.brandId,
            )}
            products={getStoreProducts()}
          />
        ) : null}
      </Dialog>
    </div>
  )
}
