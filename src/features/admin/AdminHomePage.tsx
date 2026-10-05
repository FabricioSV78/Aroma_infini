import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { categories } from '../../content/home'
import {
  adminService,
  type HomeMedia,
  type HomeMediaKey,
} from '../../services/admin-service'
import { imageSource } from '../../services/image-source'
import type { Product } from '../../types/catalog'
import { AdminNotice, AdminPageHeader } from './AdminShared'
import { homeImagePresets, prepareImageFile } from './prepareImageFile'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'

type HomeTab = 'categories' | 'featured'
const resultSize = 5

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function AdminHomePage() {
  const state = useAdminStore()
  const [tab, setTab] = useState<HomeTab>('categories')
  const [media, setMedia] = useState<HomeMedia>(() => ({ ...state.homeMedia }))
  const [featuredIds, setFeaturedIds] = useState(() => {
    const available = state.products
      .filter(
        (record) =>
          record.active &&
          state.brands.some(
            (brand) => brand.id === record.product.brandId && brand.active,
          ),
      )
      .map((record) => record.product.id)
    return [
      ...state.featuredOrder.filter((id) => available.includes(id)),
      ...available.filter((id) => !state.featuredOrder.includes(id)),
    ].slice(0, 2)
  })
  const [selectedSlot, setSelectedSlot] = useState<0 | 1>(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedVersion, setSavedVersion] = useState(() => JSON.stringify({ media, featuredIds }))
  const dirty = JSON.stringify({ media, featuredIds }) !== savedVersion
  useUnsavedChanges(dirty)
  const activeProducts = state.products.filter(
    (record) =>
      record.active &&
      state.brands.some(
        (brand) => brand.id === record.product.brandId && brand.active,
      ),
  )
  const selectedProducts = featuredIds.map(
    (id) => activeProducts.find((record) => record.product.id === id)?.product,
  )
  const matchingProducts = activeProducts.filter((record) => {
    const brand = state.brands.find(
      (item) => item.id === record.product.brandId,
    )
    return normalize(`${record.product.name} ${brand?.name ?? ''}`).includes(
      normalize(query.trim()),
    )
  })
  const totalPages = Math.max(
    1,
    Math.ceil(matchingProducts.length / resultSize),
  )
  const visibleProducts = matchingProducts.slice(
    (page - 1) * resultSize,
    page * resultSize,
  )

  async function uploadImage(key: HomeMediaKey, file: File) {
    try {
      const image = await prepareImageFile(file, homeImagePresets[key])
      setMedia((current) => ({ ...current, [key]: image }))
      setMessage(`${file.name} preparado. Guarda los cambios para publicarlo.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo preparar la imagen.',
      )
    }
  }

  function fileChanged(
    key: HomeMediaKey,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadImage(key, file)
  }

  function chooseProduct(product: Product) {
    setFeaturedIds((current) => {
      const next = [...current]
      const previousSlot = next.indexOf(product.id)
      if (previousSlot === selectedSlot) return current
      if (previousSlot >= 0) next[previousSlot] = next[selectedSlot]
      next[selectedSlot] = product.id
      return next
    })
    setMessage('')
  }

  async function saveHome() {
    const result = adminService.saveHome(featuredIds, media)
    if (result.kind === 'validation') {
      setMessage(result.message)
      return
    }
    setSaving(true)
    try {
      await adminService.flush()
      setSavedVersion(JSON.stringify({ media, featuredIds }))
      setMessage('Cambios guardados y visibles en el Home de este navegador.')
    } catch {
      setMessage(
        'Los cambios se ven ahora, pero el navegador no pudo guardarlos. Inténtalo de nuevo.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page admin-home-editor">
      <AdminPageHeader
        eyebrow="Edición visual"
        title="Home"
        description="Ajusta las imágenes y la selección editorial viendo la composición antes de guardarla."
      />
      <div className="admin-home-topbar">
        <div className="admin-home-tabs" aria-label="Apartados del Home">
          <button
            type="button"
            aria-pressed={tab === 'categories'}
            onClick={() => setTab('categories')}
          >
            Para él, para ella y unisex
          </button>
          <button
            type="button"
            aria-pressed={tab === 'featured'}
            onClick={() => setTab('featured')}
          >
            Destacados
          </button>
        </div>
        <Link
          className="text-link"
          to={tab === 'categories' ? '/#descubrir' : '/#destacados'}
        >
          Ver en tienda ↗
        </Link>
      </div>

      {tab === 'categories' ? (
        <div className="admin-home-workspace">
          <section
            className="admin-home-stage"
            aria-label="Vista previa de las tres categorías"
          >
            <div className="admin-home-stage-heading">
              <span className="eyebrow">Tres formas de explorar</span>
              <h2>Elige por dónde empezar.</h2>
            </div>
            <div className="admin-home-category-preview">
              {categories.map((category) => {
                const key = category.id as HomeMediaKey
                return (
                  <div
                    className={`admin-home-category admin-home-category--${category.layout}`}
                    key={category.id}
                  >
                    <div className="admin-home-category-image">
                      <img
                        src={imageSource(media[key] ?? category.image, 960)}
                        alt=""
                      />
                    </div>
                    <div className="admin-home-category-copy">
                      <strong>{category.title}</strong>
                      <span>{category.description}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          <section
            className="admin-home-controls"
            aria-labelledby="admin-home-categories-title"
          >
            <h2 id="admin-home-categories-title">Imágenes de categorías</h2>
            <p>
              El encuadre se ajusta al centro y se muestra arriba antes de
              guardar.
            </p>
            {categories.map((category) => {
              const key = category.id as HomeMediaKey
              return (
                <div className="admin-home-image-control" key={category.id}>
                  <div>
                    <strong>{category.title}</strong>
                    <small>{homeImagePresets[key].label}</small>
                  </div>
                  <label className="admin-home-file-button">
                    Cambiar imagen
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      aria-label={`Subir imagen de ${category.title}`}
                      onChange={(event) => fileChanged(key, event)}
                    />
                  </label>
                  {media[key] ? (
                    <button
                      className="admin-home-reset"
                      type="button"
                      onClick={() =>
                        setMedia((current) => ({ ...current, [key]: null }))
                      }
                    >
                      Usar original
                    </button>
                  ) : null}
                </div>
              )
            })}
          </section>
        </div>
      ) : (
        <div className="admin-home-workspace">
          <section
            className="admin-home-stage"
            aria-label="Vista previa de destacados"
          >
            <div className="admin-home-featured-preview">
              <img
                className="admin-home-featured-photo"
                src={imageSource(media.featured ?? 'featured-duo-v3', 960)}
                alt="Composición editorial de los destacados"
              />
              <div className="admin-home-featured-copy">
                <span className="eyebrow">Encuentro editorial</span>
                <h2>Dos aromas. Dos formas de dejar huella.</h2>
                <span className="admin-home-preview-link">
                  Explorar destacados ↗
                </span>
                <div className="admin-home-featured-products">
                  {selectedProducts.map((product, index) => (
                    <div key={index}>
                      {product ? (
                        <img src={imageSource(product.image)} alt="" />
                      ) : null}
                      <span>
                        <small>0{index + 1}</small>
                        <strong>{product?.name ?? 'Elige un perfume'}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section
            className="admin-home-controls"
            aria-labelledby="admin-home-featured-title"
          >
            <h2 id="admin-home-featured-title">Editar destacados</h2>
            <div className="admin-home-image-control">
              <div>
                <strong>Fotografía grande</strong>
                <small>{homeImagePresets.featured.label}</small>
              </div>
              <label className="admin-home-file-button">
                Cambiar imagen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="Subir fotografía grande de destacados"
                  onChange={(event) => fileChanged('featured', event)}
                />
              </label>
              {media.featured ? (
                <button
                  className="admin-home-reset"
                  type="button"
                  onClick={() =>
                    setMedia((current) => ({ ...current, featured: null }))
                  }
                >
                  Usar original
                </button>
              ) : null}
            </div>
            <div
              className="admin-home-slot-picker"
              aria-label="Posición que vas a editar"
            >
              {selectedProducts.map((product, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={selectedSlot === index}
                  onClick={() => setSelectedSlot(index as 0 | 1)}
                >
                  <small>Destacado 0{index + 1}</small>
                  <strong>{product?.name ?? 'Seleccionar'}</strong>
                </button>
              ))}
            </div>
            <button
              className="admin-home-reset"
              type="button"
              onClick={() =>
                setFeaturedIds((current) => [...current].reverse())
              }
            >
              Invertir orden
            </button>
            <label className="admin-home-search">
              Buscar un producto para destacado {selectedSlot + 1}
              <input
                type="search"
                value={query}
                placeholder="Nombre o marca"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <p className="admin-home-result-count" role="status">
              {matchingProducts.length} productos disponibles
            </p>
            <ul className="admin-home-product-results">
              {visibleProducts.map((record) => (
                <li key={record.product.id}>
                  <button
                    type="button"
                    onClick={() => chooseProduct(record.product)}
                    aria-label={`Elegir ${record.product.name} para destacado ${selectedSlot + 1}`}
                  >
                    <img src={imageSource(record.product.image)} alt="" />
                    <span>
                      <strong>{record.product.name}</strong>
                      <small>
                        {
                          state.brands.find(
                            (brand) => brand.id === record.product.brandId,
                          )?.name
                        }
                      </small>
                    </span>
                    <span aria-hidden="true">
                      {featuredIds.includes(record.product.id) ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <div className="admin-home-pages">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <div className="admin-home-savebar">
        <AdminNotice>{message}</AdminNotice>
        <button
          className="button button--primary"
          type="button"
          disabled={saving}
          onClick={() => void saveHome()}
        >
          {saving ? 'Guardando…' : 'Guardar cambios del Home'}
        </button>
      </div>
    </div>
  )
}
