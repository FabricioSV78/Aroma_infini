import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type DragEvent,
} from 'react'
import type { AdminProduct } from '../../services/admin-service'
import type { ProductGalleryView } from '../../types/catalog'
import { isPerfume } from '../../domain/product-type'
import { imageSource } from '../../services/image-source'
import { prepareProductPhoto } from '../../services/product-photo-upload'
import { UserFacingError } from '../../services/admin-messages'
import { Dialog } from '../../components/ui/Dialog'
import { useAdminNotice } from './AdminNoticeProvider'
import './admin-product-photos.css'

interface AdminProductPhotosProps {
  record: AdminProduct
  onChange: Dispatch<SetStateAction<AdminProduct>>
  busy: boolean
  /** Also update the parent's synchronous navigation/save guard. */
  onBusyChange: (busy: boolean) => void
}

const photoNames = [
  'Imagen principal',
  'Imagen secundaria 1',
  'Imagen secundaria 2',
  'Imagen secundaria 3',
  'Imagen de familia olfativa',
] as const
const fileTypes = 'image/jpeg,image/png,image/webp,image/avif'
const dragType = 'application/x-aroma-product-photo'
const emptyView = (): ProductGalleryView => ({
  image: '',
  alt: '',
  framing: 'full',
})

function photoSlots(record: AdminProduct): ProductGalleryView[] {
  const slots = Array.from({ length: 4 }, (_, index) => ({
    ...(record.detail.gallery[index] ?? emptyView()),
  }))
  if (isPerfume(record.product)) {
    slots.push({
      image: record.detail.olfactoryImage ?? '',
      alt: '',
      framing: 'full',
    })
  }
  return slots
}

function applySlots(
  record: AdminProduct,
  slots: ProductGalleryView[],
): AdminProduct {
  const gallery = slots.slice(0, 4).filter((view) => view.image.trim())
  return {
    ...record,
    product: { ...record.product, image: gallery[0]?.image ?? '' },
    detail: {
      ...record.detail,
      gallery: gallery.length ? gallery : [emptyView()],
      olfactoryImage: isPerfume(record.product)
        ? slots[4]?.image || null
        : null,
    },
  }
}

export function AdminProductPhotos({
  record,
  onChange,
  busy,
  onBusyChange,
}: AdminProductPhotosProps) {
  const notice = useAdminNotice()
  const inputRef = useRef<HTMLInputElement>(null)
  const preparingRef = useRef(false)
  const [preparing, setPreparing] = useState<number | 'batch' | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<{
    image: string
    title: string
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<number | 'batch' | null>(null)
  const slots = photoSlots(record)
  const count = slots.filter((view) => view.image.trim()).length
  const remaining = slots.length - count
  const locked = busy || preparing !== null

  async function upload(files: File[], target?: number) {
    if (!files.length || preparingRef.current || busy) return
    const destinations =
      typeof target === 'number' && files.length === 1
        ? [target]
        : slots.flatMap((view, index) => (view.image.trim() ? [] : [index]))
    if (files.length > destinations.length) {
      notice.error(
        new UserFacingError(
          'image-gallery-limit',
          destinations.length
            ? `Puedes añadir ${destinations.length} ${destinations.length === 1 ? 'foto más' : 'fotos más'}. Selecciona hasta esa cantidad.`
            : 'Todos los espacios tienen una foto. Usa Reemplazar o quita una para añadir otra.',
        ),
        'image',
      )
      return
    }
    preparingRef.current = true
    onBusyChange(true)
    setPreparing(
      typeof target === 'number' && files.length === 1 ? target : 'batch',
    )
    setMessage(`Preparando 0 de ${files.length} fotos…`)
    try {
      const images: string[] = []
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        try {
          images.push(
            await prepareProductPhoto(
              file,
              destinations[index] === 4 ? 'olfactory' : 'gallery',
            ),
          )
          setMessage(`Preparando ${index + 1} de ${files.length} fotos…`)
        } catch (error) {
          if (error instanceof UserFacingError) {
            throw new UserFacingError(
              error.code,
              `${file.name}: ${error.message} No se añadió ninguna foto.`,
            )
          }
          throw error
        }
      }
      const proposed = slots.map((view) => ({ ...view }))
      images.forEach((image, index) => {
        proposed[destinations[index]] = { image, alt: '', framing: 'full' }
      })
      const repeatedGalleryPhoto = images.some(
        (image, index) =>
          destinations[index] < 4 &&
          proposed
            .slice(0, 4)
            .some(
              (view, position) =>
                position !== destinations[index] && view.image === image,
            ),
      )
      if (repeatedGalleryPhoto) {
        throw new UserFacingError(
          'image-duplicate',
          'Una foto está repetida en la galería. Selecciona fotografías diferentes. No se añadió ninguna foto.',
        )
      }
      onChange((current) => {
        const next = photoSlots(current)
        images.forEach((image, index) => {
          next[destinations[index]] = { image, alt: '', framing: 'full' }
        })
        return applySlots(current, next)
      })
      notice.toast(
        `${files.length === 1 ? 'Foto preparada' : `${files.length} fotos preparadas`}. Revisa las posiciones y guarda los cambios.`,
      )
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      preparingRef.current = false
      onBusyChange(false)
      setPreparing(null)
      setMessage('')
    }
  }

  function assign(from: number, to: number, reorder = false) {
    if (locked || preparingRef.current || from === to) return
    if (from === 4 || to === 4) {
      const entering = from === 4 ? slots[from].image : slots[to].image
      const destination = from === 4 ? to : from
      if (
        entering &&
        slots
          .slice(0, 4)
          .some(
            (view, index) => index !== destination && view.image === entering,
          )
      ) {
        notice.error(
          new UserFacingError(
            'image-duplicate',
            'Esta foto ya está en la galería. Elige otra ubicación o reemplaza la imagen repetida.',
          ),
          'image',
        )
        return
      }
    }
    onChange((current) => {
      const next = photoSlots(current)
      if (!next[from]?.image || !next[to]) return current
      if (reorder && from < 4 && to < 4) {
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
      } else {
        ;[next[from], next[to]] = [next[to], next[from]]
      }
      return applySlots(current, next)
    })
    setMessage(`Foto asignada a ${photoNames[to].toLocaleLowerCase('es')}.`)
  }

  function remove(index: number) {
    if (locked || preparingRef.current) return
    onChange((current) => {
      const next = photoSlots(current)
      next[index] = emptyView()
      return applySlots(current, next)
    })
    setMessage('Foto quitada del borrador. Guarda para aplicar el cambio.')
  }

  function drop(event: DragEvent<HTMLElement>, target?: number) {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    if (locked || preparingRef.current) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length) {
      void upload(files, target)
      return
    }
    const source = event.dataTransfer.getData(dragType).split(':')
    if (source[0] === record.product.id && typeof target === 'number') {
      const index = Number(source[1])
      if (Number.isInteger(index) && index >= 0 && index < slots.length)
        assign(index, target, true)
    }
  }

  const slotCards = slots.map((view, index) => {
    const olfactory = index === 4
    return (
      <div
        key={index}
        className={`${olfactory ? 'admin-product-olfactory-slot' : 'admin-product-upload-item'} admin-product-photo-slot${dropTarget === index ? ' is-drop-target' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!locked) setDropTarget(index)
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => drop(event, index)}
      >
        {view.image ? (
          <img
            src={imageSource(view.image)}
            alt={photoNames[index]}
            draggable={!locked}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                dragType,
                `${record.product.id}:${index}`,
              )
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDropTarget(null)}
          />
        ) : (
          <div className="admin-product-upload-placeholder" aria-hidden="true">
            <span>{index + 1}</span>
            Sin imagen
          </div>
        )}
        <div className="admin-product-photo-slot-content">
          <strong>{photoNames[index]}</strong>
          {olfactory ? (
            <small>Solo en la sección Familia olfativa.</small>
          ) : index === 0 ? (
            <small>Portada de la tienda y primera foto.</small>
          ) : null}
          <div className="admin-product-photo-controls">
            <label className="admin-home-file-button">
              {preparing === index
                ? 'Preparando…'
                : view.image
                  ? 'Reemplazar'
                  : 'Subir archivo'}
              <input
                type="file"
                accept={fileTypes}
                aria-label={
                  olfactory
                    ? 'Subir imagen del perfil olfativo'
                    : `${view.image ? 'Reemplazar' : 'Subir'} ${index === 0 ? 'foto principal' : `vista ${index + 1}`} del producto`
                }
                disabled={locked}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void upload([file], index)
                }}
              />
            </label>
            {view.image ? (
              <>
                <button
                  type="button"
                  disabled={locked}
                  className="admin-product-photo-preview"
                  onClick={() =>
                    setPreview({ image: view.image, title: photoNames[index] })
                  }
                >
                  Ver foto
                </button>
                <button
                  type="button"
                  disabled={locked}
                  className="admin-remove"
                  onClick={() => remove(index)}
                >
                  Quitar
                </button>
              </>
            ) : null}
          </div>
          {view.image ? (
            <div className="admin-product-photo-slot-assignment">
              <label>
                Ubicación
                <select
                  aria-label={`Ubicación de foto ${index + 1}`}
                  value={index}
                  disabled={locked}
                  onChange={(event) =>
                    assign(index, Number(event.target.value))
                  }
                >
                  {slots.map((_, target) => (
                    <option key={target} value={target}>
                      {photoNames[target]}
                    </option>
                  ))}
                </select>
              </label>
              {!olfactory ? (
                <div
                  className="admin-product-photo-order"
                  aria-label={`Orden de foto ${index + 1}`}
                >
                  <button
                    type="button"
                    disabled={locked || index === 0}
                    aria-label={`Mover foto ${index + 1} antes`}
                    onClick={() => assign(index, index - 1, true)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={
                      locked ||
                      index >=
                        record.detail.gallery.filter((item) =>
                          item.image.trim(),
                        ).length -
                          1
                    }
                    aria-label={`Mover foto ${index + 1} después`}
                    onClick={() => assign(index, index + 1, true)}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  })

  return (
    <div
      className={`admin-product-upload-area admin-product-photos${dropTarget === 'batch' ? ' is-drop-target' : ''}`}
      aria-busy={preparing !== null}
      onDragOver={(event) => {
        event.preventDefault()
        if (!locked) setDropTarget('batch')
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(event) => drop(event)}
    >
      <div className="admin-product-upload-toolbar">
        <button
          type="button"
          className="button button--primary"
          disabled={locked || remaining === 0}
          aria-describedby="product-photo-help product-photo-count"
          onClick={() => inputRef.current?.click()}
        >
          {preparing === 'batch' ? 'Preparando fotos…' : 'Subir fotos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={fileTypes}
          aria-label="Subir varias fotos del producto"
          disabled={locked || remaining === 0}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            void upload(files)
          }}
        />
        <span id="product-photo-count" role="status">
          {count} de {slots.length} fotos
        </span>
      </div>
      <p id="product-photo-help">
        Arrastra tus fotos aquí o selecciona hasta {slots.length} juntas. Revisa
        las posiciones antes de guardar.
      </p>
      <p className="admin-product-photo-requirements">
        JPG, PNG, WebP o AVIF · hasta 20 MB por foto · galería desde 800 × 1000
        px{slots.length === 5 ? ' · olfativa desde 960 × 1200 px' : ''}.
      </p>
      {message ? (
        <p className="admin-product-upload-feedback" role="status">
          {message}
        </p>
      ) : null}
      <div className="admin-product-upload-grid">{slotCards.slice(0, 4)}</div>
      {slotCards[4] ?? null}
      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        id="admin-product-photo-preview"
        title={preview?.title ?? 'Vista previa de la fotografía'}
        className="admin-product-photo-preview-dialog"
      >
        {preview ? (
          <img src={imageSource(preview.image)} alt={preview.title} />
        ) : null}
      </Dialog>
    </div>
  )
}
