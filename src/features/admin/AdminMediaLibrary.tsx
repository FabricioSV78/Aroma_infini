import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import {
  IMAGE_MEDIA_PROFILES,
  type ImageMediaPurpose,
} from '../../domain/media'
import {
  SITE_MEDIA_SLOTS,
  getSiteMediaItem,
  type SiteMediaSlot,
} from '../../domain/site-media-slots'
import { assetSource } from '../../services/asset-source'
import { imageSourceSet } from '../../services/image-source'
import { getAdminErrorMessage } from '../../services/admin-messages'
import { isRemoteCatalog } from '../../services/catalog-source'
import {
  MEDIA_LIBRARY_SECTIONS,
  mediaLibraryActor,
  mediaLibraryService,
  mediaStateLabels,
  type MediaLibraryDetail,
  type LibraryAsset,
  type MediaLibraryItem,
  type MediaLibrarySection,
} from '../../services/media-library-service'
import { siteMediaService } from '../../services/site-media-service'
import {
  AdminMediaPicker,
  MediaAssetPreview,
  MediaLibraryBrowser,
} from './AdminMediaPicker'
import { AdminPageHeader } from './AdminShared'
import { useAdminNotice } from './AdminNoticeProvider'
import '../../styles/admin-media-library.css'

const purposeNames: Record<
  ImageMediaPurpose | 'film-video' | 'site-vector',
  string
> = {
  'site-vector': 'Logotipo vectorial SVG',
  'site-image': 'Imagen general de la tienda',
  'product-gallery': 'Galería del producto · 4:5',
  'product-olfactory': 'Perfil olfativo · 4:5',
  category: 'Categorías del Home · 4:5',
  'hero-desktop': 'Carrusel de escritorio · 16:9',
  'hero-mobile': 'Carrusel de móvil · 2:3',
  'finder-desktop': 'Recomendador de escritorio · 16:9',
  'finder-mobile': 'Recomendador de móvil · 2:3',
  'finder-option': 'Opción del recomendador · 1:1',
  'film-poster': 'Portada de video',
  'film-video': 'Video MP4',
}
const errorText = (error: unknown) => getAdminErrorMessage(error).description

export function AdminMediaLibrary() {
  const [view, setView] = useState<'files' | 'placements'>('files')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<MediaLibraryItem | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const importController = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(function stopImportAfterLeavingLibrary() {
    mounted.current = true
    return () => {
      mounted.current = false
      importController.current?.abort()
    }
  }, [])
  const notice = useAdminNotice()
  async function centralize() {
    if (importing) return
    const controller = new AbortController()
    importController.current = controller
    setImporting(true)
    setImportMessage('Revisando recursos actuales…')
    try {
      const actor = await mediaLibraryActor()
      const { centralizeExistingMedia } =
        await import('../../services/builtin-media-import')
      const result = await centralizeExistingMedia(
        actor,
        (done: number, total: number) => {
          if (mounted.current && !controller.signal.aborted)
            setImportMessage(`Centralizando ${done} de ${total} recursos…`)
        },
        controller.signal,
      )
      if (!mounted.current) return
      setImportMessage(
        `${result.imported} de ${result.total} recursos centralizados.`,
      )
      setRefresh((value) => value + 1)
    } catch (error) {
      if (mounted.current)
        setImportMessage(
          controller.signal.aborted
            ? 'Centralización pausada. Puedes continuar cuando quieras; los recursos confirmados se conservan.'
            : errorText(error),
        )
    } finally {
      if (importController.current === controller)
        importController.current = null
      if (mounted.current) setImporting(false)
    }
  }
  return (
    <div className="admin-page admin-media-library-page">
      <AdminPageHeader
        eyebrow="Contenido de la tienda"
        title="Biblioteca multimedia"
        description="Organiza imágenes y videos, revisa dónde se usan y reutilízalos en la tienda."
      />
      <div className="admin-media-toolbar">
        <div
          className="admin-media-tabs"
          role="group"
          aria-label="Vistas de la biblioteca"
        >
          <button
            type="button"
            aria-pressed={view === 'files'}
            onClick={() => setView('files')}
          >
            Archivos
          </button>
          <button
            type="button"
            aria-pressed={view === 'placements'}
            onClick={() => setView('placements')}
          >
            Ubicaciones de la tienda
          </button>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={!isRemoteCatalog}
          onClick={() => setUploadOpen(true)}
        >
          Subir archivo
        </button>
      </div>
      <p className="admin-media-info">
        Los archivos sin usar tienen una limpieza programada. Al asignarlos a
        una ubicación quedan protegidos; las imágenes de pedidos anteriores
        también se conservan.
      </p>
      {view === 'files' ? (
        <>
          <MediaLibraryBrowser
            refreshToken={refresh}
            onOpenItem={setSelected}
          />
          <section
            className="admin-media-centralize"
            aria-labelledby="admin-media-existing-title"
          >
            <div>
              <h2 id="admin-media-existing-title">
                Recursos actuales de la tienda
              </h2>
              <p>
                Incorpora los recursos incluidos en el sitio a la biblioteca,
                conservando su presentación actual.
              </p>
            </div>
            <button
              type="button"
              disabled={!isRemoteCatalog || importing}
              onClick={() => void centralize()}
            >
              {importing ? 'Centralizando…' : 'Centralizar recursos actuales'}
            </button>
            {importing ? (
              <button
                type="button"
                onClick={() => importController.current?.abort()}
              >
                Pausar centralización
              </button>
            ) : null}
            <p role="status" aria-live="polite">
              {importMessage}
            </p>
          </section>
        </>
      ) : (
        <SiteMediaPlacements />
      )}
      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        id="admin-media-upload"
        title="Subir a la biblioteca"
        className="admin-media-editor-dialog"
      >
        {uploadOpen ? (
          <MediaUploadForm
            onSaved={() => {
              setRefresh((value) => value + 1)
              setUploadOpen(false)
              notice.toast('Archivo guardado en la biblioteca.')
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        id="admin-media-detail"
        title={selected?.name ?? 'Detalles del archivo'}
        className="admin-media-detail-dialog"
      >
        {selected ? (
          <MediaDetailEditor
            key={selected.id}
            item={selected}
            onUpdated={(item) => {
              setSelected(item)
              setRefresh((value) => value + 1)
            }}
          />
        ) : null}
      </Dialog>
    </div>
  )
}

function MediaUploadForm({ onSaved }: { onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [purpose, setPurpose] = useState<ImageMediaPurpose | 'film-video'>(
    'site-image',
  )
  const [name, setName] = useState('')
  const [alt, setAlt] = useState('')
  const [section, setSection] = useState<MediaLibrarySection>('other')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState<MediaLibraryItem | null>(null)
  const controller = useRef<AbortController | null>(null)
  const derivedUploads = useRef<{ id: string; suffix: string }[]>([])
  useEffect(function abortUploadOnUnmount() {
    return () => controller.current?.abort()
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setError('')
    let currentUpload = uploaded
    try {
      if (!currentUpload) {
        controller.current = new AbortController()
        setMessage('Preparando y subiendo el archivo…')
        const actor = await mediaLibraryActor()
        const { prepareAndUploadLibraryImage, prepareAndUploadLibraryVideo } =
          await import('../../services/library-media-upload')
        let asset: LibraryAsset
        if (file.type === 'image/svg+xml')
          asset = await (
            await import('../../services/media-svg-upload')
          ).uploadManagedSvg(file, actor)
        else if (purpose === 'film-video') {
          const prepared = await prepareAndUploadLibraryVideo(
            file,
            actor,
            controller.current.signal,
          )
          asset = prepared.video
          derivedUploads.current = [
            { id: prepared.poster.id, suffix: ' · portada' },
            ...(prepared.mobileVideo
              ? [{ id: prepared.mobileVideo.id, suffix: ' · móvil' }]
              : []),
            ...(prepared.mobilePoster &&
            prepared.mobilePoster.id !== prepared.poster.id
              ? [{ id: prepared.mobilePoster.id, suffix: ' · portada móvil' }]
              : []),
          ]
        } else
          asset = await prepareAndUploadLibraryImage(
            file,
            purpose,
            actor,
            controller.current.signal,
          )
        currentUpload = await mediaLibraryService.detail(asset.id)
        setUploaded(currentUpload)
      }
      setMessage('Guardando los datos del archivo…')
      currentUpload = await mediaLibraryService.metadata(currentUpload, {
        name: name.trim(),
        alt: alt.trim(),
        section,
      })
      setUploaded(currentUpload)
      while (derivedUploads.current.length) {
        const next = derivedUploads.current[0]
        const item = await mediaLibraryService.detail(next.id)
        await mediaLibraryService.metadata(item, {
          name: `${name.trim()}${next.suffix}`.slice(0, 160),
          alt: alt.trim(),
          section,
        })
        derivedUploads.current.shift()
      }
      onSaved()
    } catch (cause) {
      setError(errorText(cause))
      setMessage(
        currentUpload
          ? 'El archivo ya está subido. Reintentar solo guardará sus datos.'
          : '',
      )
    } finally {
      setBusy(false)
    }
  }
  const profile =
    purpose === 'film-video' ? null : IMAGE_MEDIA_PROFILES[purpose]
  return (
    <form
      className="admin-media-form"
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
    >
      <label>
        Uso previsto
        <select
          value={purpose}
          disabled={busy || Boolean(uploaded)}
          onChange={(event) => {
            setPurpose(event.target.value as ImageMediaPurpose | 'film-video')
            setFile(null)
          }}
        >
          {Object.entries(purposeNames)
            .filter(([value]) => value !== 'site-vector')
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <p className="admin-media-help">
        {purpose === 'film-video'
          ? 'Se prepara el video y su portada. La compatibilidad de compresión depende del navegador.'
          : purpose === 'site-image'
            ? 'JPG, PNG, WebP o AVIF. Se conserva la proporción y se generan versiones WebP.'
            : `${profile?.width} × ${profile?.height} px como mínimo. Se ajustará al formato de esta ubicación.`}
      </p>
      <label>
        Archivo
        <input
          key={purpose}
          type="file"
          required={!uploaded}
          disabled={busy || Boolean(uploaded)}
          accept={
            purpose === 'film-video'
              ? 'video/mp4'
              : `image/jpeg,image/png,image/webp,image/avif${purpose === 'site-image' ? ',image/svg+xml' : ''}`
          }
          onChange={(event) => {
            const next = event.currentTarget.files?.[0] ?? null
            setFile(next)
            setUploaded(null)
            if (next?.type === 'image/svg+xml') setSection('identity')
            if (next && !name)
              setName(next.name.replace(/\.[^.]+$/, '').slice(0, 160))
          }}
        />
      </label>
      {file?.type === 'image/svg+xml' ? (
        <p className="admin-media-help">
          El SVG conserva sus vectores y se valida antes de guardarlo. Solo
          puede asignarse al logotipo de la tienda.
        </p>
      ) : null}
      <label>
        Nombre del archivo
        <input
          value={name}
          required
          maxLength={160}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Texto alternativo
        <textarea
          value={alt}
          maxLength={500}
          rows={3}
          disabled={busy}
          onChange={(event) => setAlt(event.target.value)}
        />
        <small>
          Describe el contenido para quien no pueda ver la imagen. Puede
          ajustarse después en cada ubicación.
        </small>
      </label>
      <label>
        Sección
        <select
          value={section}
          disabled={busy}
          onChange={(event) =>
            setSection(event.target.value as MediaLibrarySection)
          }
        >
          {MEDIA_LIBRARY_SECTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="admin-media-info">
        Si no lo asignas a una ubicación, el archivo quedará pendiente de
        limpieza en 24 horas.
      </p>
      {error ? (
        <p className="admin-media-error" role="alert">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <button
        type="submit"
        className="button button--primary"
        disabled={busy || !file || !name.trim()}
      >
        {busy
          ? 'Guardando…'
          : uploaded
            ? 'Reintentar datos del archivo'
            : 'Subir archivo'}
      </button>
    </form>
  )
}

function MediaDetailEditor({
  item,
  onUpdated,
}: {
  item: MediaLibraryItem
  onUpdated: (item: MediaLibraryItem) => void
}) {
  const [current, setCurrent] = useState(item)
  const [name, setName] = useState(item.name)
  const [alt, setAlt] = useState(item.alt)
  const [section, setSection] = useState(item.section)
  const [detail, setDetail] = useState<MediaLibraryDetail | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const notice = useAdminNotice()
  useEffect(
    function loadFileDetail() {
      let active = true
      void mediaLibraryService
        .detail(item.id)
        .then((value) => {
          if (active) setDetail(value)
        })
        .catch((cause: unknown) => {
          if (active) setError(errorText(cause))
        })
      return () => {
        active = false
      }
    },
    [item.id],
  )
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await mediaLibraryService.metadata(current, {
        name: name.trim(),
        alt: alt.trim(),
        section,
      })
      setCurrent(result)
      onUpdated(result)
      setMessage('Datos del archivo guardados.')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function retire() {
    if (
      busy ||
      current.useCount ||
      !(await notice.confirm({
        title: 'Programar eliminación del archivo',
        description:
          'El archivo sin usar quedará pendiente de limpieza en 24 horas. Si lo asignas antes a una ubicación, se conservará.',
        confirmLabel: 'Programar eliminación',
        destructive: true,
      }))
    )
      return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await mediaLibraryService.retire(current)
      setCurrent(result)
      onUpdated(result)
      setMessage(
        'Eliminación programada. El archivo se conserva durante las próximas 24 horas.',
      )
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function reviewCurrentVersion() {
    if (busy) return
    setBusy(true)
    try {
      const latest = await mediaLibraryService.detail(current.id)
      setCurrent(latest)
      setDetail(latest)
      setError('')
      setMessage(
        `Versión actual revisada. Nombre guardado: «${latest.name}». Tus campos se conservan; revísalos antes de guardar.`,
      )
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const retired = ['deleting', 'deleted', 'disabled'].includes(current.state)
  return (
    <div className="admin-media-detail-layout">
      <MediaAssetPreview item={current} />
      <div>
        <p className="admin-media-help">
          {mediaStateLabels[current.state]} · {purposeNames[current.purpose]}
          {current.asset
            ? ` · ${current.asset.width} × ${current.asset.height} px`
            : ''}
        </p>
        <form
          className="admin-media-form"
          onSubmit={(event) => void save(event)}
          aria-busy={busy}
        >
          <label>
            Nombre del archivo
            <input
              value={name}
              maxLength={160}
              required
              disabled={busy || retired}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Texto alternativo
            <textarea
              value={alt}
              rows={3}
              maxLength={500}
              disabled={busy || retired}
              onChange={(event) => setAlt(event.target.value)}
            />
            <small>
              Se ofrece al reutilizar el archivo; no sobrescribe los textos de
              sus ubicaciones actuales.
            </small>
          </label>
          <label>
            Sección
            <select
              value={section}
              disabled={busy || retired}
              onChange={(event) =>
                setSection(event.target.value as MediaLibrarySection)
              }
            >
              {MEDIA_LIBRARY_SECTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <div className="admin-media-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void reviewCurrentVersion()}
              >
                Revisar versión actual
              </button>
            </div>
          ) : null}
          <p role="status" aria-live="polite">
            {message}
          </p>
          <div className="admin-media-card-actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={busy || retired || !name.trim()}
            >
              {busy ? 'Guardando…' : 'Guardar datos'}
            </button>
            <button
              type="button"
              className="admin-remove"
              disabled={
                busy ||
                current.useCount > 0 ||
                retired ||
                current.state === 'pending'
              }
              onClick={() => void retire()}
            >
              Programar eliminación
            </button>
          </div>
        </form>
        <section
          className="admin-media-usages"
          aria-label="Ubicaciones del archivo"
        >
          <h3>En uso en {detail?.useCount ?? current.useCount} ubicaciones</h3>
          {detail ? (
            detail.usages.length ? (
              <ul>
                {detail.usages.map((usage, index) => (
                  <li key={`${usage.key}-${index}`}>
                    <strong>{usage.label}</strong>
                    <span>
                      {MEDIA_LIBRARY_SECTIONS.find(
                        (section) => section.value === usage.section,
                      )?.label ?? usage.section}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Este archivo no está asignado a una ubicación.</p>
            )
          ) : (
            <p>Cargando ubicaciones…</p>
          )}
        </section>
        {current.retireAfter && !current.useCount ? (
          <p className="admin-media-info">
            Limpieza programada a partir del{' '}
            {new Date(current.retireAfter).toLocaleString('es-PE')}. Asignarlo a
            una ubicación lo protege de la limpieza.
          </p>
        ) : null}
        {detail?.events.length ? (
          <details className="admin-media-history">
            <summary>Actividad del archivo</summary>
            <ul>
              {detail.events.map((event) => (
                <li key={event.id}>
                  <span>{event.type.replaceAll('_', ' ')}</span>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString('es-PE')}
                  </time>
                  {event.code ? <small>Referencia: {event.code}</small> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function SiteMediaPlacements() {
  const document = useSyncExternalStore(
    siteMediaService.subscribe,
    siteMediaService.getSnapshot,
    siteMediaService.getSnapshot,
  )
  const [selected, setSelected] = useState<SiteMediaSlot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(function loadAdminPlacements() {
    let active = true
    void siteMediaService
      .loadAdmin()
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  const definition = SITE_MEDIA_SLOTS.find((slot) => slot.slot === selected)
  return (
    <section
      className="admin-media-placements"
      aria-label="Ubicaciones de imágenes de la tienda"
    >
      <p>
        Los recursos de estas ubicaciones conservan el diseño de cada página.
        Para productos y Home, usa la biblioteca desde sus editores.
      </p>
      <div className="admin-media-editor-links">
        <Link to="/admin/home">Editar imágenes y videos del Home</Link>
        <Link to="/admin/productos">Editar fotos de productos</Link>
      </div>
      {error ? (
        <p className="admin-media-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">Cargando ubicaciones…</p> : null}
      <div className="admin-media-grid">
        {SITE_MEDIA_SLOTS.map((slot) => {
          const item = getSiteMediaItem(document, slot.slot)
          return (
            <article className="admin-media-card" key={slot.slot}>
              <div className="admin-media-thumbnail">
                <img
                  src={assetSource(item.asset?.src ?? slot.fallback.src)}
                  srcSet={imageSourceSet(
                    item.asset?.src ?? slot.fallback.src,
                    [480, 960],
                  )}
                  sizes="(max-width: 640px) calc(100vw - 64px), (max-width: 1023px) 44vw, 260px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={slot.fallback.width}
                  height={slot.fallback.height}
                />
              </div>
              <div className="admin-media-card-copy">
                <h3>{slot.name}</h3>
                <p>
                  {MEDIA_LIBRARY_SECTIONS.find(
                    (section) => section.value === slot.section,
                  )?.label ?? slot.section}
                </p>
                <small>
                  {item.asset
                    ? 'Imagen personalizada'
                    : 'Recurso original de la tienda'}
                </small>
                <button
                  type="button"
                  disabled={loading || Boolean(error) || !isRemoteCatalog}
                  onClick={() => setSelected(slot.slot)}
                >
                  Cambiar imagen
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <Dialog
        open={Boolean(definition)}
        onClose={() => setSelected(null)}
        id="admin-site-media-placement"
        title={definition?.name ?? 'Ubicación'}
        className="admin-media-editor-dialog"
      >
        {definition ? (
          <SitePlacementEditor
            key={definition.slot}
            definition={definition}
            onSaved={() => setSelected(null)}
          />
        ) : null}
      </Dialog>
    </section>
  )
}

function SitePlacementEditor({
  definition,
  onSaved,
}: {
  definition: (typeof SITE_MEDIA_SLOTS)[number]
  onSaved: () => void
}) {
  const [initial] = useState(() =>
    getSiteMediaItem(siteMediaService.getSnapshot(), definition.slot),
  )
  const [asset, setAsset] = useState(initial.asset)
  const [alt, setAlt] = useState(initial.alt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const notice = useAdminNotice()
  async function upload(file: File) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('Preparando y subiendo la imagen…')
    try {
      const actor = await mediaLibraryActor()
      const next =
        file.type === 'image/svg+xml' && definition.slot === 'identity.logo'
          ? await (
              await import('../../services/media-svg-upload')
            ).uploadManagedSvg(file, actor)
          : await (
              await import('../../services/library-media-upload')
            ).prepareAndUploadLibraryImage(
              file,
              'site-image',
              actor,
              undefined,
              definition.minimumDimensions,
            )
      setAsset(next)
      const uploaded = await mediaLibraryService.detail(next.id)
      const section: MediaLibrarySection = definition.slot.startsWith('about.')
        ? 'about'
        : definition.slot.startsWith('auth.')
          ? 'account'
          : definition.slot.startsWith('seo.')
            ? 'seo'
            : 'identity'
      await mediaLibraryService.metadata(uploaded, {
        name:
          file.name.replace(/\.[^.]+$/, '').slice(0, 160) || definition.name,
        alt: definition.decorative ? '' : alt,
        section,
      })
      setMessage('Imagen subida. Guarda esta ubicación para publicarla.')
    } catch (cause) {
      setError(errorText(cause))
      setMessage('')
    } finally {
      setBusy(false)
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await siteMediaService.save(
        definition.slot,
        asset?.id ?? null,
        alt,
        initial.version,
      )
      notice.toast('Imagen de la tienda guardada.')
      onSaved()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="admin-media-form"
      onSubmit={(event) => void save(event)}
      aria-busy={busy}
    >
      <div className="admin-media-preview">
        <img
          src={assetSource(asset?.src ?? definition.fallback.src)}
          alt={alt || definition.fallback.alt}
        />
      </div>
      <AdminMediaPicker
        purpose="site-image"
        minimumDimensions={definition.minimumDimensions}
        allowSvg={definition.slot === 'identity.logo'}
        label={definition.name}
        disabled={busy}
        onSelect={(item) => {
          if (
            item.asset &&
            ('variants' in item.asset ||
              item.asset.mimeType === 'image/svg+xml')
          ) {
            setAsset(item.asset)
            setError('')
            setMessage(
              'Imagen seleccionada. Guarda esta ubicación para publicarla.',
            )
            setAlt(
              definition.decorative ? '' : item.alt || definition.fallback.alt,
            )
          }
        }}
      />
      <p className="admin-media-help">
        Resolución mínima: {definition.minimumDimensions.width} ×{' '}
        {definition.minimumDimensions.height} px.{' '}
        {definition.slot === 'identity.logo'
          ? 'Un logotipo SVG conserva su nitidez a cualquier tamaño.'
          : 'Elige una imagen de ese tamaño o mayor para conservar la nitidez.'}
      </p>
      <label>
        Subir una imagen nueva
        <input
          type="file"
          disabled={busy}
          accept={`image/jpeg,image/png,image/webp,image/avif${definition.slot === 'identity.logo' ? ',image/svg+xml' : ''}`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void upload(file)
          }}
        />
      </label>
      {asset ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAsset(null)
            setAlt(definition.fallback.alt)
          }}
        >
          Usar recurso original
        </button>
      ) : null}
      <label>
        Texto alternativo
        <textarea
          maxLength={500}
          rows={3}
          disabled={busy || definition.decorative}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
        />
        <small>
          {definition.decorative
            ? 'Esta imagen es decorativa y se presenta sin descripción al lector de pantalla.'
            : 'Describe la imagen en el contexto de esta ubicación.'}
        </small>
      </label>
      <p className="admin-media-help">
        La biblioteca conserva el archivo original de la ubicación hasta que
        guardes los cambios. Las imágenes de pedidos anteriores permanecen
        protegidas.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error ? (
        <p className="admin-media-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button button--primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar imagen de la tienda'}
      </button>
    </form>
  )
}
