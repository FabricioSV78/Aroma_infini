import { OlfactoryProfile } from '../product/OlfactoryProfile'
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
import {
  adminService,
  createAdminProductDetail,
  type AdminGender,
  type AdminProduct,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import type { ProductVariant } from '../../types/catalog'
import { AdminPagination } from './AdminPagination'
import {
  AdminBadge,
  AdminNotice,
  AdminPageHeader,
  AdminStatus,
} from './AdminShared'
import {
  getInventoryAlerts,
  getProductInventory,
  getVariantInventory,
} from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'

function productPrice(record: AdminProduct) {
  const active = record.product.variants.filter(
    (variant) => variant.active !== false,
  )
  return active.length
    ? formatPEN(Math.min(...active.map((variant) => variant.priceCents)))
    : 'Sin precio'
}

export function AdminProductsPage() {
  const state = useAdminStore()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [actionMessage, setActionMessage] = useState('')
  const search = params.get('q') ?? ''
  const stockFilter = ['alert', 'out', 'healthy'].includes(
    params.get('stock') ?? '',
  )
    ? (params.get('stock') as 'alert' | 'out' | 'healthy')
    : 'all'
  const visibilityFilter = ['active', 'inactive'].includes(
    params.get('visibilidad') ?? '',
  )
    ? (params.get('visibilidad') as 'active' | 'inactive')
    : 'all'
  const saved = params.get('guardado') === '1'
  const normalizedSearch = search.trim().toLocaleLowerCase('es')
  const activeBrandIds = new Set(
    state.brands.filter((brand) => brand.active).map((brand) => brand.id),
  )
  const visibleProducts = state.products.filter(
    (record) => record.active && activeBrandIds.has(record.product.brandId),
  )
  const inventoryAlerts = getInventoryAlerts(visibleProducts)
  const totalStock = visibleProducts.reduce(
    (total, record) => total + getProductInventory(record).totalStock,
    0,
  )
  const productRows = state.products.map((record) => ({
    record,
    brand: state.brands.find((item) => item.id === record.product.brandId),
    inventory: getProductInventory(record),
  }))
  const products = productRows
    .filter(({ record, brand, inventory }) => {
      const matchesSearch = `${record.product.name} ${brand?.name ?? ''}`
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
        (visibilityFilter === 'inactive' && !record.active)
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
  const pagination = useAdminPagination(products, 20)
  const hasFilters =
    Boolean(search) || stockFilter !== 'all' || visibilityFilter !== 'all'

  return (
    <div className="admin-page admin-products-page">
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Controla catálogo, presentaciones e inventario desde un solo lugar."
        action={{ label: 'Nuevo producto', to: '/admin/productos/nuevo' }}
      />
      {saved ? <AdminNotice>Producto guardado en memoria.</AdminNotice> : null}
      {actionMessage ? <AdminNotice>{actionMessage}</AdminNotice> : null}

      <section
        className="admin-inventory-summary"
        aria-label="Resumen de inventario"
      >
        <div>
          <span>Productos totales</span>
          <strong>{state.products.length}</strong>
        </div>
        <div>
          <span>Unidades activas</span>
          <strong>{totalStock}</strong>
        </div>
        <div className="is-warning">
          <span>Stock bajo</span>
          <strong>
            {inventoryAlerts.filter((item) => item.tone === 'warning').length}
          </strong>
        </div>
        <div className="is-danger">
          <span>Agotadas</span>
          <strong>
            {inventoryAlerts.filter((item) => item.tone === 'danger').length}
          </strong>
        </div>
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
            Buscar producto o marca
            <input
              id="admin-product-search"
              name="q"
              key={search}
              defaultValue={search}
              type="search"
              placeholder="Producto o marca"
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
            </select>
          </label>
          <button className="button button--primary" type="submit">
            <Icon name="search" /> Aplicar
          </button>
        </div>
        <div className="admin-filter-result" aria-live="polite">
          <span>
            {products.length} {products.length === 1 ? 'producto' : 'productos'}
          </span>
          {hasFilters ? (
            <button type="button" onClick={() => setParams({})}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>
      <div className="admin-table-wrap admin-table-wrap--products">
        <table className="admin-table admin-table--products">
          <caption className="sr-only">Productos de demostración</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Inventario</th>
              <th scope="col">Precio desde</th>
              <th scope="col">Visibilidad</th>
              <th scope="col">Destacado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map(({ record, brand, inventory }) => {
              return (
                <tr key={record.product.id}>
                  <th scope="row">
                    <span className="admin-cell-label">Producto</span>
                    <div className="admin-product-identity">
                      <img
                        src={`/images/${record.product.image}-480.webp`}
                        width={54}
                        height={68}
                        loading="lazy"
                        alt=""
                      />
                      <span>
                        <strong>{record.product.name}</strong>
                        <small>{brand?.name}</small>
                      </span>
                    </div>
                  </th>
                  <td>
                    <span className="admin-cell-label">Inventario</span>
                    <ul className="admin-stock-list">
                      {inventory.variants.map((variant) => (
                        <li key={variant.variantId}>
                          <span>{variant.ml} ml</span>
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
                    <AdminStatus active={record.active} />
                  </td>
                  <td>
                    <span className="admin-cell-label">Destacado</span>
                    <AdminBadge tone={record.featured ? 'info' : 'neutral'}>
                      {record.featured ? 'Sí' : 'No'}
                    </AdminBadge>
                  </td>
                  <td>
                    <span className="admin-cell-label">Acciones</span>
                    <div className="admin-row-actions">
                      <Link
                        to={`/admin/productos/${record.product.id}`}
                        state={{
                          returnTo: `${location.pathname}${location.search}`,
                        }}
                      >
                        Editar{' '}
                        <span className="sr-only">{record.product.name}</span>
                      </Link>
                      <button
                        type="button"
                        aria-pressed={record.active}
                        onClick={() => {
                          const result = adminService.setProductActive(
                            record.product.id,
                            !record.active,
                          )
                          setActionMessage(
                            result.kind === 'saved'
                              ? `Producto ${record.active ? 'desactivado' : 'activado'}.`
                              : result.message,
                          )
                        }}
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
      <AdminPagination
        label="productos"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
      {!products.length ? (
        <div className="admin-empty">
          <Icon name="search" />
          <h2>No encontramos productos</h2>
          <p>Prueba con otra búsqueda o limpia los filtros aplicados.</p>
          <button
            type="button"
            onClick={() => {
              setParams({})
            }}
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : null}
    </div>
  )
}

const imageOptions = [
  { value: 'cedre', label: 'Bois Clair · frasco claro' },
  { value: 'petale', label: 'Pétale Nu · frasco rosado' },
  { value: 'sillage', label: 'Vert Silence · frasco verde' },
  { value: 'ambre', label: 'Ambre Lent · frasco ámbar' },
] as const

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
      variants: record.product.variants.map((variant) => ({ ...variant })),
    },
    detail: {
      ...record.detail,
      notes: {
        top: [...record.detail.notes.top],
        heart: [...record.detail.notes.heart],
        base: [...record.detail.notes.base],
      },
      gallery: record.detail.gallery.map((image) => ({ ...image })),
      recommendationIds: [...record.detail.recommendationIds],
    },
  }
}

function createProductDraft(brandId: string): AdminProduct {
  const id = `product-${crypto.randomUUID().slice(0, 8)}`
  const product = {
    id,
    slug: '',
    name: '',
    brandId,
    image: 'cedre',
    family: '',
    variants: [
      {
        id: `${id}-50`,
        ml: 50,
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
    featured: false,
    gender: 'unisex',
    popularity: 999,
    newest: Date.now(),
    lowStockThreshold: 2,
  }
}

export function AdminProductFormPage() {
  const { id } = useParams()
  const state = useAdminStore()
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
    return stored ? cloneRecord(stored) : createProductDraft(defaultBrandId)
  })
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(() =>
    createNoteDraft(form.detail.notes),
  )
  const [initialSnapshot] = useState(() => JSON.stringify({ form, noteDraft }))
  const [message, setMessage] = useState('')
  const editing = Boolean(id)
  const hasUnsavedChanges =
    JSON.stringify({ form, noteDraft }) !== initialSnapshot
  const allowNavigation = useRef(false)
  const blocker = useBlocker(
    () => hasUnsavedChanges && !allowNavigation.current,
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
    if (blocker.state !== 'blocked') return
    if (
      window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?')
    )
      blocker.proceed()
    else blocker.reset()
  }, [blocker])

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
        <h1>No existe este registro de demostración.</h1>
        <Link className="text-link" to="/admin/productos">
          Volver a productos <Icon name="arrow" />
        </Link>
      </div>
    )

  function updateProduct(
    field: 'name' | 'slug' | 'brandId' | 'image' | 'family',
    value: string,
  ) {
    setMessage('')
    setForm((current) => {
      const product = { ...current.product, [field]: value }
      const shouldUpdateGallery = field === 'image' || field === 'name'
      return {
        ...current,
        product,
        detail: shouldUpdateGallery
          ? {
              ...current.detail,
              gallery: current.detail.gallery.map((view, index) => ({
                ...view,
                image:
                  index === 0 ? product.image : `${product.image}-alternate`,
                alt:
                  index === 0
                    ? `Vista conceptual de ${product.name}; imagen temporal`
                    : `Vista alternativa conceptual de ${product.name}; imagen temporal`,
              })),
            }
          : current.detail,
      }
    })
  }

  function updateVariant(
    variantId: string,
    field: keyof Pick<ProductVariant, 'ml' | 'priceCents' | 'stock' | 'active'>,
    value: number | boolean,
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
    setForm((current) => ({
      ...current,
      product: {
        ...current.product,
        variants: [
          ...current.product.variants,
          {
            id: `${current.product.id}-${crypto.randomUUID().slice(0, 6)}`,
            ml: 100,
            priceCents: 0,
            stock: 0,
            active: true,
          },
        ],
      },
    }))
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const productToSave = {
      ...form,
      detail: {
        ...form.detail,
        notes: parseNoteDraft(noteDraft),
      },
    }
    setForm(productToSave)
    const result = adminService.saveProduct(productToSave)
    if (result.kind === 'validation') {
      setMessage(result.message)
      return
    }
    allowNavigation.current = true
    const destination = new URL(returnTo, window.location.origin)
    destination.searchParams.set('guardado', '1')
    navigate(`${destination.pathname}${destination.search}`)
  }

  return (
    <div className="admin-page admin-editor-page">
      <Link className="admin-back" to={returnTo}>
        ← Volver
      </Link>
      <AdminPageHeader
        eyebrow={editing ? 'Editar producto' : 'Nuevo producto'}
        title={editing ? form.product.name : 'Crear producto'}
        description="Actualiza información, inventario y visibilidad."
      />
      <form className="admin-editor" onSubmit={submit}>
        <section aria-labelledby="product-general-title">
          <header>
            <span>01</span>
            <div>
              <h2 id="product-general-title">Información general</h2>
              <p>Identidad y clasificación principal.</p>
            </div>
          </header>
          <div className="admin-fields">
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
                onChange={(event) =>
                  updateProduct('slug', event.target.value.toLowerCase())
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </label>
            <label>
              Marca
              <select
                value={form.product.brandId}
                onChange={(event) =>
                  updateProduct('brandId', event.target.value)
                }
                required
              >
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
            <label>
              Categoría
              <select
                value={form.gender}
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
            <label>
              Fotografía del catálogo
              <select
                value={form.product.image}
                onChange={(event) => updateProduct('image', event.target.value)}
              >
                {imageOptions.map((image) => (
                  <option key={image.value} value={image.value}>
                    {image.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section aria-labelledby="product-preview-title">
          <header>
            <div>
              <h2 id="product-preview-title">Así se verá tu producto</h2>
              <p>Vista previa del borrador, antes de guardar.</p>
            </div>
          </header>
          <div className="admin-product-live-preview">
            <div className="admin-product-preview-photos">
              <img
                src={'/images/' + form.product.image + '-480.webp'}
                alt="Fotografía principal seleccionada"
                width={480}
                height={600}
              />
              <img
                src={'/images/' + form.product.image + '-alternate-480.webp'}
                alt="Fotografía alternativa seleccionada"
                width={480}
                height={600}
              />
            </div>
            <div>
              <p className="eyebrow">
                {
                  state.brands.find(
                    (brand) => brand.id === form.product.brandId,
                  )?.name
                }
              </p>
              <h3>{form.product.name || 'Nombre del perfume'}</h3>
              <p>{form.detail.shortDescription}</p>
              <ul>
                {form.product.variants
                  .filter((variant) => variant.active !== false)
                  .map((variant) => (
                    <li key={variant.id}>
                      <strong>
                        {variant.ml} ml · {formatPEN(variant.priceCents)}
                      </strong>
                      <span>
                        {variant.stock > 0 ? 'Disponible' : 'Agotado'}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="admin-data-note">
                {form.active
                  ? 'Visible en la tienda al guardar.'
                  : 'Borrador oculto en la tienda.'}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="product-content-title">
          <header>
            <span>02</span>
            <div>
              <h2 id="product-content-title">Contenido olfativo</h2>
              <p>
                Edita el perfil tal como lo verá el cliente. Los cambios se
                publican al guardar.
              </p>
            </div>
          </header>
          <div className="admin-olfactory-editor">
            <OlfactoryProfile
              family={form.product.family}
              detail={form.detail}
              editor={{
                family: (
                  <input
                    aria-label="Familia olfativa"
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
                    value={form.detail.intensityLevel}
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
                        Notas de{' '}
                        {note === 'top'
                          ? 'salida'
                          : note === 'heart'
                            ? 'corazón'
                            : 'fondo'}
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
              <small>Texto breve junto al precio y las presentaciones.</small>
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
        </section>

        <section aria-labelledby="product-variants-title">
          <header>
            <span>03</span>
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
              Se mostrará una alerta cuando cualquier presentación tenga estas
              unidades o menos.
            </p>
          </div>
          <div className="admin-variant-list">
            {form.product.variants.map((variant, index) => {
              const inventory = getVariantInventory(form, variant)
              return (
                <fieldset key={variant.id}>
                  <legend>Presentación {index + 1}</legend>
                  <div className="admin-variant-status">
                    <strong>{variant.ml} ml</strong>
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
                  <label>
                    Mililitros
                    <input
                      type="number"
                      min="1"
                      value={variant.ml}
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
                      aria-label={`Stock de presentación ${variant.ml} ml`}
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
                    Variante activa
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
                      Quitar presentación
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
            <span>04</span>
            <div>
              <h2 id="product-visibility-title">Visibilidad</h2>
              <p>Control de publicación en la tienda.</p>
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
            {form.active &&
            !form.product.variants.some(
              (variant) => variant.active !== false && variant.stock > 0,
            ) ? (
              <p className="admin-inline-warning" role="status">
                Este producto quedará visible, pero ninguna presentación podrá
                comprarse.
              </p>
            ) : null}
            <p className="admin-data-note">
              La selección y el orden de destacados se administran en el módulo{' '}
              <Link to="/admin/home">Home</Link>.
            </p>
          </div>
        </section>

        {message ? (
          <p className="admin-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="admin-editor-actions">
          <button className="button button--primary" type="submit">
            Guardar producto
          </button>
          <Link className="button button--secondary" to={returnTo}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
