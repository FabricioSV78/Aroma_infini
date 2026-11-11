import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import {
  getHeroFallback,
  HERO_MAX_CAMPAIGNS,
  heroInternalPages,
  orderedHeroContent,
  resolveHeroDestination,
} from '../../domain/hero-content'
import type { AdminProduct } from '../../types/admin'
import type { Product } from '../../types/catalog'
import type { HomeHeroContent, HomeHeroDestination } from '../../types/home'
import { assetSource } from '../../services/asset-source'
import { heroImageSource } from '../../services/hero-image-source'
import { homeImagePresets, prepareImageFile } from './prepareImageFile'
import { prepareVideoFile } from './prepareVideoFile'
import { useAdminNotice } from './AdminNoticeProvider'
import { AdminMediaPicker } from './AdminMediaPicker'
import './admin-hero-editor.css'

interface AdminHeroEditorProps {
  slides: HomeHeroContent[]
  products: AdminProduct[]
  publicProducts: Product[]
  complementsEnabled: boolean
  previewOpen: boolean
  onClosePreview: () => void
  onChange: (update: (current: HomeHeroContent[]) => HomeHeroContent[]) => void
  beginMediaPreparation: () => boolean
  endMediaPreparation: () => void
}

type HeroImageField = 'desktopImage' | 'mobileImage' | 'poster' | 'mobilePoster'
const categoryOptions = [
  { value: 'hombre', label: 'Para él' },
  { value: 'mujer', label: 'Para ella' },
  { value: 'unisex', label: 'Unisex' },
  { value: 'complementos', label: 'Complementos' },
] as const

export function AdminHeroEditor({
  slides,
  products,
  publicProducts,
  complementsEnabled,
  previewOpen,
  onClosePreview,
  onChange,
  beginMediaPreparation,
  endMediaPreparation,
}: AdminHeroEditorProps) {
  const notice = useAdminNotice()
  const videoPreparationAbort = useRef<AbortController | null>(null)
  useEffect(function cancelVideoOnUnmount() {
    return () => videoPreparationAbort.current?.abort()
  }, [])
  const ordered = orderedHeroContent(slides)
  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? '')
  const [previewFormat, setPreviewFormat] = useState<'desktop' | 'mobile'>(
    'desktop',
  )
  const [productSearch, setProductSearch] = useState('')
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const current = slides.find((slide) => slide.id === selectedId) ?? ordered[0]
  if (!current) return null
  const index = ordered.findIndex((slide) => slide.id === current.id)
  const visibleNumber = index + 1
  const fallback = getHeroFallback(current.fallbackIndex)
  const destination = resolveHeroDestination(current.destination, {
    products: publicProducts,
    complementsEnabled,
  })
  const selectedProductId =
    current.destination.type === 'product' ? current.destination.productId : ''
  const selectedProduct = products.find(
    (record) => record.product.id === selectedProductId,
  )
  const normalizedQuery = productSearch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
  const matchingProducts = products.filter((record) => {
    if (record.product.id === selectedProductId) return true
    const haystack = [
      record.product.name,
      record.product.sku ?? '',
      ...record.product.variants.map((variant) => variant.sku ?? ''),
    ]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
    return !normalizedQuery || haystack.includes(normalizedQuery)
  })
  const filteredProducts = matchingProducts.slice(0, 100)
  if (
    selectedProduct &&
    !filteredProducts.some((record) => record.product.id === selectedProductId)
  ) {
    filteredProducts.splice(99, 1, selectedProduct)
  }
  const isMobile = previewFormat === 'mobile'
  const previewVideo = isMobile
    ? (current.mobileVideo ?? current.video)
    : current.video
  const previewPoster =
    isMobile && current.mobileVideo
      ? (current.mobilePoster ?? current.poster)
      : current.poster
  const image =
    current.mediaType === 'video'
      ? previewPoster
      : isMobile
        ? (current.mobileImage ?? current.desktopImage)
        : current.desktopImage
  const previewFallback =
    current.fallbackIndex !== null
      ? heroImageSource(
          fallback.image,
          isMobile ? 'mobile' : 'desktop',
          isMobile ? 780 : 1536,
        )
      : null
  const previewImage =
    image || previewFallback
      ? assetSource(image ?? previewFallback!)
      : undefined

  function update(id: string, patch: Partial<HomeHeroContent>) {
    onChange((previous) =>
      previous.map((slide) => {
        if (slide.id !== id) return slide
        const next = { ...slide, ...patch }
        if (
          patch.title !== undefined ||
          patch.desktopImage !== undefined ||
          patch.mobileImage !== undefined ||
          patch.poster !== undefined
        ) {
          const title = next.title.replace(/\s+/g, ' ').trim()
          next.alt =
            next.desktopImage ||
            next.mobileImage ||
            next.poster ||
            next.fallbackIndex === null
              ? `Imagen de la campaña «${title || 'Nueva campaña'}»`.slice(
                  0,
                  160,
                )
              : getHeroFallback(next.fallbackIndex).alt
        }
        if (patch.alt !== undefined) next.alt = patch.alt
        return next
      }),
    )
  }

  function addSlide() {
    if (slides.length >= HERO_MAX_CAMPAIGNS) return
    const id = crypto.randomUUID()
    const slide: HomeHeroContent = {
      id,
      fallbackIndex: null,
      order: slides.length,
      mediaType: 'image',
      published: false,
      eyebrow: '',
      title: '',
      description: '',
      cta: 'Descubrir',
      alt: 'Imagen de nueva campaña',
      desktopImage: null,
      mobileImage: null,
      video: null,
      mobileVideo: null,
      poster: null,
      mobilePoster: null,
      showText: true,
      showButton: false,
      destination: { type: 'shop' },
    }
    onChange((previous) => [...previous, slide])
    setSelectedId(id)
    setProductSearch('')
  }

  function moveSlide(delta: number) {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const moved = [...ordered]
    ;[moved[index], moved[target]] = [moved[target], moved[index]]
    onChange((previous) =>
      previous.map((slide) => ({
        ...slide,
        order: moved.findIndex((item) => item.id === slide.id),
      })),
    )
  }

  async function removeSlide() {
    if (slides.length <= 1) return
    const id = current.id
    if (
      !(await notice.confirm({
        title: 'Eliminar campaña',
        description: 'Se quitará del carrusel cuando guardes los cambios.',
        confirmLabel: 'Eliminar campaña',
        destructive: true,
      }))
    )
      return
    const remaining = ordered.filter((slide) => slide.id !== id)
    onChange((previous) =>
      previous
        .filter((slide) => slide.id !== id)
        .map((slide) => ({
          ...slide,
          order: remaining.findIndex((item) => item.id === slide.id),
        })),
    )
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? '')
  }

  async function uploadImage(id: string, field: HeroImageField, file: File) {
    if (!beginMediaPreparation()) return
    try {
      const preset =
        field === 'desktopImage'
          ? homeImagePresets.heroDesktop
          : field === 'mobileImage'
            ? homeImagePresets.heroMobile
            : field === 'mobilePoster'
              ? {
                  width: 640,
                  height: 960,
                  maxWidth: 1066,
                  label: '2:3 · mínimo 640 × 960 px',
                }
              : {
                  width: 960,
                  height: 540,
                  maxWidth: 1600,
                  label: '16:9 · mínimo 960 × 540 px',
                }
      const prepared = await prepareImageFile(file, preset)
      update(id, { [field]: prepared })
      notice.toast('Imagen preparada. Guarda los cambios para publicarla.')
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      endMediaPreparation()
    }
  }

  async function uploadVideo(id: string, mobile: boolean, file: File) {
    if (!beginMediaPreparation()) return
    const cancellation = new AbortController()
    videoPreparationAbort.current = cancellation
    try {
      const prepared = await prepareVideoFile(file, cancellation.signal)
      if (cancellation.signal.aborted) return
      update(
        id,
        mobile
          ? {
              mobileVideo: prepared.mobileVideo ?? prepared.video,
              mobilePoster: prepared.mobilePoster ?? prepared.poster,
            }
          : {
              video: prepared.video,
              poster: prepared.poster,
              mobileVideo: prepared.mobileVideo ?? null,
              mobilePoster: prepared.mobilePoster ?? null,
            },
      )
      notice.toast(
        `${prepared.optimization.message} Guarda los cambios para publicarlo.`,
      )
    } catch (error) {
      if (!cancellation.signal.aborted) notice.error(error, 'video')
    } finally {
      if (videoPreparationAbort.current === cancellation)
        videoPreparationAbort.current = null
      endMediaPreparation()
    }
  }

  function imageChanged(
    field: HeroImageField,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadImage(current.id, field, file)
  }
  function videoChanged(mobile: boolean, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadVideo(current.id, mobile, file)
  }

  function chooseDestination(type: HomeHeroDestination['type']) {
    const next: HomeHeroDestination =
      type === 'product'
        ? { type, productId: '' }
        : type === 'category'
          ? { type, category: 'hombre' }
          : type === 'page'
            ? { type, page: '/nosotros' }
            : { type: 'shop' }
    update(current.id, { destination: next })
    setProductSearch('')
  }

  function imageControl(field: HeroImageField, title: string, help: string) {
    const resource = current[field]
    const original = field === 'desktopImage' && current.fallbackIndex !== null
    return (
      <div className="admin-home-image-control" key={field}>
        <div>
          <strong>{title}</strong>
          <small>{help}</small>
        </div>
        <label className="admin-home-file-button">
          {resource ? 'Cambiar imagen' : 'Subir imagen'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-label={
              field === 'desktopImage'
                ? `Subir imagen de escritorio de campaña ${visibleNumber}`
                : field === 'mobileImage'
                  ? `Subir imagen móvil de campaña ${visibleNumber}`
                  : `Subir ${title.toLocaleLowerCase('es')} de campaña ${visibleNumber}`
            }
            onChange={(event) => imageChanged(field, event)}
          />
        </label>
        <AdminMediaPicker
          purpose={
            field === 'desktopImage'
              ? 'hero-desktop'
              : field === 'mobileImage'
                ? 'hero-mobile'
                : 'film-poster'
          }
          label={`${title} de campaña ${visibleNumber}`}
          onSelect={(item) => {
            if (item.asset && 'variants' in item.asset) {
              update(current.id, {
                [field]: item.asset.src,
                ...(item.alt ? { alt: item.alt.slice(0, 160) } : {}),
              })
              notice.toast(
                'Imagen seleccionada. Guarda los cambios para publicarla.',
              )
            }
          }}
        />
        {resource ? (
          <button
            type="button"
            className="admin-home-reset"
            onClick={() => update(current.id, { [field]: null })}
          >
            {original ? 'Usar original' : 'Quitar imagen'}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="admin-home-workspace admin-home-workspace--modal admin-hero-editor">
      <Dialog
        open={previewOpen}
        onClose={() => {
          previewVideoRef.current?.pause()
          setPreviewPlaying(false)
          onClosePreview()
        }}
        id="admin-home-preview"
        title="Vista previa · Carrusel principal"
        className="admin-home-preview-dialog"
      >
        {previewOpen ? (
          <section
            className="admin-home-stage"
            aria-label="Vista previa del carrusel principal"
          >
            <div className="admin-home-stage-toolbar">
              <div>
                <span className="eyebrow">Borrador · Sin publicar</span>
                <h2>
                  Campaña {visibleNumber} de {ordered.length}
                </h2>
              </div>
              <div
                className="admin-home-preview-switch"
                role="group"
                aria-label="Formato de vista previa"
              >
                <button
                  type="button"
                  aria-pressed={!isMobile}
                  onClick={() => setPreviewFormat('desktop')}
                >
                  Escritorio
                </button>
                <button
                  type="button"
                  aria-pressed={isMobile}
                  onClick={() => setPreviewFormat('mobile')}
                >
                  Móvil
                </button>
              </div>
            </div>
            <div
              className={`admin-home-hero-preview admin-home-hero-preview--${previewFormat}`}
              data-tone={fallback.tone}
              data-layout={fallback.layout}
              data-default-image={!current.desktopImage}
              data-has-copy={current.showText || current.showButton}
            >
              {previewImage ? <img src={previewImage} alt="" /> : null}
              {current.mediaType === 'video' && previewVideo ? (
                <video
                  key={previewVideo}
                  ref={previewVideoRef}
                  src={assetSource(previewVideo)}
                  poster={previewImage}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label="Vista previa del video de campaña"
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={() => setPreviewPlaying(false)}
                />
              ) : null}
              {current.showText || current.showButton ? (
                <div className="admin-home-hero-preview-copy">
                  {current.showText ? (
                    <div className="admin-home-hero-preview-heading">
                      {current.eyebrow ? <span>{current.eyebrow}</span> : null}
                      {current.title ? <strong>{current.title}</strong> : null}
                    </div>
                  ) : null}
                  <div className="admin-home-hero-preview-details">
                    {current.showText && current.description ? (
                      <p>{current.description}</p>
                    ) : null}
                    {current.showButton && destination.href ? (
                      <Link
                        className="admin-home-hero-preview-cta"
                        to={destination.href}
                        onClick={(event) => event.preventDefault()}
                      >
                        {current.cta || 'Botón'}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {current.mediaType === 'video' && previewVideo ? (
              <button
                type="button"
                className="admin-hero-preview-play"
                onClick={() => {
                  const video = previewVideoRef.current
                  if (!video) return
                  if (!video.paused) video.pause()
                  else
                    void video
                      .play()
                      .catch(() =>
                        notice.toast(
                          'No se pudo reproducir este MP4 en el navegador. Revisa el formato antes de publicar.',
                        ),
                      )
                }}
              >
                {previewPlaying
                  ? 'Pausar vista previa'
                  : 'Reproducir vista previa'}
              </button>
            ) : null}
            {current.mediaType === 'image' && !previewImage ? (
              <p className="admin-hero-warning" role="status">
                Sube una imagen para revisar esta campaña.
              </p>
            ) : null}
            {current.mediaType === 'video' && !previewVideo ? (
              <p className="admin-hero-warning" role="status">
                Sube un video para revisar esta campaña.
              </p>
            ) : null}
            <p className="admin-home-preview-note">
              Esta vista muestra los cambios sin publicar. Las imágenes duran
              3,8 segundos; los videos avanzan al terminar, hasta 15 segundos.
            </p>
          </section>
        ) : null}
      </Dialog>
      <section
        className="admin-home-controls"
        aria-labelledby="admin-home-hero-title"
      >
        <div className="admin-hero-section-heading">
          <div>
            <h2 id="admin-home-hero-title">Editar campaña</h2>
            <p>
              {slides.length} de {HERO_MAX_CAMPAIGNS} campañas
            </p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={addSlide}
            disabled={slides.length >= HERO_MAX_CAMPAIGNS}
          >
            Nueva campaña
          </button>
        </div>
        <div
          className="admin-home-slide-picker"
          role="group"
          aria-label="Campañas del carrusel"
        >
          {ordered.map((slide, displayIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-pressed={current.id === slide.id}
              onClick={() => {
                setSelectedId(slide.id)
                setProductSearch('')
              }}
            >
              <small>{String(displayIndex + 1).padStart(2, '0')}</small>
              <span>
                {slide.title.split('\n')[0] || `Campaña ${displayIndex + 1}`}
              </span>
              {!slide.published ? (
                <em className="admin-hero-item-state">Oculta</em>
              ) : null}
            </button>
          ))}
        </div>
        <div
          className="admin-hero-order-actions"
          role="group"
          aria-label="Orden de la campaña seleccionada"
        >
          <span>Posición {visibleNumber}</span>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => moveSlide(-1)}
            aria-label="Subir campaña"
          >
            <Icon name="chevron" />
            Subir
          </button>
          <button
            type="button"
            disabled={index === ordered.length - 1}
            onClick={() => moveSlide(1)}
            aria-label="Bajar campaña"
          >
            Bajar
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            className="admin-hero-delete"
            disabled={slides.length <= 1}
            onClick={() => void removeSlide()}
          >
            Eliminar campaña
          </button>
        </div>
        <div className="admin-hero-fields">
          <label className="admin-home-field">
            Tipo de contenido
            <select
              aria-label="Tipo de contenido"
              value={current.mediaType}
              onChange={(event) =>
                update(current.id, {
                  mediaType: event.target.value as HomeHeroContent['mediaType'],
                })
              }
            >
              <option value="image">Imagen</option>
              <option value="video">Video</option>
            </select>
          </label>
          <label className="admin-home-field">
            Estado de campaña
            <select
              aria-label="Estado de campaña"
              value={current.published ? 'published' : 'hidden'}
              onChange={(event) =>
                update(current.id, {
                  published: event.target.value === 'published',
                })
              }
            >
              <option value="published">Publicada</option>
              <option value="hidden">Oculta</option>
            </select>
          </label>
        </div>
        <div className="admin-hero-media-controls">
          {current.mediaType === 'image' ? (
            <>
              {imageControl(
                'desktopImage',
                'Fotografía de escritorio',
                homeImagePresets.heroDesktop.label,
              )}
              {imageControl(
                'mobileImage',
                'Fotografía de móvil',
                `${homeImagePresets.heroMobile.label}. Opcional; sin ella se usa la imagen de escritorio.`,
              )}
            </>
          ) : (
            <>
              <div className="admin-home-image-control">
                <div>
                  <strong>Video principal</strong>
                  <small>
                    MP4 · 2–60 s · original hasta 20 MB · recomendado 1920 ×
                    1080 px.
                  </small>
                </div>
                <label className="admin-home-file-button">
                  {current.video ? 'Cambiar video' : 'Subir video'}
                  <input
                    type="file"
                    accept="video/mp4"
                    aria-label={`Subir video de campaña ${visibleNumber}`}
                    onChange={(event) => videoChanged(false, event)}
                  />
                </label>
                <AdminMediaPicker
                  purpose="film-video"
                  label={`Video de campaña ${visibleNumber}`}
                  onSelect={(item) => {
                    if (item.asset) {
                      update(current.id, {
                        video: item.asset.src,
                        poster: null,
                        mobileVideo: null,
                        mobilePoster: null,
                      })
                      notice.toast(
                        'Video seleccionado. Elige su portada y guarda los cambios.',
                      )
                    }
                  }}
                />
                {current.video ? (
                  <button
                    type="button"
                    className="admin-home-reset"
                    onClick={() =>
                      update(current.id, { video: null, poster: null })
                    }
                  >
                    Quitar video
                  </button>
                ) : null}
              </div>
              {imageControl(
                'poster',
                'Portada del video',
                'Se genera al subir el video. Puedes reemplazarla por una imagen 16:9 de al menos 960 × 540 px.',
              )}
              <div className="admin-home-image-control">
                <div>
                  <strong>Video móvil (opcional)</strong>
                  <small>
                    Otra exportación del mismo material. Sin ella se utiliza el
                    video principal.
                  </small>
                </div>
                <label className="admin-home-file-button">
                  {current.mobileVideo ? 'Cambiar video' : 'Subir video'}
                  <input
                    type="file"
                    accept="video/mp4"
                    aria-label={`Subir video móvil de campaña ${visibleNumber}`}
                    onChange={(event) => videoChanged(true, event)}
                  />
                </label>
                <AdminMediaPicker
                  purpose="film-video"
                  label={`Video móvil de campaña ${visibleNumber}`}
                  onSelect={(item) => {
                    if (item.asset) {
                      update(current.id, {
                        mobileVideo: item.asset.src,
                        mobilePoster: null,
                      })
                      notice.toast(
                        'Video móvil seleccionado. Elige su portada y guarda los cambios.',
                      )
                    }
                  }}
                />
                {current.mobileVideo ? (
                  <button
                    type="button"
                    className="admin-home-reset"
                    onClick={() =>
                      update(current.id, {
                        mobileVideo: null,
                        mobilePoster: null,
                      })
                    }
                  >
                    Usar video principal
                  </button>
                ) : null}
              </div>
              {current.mobileVideo
                ? imageControl(
                    'mobilePoster',
                    'Portada móvil del video',
                    'Se genera al subir el video móvil. Para reemplazarla, usa una imagen 2:3 de al menos 640 × 960 px.',
                  )
                : null}
              <p className="admin-hero-help">
                Se prepara el video y su portada. Cuando se obtiene un archivo
                más ligero, también se ofrece una versión móvil del mismo clip.
                Revisa ambas vistas antes de guardar.
              </p>
            </>
          )}
        </div>
        <label className="admin-hero-check">
          <input
            type="checkbox"
            checked={current.showText}
            onChange={(event) =>
              update(current.id, { showText: event.target.checked })
            }
          />
          Mostrar textos
        </label>
        {current.showText ? (
          <div className="admin-hero-copy-fields">
            <label className="admin-home-field">
              Etiqueta superior
              <input
                value={current.eyebrow}
                maxLength={60}
                onChange={(event) =>
                  update(current.id, { eyebrow: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Título <small>Una línea por renglón; máximo 3</small>
              <textarea
                value={current.title}
                maxLength={90}
                rows={3}
                onChange={(event) =>
                  update(current.id, { title: event.target.value })
                }
              />
            </label>
            <label className="admin-home-field">
              Descripción
              <textarea
                value={current.description}
                maxLength={180}
                rows={2}
                onChange={(event) =>
                  update(current.id, { description: event.target.value })
                }
              />
            </label>
          </div>
        ) : null}
        <label className="admin-hero-check">
          <input
            type="checkbox"
            checked={current.showButton}
            onChange={(event) =>
              update(current.id, {
                showButton: event.target.checked,
                ...(!event.target.checked &&
                current.destination.type === 'product' &&
                !current.destination.productId
                  ? { destination: { type: 'shop' } as const }
                  : {}),
              })
            }
          />
          Mostrar botón
        </label>
        {current.showButton ? (
          <div className="admin-hero-destination-fields">
            <div className="admin-hero-fields">
              <label className="admin-home-field">
                Texto del botón
                <input
                  value={current.cta}
                  maxLength={45}
                  onChange={(event) =>
                    update(current.id, { cta: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Destino del botón
                <select
                  aria-label="Destino del botón"
                  value={current.destination.type}
                  onChange={(event) =>
                    chooseDestination(
                      event.target.value as HomeHeroDestination['type'],
                    )
                  }
                >
                  <option value="shop">Tienda</option>
                  <option value="product">Producto específico</option>
                  <option value="category">Categoría</option>
                  <option value="page">Página interna</option>
                </select>
              </label>
            </div>
            {current.destination.type === 'product' ? (
              <>
                <label className="admin-home-field">
                  Buscar producto por nombre o SKU
                  <input
                    type="search"
                    value={productSearch}
                    placeholder="Nombre o SKU de presentación"
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </label>
                <label className="admin-home-field">
                  Producto de destino
                  <select
                    aria-label="Producto de destino"
                    value={selectedProductId}
                    onChange={(event) =>
                      update(current.id, {
                        destination: {
                          type: 'product',
                          productId: event.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Selecciona un producto</option>
                    {selectedProductId && !selectedProduct ? (
                      <option value={selectedProductId}>
                        Producto no disponible
                      </option>
                    ) : null}
                    {filteredProducts.map((record) => (
                      <option key={record.product.id} value={record.product.id}>
                        {record.product.name}
                        {record.product.variants[0]?.sku
                          ? ` · SKU ${record.product.variants[0].sku}`
                          : ''}
                        {!record.active ? ' · Oculto' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {filteredProducts.length === 0 ? (
                  <p className="admin-hero-help" role="status">
                    No hay productos que coincidan con la búsqueda.
                  </p>
                ) : null}
                {products.length > 100 && !productSearch ? (
                  <p className="admin-hero-help">
                    Se muestran hasta 100 productos. Busca por nombre o SKU para
                    encontrar otro.
                  </p>
                ) : null}
              </>
            ) : null}
            {current.destination.type === 'category' ? (
              <label className="admin-home-field">
                Categoría de destino
                <select
                  aria-label="Categoría de destino"
                  value={current.destination.category}
                  onChange={(event) =>
                    update(current.id, {
                      destination: {
                        type: 'category',
                        category: event.target.value as Extract<
                          HomeHeroDestination,
                          { type: 'category' }
                        >['category'],
                      },
                    })
                  }
                >
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                      {category.value === 'complementos' && !complementsEnabled
                        ? ' · Oculta'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {current.destination.type === 'page' ? (
              <label className="admin-home-field">
                Página de destino
                <select
                  aria-label="Página de destino"
                  value={current.destination.page}
                  onChange={(event) =>
                    update(current.id, {
                      destination: {
                        type: 'page',
                        page: event.target.value as Extract<
                          HomeHeroDestination,
                          { type: 'page' }
                        >['page'],
                      },
                    })
                  }
                >
                  {heroInternalPages.map((page) => (
                    <option key={page.value} value={page.value}>
                      {page.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {destination.warning ? (
              <p className="admin-hero-warning" role="status">
                <Icon name="alert" />
                {destination.warning}
              </p>
            ) : (
              <p className="admin-hero-help">
                El botón abre una página de Aroma Infini. No necesitas escribir
                una URL.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
