import { variantSkuSummary } from '../../domain/product-identity'
import { getProductPhotoStatus } from '../../domain/product-photos'
import { hasProductMainImage } from '../../domain/product-publication'
import { isPerfume, variantLabel } from '../../domain/product-type'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { type AdminBrand, type AdminProduct } from '../../services/admin-service'
import { catalogAdminService as adminService } from '../../services/catalog-admin-service'
import { formatPEN } from '../../services/currency'
import { getVariantPrice } from '../../services/product-discounts'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { AdminPagination } from './AdminPagination'
import { AdminBadge, AdminPageHeader, AdminStatus } from './AdminShared'
import { getProductInventory } from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { AdminProductImport } from './AdminProductImport'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminNotice } from './AdminNoticeProvider'
import './admin-products.css'

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
  const visibilityPersistence = useAdminSave({ catalog: true })
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
  const brandsById = useMemo(() => {
    const byId = new Map<string, AdminBrand>()
    for (const brand of state.brands) {
      if (!byId.has(brand.id)) byId.set(brand.id, brand)
    }
    return byId
  }, [state.brands])
  const productRows = useMemo(
    () =>
      state.products.map((record) => ({
        record,
        brand: brandsById.get(record.product.brandId),
        inventory: getProductInventory(record),
      })),
    [state.products, brandsById],
  )
  const { totalStock, productsWithAlerts, soldOutProducts } = useMemo(() => {
    const activeInventory = productRows
      .filter(({ record }) => record.active)
      .map(({ inventory }) => inventory)
    return {
      totalStock: activeInventory.reduce(
        (total, inventory) => total + inventory.totalStock,
        0,
      ),
      productsWithAlerts: new Set(
        productRows
          .filter(({ inventory }) => inventory.alerts.length > 0)
          .map(({ record }) => record.product.id),
      ).size,
      soldOutProducts: productRows.filter(
        ({ inventory }) => inventory.fullyOutOfStock,
      ).length,
    }
  }, [productRows])
  const products = useMemo(
    () =>
      productRows
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
            (visibilityFilter === 'pending-images' &&
              !hasProductMainImage(record))
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
        }),
    [productRows, normalizedSearch, stockFilter, visibilityFilter],
  )
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
                            srcSet={imageSourceSet(
                              record.product.image,
                              [480, 960],
                            )}
                            sizes="(min-width: 768px) and (max-width: 1100px) 42px, 54px"
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
                            {variantSkuSummary(record.product.variants)} ·{' '}
                            {photos.count}/{photos.expected} fotos
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
