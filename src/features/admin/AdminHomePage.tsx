import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { categories } from '../../content/home'
import { heroSlides } from '../../content/home'
import { editorialFilm } from '../../content/editorial-film'
import type {
  HomeContent,
  HomeFilmContent,
  HomeHeroContent,
} from '../../content/home-editor'
import {
  adminService,
  type HomeMedia,
  type HomeMediaKey,
} from '../../services/admin-service'
import { imageSource } from '../../services/image-source'
import type { Product } from '../../types/catalog'
import { AdminNotice, AdminPageHeader } from './AdminShared'
import { homeImagePresets, prepareImageFile } from './prepareImageFile'
import { prepareVideoFile } from './prepareVideoFile'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'

type HomeTab = 'hero' | 'categories' | 'film' | 'featured'
const resultSize = 5

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function sameFields<T extends object>(left: T, right: T) {
  return (Object.keys(left) as Array<keyof T>).every(
    (key) => left[key] === right[key],
  )
}

function sameHomeContent(left: HomeContent, right: HomeContent) {
  return (
    left.hero.length === right.hero.length &&
    left.hero.every((slide, index) => sameFields(slide, right.hero[index])) &&
    sameFields(left.film, right.film)
  )
}

export function AdminHomePage() {
  const state = useAdminStore()
  const [tab, setTab] = useState<HomeTab>('hero')
  const [media, setMedia] = useState<HomeMedia>(() => ({ ...state.homeMedia }))
  const [content, setContent] = useState<HomeContent>(() => state.homeContent)
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [heroPreview, setHeroPreview] = useState<'desktop' | 'mobile'>(
    'desktop',
  )
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
  const [messageIsError, setMessageIsError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedDraft, setSavedDraft] = useState(() => ({
    media,
    featuredIds,
    content,
  }))
  const dirty =
    !sameFields(media, savedDraft.media) ||
    featuredIds.some((id, index) => id !== savedDraft.featuredIds[index]) ||
    featuredIds.length !== savedDraft.featuredIds.length ||
    !sameHomeContent(content, savedDraft.content)
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
  const currentSlide = content.hero[selectedSlide]
  const defaultSlide = heroSlides[selectedSlide]
  const heroPreviewImage =
    heroPreview === 'mobile'
      ? (currentSlide.mobileImage ??
        currentSlide.desktopImage ??
        `/images/${defaultSlide.image}-mobile-780.webp`)
      : (currentSlide.desktopImage ??
        `/images/${defaultSlide.image}-desktop-1536.webp`)

  function updateHero(index: number, patch: Partial<HomeHeroContent>) {
    setContent((current) => ({
      ...current,
      hero: current.hero.map((slide, slideIndex) =>
        slideIndex === index ? { ...slide, ...patch } : slide,
      ),
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFilm(patch: Partial<HomeFilmContent>) {
    setContent((current) => ({
      ...current,
      film: { ...current.film, ...patch },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  async function uploadHeroImage(
    index: number,
    kind: 'desktopImage' | 'mobileImage',
    file: File,
  ) {
    try {
      const preset =
        kind === 'desktopImage'
          ? homeImagePresets.heroDesktop
          : homeImagePresets.heroMobile
      const image = await prepareImageFile(file, preset)
      updateHero(index, { [kind]: image })
      setMessageIsError(false)
      setMessage(`${file.name} preparado. Guarda los cambios para publicarlo.`)
    } catch (error) {
      setMessageIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo preparar la imagen.',
      )
    }
  }

  function heroFileChanged(
    index: number,
    kind: 'desktopImage' | 'mobileImage',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadHeroImage(index, kind, file)
  }

  async function uploadFilm(file: File) {
    try {
      const prepared = await prepareVideoFile(file)
      updateFilm(prepared)
      setMessageIsError(false)
      setMessage(`${file.name} preparado. Guarda los cambios para publicarlo.`)
    } catch (error) {
      setMessageIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo preparar el video.',
      )
    }
  }

  async function uploadImage(key: HomeMediaKey, file: File) {
    try {
      const image = await prepareImageFile(file, homeImagePresets[key])
      setMedia((current) => ({ ...current, [key]: image }))
      setMessageIsError(false)
      setMessage(`${file.name} preparado. Guarda los cambios para publicarlo.`)
    } catch (error) {
      setMessageIsError(true)
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
    setMessageIsError(false)
  }

  async function saveHome() {
    const result = adminService.saveHome(featuredIds, media, content)
    if (result.kind === 'validation') {
      setMessageIsError(true)
      setMessage(result.message)
      return
    }
    setSaving(true)
    try {
      await adminService.flush()
      setSavedDraft({ media, featuredIds, content })
      setMessageIsError(false)
      setMessage('Cambios guardados y visibles en el Home de este navegador.')
    } catch {
      setMessageIsError(true)
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
            aria-pressed={tab === 'hero'}
            onClick={() => setTab('hero')}
          >
            Carrusel principal
          </button>
          <button
            type="button"
            aria-pressed={tab === 'categories'}
            onClick={() => setTab('categories')}
          >
            Para él, para ella y unisex
          </button>
          <button
            type="button"
            aria-pressed={tab === 'film'}
            onClick={() => setTab('film')}
          >
            Video editorial
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
          to={
            tab === 'hero'
              ? '/'
              : tab === 'categories'
                ? '/#descubrir'
                : tab === 'film'
                  ? '/#ritual'
                  : '/#destacados'
          }
        >
          Ver en tienda ↗
        </Link>
      </div>

      {tab === 'hero' ? (
        <div className="admin-home-workspace">
          <section
            className="admin-home-stage"
            aria-label="Vista previa del carrusel principal"
          >
            <div className="admin-home-stage-toolbar">
              <div>
                <span className="eyebrow">Carrusel principal</span>
                <h2>
                  Campaña {selectedSlide + 1} de {content.hero.length}
                </h2>
              </div>
              <div
                className="admin-home-preview-switch"
                aria-label="Formato de vista previa"
              >
                <button
                  type="button"
                  aria-pressed={heroPreview === 'desktop'}
                  onClick={() => setHeroPreview('desktop')}
                >
                  Escritorio
                </button>
                <button
                  type="button"
                  aria-pressed={heroPreview === 'mobile'}
                  onClick={() => setHeroPreview('mobile')}
                >
                  Móvil
                </button>
              </div>
            </div>
            <div
              className={`admin-home-hero-preview admin-home-hero-preview--${heroPreview}`}
              data-tone={defaultSlide.tone}
            >
              <img src={heroPreviewImage} alt="" />
              <div className="admin-home-hero-preview-copy">
                <span>{currentSlide.eyebrow || 'Etiqueta'}</span>
                <strong>{currentSlide.title || 'Título de campaña'}</strong>
                <p>{currentSlide.description || 'Descripción de campaña'}</p>
                <span className="admin-home-hero-preview-cta">
                  {currentSlide.cta || 'Botón'}
                </span>
              </div>
            </div>
            <p className="admin-home-preview-note">
              La vista previa muestra el encuadre y texto. El Home conserva las
              flechas y el cambio automático cada 3 segundos.
            </p>
          </section>
          <section
            className="admin-home-controls"
            aria-labelledby="admin-home-hero-title"
          >
            <h2 id="admin-home-hero-title">Editar campaña</h2>
            <div
              className="admin-home-slide-picker"
              aria-label="Campañas del carrusel"
            >
              {content.hero.map((slide, index) => (
                <button
                  type="button"
                  key={defaultSlide.image + index}
                  aria-pressed={selectedSlide === index}
                  onClick={() => setSelectedSlide(index)}
                >
                  <small>0{index + 1}</small>
                  <span>
                    {slide.title.split('\n')[0] || `Campaña ${index + 1}`}
                  </span>
                </button>
              ))}
            </div>
            <label className="admin-home-field">
              Etiqueta superior
              <input
                value={currentSlide.eyebrow}
                maxLength={60}
                onChange={(event) =>
                  updateHero(selectedSlide, { eyebrow: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Título <small>Una línea por renglón; máximo 3</small>
              <textarea
                value={currentSlide.title}
                maxLength={90}
                rows={3}
                onChange={(event) =>
                  updateHero(selectedSlide, { title: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Descripción
              <textarea
                value={currentSlide.description}
                maxLength={180}
                rows={3}
                onChange={(event) =>
                  updateHero(selectedSlide, { description: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Texto del botón
              <input
                value={currentSlide.cta}
                maxLength={45}
                onChange={(event) =>
                  updateHero(selectedSlide, { cta: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Descripción de la imagen <small>Para lectores de pantalla</small>
              <input
                value={currentSlide.alt}
                maxLength={160}
                onChange={(event) =>
                  updateHero(selectedSlide, { alt: event.target.value })
                }
              />
            </label>
            <div className="admin-home-image-control">
              <div>
                <strong>Fotografía de escritorio</strong>
                <small>{homeImagePresets.heroDesktop.label}</small>
              </div>
              <label className="admin-home-file-button">
                Cambiar imagen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label={`Subir imagen de escritorio de campaña ${selectedSlide + 1}`}
                  onChange={(event) =>
                    heroFileChanged(selectedSlide, 'desktopImage', event)
                  }
                />
              </label>
              {currentSlide.desktopImage && (
                <button
                  className="admin-home-reset"
                  type="button"
                  onClick={() =>
                    updateHero(selectedSlide, { desktopImage: null })
                  }
                >
                  Usar original
                </button>
              )}
            </div>
            <div className="admin-home-image-control">
              <div>
                <strong>Fotografía de móvil</strong>
                <small>
                  {homeImagePresets.heroMobile.label}. Opcional; sin ella se usa
                  la imagen de escritorio.
                </small>
              </div>
              <label className="admin-home-file-button">
                Cambiar imagen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label={`Subir imagen móvil de campaña ${selectedSlide + 1}`}
                  onChange={(event) =>
                    heroFileChanged(selectedSlide, 'mobileImage', event)
                  }
                />
              </label>
              {currentSlide.mobileImage && (
                <button
                  className="admin-home-reset"
                  type="button"
                  onClick={() =>
                    updateHero(selectedSlide, { mobileImage: null })
                  }
                >
                  Usar imagen de escritorio
                </button>
              )}
            </div>
          </section>
        </div>
      ) : tab === 'categories' ? (
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
                      onClick={() => {
                        setMedia((current) => ({ ...current, [key]: null }))
                        setMessage('')
                        setMessageIsError(false)
                      }}
                    >
                      Usar original
                    </button>
                  ) : null}
                </div>
              )
            })}
          </section>
        </div>
      ) : tab === 'film' ? (
        <div className="admin-home-workspace">
          <section
            className="admin-home-stage"
            aria-label="Vista previa de la sección audiovisual"
          >
            <div className="admin-home-film-preview">
              <div className="admin-home-film-preview-copy">
                <span className="eyebrow">
                  {content.film.eyebrow || 'Etiqueta'}
                </span>
                <h2>{content.film.title || 'Título del video'}</h2>
                <p>{content.film.description || 'Texto del video'}</p>
                <span className="admin-home-preview-link">
                  {content.film.cta || 'Botón'} ↗
                </span>
              </div>
              <video
                controls
                muted
                playsInline
                preload="metadata"
                src={content.film.video ?? editorialFilm.src}
                poster={content.film.poster ?? editorialFilm.poster}
                aria-label="Vista previa del video editorial"
              />
            </div>
          </section>
          <section
            className="admin-home-controls"
            aria-labelledby="admin-home-film-title"
          >
            <h2 id="admin-home-film-title">Video editorial</h2>
            <p>Revisa aquí el video y el texto antes de guardar.</p>
            <label className="admin-home-field">
              Etiqueta superior
              <input
                value={content.film.eyebrow}
                maxLength={60}
                onChange={(event) =>
                  updateFilm({ eyebrow: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Título <small>Una línea por renglón; máximo 2</small>
              <textarea
                value={content.film.title}
                maxLength={90}
                rows={2}
                onChange={(event) => updateFilm({ title: event.target.value })}
              />
            </label>
            <label className="admin-home-field">
              Descripción
              <textarea
                value={content.film.description}
                maxLength={300}
                rows={4}
                onChange={(event) =>
                  updateFilm({ description: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Texto del botón
              <input
                value={content.film.cta}
                maxLength={45}
                onChange={(event) => updateFilm({ cta: event.target.value })}
              />
            </label>
            <div className="admin-home-image-control">
              <div>
                <strong>Archivo de video</strong>
                <small>
                  MP4 · 2 a 60 segundos · lado menor de 480 px · hasta 10 MB
                </small>
              </div>
              <label className="admin-home-file-button">
                Cambiar video
                <input
                  type="file"
                  accept="video/mp4"
                  aria-label="Subir video editorial"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void uploadFilm(file)
                  }}
                />
              </label>
              {content.film.video && (
                <button
                  className="admin-home-reset"
                  type="button"
                  onClick={() => updateFilm({ video: null, poster: null })}
                >
                  Usar video original
                </button>
              )}
            </div>
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
                  onClick={() => {
                    setMedia((current) => ({ ...current, featured: null }))
                    setMessage('')
                    setMessageIsError(false)
                  }}
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
              onClick={() => {
                setFeaturedIds((current) => [...current].reverse())
                setMessage('')
                setMessageIsError(false)
              }}
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
            {matchingProducts.length === 0 ? (
              <p className="admin-home-no-results" role="status">
                {activeProducts.length === 0
                  ? 'Todavía no hay productos activos para destacar. Activa uno desde Productos.'
                  : 'No hay productos con ese nombre o marca. Prueba otra búsqueda.'}
              </p>
            ) : null}
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
        <div className="admin-home-save-status">
          <span className={dirty ? 'is-unsaved' : 'is-saved'}>
            {dirty ? 'Cambios sin guardar' : 'Todo guardado'}
          </span>
          {messageIsError ? (
            <p className="admin-form-notice" role="alert">
              {message}
            </p>
          ) : (
            <AdminNotice>{message}</AdminNotice>
          )}
        </div>
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
