import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import type { ImageMediaPurpose } from '../../domain/media'
import { assetSource } from '../../services/asset-source'
import { isRemoteCatalog } from '../../services/catalog-source'
import { getAdminErrorMessage } from '../../services/admin-messages'
import {
  isMediaCompatible,
  MEDIA_LIBRARY_SECTIONS,
  mediaLibraryService,
  mediaStateLabels,
  type MediaLibraryFilter,
  type MediaLibraryItem,
  type MediaLibraryPage,
  type MediaLibrarySection,
} from '../../services/media-library-service'
import '../../styles/admin-media-library.css'

interface MediaLibraryBrowserProps {
  purpose?: ImageMediaPurpose | 'film-video'
  onSelect?: (item: MediaLibraryItem) => void
  onOpenItem?: (item: MediaLibraryItem) => void
  refreshToken?: number
  allowSvg?: boolean
  minimumDimensions?: { width: number; height: number }
}

function meetsMinimumDimensions(
  item: MediaLibraryItem,
  minimum?: { width: number; height: number },
) {
  if (!minimum) return true
  if (!item.asset) return false
  if ('mimeType' in item.asset && item.asset.mimeType === 'image/svg+xml')
    return true
  return (
    item.asset.width >= minimum.width && item.asset.height >= minimum.height
  )
}

export function MediaLibraryBrowser({
  purpose,
  onSelect,
  onOpenItem,
  refreshToken = 0,
  allowSvg = false,
  minimumDimensions,
}: MediaLibraryBrowserProps) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<MediaLibrarySection | ''>('')
  const [state, setState] = useState<MediaLibraryFilter>('all')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<MediaLibraryPage | null>(null)
  const [completedKey, setCompletedKey] = useState('')
  const [loadError, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<MediaLibraryItem | null>(null)
  const requestKey = JSON.stringify([
    query,
    section,
    state,
    page,
    refreshToken,
    retry,
  ])
  const loading = completedKey !== requestKey
  const error = loading ? '' : loadError
  useEffect(
    function loadLibraryPage() {
      let active = true
      if (!isRemoteCatalog) return
      void mediaLibraryService
        .list({ query, section, state, page })
        .then((value) => {
          if (active) {
            setResult(value)
            setError('')
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(getAdminErrorMessage(cause).description)
        })
        .finally(() => {
          if (active) setCompletedKey(requestKey)
        })
      return () => {
        active = false
      }
    },
    [query, section, state, page, refreshToken, retry, requestKey],
  )
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    setPage(1)
    setQuery(search.trim())
    setRetry((value) => value + 1)
  }
  if (!isRemoteCatalog)
    return (
      <p className="admin-media-info" role="status">
        La biblioteca estará disponible al conectar la tienda a su
        almacenamiento. Los archivos de ejemplo no se publican aquí.
      </p>
    )
  return (
    <div className="admin-media-browser">
      <form
        className="admin-media-filters"
        onSubmit={submit}
        role="search"
        aria-label="Buscar archivos de la biblioteca"
      >
        <label htmlFor={`${id}-search`}>
          Buscar archivo
          <input
            id={`${id}-search`}
            type="search"
            maxLength={120}
            placeholder="Nombre o texto alternativo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label htmlFor={`${id}-section`}>
          Sección
          <select
            id={`${id}-section`}
            value={section}
            onChange={(event) => {
              setSection(event.target.value as MediaLibrarySection | '')
              setPage(1)
            }}
          >
            <option value="">Todas las secciones</option>
            {MEDIA_LIBRARY_SECTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-state`}>
          Estado
          <select
            id={`${id}-state`}
            value={state}
            onChange={(event) => {
              setState(event.target.value as MediaLibraryFilter)
              setPage(1)
            }}
          >
            <option value="all">Todos los archivos</option>
            <option value="used">En uso</option>
            <option value="unused">Sin usar</option>
            <option value="pending">Pendientes de limpieza</option>
            <option value="deleted">Eliminados</option>
          </select>
        </label>
        <button type="submit" className="button button--primary">
          Buscar
        </button>
      </form>
      {error ? (
        <div className="admin-media-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}
      <p className="admin-media-count" role="status" aria-live="polite">
        {loading
          ? 'Cargando archivos…'
          : `${result?.total ?? 0} archivos encontrados`}
      </p>
      {purpose ? (
        <p className="admin-media-help">
          Solo puedes elegir archivos compatibles con la proporción y resolución
          de esta ubicación.
        </p>
      ) : null}
      {minimumDimensions ? (
        <p className="admin-media-help">
          Resolución mínima: {minimumDimensions.width} ×{' '}
          {minimumDimensions.height} px.
          {allowSvg
            ? ' Los logotipos SVG conservan su nitidez a cualquier tamaño.'
            : ''}
        </p>
      ) : null}
      <div className="admin-media-grid" aria-busy={loading}>
        {!loading && !error && !result?.items.length ? (
          <p className="admin-media-empty">
            No hay archivos con estos filtros. Prueba otra búsqueda o sube un
            archivo.
          </p>
        ) : null}
        {result?.items.map((item) => {
          const image =
            item.asset &&
            ('variants' in item.asset ||
              item.asset.mimeType === 'image/svg+xml')
              ? item.asset
              : null
          const compatible =
            isMediaCompatible(item, purpose, allowSvg) &&
            meetsMinimumDimensions(item, minimumDimensions)
          return (
            <article className="admin-media-card" key={item.id}>
              <button
                type="button"
                className="admin-media-thumbnail"
                aria-label={`Ver archivo ${item.name}`}
                disabled={!item.asset || loading}
                onClick={() =>
                  onOpenItem ? onOpenItem(item) : setPreview(item)
                }
              >
                {image ? (
                  <img
                    src={assetSource(
                      'variants' in image ? image.variants[0].src : image.src,
                    )}
                    alt=""
                    loading="lazy"
                    width={image.width}
                    height={image.height}
                  />
                ) : (
                  <span>
                    <Icon
                      name={item.purpose === 'film-video' ? 'play' : 'package'}
                    />
                    <span>
                      {item.purpose === 'film-video'
                        ? 'Video MP4'
                        : 'Sin vista previa'}
                    </span>
                  </span>
                )}
              </button>
              <div className="admin-media-card-copy">
                <h3>{item.name}</h3>
                <p>
                  {
                    MEDIA_LIBRARY_SECTIONS.find(
                      (section) => section.value === item.section,
                    )?.label
                  }{' '}
                  · {mediaStateLabels[item.state]}
                </p>
                <small>
                  {item.asset
                    ? `${item.asset.width} × ${item.asset.height} px`
                    : 'Carga sin confirmar'}{' '}
                  · {item.useCount} {item.useCount === 1 ? 'uso' : 'usos'}
                </small>
                {item.retireAfter && !item.useCount ? (
                  <small className="admin-media-expiry">
                    Limpieza programada:{' '}
                    {new Date(item.retireAfter).toLocaleDateString('es-PE')}
                  </small>
                ) : null}
                <div className="admin-media-card-actions">
                  {onOpenItem ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onOpenItem(item)}
                    >
                      Detalles
                    </button>
                  ) : null}
                  {onSelect ? (
                    <button
                      type="button"
                      disabled={!compatible || loading}
                      title={
                        !compatible
                          ? 'Formato, proporción o resolución incompatible con esta ubicación.'
                          : undefined
                      }
                      onClick={() => onSelect(item)}
                    >
                      Usar archivo<span className="sr-only"> {item.name}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {result && result.total > result.pageSize ? (
        <nav
          className="admin-media-pagination"
          aria-label="Páginas de la biblioteca"
        >
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </button>
          <span>
            Página {result.page} de{' '}
            {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </span>
          <button
            type="button"
            disabled={
              loading || page >= Math.ceil(result.total / result.pageSize)
            }
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente
          </button>
        </nav>
      ) : null}
      <Dialog
        open={Boolean(preview)}
        isolateEvents
        onClose={() => setPreview(null)}
        id={`${id}-preview`}
        title={preview?.name ?? 'Vista previa'}
        className="admin-media-preview-dialog"
      >
        {preview?.asset ? <MediaAssetPreview item={preview} /> : null}
      </Dialog>
    </div>
  )
}

export function MediaAssetPreview({ item }: { item: MediaLibraryItem }) {
  if (!item.asset)
    return (
      <p className="admin-media-info">
        Este archivo todavía no tiene una versión publicada.
      </p>
    )
  return (
    <div className="admin-media-preview">
      {'mimeType' in item.asset && item.asset.mimeType === 'video/mp4' ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={assetSource(item.asset.src)}
          aria-label={`Vista previa de ${item.name}`}
        />
      ) : (
        <img src={assetSource(item.asset.src)} alt={item.alt || item.name} />
      )}
    </div>
  )
}

interface AdminMediaPickerProps {
  purpose: ImageMediaPurpose | 'film-video'
  label: string
  disabled?: boolean
  allowSvg?: boolean
  minimumDimensions?: { width: number; height: number }
  onSelect: (item: MediaLibraryItem) => void
}
export function AdminMediaPicker({
  purpose,
  label,
  disabled = false,
  allowSvg = false,
  minimumDimensions,
  onSelect,
}: AdminMediaPickerProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="admin-media-picker-button"
        disabled={disabled}
        aria-label={`Biblioteca: ${label}`}
        onClick={() => setOpen(true)}
      >
        Biblioteca
      </button>
      {open
        ? createPortal(
            <Dialog
              open={open}
              isolateEvents
              onClose={() => setOpen(false)}
              returnFocusRef={trigger}
              id={`${id}-picker`}
              title={`Elegir archivo · ${label}`}
              className="admin-media-picker-dialog"
            >
              {open ? (
                <MediaLibraryBrowser
                  purpose={purpose}
                  allowSvg={allowSvg}
                  minimumDimensions={minimumDimensions}
                  onSelect={(item) => {
                    if (
                      !isMediaCompatible(item, purpose, allowSvg) ||
                      !meetsMinimumDimensions(item, minimumDimensions)
                    )
                      return
                    onSelect(item)
                    setOpen(false)
                  }}
                />
              ) : null}
            </Dialog>,
            document.body,
          )
        : null}
    </>
  )
}
