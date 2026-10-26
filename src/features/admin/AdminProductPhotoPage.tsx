import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { getProductPhotoStatus } from '../../domain/product-photos'
import {
  adminService,
  getStoreProducts,
  type AdminProduct,
} from '../../services/admin-service'
import { saveProductPhotos } from '../../services/product-photos'
import { ProductDetailPreview } from '../product/ProductPage'
import { AdminProductPhotos } from './AdminProductPhotos'
import { AdminPageHeader } from './AdminShared'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminStore } from './useAdminStore'
import { useAdminSave } from './useAdminSave'
import { useAdminNotice } from './AdminNoticeProvider'

export function AdminProductPhotoPage() {
  const { id } = useParams()
  const state = useAdminStore()
  const record = state.products.find((item) => item.product.id === id)
  return record ? (
    <ProductPhotoWorkspace key={id} record={record} />
  ) : (
    <div className="admin-page admin-empty">
      <h1>Producto no encontrado</h1>
      <Link to="/admin/productos">Volver a productos</Link>
    </div>
  )
}

function ProductPhotoWorkspace({ record }: { record: AdminProduct }) {
  const state = useAdminStore()
  const location = useLocation()
  const navigate = useNavigate()
  const notice = useAdminNotice()
  const persistence = useAdminSave()
  const [draft, setDraft] = useState<AdminProduct>(() =>
    structuredClone(record),
  )
  const [initial] = useState(draft)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const allowNavigation = useRef(false)
  const confirming = useRef(false)
  const returnTo =
    typeof location.state?.returnTo === 'string' &&
    location.state.returnTo.startsWith('/admin/productos')
      ? (location.state.returnTo as string)
      : '/admin/productos'
  const [queue] = useState<string[]>(() => {
    const ids: unknown = location.state?.photoQueue
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string')
      ? [...new Set(ids)]
      : state.products
          .filter((item) => getProductPhotoStatus(item).status !== 'complete')
          .map((item) => item.product.id)
  })
  const photoStatus = getProductPhotoStatus(draft)
  const dirty =
    draft !== initial ||
    mediaBusy ||
    persistence.saving ||
    persistence.persistenceFailed
  const blocker = useBlocker(
    () => (dirty || busyRef.current) && !allowNavigation.current,
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (blocker.state !== 'blocked' || confirming.current) return
    confirming.current = true
    void notice
      .confirm({
        title: '¿Salir sin guardar?',
        description: 'Las fotografías que preparaste se perderán.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        destructive: true,
      })
      .then((confirmed) => {
        if (confirmed) blocker.proceed()
        else blocker.reset()
      })
      .finally(() => {
        confirming.current = false
      })
  }, [blocker, notice])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      busyRef.current ||
      mediaBusy ||
      persistence.saving ||
      persistence.persistenceFailed
    )
      return
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const continuing =
      submitter instanceof HTMLButtonElement && submitter.value === 'continue'
    setError('')
    const result = await persistence.save(
      () => saveProductPhotos(record.product.id, draft.detail),
      () => {
        allowNavigation.current = true
        const currentIndex = queue.indexOf(record.product.id)
        const ordered = [
          ...queue.slice(currentIndex + 1),
          ...queue.slice(0, Math.max(0, currentIndex)),
        ]
        const next = continuing
          ? ordered.find((id) => {
              const item = adminService
                .getSnapshot()
                .products.find((item) => item.product.id === id)
              return item && getProductPhotoStatus(item).status !== 'complete'
            })
          : undefined
        notice.toast(
          next
            ? 'Fotografías guardadas. Siguiente producto.'
            : 'Fotografías guardadas.',
        )
        if (next)
          navigate(`/admin/productos/${next}/fotos`, {
            state: { returnTo, photoQueue: queue },
          })
        else navigate(returnTo)
      },
    )
    if (result?.kind === 'validation') setError(result.message)
  }

  return (
    <div className="admin-page admin-editor-page admin-photo-workspace">
      <Link className="admin-back" to={returnTo}>
        ← Volver a productos
      </Link>
      <AdminPageHeader
        eyebrow="Fotografías de producto"
        title={`Fotografías de ${record.product.name}`}
        description={`SKU ${record.product.sku ?? 'pendiente'} · ${photoStatus.count}/${photoStatus.expected} fotos · ${record.active ? 'Activo' : 'Desactivado'}`}
      />
      <form
        className="admin-editor"
        onSubmit={submit}
        aria-busy={persistence.saving}
        inert={persistence.saving || persistence.persistenceFailed}
      >
        <section aria-labelledby="product-photos-title">
          <header>
            <div>
              <h2 id="product-photos-title">Fotografías</h2>
              <p>
                Revisa la imagen principal y la asignación antes de guardar.
              </p>
            </div>
          </header>
          <AdminProductPhotos
            record={draft}
            onChange={setDraft}
            busy={persistence.saving || persistence.persistenceFailed}
            onBusyChange={(value) => {
              busyRef.current = value
              setMediaBusy(value)
            }}
          />
        </section>
        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-editor-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={
              mediaBusy || persistence.saving || persistence.persistenceFailed
            }
          >
            {persistence.saving ? 'Guardando…' : 'Guardar fotos'}
          </button>
          <button
            className="button button--secondary"
            name="afterSave"
            value="continue"
            type="submit"
            disabled={
              mediaBusy || persistence.saving || persistence.persistenceFailed
            }
          >
            Guardar y continuar
          </button>
          <button
            className="button button--secondary admin-product-preview-open"
            type="button"
            disabled={mediaBusy || persistence.saving}
            onClick={() => setPreview(true)}
          >
            Vista previa
          </button>
          <Link to={returnTo}>Cancelar</Link>
        </div>
      </form>
      <AdminSaveFeedback {...persistence} />
      <Dialog
        id="admin-product-photos-preview"
        open={preview}
        onClose={() => setPreview(false)}
        title="Vista previa del producto"
        className="admin-product-preview-dialog"
      >
        {preview ? (
          <ProductDetailPreview
            record={draft}
            products={getStoreProducts()}
            brands={state.brands}
          />
        ) : null}
      </Dialog>
    </div>
  )
}
