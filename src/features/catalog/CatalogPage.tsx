import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useLoaderData,
  useLocation,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from 'react-router'
import { orders } from '../../services/catalog-service'
import { catalogLoader } from './catalog-loaders'
import { ProductCard } from '../home/ProductCard'
import { Dialog } from '../../components/ui/Dialog'

export function CatalogPage() {
  const data = useLoaderData<typeof catalogLoader>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const sidebarTitle = useRef<HTMLHeadingElement>(null)
  useEffect(
    function closeMobileFiltersOnDesktop() {
      const desktop = window.matchMedia('(min-width: 1024px)')
      function handleResize() {
        if (desktop.matches && filtersOpen) {
          setFiltersOpen(false)
          requestAnimationFrame(() =>
            sidebarTitle.current?.focus({ preventScroll: true }),
          )
        }
      }
      desktop.addEventListener('change', handleResize)
      return () => desktop.removeEventListener('change', handleResize)
    },
    [filtersOpen],
  )
  const searchMode = location.pathname === '/buscar'
  const title =
    data.kind === 'ready' && data.brand
      ? data.brand.name
      : searchMode
        ? 'Encuentra tu aroma.'
        : 'Elige tu próxima fragancia.'
  function update(patch: Record<string, string | string[] | null>) {
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
    update({ marca: null, genero: null, min: null, max: null, seleccion: null })
  }
  function closeFilters() {
    setFiltersOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
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
    if (!event.currentTarget.reportValidity()) return
    update({
      marca: fields.getAll('marca').map(String),
      genero: fields.getAll('genero').map(String),
      min,
      max,
    })
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
            ? 'Esta marca no está en la selección.'
            : 'Volvamos a intentarlo.'}
        </h1>
        {data.kind === 'error' && (
          <button
            className="button button--primary"
            onClick={() => revalidator.revalidate()}
          >
            Reintentar
          </button>
        )}
        <Link className="text-link" to="/catalogo">
          Explorar catálogo
        </Link>
      </section>
    )
  const { query, brand } = data
  const count =
    (brand ? 0 : query.brands.length) +
    query.genders.length +
    Number(Boolean(query.min || query.max)) +
    Number(query.featured)
  const filterForm = (
    <form onSubmit={applyFilters} className="catalog-filter-form">
      {!brand && (
        <fieldset key={'brands-' + params.toString()}>
          <legend>Marca</legend>
          {data.brands.map((item) => (
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
      )}
      <fieldset key={'gender-' + params.toString()}>
        <legend>Género</legend>
        {data.genders.map((item) => (
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
      <fieldset key={'price-' + params.toString()}>
        <legend>Precio en soles</legend>
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
              onInput={(event) => event.currentTarget.setCustomValidity('')}
            />
          </label>
        </div>
      </fieldset>
      <div className="catalog-filter-actions">
        <button
          type="button"
          className="text-link"
          onClick={(event) => {
            const form = event.currentTarget.form!
            form
              .querySelectorAll<HTMLInputElement>('input')
              .forEach((input) => {
                input.checked = false
                input.value = input.type === 'number' ? '' : input.value
                input.setCustomValidity('')
              })
          }}
        >
          Limpiar selección
        </button>
        <button className="button button--primary">Aplicar filtros</button>
      </div>
    </form>
  )
  return (
    <div className="store-page catalog-page container">
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
            {searchMode ? 'Búsqueda' : 'Perfumes'}
          </span>
        )}
      </nav>
      <header className="catalog-heading" data-scroll-reveal="copy">
        <div>
          <p className="eyebrow">
            {brand ? 'Universo de marca' : 'La selección de Aroma Infini'}
          </p>
          <h1>{title}</h1>
        </div>
        <p>
          {brand
            ? 'Descubre sus perfumes y presentaciones.'
            : 'Distintas firmas. Una forma muy personal de elegir.'}
        </p>
      </header>
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
          <label htmlFor="catalog-search">Perfume o marca</label>
          <div>
            <input
              key={query.search}
              id="catalog-search"
              type="search"
              name="q"
              defaultValue={query.search}
              maxLength={100}
            />
            <button className="button button--primary">Buscar</button>
          </div>
        </form>
      )}
      {searchMode && !query.search ? (
        <section className="catalog-empty" data-scroll-reveal="copy">
          <h2>¿Qué perfume tienes en mente?</h2>
          <p>Escribe un nombre de perfume o una marca para empezar.</p>
          <Link className="text-link" to="/catalogo">
            Explorar todos los perfumes
          </Link>
        </section>
      ) : (
        <div className="catalog-layout">
          <aside
            className="catalog-sidebar"
            aria-label="Filtros del catálogo"
            data-scroll-reveal="copy"
          >
            <h2 ref={sidebarTitle} tabIndex={-1}>
              Filtrar por
            </h2>
            {filterForm}
          </aside>
          <div className="catalog-listing">
            <div className="catalog-toolbar" data-scroll-reveal="copy">
              <button
                ref={trigger}
                className="button button--secondary catalog-filter-trigger"
                onClick={() => setFiltersOpen(true)}
                aria-haspopup="dialog"
              >
                Filtros{count ? ` (${count})` : ''}
              </button>
              <p role="status" aria-live="polite">
                {data.total} {data.total === 1 ? 'perfume' : 'perfumes'}
                {query.search && <> para «{query.search}»</>}
              </p>
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
                {(query.min || query.max) && (
                  <button onClick={() => update({ min: null, max: null })}>
                    Precio: S/ {query.min || '0'} —{' '}
                    {query.max ? 'S/ ' + query.max : 'sin límite'} ×
                  </button>
                )}
                {query.featured && (
                  <button onClick={() => update({ seleccion: null })}>
                    Destacados ×
                  </button>
                )}
                <button className="catalog-clear" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>
            )}
            <div
              className="catalog-results"
              aria-busy={navigation.state !== 'idle'}
            >
              {navigation.state !== 'idle' && (
                <p className="sr-only" role="status">
                  Actualizando perfumes…
                </p>
              )}
              {data.total ? (
                <div className="product-grid" data-scroll-reveal="stagger">
                  {data.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      brand={data.brands.find(
                        (item) => item.id === product.brandId,
                      )}
                      hoverImage={product.image + '-alternate'}
                    />
                  ))}
                </div>
              ) : (
                <section className="catalog-empty">
                  <h2>No encontramos coincidencias.</h2>
                  <p>Prueba con otra búsqueda o ajusta los filtros.</p>
                  {count > 0 && (
                    <button
                      className="button button--secondary"
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  )}
                </section>
              )}
            </div>
            {data.pages > 1 && (
              <nav
                className="catalog-pagination"
                aria-label="Páginas del catálogo"
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
        {filtersOpen && filterForm}
      </Dialog>
    </div>
  )
}
