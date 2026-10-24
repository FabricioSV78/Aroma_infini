import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { isPerfume } from '../../domain/product-type'
import { adminService } from '../../services/admin-service'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { useAdminNotice } from './AdminNoticeProvider'
import { getAdminErrorMessage } from '../../services/admin-messages'
import {
  downloadProductTemplate,
  parseProductImport,
  type ProductImportPreview,
} from './product-import-excel'
import '../../styles/admin-product-import.css'

interface ReadyPreview extends ProductImportPreview {
  fileName: string
  revision: number
}

const PREVIEW_PAGE_SIZE = 25
type RowFilter = 'all' | 'invalid' | 'valid' | 'duplicate'
type ImportAction = 'reading' | 'importing' | 'retrying' | 'template' | null

export function AdminProductImport() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<HTMLOListElement>(null)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const photosLinkRef = useRef<HTMLAnchorElement>(null)
  const actionRef = useRef<ImportAction>(null)
  const [preview, setPreview] = useState<ReadyPreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState<ImportAction>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingSaveCount, setPendingSaveCount] = useState(0)
  const [rowFilter, setRowFilter] = useState<RowFilter>('all')
  const [rowPage, setRowPage] = useState(1)
  const catalogChanged =
    preview !== null &&
    busy !== 'importing' &&
    preview.revision !== state.revision
  const filteredRows = preview?.rows.filter((row) =>
    rowFilter === 'all'
      ? true
      : rowFilter === 'invalid'
        ? row.errors.length > 0
        : rowFilter === 'duplicate'
          ? row.duplicate === true
          : row.errors.length === 0,
  )
  const totalRowPages = Math.max(
    1,
    Math.ceil((filteredRows?.length ?? 0) / PREVIEW_PAGE_SIZE),
  )
  const currentRowPage = Math.min(rowPage, totalRowPages)
  const firstRow = (currentRowPage - 1) * PREVIEW_PAGE_SIZE
  const visibleRows = filteredRows?.slice(
    firstRow,
    firstRow + PREVIEW_PAGE_SIZE,
  )

  useUnsavedChanges(
    pendingSaveCount > 0 || busy === 'importing' || busy === 'retrying',
  )

  useEffect(
    function focusImportOutcome() {
      if (message) photosLinkRef.current?.focus()
    },
    [pendingSaveCount, message],
  )

  function reportSuccess(count: number) {
    setMessage(
      `${count} ${count === 1 ? 'producto importado como borrador pendiente de imágenes.' : 'productos importados como borradores pendientes de imágenes.'} Añade las fotos y revisa cada producto antes de publicarlo.`,
    )
    notice.show({
      kind: 'success',
      title: `${count} ${count === 1 ? 'producto importado' : 'productos importados'}`,
      description:
        'Se guardaron como borradores. Añade sus fotos y revisa la ficha antes de publicarlos.',
      primary: {
        label: 'Añadir imágenes',
        onClick: () => {
          photosLinkRef.current?.click()
        },
      },
      secondary: { label: 'Cerrar' },
    })
  }

  function showRows(filter: RowFilter) {
    setRowFilter(filter)
    setRowPage(1)
    if (rowsRef.current) rowsRef.current.scrollTop = 0
  }

  function showRowPage(page: number) {
    setRowPage(page)
    if (rowsRef.current) rowsRef.current.scrollTop = 0
  }

  async function readFile(file: File | undefined) {
    if (!file || actionRef.current || pendingSaveCount > 0) return
    actionRef.current = 'reading'
    setPreview(null)
    setPreviewOpen(false)
    setRowFilter('all')
    setRowPage(1)
    setError('')
    setMessage('')
    setBusy('reading')
    const snapshot = adminService.getSnapshot()
    try {
      const result = await parseProductImport(
        file,
        snapshot.brands,
        snapshot.products,
      )
      setPreview({
        ...result,
        warnings: [
          ...(result.warnings ?? []),
          ...(!snapshot.features.complementsEnabled &&
          result.products.some((record) => !isPerfume(record.product))
            ? [
                'Complementos está desactivado. Estos productos se guardarán como borradores y permanecerán ocultos hasta habilitar la categoría en Contenido del Home → Categorías.',
              ]
            : []),
        ],
        fileName: file.name,
        revision: snapshot.revision,
      })
    } catch (cause) {
      notice.error(cause, 'excel')
    } finally {
      actionRef.current = null
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function getTemplate() {
    if (actionRef.current) return
    actionRef.current = 'template'
    setBusy('template')
    setError('')
    try {
      await downloadProductTemplate(state.brands, state.features)
    } catch (cause) {
      notice.error(cause, 'download')
    } finally {
      actionRef.current = null
      setBusy(null)
    }
  }

  async function confirmImport() {
    if (
      !preview ||
      actionRef.current ||
      pendingSaveCount > 0 ||
      catalogChanged ||
      !preview.products.length
    )
      return
    actionRef.current = 'importing'
    setBusy('importing')
    setError('')
    setMessage('')
    let addedToSession = false
    try {
      // Yield before validating a large batch so the progress state can render.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const result = adminService.saveProductsBatch(
        preview.products,
        preview.revision,
      )
      if (result.kind === 'validation') {
        setError(result.message)
        return
      }
      addedToSession = true
      await adminService.flush()
      setPreview(null)
      setPreviewOpen(false)
      reportSuccess(preview.validProductCount)
    } catch (cause) {
      if (addedToSession) {
        setPreview(null)
        setPreviewOpen(false)
        setPendingSaveCount(preview.validProductCount)
      }
      if (addedToSession) showPersistenceError(cause, preview.validProductCount)
      else notice.error(cause, 'import')
    } finally {
      actionRef.current = null
      setBusy(null)
    }
  }

  function showPersistenceError(cause: unknown, count: number) {
    notice.show({
      ...getAdminErrorMessage(cause, 'storage'),
      primary: {
        label: 'Reintentar guardado',
        onClick: () => retrySave(count),
      },
      secondary: { label: 'Revisar después' },
    })
  }

  async function retrySave(count = pendingSaveCount): Promise<boolean> {
    if (!count || actionRef.current) return false
    actionRef.current = 'retrying'
    setBusy('retrying')
    setError('')
    try {
      await adminService.retryPersistence()
      reportSuccess(count)
      setPendingSaveCount(0)
      return true
    } catch (cause) {
      showPersistenceError(cause, count)
      return false
    } finally {
      actionRef.current = null
      setBusy(null)
    }
  }

  function closePreview() {
    if (actionRef.current !== 'importing') setPreviewOpen(false)
  }

  return (
    <details className="admin-product-import">
      <summary>
        <span>
          <strong>Importar productos con Excel</strong>
          <small id="admin-product-import-format">
            Una fila por presentación · .xlsx · Máx. 5 MB
          </small>
        </span>
        <span className="admin-product-import__expand" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="admin-product-import__body" aria-busy={busy !== null}>
        <div className="admin-product-import__controls">
          <button
            className="button button--secondary"
            type="button"
            aria-label="Descargar plantilla .xlsx"
            onClick={getTemplate}
            disabled={busy !== null}
          >
            {busy === 'template'
              ? 'Generando plantilla…'
              : 'Descargar plantilla'}
          </button>
          <button
            className="button button--primary"
            type="button"
            aria-describedby="admin-product-import-format admin-product-import-help"
            disabled={busy !== null || pendingSaveCount > 0}
            onClick={() => inputRef.current?.click()}
          >
            Subir Excel
          </button>
          <input
            ref={inputRef}
            id="admin-product-import-file"
            type="file"
            hidden
            aria-label="Archivo Excel .xlsx (máx. 5 MB)"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby="admin-product-import-help"
            disabled={busy !== null || pendingSaveCount > 0}
            onChange={(event) => {
              void readFile(event.currentTarget.files?.[0])
            }}
          />
        </div>
        <p
          id="admin-product-import-help"
          className="admin-product-import__hint"
        >
          Se guardan como borradores. Añade las fotos antes de publicar.
        </p>
        {busy === 'reading' || busy === 'template' ? (
          <InlineStatus className="admin-product-import__progress" busy>
            {busy === 'reading'
              ? 'Validando archivo y buscando duplicados…'
              : 'Generando plantilla Excel…'}
          </InlineStatus>
        ) : null}
        {error && !previewOpen ? (
          <p className="admin-product-import__error" role="alert">
            {error}
          </p>
        ) : null}
        {pendingSaveCount > 0 ? (
          <div className="admin-product-import__pending-save">
            <p>
              Mantén esta pestaña abierta hasta completar el guardado. No
              necesitas volver a importar el archivo.
            </p>
            <button
              ref={retryButtonRef}
              className="button button--secondary"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void retrySave()
              }}
            >
              {busy === 'retrying' ? 'Guardando…' : 'Reintentar guardado'}
            </button>
          </div>
        ) : null}
        {message ? (
          <div className="admin-product-import__success">
            <Link
              ref={photosLinkRef}
              className="admin-product-import__photos-link"
              to="/admin/productos?visibilidad=pending-images"
            >
              Ver pendientes y subir fotos
            </Link>
          </div>
        ) : null}
        {preview ? (
          <>
            <div className="admin-product-import__ready" role="status">
              <p>
                <strong>{preview.fileName}</strong>
                <span>
                  {preview.validProductCount}{' '}
                  {preview.validProductCount === 1
                    ? 'producto listo para importar'
                    : 'productos listos para importar'}
                  {preview.invalidRowCount > 0
                    ? ` · ${preview.invalidRowCount} ${preview.invalidRowCount === 1 ? 'fila por revisar' : 'filas por revisar'}`
                    : ''}
                </span>
              </p>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setPreviewOpen(true)}
                disabled={busy !== null}
              >
                Revisar filas y confirmar
              </button>
            </div>
            <Dialog
              open={previewOpen}
              onClose={closePreview}
              id="admin-product-import-preview"
              title={`Vista previa · ${preview.fileName}`}
              className="admin-product-import__dialog"
            >
              <div
                className="admin-product-import__preview"
                role="region"
                aria-label="Vista previa de importación"
                aria-busy={busy === 'importing'}
              >
                <div className="admin-product-import__preview-head">
                  <div>
                    <h3>Revisión de filas</h3>
                    <p>
                      {preview.validProductCount}{' '}
                      {preview.validProductCount === 1
                        ? 'producto'
                        : 'productos'}{' '}
                      · {preview.validRowCount}{' '}
                      {preview.validRowCount === 1
                        ? 'fila correcta'
                        : 'filas correctas'}{' '}
                      · {preview.invalidRowCount}{' '}
                      {preview.invalidRowCount === 1
                        ? 'fila con errores'
                        : 'filas con errores'}
                    </p>
                  </div>
                </div>
                <p className="admin-product-import__draft-note">
                  Se crearán borradores pendientes de imágenes. Ningún producto
                  existente se sobrescribirá.
                </p>
                {error ? (
                  <p className="admin-product-import__error" role="alert">
                    {error}
                  </p>
                ) : null}
                {catalogChanged ? (
                  <p className="admin-product-import__error" role="alert">
                    El catálogo cambió. Vuelve a cargar el archivo para
                    verificar duplicados y precios antes de importar.
                  </p>
                ) : null}
                {preview.invalidRowCount > 0 ? (
                  <p className="admin-product-import__hint">
                    Las filas con errores y sus otras presentaciones no se
                    importarán. Corrige el archivo y vuelve a cargarlo si
                    quieres incluirlas.
                  </p>
                ) : null}
                {preview.warnings?.length ? (
                  <ul className="admin-product-import__warnings">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div
                  className="admin-product-import__row-filters"
                  role="group"
                  aria-label="Filtrar filas de la vista previa"
                >
                  <button
                    type="button"
                    aria-pressed={rowFilter === 'all'}
                    onClick={() => showRows('all')}
                  >
                    Todas ({preview.rows.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={rowFilter === 'invalid'}
                    onClick={() => showRows('invalid')}
                  >
                    Con errores ({preview.invalidRowCount})
                  </button>
                  <button
                    type="button"
                    aria-pressed={rowFilter === 'valid'}
                    onClick={() => showRows('valid')}
                  >
                    Correctas ({preview.validRowCount})
                  </button>
                  <button
                    type="button"
                    aria-pressed={rowFilter === 'duplicate'}
                    onClick={() => showRows('duplicate')}
                  >
                    Duplicadas ({preview.duplicateRowCount})
                  </button>
                </div>
                {filteredRows?.length === 0 ? (
                  <p className="admin-product-import__empty" role="status">
                    {rowFilter === 'invalid'
                      ? 'No hay filas con errores en este archivo.'
                      : rowFilter === 'duplicate'
                        ? 'No se encontraron filas duplicadas.'
                        : 'No hay filas correctas en este archivo.'}
                  </p>
                ) : null}
                <ol
                  ref={rowsRef}
                  className="admin-product-import__rows"
                  tabIndex={0}
                  aria-label="Filas del archivo Excel"
                >
                  {visibleRows?.map((row) => (
                    <li
                      key={row.number}
                      className={row.errors.length ? 'is-invalid' : 'is-valid'}
                    >
                      <span className="admin-product-import__line">
                        Fila {row.number}
                      </span>
                      <div>
                        <strong>{row.name || row.slug || 'Sin nombre'}</strong>
                        <small>
                          {row.variant}
                          {row.slug ? ` · ${row.slug}` : ''}
                        </small>
                      </div>
                      <span className="admin-product-import__state">
                        {row.duplicate
                          ? 'Duplicada'
                          : row.errors.length
                            ? 'Revisar'
                            : 'Correcta'}
                      </span>
                      {row.errors.length ? (
                        <ul>
                          {row.errors.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                      {row.warnings?.length ? (
                        <ul className="admin-product-import__row-warnings">
                          {row.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {totalRowPages > 1 ? (
                  <nav
                    className="admin-product-import__pagination"
                    aria-label="Páginas de la vista previa"
                  >
                    <p aria-live="polite">
                      Filas {firstRow + 1}–
                      {Math.min(
                        firstRow + PREVIEW_PAGE_SIZE,
                        filteredRows?.length ?? 0,
                      )}{' '}
                      de {filteredRows?.length} · Página {currentRowPage} de{' '}
                      {totalRowPages}
                    </p>
                    <div>
                      <button
                        type="button"
                        disabled={currentRowPage === 1}
                        onClick={() =>
                          showRowPage(Math.max(1, currentRowPage - 1))
                        }
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={currentRowPage === totalRowPages}
                        onClick={() =>
                          showRowPage(
                            Math.min(totalRowPages, currentRowPage + 1),
                          )
                        }
                      >
                        Siguiente
                      </button>
                    </div>
                  </nav>
                ) : null}
                {busy === 'importing' ? (
                  <p className="admin-product-import__progress" role="status">
                    Guardando productos… Espera a que termine la importación.
                  </p>
                ) : null}
                <div className="admin-product-import__actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={
                      busy !== null ||
                      catalogChanged ||
                      preview.validProductCount === 0
                    }
                    onClick={() => {
                      void confirmImport()
                    }}
                  >
                    {busy === 'importing'
                      ? 'Importando…'
                      : `Confirmar e importar ${preview.validProductCount} ${preview.validProductCount === 1 ? 'producto' : 'productos'}`}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setPreview(null)
                      setPreviewOpen(false)
                      setRowFilter('all')
                      setRowPage(1)
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </Dialog>
          </>
        ) : null}
      </div>
    </details>
  )
}
