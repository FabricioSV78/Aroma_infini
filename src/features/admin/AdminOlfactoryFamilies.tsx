import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  DEFAULT_OLFACTORY_FAMILIES,
  getProductOlfactoryFamilies,
  olfactoryFamilyKey,
  validateOlfactoryFamilyName,
  type OlfactoryFamilyDefinition,
} from '../../domain/olfactory-family'
import { catalogAdminService } from '../../services/catalog-admin-service'
import { isRemoteCatalog } from '../../services/catalog-source'
import { useAdminStore } from './useAdminStore'
import { useAdminNotice } from './AdminNoticeProvider'
import { useAdminSave } from './useAdminSave'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminBadge, AdminPageHeader } from './AdminShared'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { AdminPagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'
import './admin-olfactory-families.css'

interface FamilyDraft {
  code?: string
  label: string
  active: boolean
  version?: number
}

export function AdminOlfactoryFamilies() {
  const state = useAdminStore()
  const notice = useAdminNotice()
  const persistence = useAdminSave({ catalog: true })
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<FamilyDraft | null>(null)
  const [initial, setInitial] = useState<FamilyDraft | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const busy = persistence.saving || persistence.persistenceFailed
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(initial)
  useUnsavedChanges(dirty && !busy)
  const families = state.olfactoryFamilies ?? DEFAULT_OLFACTORY_FAMILIES
  const filtered = families.filter((family) =>
    olfactoryFamilyKey(family.label).includes(olfactoryFamilyKey(search)),
  )
  const pagination = useAdminPagination(filtered, 20)
  const count = (family: OlfactoryFamilyDefinition) =>
    isRemoteCatalog && family.productCount !== undefined
      ? family.productCount
      : state.products.filter(({ product }) =>
          getProductOlfactoryFamilies(product).includes(family.value),
        ).length

  function open(family?: OlfactoryFamilyDefinition) {
    const value: FamilyDraft = family
      ? {
          code: family.value,
          label: family.label,
          active: family.active,
          version: family.version,
        }
      : { label: '', active: true }
    setInitial(value)
    setDraft(value)
    setError('')
  }
  async function close() {
    if (busy) return
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Cerrar sin guardar?',
        description: 'Se perderán los cambios de esta familia.',
        confirmLabel: 'Cerrar sin guardar',
        destructive: true,
      }))
    )
      return
    setDraft(null)
    setInitial(null)
    setError('')
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || busy) return
    const invalid = validateOlfactoryFamilyName(draft.label, draft.code)
    if (invalid) {
      setError(invalid)
      input.current?.focus()
      return
    }
    setError('')
    const result = await persistence.save(
      () => catalogAdminService.saveOlfactoryFamily(draft),
      () => {
        setDraft(null)
        setInitial(null)
        notice.toast(draft.code ? 'Familia actualizada.' : 'Familia creada.')
      },
    )
    if (result?.kind === 'validation') setError(result.message)
  }
  async function remove(family: OlfactoryFamilyDefinition) {
    if (busy) return
    if (
      !(await notice.confirm({
        title: `¿Eliminar «${family.label}»?`,
        description:
          'Esta familia no está asignada a productos. La eliminación es permanente.',
        confirmLabel: 'Eliminar familia',
        destructive: true,
      }))
    )
      return
    await persistence.save(
      () =>
        catalogAdminService.deleteOlfactoryFamily(
          family.value,
          family.version ?? 1,
        ),
      () => notice.toast('Familia eliminada.'),
    )
  }
  async function toggle(family: OlfactoryFamilyDefinition) {
    if (busy) return
    if (
      family.active &&
      !(await notice.confirm({
        title: `¿Desactivar «${family.label}»?`,
        description:
          'Se conservará en los productos actuales. No se ofrecerá para nuevas asignaciones, filtros ni preguntas del recomendador.',
        confirmLabel: 'Desactivar familia',
      }))
    )
      return
    await persistence.save(
      () =>
        catalogAdminService.saveOlfactoryFamily({
          code: family.value,
          label: family.label,
          active: !family.active,
          version: family.version,
        }),
      () =>
        notice.toast(
          family.active ? 'Familia desactivada.' : 'Familia activada.',
        ),
    )
  }
  return (
    <div className="admin-page admin-families-page">
      <AdminPageHeader
        eyebrow="Tienda"
        title="Familias olfativas"
        description="Administra las opciones compartidas por productos, filtros y Excel."
      />
      <AdminSaveFeedback {...persistence} />
      <div className="admin-families-toolbar">
        <label>
          Buscar familia
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre de la familia"
          />
        </label>
        <button
          className="button button--primary"
          type="button"
          onClick={() => open()}
          disabled={busy}
        >
          Nueva familia
        </button>
      </div>
      <p className="admin-families-count" role="status">
        {filtered.length} {filtered.length === 1 ? 'familia' : 'familias'}
      </p>
      {filtered.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table admin-families-table">
            <thead>
              <tr>
                <th scope="col">Familia</th>
                <th scope="col">Productos</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((family) => (
                <tr key={family.value}>
                  <th scope="row">{family.label}</th>
                  <td>{count(family)}</td>
                  <td>
                    <AdminBadge tone={family.active ? 'success' : 'neutral'}>
                      {family.active ? 'Activa' : 'Desactivada'}
                    </AdminBadge>
                  </td>
                  <td>
                    <div className="admin-inline-actions">
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => open(family)}
                        disabled={busy}
                        aria-label={`Editar ${family.label}`}
                      >
                        Editar
                      </button>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => void toggle(family)}
                        disabled={busy}
                        aria-label={`${family.active ? 'Desactivar' : 'Activar'} ${family.label}`}
                      >
                        {family.active ? 'Desactivar' : 'Activar'}
                      </button>
                      {count(family) === 0 ? (
                        <button
                          className="text-link admin-family-delete"
                          type="button"
                          onClick={() => void remove(family)}
                          disabled={busy}
                          aria-label={`Eliminar ${family.label}`}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Sin familias para esta búsqueda"
          description="Prueba con otro nombre o crea una familia."
        />
      )}
      <AdminPagination
        {...pagination}
        label="familias"
        onPageChange={pagination.setPage}
      />
      <p className="admin-families-help">
        Las familias asignadas a productos se pueden desactivar.{' '}
        <Link to="/admin/productos">Ir a productos →</Link>
      </p>
      <Dialog
        id="admin-family-dialog"
        open={draft !== null}
        onClose={() => void close()}
        title={draft?.code ? 'Editar familia' : 'Nueva familia'}
        closeDisabled={busy}
      >
        {draft ? (
          <form
            className="admin-family-form"
            onSubmit={(event) => void save(event)}
            aria-busy={busy}
          >
            <label htmlFor="family-name">Nombre de la familia</label>
            <input
              ref={input}
              id="family-name"
              value={draft.label}
              maxLength={80}
              autoComplete="off"
              required
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'family-name-error' : undefined}
              onChange={(event) => {
                setDraft({ ...draft, label: event.target.value })
                setError('')
              }}
              placeholder="Por ejemplo, Especiada"
            />
            {error ? (
              <p
                id="family-name-error"
                className="admin-field-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <label className="admin-family-active">
              <input
                type="checkbox"
                checked={draft.active}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, active: event.target.checked })
                }
              />
              Familia activa
            </label>
            <div className="admin-inline-actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={busy}
              >
                {busy ? 'Guardando…' : 'Guardar familia'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => void close()}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  )
}
