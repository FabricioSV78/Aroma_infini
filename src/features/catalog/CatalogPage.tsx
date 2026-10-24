import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Link,
  useLoaderData,
  useLocation,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from 'react-router'
import { orders } from '../../services/catalog-service'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { catalogLoader } from './catalog-loaders'
import { ProductCard } from '../home/ProductCard'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { PRODUCT_TYPES } from '../../domain/product-type'

type FilterGroupId = 'type' | 'brand' | 'gender' | 'family' | 'price'

function CatalogFilterGroup({
  id,
  title,
  initiallyOpen,
  initialCount,
  children,
}: {
  id: FilterGroupId
  title: string
  initiallyOpen: boolean
  initialCount: number
  children: ReactNode
}) {
  const [draftCount, setDraftCount] = useState(initialCount)

  function updateDraftCount(event: FormEvent<HTMLDetailsElement>) {
    const inputs =
      event.currentTarget.querySelectorAll<HTMLInputElement>('input')
    setDraftCount(
      id === 'price'
        ? Number(Array.from(inputs).some((input) => input.value.trim() !== ''))
        : Array.from(inputs).filter((input) => input.checked).length,
    )
  }

  return (
    <details
      className="catalog-filter-group"
      data-filter-group={id}
      open={initiallyOpen}
      onChange={updateDraftCount}
      onInput={updateDraftCount}
    >
      <summary>
        <span>{title}</span>
        {draftCount > 0 && (
          <span className="catalog-filter-group__count">
            {draftCount}
            <span className="sr-only">
              {' '}
              {draftCount === 1 ? 'seleccionado' : 'seleccionados'}
            </span>
          </span>
        )}
      </summary>
      <div className="catalog-filter-group__content">{children}</div>
    </details>
  )
}

export function CatalogPage() {
  const offerPriceRevision = useOfferPriceRevision()
  const data = useLoaderData<typeof catalogLoader>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const loading = navigation.state !== 'idle' || revalidator.state !== 'idle'
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftTypes, setDraftTypes] = useState<string[] | null>(null)
  const [scrollResultsOnApply, setScrollResultsOnApply] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const sidebarTitle = useRef<HTMLHeadingElement>(null)
  const sidebarSummary = useRef<HTMLElement>(null)
  const previousOfferPriceRevision = useRef(offerPriceRevision)
  useEffect(() => {
    if (previousOfferPriceRevision.current === offerPriceRevision) return
    previousOfferPriceRevision.current = offerPriceRevision
    revalidator.revalidate()
  }, [offerPriceRevision, revalidator])
  useEffect(
    function closeMobileFiltersOnDesktop() {
      const desktop = window.matchMedia('(min-width: 1024px)')
      function handleResize() {
        if (desktop.matches && filtersOpen) {
          setFiltersOpen(false)
          requestAnimationFrame(() =>
            (sidebarSummary.current ?? sidebarTitle.current)?.focus({
              preventScroll: true,
            }),
          )
        }
      }
      desktop.addEventListener('change', handleResize)
      return () => desktop.removeEventListener('change', handleResize)
    },
    [filtersOpen],
  )
  useEffect(() => {
    if (!scrollResultsOnApply || navigation.state !== 'idle') return
    const frame = requestAnimationFrame(() => {
      toolbar.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      })
      setScrollResultsOnApply(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollResultsOnApply, navigation.state, location.search])
  const searchMode = location.pathname === '/buscar'
  const title =
    data.kind === 'ready' && data.brand
      ? data.brand.name
      : searchMode
        ? 'Encuentra tu aroma'
        : data.kind === 'ready' &&
            data.query.productTypes.length === 1 &&
            data.query.productTypes[0] === 'complemento'
          ? 'Complementos'
          : 'Explora la tienda'
  function update(patch: Record<string, string | string[] | null>) {
    setDraftTypes(null)
    const next = new URLSearchParams(params)
    next.delete('pagina')
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key)
      if (Array.isArray(value)) value.forEach((item) => next.append(key, item))
      else if (value) next.set(key, value)
    }
    setParams(next, { preventScrollReset: true })
  }
  function clearFilters() {
    update({
      marca: null,
      tipo: null,
      genero: null,
      familia: null,
      min: null,
      max: null,
    })
  }
  function closeFilters() {
    setFiltersOpen(false)
    setDraftTypes(null)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const types = fields.getAll('tipo').map(String)
    const onlyComplements = types.length === 1 && types[0] === 'complemento'
    const min = fields.get('min')?.toString() ?? ''
    const max = fields.get('max')?.toString() ?? ''
    const maxField = event.currentTarget.elements.namedItem(
      'max',
    ) as HTMLInputElement
    maxField.setCustomValidity(
      min && max && Number(min) > Number(max)
        ? 'El precio máximo debe ser mayor o igual al mínimo.'
        : '',
    )
    const invalidField =
      event.currentTarget.querySelector<HTMLInputElement>('input:invalid')
    if (invalidField) invalidField.closest('details')!.open = true
    if (!event.currentTarget.reportValidity()) return
    update({
      marca: fields.getAll('marca').map(String),
      tipo: types,
      genero: onlyComplements ? null : fields.getAll('genero').map(String),
      familia: onlyComplements ? null : fields.getAll('familia').map(String),
      min,
      max,
    })
    if (!filtersOpen) setScrollResultsOnApply(true)
    if (filtersOpen) closeFilters()
  }
  if (data.kind !== 'ready')
    return (
      <section
        className="store-page catalog-page container catalog-empty"
        data-scroll-reveal="fade"
      >
        <p className="eyebrow">
          {data.kind === 'missing'
            ? 'Marca no encontrada'
            : 'No pudimos cargar la selección'}
        </p>
        <h1>
          {data.kind === 'missing'
            ? 'Esta marca no está en la selección'
            : 'Volvamos a intentarlo'}
        </h1>
        {data.kind === 'error' && (
          <>
            <InlineStatus role="alert">
              No se pudo consultar el catálogo. Vuelve a intentarlo para ver los
              productos.
            </InlineStatus>
            {loading ? (
              <InlineStatus busy>Consultando productos…</InlineStatus>
            ) : null}
            <button
              className="button button--primary"
              disabled={loading}
              onClick={() => revalidator.revalidate()}
            >
              Reintentar
            </button>
          </>
        )}
        <Link className="text-link" to="/tienda">
          Explorar tienda
        </Link>
      </section>
    )
  const { query, brand, brands, genders, families, features } = data
  const selectedTypes = draftTypes ?? query.productTypes
  const onlyComplements =
    selectedTypes.length === 1 && selectedTypes[0] === 'complemento'
  const count =
    (brand ? 0 : query.brands.length) +
    query.productTypes.length +
    query.genders.length +
    query.families.length +
    Number(Boolean(query.min || query.max))
  const compactSidebar = searchMode && data.total === 1
  function renderFilterForm(surface: 'sidebar' | 'dialog') {
    const keySuffix = `${surface}-${params.toString()}`
    return (
      <form onSubmit={applyFilters} className="catalog-filter-form" noValidate>
        <div className="catalog-filter-fields">
          {features.complementsEnabled && (
            <CatalogFilterGroup
              key={`type-${keySuffix}`}
              id="type"
              title="Tipo de producto"
              initiallyOpen={surface === 'sidebar'}
              initialCount={query.productTypes.length}
            >
              <fieldset>
                <legend className="sr-only">Tipo de producto</legend>
                {PRODUCT_TYPES.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      name="tipo"
                      value={item.value}
                      defaultChecked={query.productTypes.includes(item.value)}
                      onChange={(event) =>
                        setDraftTypes(
                          new FormData(event.currentTarget.form!)
                            .getAll('tipo')
                            .map(String),
                        )
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>
            </CatalogFilterGroup>
          )}
          {!brand && (
            <CatalogFilterGroup
              key={`brand-${keySuffix}`}
              id="brand"
              title="Marca"
              initiallyOpen={surface === 'sidebar'}
              initialCount={query.brands.length}
            >
              <fieldset>
                <legend className="sr-only">Marca</legend>
                {brands.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      name="marca"
                      value={item.slug}
                      defaultChecked={query.brands.includes(item.slug)}
                    />
                    {item.name}
                  </label>
                ))}
              </fieldset>
            </CatalogFilterGroup>
          )}
          {!onlyComplements && (
            <CatalogFilterGroup
              key={`gender-${keySuffix}`}
              id="gender"
              title="Género"
              initiallyOpen={false}
              initialCount={query.genders.length}
            >
              <fieldset>
                <legend className="sr-only">Género</legend>
                {genders.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      name="genero"
                      value={item.value}
                      defaultChecked={query.genders.includes(item.value)}
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>
            </CatalogFilterGroup>
          )}
          {!onlyComplements && families.length > 0 && (
            <CatalogFilterGroup
              key={`family-${keySuffix}`}
              id="family"
              title="Familia olfativa"
              initiallyOpen={surface === 'sidebar'}
              initialCount={query.families.length}
            >
              <fieldset>
                <legend className="sr-only">Familia olfativa</legend>
                {families.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      name="familia"
                      value={item.value}
                      defaultChecked={query.families.includes(item.value)}
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>
            </CatalogFilterGroup>
          )}
          <CatalogFilterGroup
            key={`price-${keySuffix}`}
            id="price"
            title="Precio en soles"
            initiallyOpen={false}
            initialCount={Number(Boolean(query.min || query.max))}
          >
            <fieldset>
              <legend className="sr-only">Precio en soles</legend>
              <div className="catalog-price-fields">
                <label>
                  Mínimo
                  <input
                    type="number"
                    name="min"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={query.min}
                    onInput={(event) =>
                      (
                        event.currentTarget.form?.elements.namedItem(
                          'max',
                        ) as HTMLInputElement
                      ).setCustomValidity('')
                    }
                  />
                </label>
                <label>
                  Máximo
                  <input
                    type="number"
                    name="max"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={query.max}
                    onInput={(event) =>
                      event.currentTarget.setCustomValidity('')
                    }
                  />
                </label>
              </div>
            </fieldset>
          </CatalogFilterGroup>
        </div>
        <div className="catalog-filter-actions">
          <button
            type="button"
            className="text-link"
            onClick={(event) => {
              const form = event.currentTarget.form!
              setDraftTypes([])
              form
                .querySelectorAll<HTMLInputElement>('input')
                .forEach((input) => {
                  input.checked = false
                  input.value = input.type === 'number' ? '' : input.value
                  input.setCustomValidity('')
                })
              form
                .querySelectorAll<HTMLDetailsElement>('.catalog-filter-group')
                .forEach((group) =>
                  group.dispatchEvent(new Event('input', { bubbles: true })),
                )
            }}
          >
            Limpiar selección
          </button>
          <button className="button button--primary" disabled={loading}>
            Aplicar filtros
          </button>
        </div>
      </form>
    )
  }
  return (
    <div className="store-page catalog-page container">
      <div className="catalog-intro">
        <nav
          className="catalog-breadcrumb"
          aria-label="Ruta de navegación"
          data-scroll-reveal="fade"
        >
          <Link to="/">Inicio</Link>
          <span aria-hidden="true">/</span>
          {brand ? (
            <>
              <Link to="/marcas">Marcas</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{brand.name}</span>
            </>
          ) : (
            <span aria-current="page">
              {searchMode ? 'Búsqueda' : 'Tienda'}
            </span>
          )}
        </nav>
        <header className="catalog-heading" data-scroll-reveal="copy">
          <div>
            <p className={brand ? 'eyebrow' : 'eyebrow brand-label'}>
              {brand ? 'Universo de marca' : 'La selección de Aroma Infini'}
            </p>
            <h1>{title}</h1>
          </div>
          <p>
            {brand
              ? `Conoce los productos de ${brand.name} y sus presentaciones.`
              : data.features.complementsEnabled
                ? 'Descubre perfumes y complementos, compara sus presentaciones y encuentra tu elección.'
                : 'Descubre perfumes, compara sus presentaciones y encuentra tu elección.'}
          </p>
        </header>
      </div>
      {searchMode && (
        <form
          className="catalog-search"
          role="search"
          data-scroll-reveal="copy"
          onSubmit={(event) => {
            event.preventDefault()
            update({
              q:
                new FormData(event.currentTarget).get('q')?.toString().trim() ??
                '',
            })
          }}
        >
          <label htmlFor="catalog-search">Producto o marca</label>
          <div>
            <input
              key={query.search}
              id="catalog-search"
              type="search"
              name="q"
              defaultValue={query.search}
              maxLength={100}
            />
            <button className="button button--primary" disabled={loading}>
              Buscar
            </button>
          </div>
        </form>
      )}
      {data.availableTotal === 0 ? (
        <EmptyState
          className="catalog-empty"
          icon="store"
          title="No hay productos disponibles"
          description="Puedes volver a consultar la selección más adelante."
          role="status"
        >
          <Link className="text-link" to="/">
            Volver al inicio
          </Link>
        </EmptyState>
      ) : searchMode && !query.search ? (
        <EmptyState
          className="catalog-empty"
          icon="search"
          title="¿Qué producto tienes en mente?"
          description="Escribe un nombre de producto o una marca para empezar."
        >
          <Link className="text-link" to="/tienda">
            Explorar la tienda
          </Link>
        </EmptyState>
      ) : searchMode && query.search && data.total === 0 ? (
        <EmptyState
          className="catalog-empty catalog-empty--search"
          icon="search"
          title="No encontramos coincidencias"
          description="Prueba con otro nombre de producto o marca."
          role="status"
        >
          {count > 0 ? (
            <button className="button button--secondary" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : (
            <Link className="text-link" to="/tienda">
              Explorar la tienda
            </Link>
          )}
        </EmptyState>
      ) : (
        <div
          className={
            compactSidebar
              ? 'catalog-layout catalog-layout--single-result'
              : 'catalog-layout'
          }
        >
          <aside
            className={
              compactSidebar
                ? 'catalog-sidebar catalog-sidebar--compact'
                : 'catalog-sidebar'
            }
            aria-label="Filtros de la tienda"
            data-scroll-reveal="copy"
          >
            {compactSidebar ? (
              <details className="catalog-filter-disclosure">
                <summary ref={sidebarSummary}>
                  Filtrar resultados{count ? ` (${count})` : ''}
                </summary>
                <div className="catalog-filter-disclosure-content">
                  {renderFilterForm('sidebar')}
                </div>
              </details>
            ) : (
              <>
                <h2 ref={sidebarTitle} tabIndex={-1}>
                  Filtrar por
                </h2>
                {renderFilterForm('sidebar')}
              </>
            )}
          </aside>
          <div className="catalog-listing">
            <div
              ref={toolbar}
              className="catalog-toolbar"
              data-scroll-reveal="copy"
            >
              <button
                ref={trigger}
                className="button button--secondary catalog-filter-trigger"
                onClick={() => setFiltersOpen(true)}
                aria-haspopup="dialog"
              >
                Filtros{count ? ` (${count})` : ''}
              </button>
              {loading ? (
                <InlineStatus busy>Actualizando productos…</InlineStatus>
              ) : (
                <p role="status" aria-live="polite">
                  {data.total} {data.total === 1 ? 'producto' : 'productos'}
                  {query.search && <> para «{query.search}»</>}
                </p>
              )}
              <label className="catalog-sort">
                <span id="catalog-sort-label">Ordenar</span>
                <select
                  aria-labelledby="catalog-sort-label"
                  value={query.order}
                  onChange={(event) => update({ orden: event.target.value })}
                >
                  {orders.map((order) => (
                    <option key={order.value} value={order.value}>
                      {order.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {count > 0 && (
              <div className="catalog-chips" aria-label="Filtros activos">
                {!brand &&
                  query.brands.map((slug) => (
                    <button
                      key={slug}
                      onClick={() =>
                        update({
                          marca: query.brands.filter((item) => item !== slug),
                        })
                      }
                      aria-label={`Quitar ${data.brands.find((item) => item.slug === slug)?.name}`}
                    >
                      {data.brands.find((item) => item.slug === slug)?.name} ×
                    </button>
                  ))}
                {query.productTypes.map((value) => (
                  <button
                    key={value}
                    aria-label={`Quitar ${PRODUCT_TYPES.find((item) => item.value === value)?.label}`}
                    onClick={() =>
                      update({
                        tipo: query.productTypes.filter(
                          (item) => item !== value,
                        ),
                      })
                    }
                  >
                    {PRODUCT_TYPES.find((item) => item.value === value)?.label}{' '}
                    ×
                  </button>
                ))}
                {query.genders.map((value) => (
                  <button
                    key={value}
                    onClick={() =>
                      update({
                        genero: query.genders.filter((item) => item !== value),
                      })
                    }
                    aria-label={`Quitar ${data.genders.find((item) => item.value === value)?.label}`}
                  >
                    {data.genders.find((item) => item.value === value)?.label} ×
                  </button>
                ))}
                {query.families.map((value) => {
                  const label =
                    data.families.find((item) => item.value === value)?.label ??
                    value
                  return (
                    <button
                      key={value}
                      onClick={() =>
                        update({
                          familia: query.families.filter(
                            (item) => item !== value,
                          ),
                        })
                      }
                      aria-label={`Quitar familia olfativa ${label}`}
                    >
                      {label} ×
                    </button>
                  )
                })}
                {(query.min || query.max) && (
                  <button onClick={() => update({ min: null, max: null })}>
                    Precio: S/ {query.min || '0'} —{' '}
                    {query.max ? 'S/ ' + query.max : 'sin límite'} ×
                  </button>
                )}
                <button className="catalog-clear" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>
            )}
            <div className="catalog-results" aria-busy={loading}>
              {data.total ? (
                <div className="product-grid" data-scroll-reveal="stagger">
                  {data.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      headingLevel={2}
                      brand={data.brands.find(
                        (item) => item.id === product.brandId,
                      )}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  className="catalog-empty"
                  icon="search"
                  title="No encontramos coincidencias"
                  description="Prueba con otra búsqueda o ajusta los filtros."
                >
                  {count > 0 && (
                    <button
                      className="button button--secondary"
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  )}
                  {count === 0 ? (
                    <Link className="text-link" to="/tienda">
                      Explorar la tienda
                    </Link>
                  ) : null}
                </EmptyState>
              )}
            </div>
            {data.pages > 1 && (
              <nav
                className="catalog-pagination"
                aria-label="Páginas de la tienda"
                data-scroll-reveal="copy"
              >
                {Array.from(
                  { length: data.pages },
                  (_, index) => index + 1,
                ).map((page) => {
                  const next = new URLSearchParams(params)
                  next.set('pagina', String(page))
                  return (
                    <Link
                      key={page}
                      to={'?' + next.toString()}
                      aria-current={data.page === page ? 'page' : undefined}
                      aria-label={`Página ${page}`}
                    >
                      {page}
                    </Link>
                  )
                })}
              </nav>
            )}
          </div>
        </div>
      )}
      <Dialog
        id="catalog-filters"
        title="Afinar la selección"
        open={filtersOpen}
        onClose={closeFilters}
        className="catalog-filter-dialog"
      >
        {filtersOpen && renderFilterForm('dialog')}
      </Dialog>
    </div>
  )
}
