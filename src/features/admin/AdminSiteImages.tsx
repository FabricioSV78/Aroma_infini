import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Link } from 'react-router'
import { LoadingImage } from '../../components/media/LoadingImage'
import { Dialog } from '../../components/ui/Dialog'
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
  mediaAdminActor,
  mediaAdminService,
  type MediaSection,
} from '../../services/media-admin-service'
import { siteMediaService } from '../../services/site-media-service'
import { useAdminNotice } from './AdminNoticeProvider'
import '../../styles/admin-site-images.css'

interface EditorState {
  dirty: boolean
  busy: boolean
}

const errorText = (error: unknown) => getAdminErrorMessage(error).description

/** Fixed placements only: each image is uploaded directly from its editor. */
export function AdminSiteImages({
  onPendingChange,
}: {
  onPendingChange: (pending: boolean) => void
}) {
  const document = useSyncExternalStore(
    siteMediaService.subscribe,
    siteMediaService.getSnapshot,
    siteMediaService.getSnapshot,
  )
  const [selected, setSelected] = useState<SiteMediaSlot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const placementRequest = useRef<ReturnType<typeof siteMediaService.loadAdmin> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [editorBusy, setEditorBusy] = useState(false)
  const editorState = useRef<EditorState>({ dirty: false, busy: false })
  const confirmingClose = useRef(false)
  const notice = useAdminNotice()
  const updateEditorState = useCallback(
    (next: EditorState) => {
      editorState.current = next
      setEditorBusy(next.busy)
      onPendingChange(next.dirty || next.busy)
    },
    [onPendingChange],
  )

  useEffect(function loadAdminPlacements() {
    let active = true
    // StrictMode replays this effect in development. Reuse only this mounted
    // editor's in-flight read; the service still verifies the captured actor.
    placementRequest.current ??= siteMediaService.loadAdmin()
    void placementRequest.current
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attempt])

  useEffect(
    () => () => onPendingChange(false),
    [onPendingChange],
  )

  function finishEditor() {
    updateEditorState({ dirty: false, busy: false })
    setSelected(null)
  }

  async function closeEditor() {
    if (editorState.current.busy || confirmingClose.current) return
    if (editorState.current.dirty) {
      confirmingClose.current = true
      try {
        const discard = await notice.confirm({
          title: '¿Cerrar sin guardar?',
          description:
            'La imagen actual seguirá publicada. Perderás los cambios pendientes de esta ubicación.',
          confirmLabel: 'Cerrar sin guardar',
          cancelLabel: 'Seguir editando',
          destructive: true,
        })
        if (!discard) return
      } finally {
        confirmingClose.current = false
      }
    }
    finishEditor()
  }

  const definition = SITE_MEDIA_SLOTS.find((slot) => slot.slot === selected)
  return (
    <section
      className="admin-media-placements"
      aria-label="Ubicaciones de imágenes de la tienda"
    >
      <div className="admin-media-editor-links">
        <Link to="/admin/home">Editar imágenes y videos del Home</Link>
        <Link to="/admin/productos">Editar fotos de productos</Link>
      </div>
      {error ? (
        <div className="admin-media-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError('')
              setLoading(true)
              placementRequest.current = null
              setAttempt((value) => value + 1)
            }}
          >
            Volver a intentar
          </button>
        </div>
      ) : null}
      {loading ? <p role="status">Cargando imágenes…</p> : null}
      <div className="admin-media-grid" aria-busy={loading}>
        {SITE_MEDIA_SLOTS.map((slot) => {
          const item = getSiteMediaItem(document, slot.slot)
          return (
            <article className="admin-media-card" key={slot.slot}>
              <div className="admin-media-thumbnail">
                <LoadingImage
                  fallback="inline"
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
                <p>{slot.section}</p>
                <small>
                  {item.asset ? 'Imagen personalizada' : 'Imagen actual'}
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
        onClose={() => void closeEditor()}
        closeDisabled={editorBusy}
        id="admin-site-media-placement"
        title={definition?.name ?? 'Imagen del sitio'}
        className="admin-media-editor-dialog"
        isolateEvents
      >
        {definition ? (
          <SitePlacementEditor
            key={definition.slot}
            definition={definition}
            onSaved={finishEditor}
            onStateChange={updateEditorState}
          />
        ) : null}
      </Dialog>
    </section>
  )
}

function SitePlacementEditor({
  definition,
  onSaved,
  onStateChange,
}: {
  definition: (typeof SITE_MEDIA_SLOTS)[number]
  onSaved: () => void
  onStateChange: (state: EditorState) => void
}) {
  const [initial] = useState(() =>
    getSiteMediaItem(siteMediaService.getSnapshot(), definition.slot),
  )
  const [asset, setAsset] = useState(initial.asset)
  const [alt, setAlt] = useState(initial.alt)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dirty = asset?.id !== initial.asset?.id || alt !== initial.alt
  const notice = useAdminNotice()
  useEffect(() => onStateChange({ dirty, busy }), [dirty, busy, onStateChange])

  async function upload(file: File) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setMessage('Preparando y subiendo la imagen…')
    try {
      const actor = await mediaAdminActor()
      const next =
        file.type === 'image/svg+xml' && definition.slot === 'identity.logo'
          ? await (
              await import('../../services/media-svg-upload')
            ).uploadManagedSvg(file, actor)
          : await (
              await import('../../services/site-image-upload')
            ).prepareAndUploadSiteImage(
              file,
              'site-image',
              actor,
              undefined,
              definition.minimumDimensions,
            )
      setAsset(next)
      const uploaded = await mediaAdminService.detail(next.id)
      const section: MediaSection = definition.slot.startsWith('about.')
        ? 'about'
        : definition.slot.startsWith('auth.')
          ? 'account'
          : definition.slot.startsWith('seo.')
            ? 'seo'
            : 'identity'
      await mediaAdminService.metadata(uploaded, {
        name:
          file.name.replace(/\.[^.]+$/, '').slice(0, 160) || definition.name,
        alt: definition.decorative ? '' : alt,
        section,
      })
      setMessage('Imagen subida. Guarda los cambios para publicarla.')
    } catch (cause) {
      setError(errorText(cause))
      setMessage('')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await siteMediaService.save(
        definition.slot,
        asset?.id ?? null,
        definition.decorative ? '' : alt,
        initial.version,
      )
      notice.toast('Imagen de la tienda guardada.')
      onSaved()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      busyRef.current = false
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
        <LoadingImage
          fallback="inline"
          src={assetSource(asset?.src ?? definition.fallback.src)}
          alt={alt || definition.fallback.alt}
        />
      </div>
      <p className="admin-media-help">
        Resolución mínima: {definition.minimumDimensions.width} ×{' '}
        {definition.minimumDimensions.height} px.
        {definition.slot === 'identity.logo'
          ? ' También puedes subir un logotipo SVG.'
          : ''}
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
            setMessage('Guarda los cambios para aplicar esta imagen.')
          }}
        >
          Usar imagen original
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
            ? 'Esta imagen es decorativa y no necesita descripción.'
            : 'Describe brevemente la imagen.'}
        </small>
      </label>
      <p className="admin-media-help">
        La imagen actual se conserva hasta que guardes los cambios.
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
