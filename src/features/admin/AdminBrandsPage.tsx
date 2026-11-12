import './admin-operations.css'
import { useRef, useState, type FormEvent } from 'react'
import { type AdminBrand } from '../../services/admin-service'
import { AdminPagination } from './AdminPagination'
import { AdminPageHeader, AdminStatus } from './AdminShared'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminNotice } from './AdminNoticeProvider'
import { brandSlug } from '../../domain/brand-registration'
import { catalogAdminService } from '../../services/catalog-admin-service'
import {
  AdminBrandRegistration,
  AdminBrandRegistrationResult,
  type BrandRegistrationSummary,
} from './AdminBrandRegistration'

export function AdminBrandsPage() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const [form, setForm] = useState<AdminBrand | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminBrand | null>(null)
  const [registrationText, setRegistrationText] = useState<string | null>(null)
  const [registrationSummary, setRegistrationSummary] =
    useState<BrandRegistrationSummary | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const persistence = useAdminSave({ catalog: true })
  const pagination = useAdminPagination(state.brands, 12)
  const dirty = Boolean(
    registrationText?.trim() ||
    (form &&
      originalForm &&
      JSON.stringify(form) !== JSON.stringify(originalForm)),
  )
  useUnsavedChanges(
    dirty || persistence.saving || persistence.persistenceFailed,
  )

  function openEditor(brand: AdminBrand) {
    setRegistrationText(null)
    setError('')
    setActionError('')
    setForm(brand)
    setOriginalForm(brand)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  async function closeRegistration() {
    if (
      registrationText?.trim() &&
      !(await notice.confirm({
        title: '¿Descartar la lista de marcas?',
        description: 'Las marcas de esta lista todavía no se han guardado.',
        confirmLabel: 'Descartar lista',
        cancelLabel: 'Seguir revisando',
        destructive: true,
      }))
    )
      return
    setRegistrationText(null)
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Descartar los cambios de la marca?',
        description: 'Se conservarán los datos guardados anteriormente.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        destructive: true,
      }))
    )
      return
    setForm(null)
    setOriginalForm(null)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setError('')
    const result = await persistence.save(
      () => catalogAdminService.saveBrand(form),
      () => {
        setForm(null)
        setOriginalForm(null)
        notice.toast('Marca guardada.')
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function toggle(brand: AdminBrand) {
    if (persistence.saving || persistence.persistenceFailed) return
    if (
      brand.active &&
      !(await notice.confirm({
        title: `¿Desactivar ${brand.name}?`,
        description:
          'La marca y sus productos dejarán de mostrarse en la tienda. Podrás activarla nuevamente.',
        confirmLabel: 'Desactivar marca',
        destructive: true,
      }))
    )
      return
    setActionError('')
    const result = await persistence.save(
      () => catalogAdminService.setBrandActive(brand.id, !brand.active),
      () => notice.toast(`Marca ${brand.active ? 'desactivada' : 'activada'}.`),
    )
    if (result?.kind === 'validation') setActionError(result.message)
  }

  return (
    <div className="admin-page admin-brands-page">
      <AdminPageHeader
        eyebrow="Organización del surtido"
        title="Marcas"
        description="Gestiona las marcas visibles en la tienda."
      />
      {!form && registrationText === null ? (
        <div className="admin-list-toolbar">
          <p>
            {state.brands.length}{' '}
            {state.brands.length === 1 ? 'marca' : 'marcas'}
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={persistence.saving || persistence.persistenceFailed}
            onClick={() => {
              setRegistrationText('')
              setRegistrationSummary(null)
              setActionError('')
            }}
          >
            Registrar marcas
          </button>
        </div>
      ) : null}
      {registrationText !== null ? (
        <AdminBrandRegistration
          text={registrationText}
          onTextChange={setRegistrationText}
          brands={state.brands}
          revision={state.revision}
          persistence={persistence}
          onCancel={() => void closeRegistration()}
          onSaved={(summary) => {
            setRegistrationText(null)
            setRegistrationSummary(summary)
            notice.toast(
              `${summary.created.length} ${summary.created.length === 1 ? 'marca creada' : 'marcas creadas'}.`,
            )
          }}
        />
      ) : null}
      {registrationSummary && registrationText === null ? (
        <AdminBrandRegistrationResult summary={registrationSummary} />
      ) : null}
      {form ? (
        <form
          className="admin-compact-form"
          onSubmit={save}
          aria-busy={persistence.saving}
          inert={persistence.saving || persistence.persistenceFailed}
        >
          <header>
            <h2 ref={editorHeadingRef} tabIndex={-1}>
              {state.brands.some((brand) => brand.id === form.id)
                ? 'Editar marca'
                : 'Nueva marca'}
            </h2>
            <p>
              El nombre se muestra en la tienda. La URL se completa
              automáticamente.
            </p>
          </header>
          <div className="admin-inline-fields">
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => {
                    if (!current) return current
                    const nextName = event.target.value
                    const automaticSlug =
                      !current.slug || current.slug === brandSlug(current.name)
                    return {
                      ...current,
                      name: nextName,
                      slug: automaticSlug ? brandSlug(nextName) : current.slug,
                    }
                  })
                }
                required
              />
            </label>
            <label>
              URL de la marca
              <input
                value={form.slug}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, slug: event.target.value.toLowerCase() }
                      : current,
                  )
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Usa letras minúsculas, números y guiones."
                required
              />
            </label>
          </div>
          {error ? (
            <p className="admin-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="admin-inline-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={persistence.saving || persistence.persistenceFailed}
              aria-busy={persistence.saving}
            >
              {persistence.saving ? 'Guardando…' : 'Guardar marca'}
            </button>
            <button
              type="button"
              onClick={() => void closeEditor()}
              disabled={persistence.saving || persistence.persistenceFailed}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <AdminSaveFeedback {...persistence} />
      {actionError ? (
        <p className="admin-form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {state.brands.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Marcas de la tienda</caption>
            <thead>
              <tr>
                <th scope="col">Marca</th>
                <th scope="col">URL</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((brand) => (
                <tr key={brand.id}>
                  <th scope="row">
                    <span className="admin-cell-label">Marca</span>
                    {brand.name}
                  </th>
                  <td>
                    <span className="admin-cell-label">URL</span>
                    /marcas/{brand.slug}
                  </td>
                  <td>
                    <span className="admin-cell-label">Estado</span>
                    <AdminStatus active={brand.active} />
                  </td>
                  <td>
                    <span className="admin-cell-label">Acciones</span>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        aria-label={`Editar ${brand.name}`}
                        disabled={
                          persistence.saving ||
                          persistence.persistenceFailed ||
                          registrationText !== null
                        }
                        onClick={() => openEditor({ ...brand })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={
                          brand.active ? 'admin-action-danger' : undefined
                        }
                        disabled={
                          persistence.saving ||
                          persistence.persistenceFailed ||
                          registrationText !== null
                        }
                        onClick={() => void toggle(brand)}
                        aria-label={`${brand.active ? 'Desactivar' : 'Activar'} ${brand.name}`}
                      >
                        {brand.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!state.brands.length && !form && registrationText === null ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon="tag"
          title="Aún no hay marcas"
          description="Crea la primera marca para organizar el catálogo."
        />
      ) : null}
      <AdminPagination
        label="marcas"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </div>
  )
}
