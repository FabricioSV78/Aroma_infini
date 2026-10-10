import { useRef, useState } from 'react'
import { adminService } from '../../services/admin-service'
import { useAdminStore } from './useAdminStore'
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

export function AdminProductImport() {
  const state = useAdminStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ReadyPreview | null>(null)
  const [busy, setBusy] = useState<'reading' | 'importing' | 'template' | null>(
    null,
  )
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [rowFilter, setRowFilter] = useState<'all' | 'invalid' | 'valid'>('all')
  const catalogChanged = preview !== null && preview.revision !== state.revision
  const visibleRows = preview?.rows.filter((row) =>
    rowFilter === 'all'
      ? true
      : rowFilter === 'invalid'
        ? row.errors.length > 0
        : row.errors.length === 0,
  )

  async function readFile(file: File | undefined) {
    setPreview(null)
    setRowFilter('all')
    setError('')
    setMessage('')
    if (!file) return
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
        fileName: file.name,
        revision: snapshot.revision,
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo validar el archivo.',
      )
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function getTemplate() {
    setBusy('template')
    setError('')
    try {
      await downloadProductTemplate(state.brands)
    } catch {
      setError('No se pudo generar la plantilla. Inténtalo nuevamente.')
    } finally {
      setBusy(null)
    }
  }

  async function confirmImport() {
    if (!preview || busy || catalogChanged || !preview.products.length) return
    setBusy('importing')
    setError('')
    setMessage('')
    const result = adminService.saveProductsBatch(
      preview.products,
      preview.revision,
    )
    if (result.kind === 'validation') {
      setError(result.message)
      setBusy(null)
      return
    }
    try {
      await adminService.flush()
      setPreview(null)
      setMessage(
        `${preview.validProductCount} ${preview.validProductCount === 1 ? 'producto importado' : 'productos importados'}. Revisa los borradores sin imagen antes de publicarlos.`,
      )
    } catch {
      setPreview(null)
      setError(
        'Los productos se añadieron a esta sesión, pero no se pudieron guardar en el navegador. Revisa el almacenamiento antes de continuar.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="admin-product-import">
      <summary>
        <span>
          <strong>Importar productos con Excel</strong>
          <small>
            Carga presentaciones en lote y revisa cada fila antes de guardar.
          </small>
        </span>
        <span className="admin-product-import__expand" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="admin-product-import__body">
        <div className="admin-product-import__controls">
          <button
            className="button button--secondary"
            type="button"
            onClick={getTemplate}
            disabled={busy !== null}
          >
            {busy === 'template'
              ? 'Generando plantilla…'
              : 'Descargar plantilla .xlsx'}
          </button>
          <label htmlFor="admin-product-import-file">
            Archivo Excel .xlsx (máx. 5 MB)
            <input
              ref={inputRef}
              id="admin-product-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy !== null}
              onChange={(event) => {
                void readFile(event.currentTarget.files?.[0])
              }}
            />
          </label>
        </div>
        <ol className="admin-product-import__steps">
          <li>Descarga la plantilla y revisa la hoja Ejemplo.</li>
          <li>Completa solo Productos: una fila por presentación y tamaño.</li>
          <li>Sube el archivo y revisa los errores antes de confirmar.</li>
        </ol>
        <p className="admin-product-import__hint">
          Imágenes: escribe una URL HTTPS pública. Si aún no tienes foto, deja
          imagen vacía y marca activo=no. Podrás subirla al editar el producto.
        </p>
        {busy === 'reading' ? <p role="status">Validando archivo…</p> : null}
        {error ? (
          <p className="admin-product-import__error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="admin-product-import__success" role="status">
            {message}
          </p>
        ) : null}
        {preview ? (
          <div
            className="admin-product-import__preview"
            aria-label="Vista previa de importación"
          >
            <div className="admin-product-import__preview-head">
              <div>
                <h2>Vista previa: {preview.fileName}</h2>
                <p>
                  {preview.validProductCount}{' '}
                  {preview.validProductCount === 1 ? 'producto' : 'productos'} ·{' '}
                  {preview.validRowCount}{' '}
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
            {catalogChanged ? (
              <p className="admin-product-import__error" role="alert">
                El catálogo cambió. Vuelve a cargar el archivo para verificar
                duplicados y precios antes de importar.
              </p>
            ) : null}
            {preview.invalidRowCount > 0 ? (
              <p className="admin-product-import__hint">
                Las filas con errores y sus otras presentaciones no se
                importarán. Corrige el archivo y vuelve a cargarlo si quieres
                incluirlas.
              </p>
            ) : null}
            <div
              className="admin-product-import__row-filters"
              role="group"
              aria-label="Filtrar filas de la vista previa"
            >
              <button
                type="button"
                aria-pressed={rowFilter === 'all'}
                onClick={() => setRowFilter('all')}
              >
                Todas ({preview.rows.length})
              </button>
              <button
                type="button"
                aria-pressed={rowFilter === 'invalid'}
                onClick={() => setRowFilter('invalid')}
              >
                Con errores ({preview.invalidRowCount})
              </button>
              <button
                type="button"
                aria-pressed={rowFilter === 'valid'}
                onClick={() => setRowFilter('valid')}
              >
                Correctas ({preview.validRowCount})
              </button>
            </div>
            <ol className="admin-product-import__rows">
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
                    {row.errors.length ? 'Revisar' : 'Correcta'}
                  </span>
                  {row.errors.length ? (
                    <ul>
                      {row.errors.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
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
                  setRowFilter('all')
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  )
}
