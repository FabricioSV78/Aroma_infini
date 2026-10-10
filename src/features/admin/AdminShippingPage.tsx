import { useRef, useState, type FormEvent } from 'react'
import {
  getPeruDistrictOptions,
  getPeruDistrictLabel,
  getPeruProvinceOptions,
  getPeruProvinceLabel,
  peruDepartments,
} from '../../content/peru'
import {
  adminService,
  type AdminShippingSettings,
  type AdminShippingZone,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { AdminNotice, AdminPageHeader, AdminStatus } from './AdminShared'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'

const pageSize = 5

function moneyInputValue(cents: number): number | '' {
  return Number.isFinite(cents) ? cents / 100 : ''
}

function parseMoneyInput(value: string): number {
  return value === '' ? Number.NaN : Math.round(Number(value) * 100)
}

function scopeLabel(zone: AdminShippingZone) {
  return [
    peruDepartments.find((item) => item.value === zone.department)?.label ??
      zone.department,
    zone.province ? getPeruProvinceLabel(zone.province) : null,
    zone.district ? getPeruDistrictLabel(zone.district) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function nextExceptionScope(zones: AdminShippingZone[]) {
  const used = new Set(
    zones.map((zone) =>
      [zone.department, zone.province ?? '*', zone.district ?? '*'].join(':'),
    ),
  )
  for (const department of peruDepartments) {
    if (!used.has(department.value + ':*:*'))
      return {
        department: department.value,
        province: null,
        district: null,
        name: department.label,
      }
  }
  for (const department of peruDepartments) {
    for (const province of getPeruProvinceOptions(department.value)) {
      if (!used.has(department.value + ':' + province.value + ':*'))
        return {
          department: department.value,
          province: province.value,
          district: null,
          name: province.label,
        }
    }
  }
  for (const department of peruDepartments) {
    for (const province of getPeruProvinceOptions(department.value)) {
      for (const district of getPeruDistrictOptions(province.value)) {
        if (
          !used.has(
            department.value + ':' + province.value + ':' + district.value,
          )
        )
          return {
            department: department.value,
            province: province.value,
            district: district.value,
            name: district.label,
          }
      }
    }
  }
  return null
}

export function AdminShippingPage() {
  const state = useAdminStore()
  const [form, setForm] = useState<AdminShippingSettings>(() =>
    structuredClone(state.shipping),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [removedZones, setRemovedZones] = useState<AdminShippingZone[]>([])
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLFieldSetElement>(null)
  const [savedVersion, setSavedVersion] = useState(() => JSON.stringify(form))
  const dirty = JSON.stringify(form) !== savedVersion
  useUnsavedChanges(dirty)
  function selectZone(id: string) {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 860px)').matches) {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      window.requestAnimationFrame(() =>
        editorRef.current?.scrollIntoView({
          behavior: reduceMotion ? 'instant' : 'smooth',
          block: 'start',
        }),
      )
    }
  }
  const selected = form.zones.find((zone) => zone.id === selectedId)
  const activeZoneCount = form.zones.filter((zone) => zone.active).length
  const filtered = form.zones.filter((zone) =>
    (zone.name + ' ' + scopeLabel(zone))
      .toLocaleLowerCase('es-PE')
      .includes(search.toLocaleLowerCase('es-PE').trim()),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  function updateGeneral(changes: Partial<AdminShippingSettings>) {
    setForm((current) => ({ ...current, ...changes }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateZone(id: string, changes: Partial<AdminShippingZone>) {
    setForm((current) => ({
      ...current,
      zones: current.zones.map((zone) =>
        zone.id === id ? { ...zone, ...changes } : zone,
      ),
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function addZone() {
    const scope = nextExceptionScope([...form.zones, ...removedZones])
    if (!scope) return
    const id = 'zone-' + crypto.randomUUID().slice(0, 8)
    setForm((current) => ({
      ...current,
      zones: [
        ...current.zones,
        {
          id,
          ...scope,
          courierFeeCents: current.nationalCourierFeeCents,
          motorizadoFeeCents: null,
          estimate: current.nationalEstimate,
          active: false,
        },
      ],
    }))
    selectZone(id)
    setSearch('')
    setPage(Math.ceil((form.zones.length + 1) / pageSize))
    setMessageIsError(false)
    setMessage('Completa la excepción y actívala cuando quieras aplicarla.')
  }

  function undoRemove() {
    const removedZone = removedZones.at(-1)
    if (!removedZone) return
    setForm((current) => ({
      ...current,
      zones: [...current.zones, removedZone],
    }))
    setSelectedId(removedZone.id)
    setRemovedZones((current) => current.slice(0, -1))
    setMessageIsError(false)
    setMessage(
      'Excepción recuperada. Guarda la configuración para aplicar los cambios.',
    )
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const result = adminService.saveShipping(form)
    if (result.kind === 'validation') {
      setMessageIsError(true)
      setMessage(result.message)
      return
    }
    setSaving(true)
    try {
      await adminService.flush()
      setSavedVersion(JSON.stringify(form))
      setRemovedZones([])
      setMessageIsError(false)
      setMessage('Configuración aplicada a la tienda.')
    } catch {
      setMessageIsError(true)
      setMessage(
        'Los cambios están aplicados, pero no se pudieron guardar en este navegador.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page admin-shipping-page">
      <AdminPageHeader
        eyebrow="Configuración logística"
        title="Envíos"
        description="Una tarifa base cubre todo el Perú. Ajusta solo las rutas que necesitan un precio o plazo distinto."
      />
      <form className="admin-shipping-form" onSubmit={save}>
        <section
          className="admin-shipping-card"
          aria-labelledby="national-title"
        >
          <div className="admin-shipping-card-heading">
            <div>
              <p className="eyebrow">Cobertura general</p>
              <h2 id="national-title">Todo el Perú</h2>
            </div>
            <span className="admin-shipping-coverage">25 departamentos</span>
          </div>
          <div className="admin-shipping-fields">
            <label>
              Tarifa base de courier (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={moneyInputValue(form.nationalCourierFeeCents)}
                onChange={(event) =>
                  updateGeneral({
                    nationalCourierFeeCents: parseMoneyInput(
                      event.target.value,
                    ),
                  })
                }
              />
            </label>
            <label>
              Plazo estimado general
              <input
                required
                maxLength={80}
                placeholder="Por ejemplo: de 3 a 6 días hábiles"
                value={form.nationalEstimate}
                onChange={(event) =>
                  updateGeneral({ nationalEstimate: event.target.value })
                }
              />
            </label>
            <label>
              Envío gratis desde (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={moneyInputValue(form.freeThresholdCents)}
                onChange={(event) =>
                  updateGeneral({
                    freeThresholdCents: parseMoneyInput(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="admin-shipping-help">
            Las excepciones activas sustituyen la tarifa general. Usa 0 para
            desactivar el envío gratis; motorizado solo aparece donde tenga
            precio.
          </p>
        </section>
        <section
          className="admin-shipping-card"
          aria-labelledby="exceptions-title"
        >
          <div className="admin-shipping-card-heading">
            <div>
              <p className="eyebrow">Ajustes opcionales</p>
              <h2 id="exceptions-title">Excepciones de tarifa</h2>
              <p>
                {activeZoneCount}{' '}
                {activeZoneCount === 1
                  ? 'excepción activa'
                  : 'excepciones activas'}
                . Se aplican a la ubicación indicada.
              </p>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={addZone}
            >
              Agregar excepción
            </button>
          </div>
          <div
            className={
              'admin-shipping-workspace' + (selected ? ' has-selection' : '')
            }
          >
            <div className="admin-shipping-list">
              <label className="admin-shipping-search">
                Buscar excepción
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Departamento o nombre"
                />
              </label>
              <div className="admin-shipping-rows">
                {visible.length ? (
                  visible.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      className={
                        'admin-shipping-row' +
                        (selectedId === zone.id ? ' is-selected' : '')
                      }
                      onClick={() => selectZone(zone.id)}
                      aria-pressed={selectedId === zone.id}
                    >
                      <span>
                        <strong>{zone.name}</strong>
                        <small>{scopeLabel(zone)}</small>
                      </span>
                      <span className="admin-shipping-row-meta">
                        <strong>{formatPEN(zone.courierFeeCents)}</strong>
                        <AdminStatus active={zone.active} />
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="admin-shipping-empty">
                    {form.zones.length === 0
                      ? 'No hay excepciones. La tarifa general cubre todos los destinos.'
                      : 'No hay excepciones para esa búsqueda. Prueba otro departamento o nombre.'}
                  </p>
                )}
              </div>
              {pageCount > 1 ? (
                <div className="admin-shipping-pagination">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {currentPage} de {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </div>
            {selected ? (
              <fieldset ref={editorRef} className="admin-shipping-editor">
                <legend>Editar excepción: {selected.name}</legend>
                <div className="admin-shipping-editor-fields">
                  <label>
                    Nombre de la excepción
                    <input
                      required
                      maxLength={60}
                      value={selected.name}
                      onChange={(event) =>
                        updateZone(selected.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Departamento
                    <select
                      value={selected.department}
                      onChange={(event) => {
                        const department = peruDepartments.find(
                          (item) => item.value === event.target.value,
                        )
                        updateZone(selected.id, {
                          department: event.target.value,
                          province: null,
                          district: null,
                          name: peruDepartments.some(
                            (item) => item.label === selected.name,
                          )
                            ? (department?.label ?? selected.name)
                            : selected.name,
                        })
                      }}
                    >
                      {peruDepartments.map((department) => (
                        <option key={department.value} value={department.value}>
                          {department.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Provincia
                    <select
                      value={selected.province ?? ''}
                      onChange={(event) =>
                        updateZone(selected.id, {
                          province: event.target.value || null,
                          district: null,
                        })
                      }
                    >
                      <option value="">Todas</option>
                      {getPeruProvinceOptions(selected.department).map(
                        (province) => (
                          <option key={province.value} value={province.value}>
                            {province.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Distrito
                    <select
                      value={selected.district ?? ''}
                      disabled={!selected.province}
                      onChange={(event) =>
                        updateZone(selected.id, {
                          district: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Todos</option>
                      {getPeruDistrictOptions(selected.province ?? '').map(
                        (district) => (
                          <option key={district.value} value={district.value}>
                            {district.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Courier (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={moneyInputValue(selected.courierFeeCents)}
                      onChange={(event) =>
                        updateZone(selected.id, {
                          courierFeeCents: parseMoneyInput(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Motorizado (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        selected.motorizadoFeeCents === null
                          ? ''
                          : selected.motorizadoFeeCents / 100
                      }
                      placeholder="No disponible"
                      onChange={(event) =>
                        updateZone(selected.id, {
                          motorizadoFeeCents: event.target.value
                            ? Math.round(Number(event.target.value) * 100)
                            : null,
                        })
                      }
                    />
                  </label>
                  <label className="admin-shipping-span">
                    Plazo
                    <input
                      required
                      maxLength={80}
                      placeholder="Por ejemplo: de 1 a 2 días hábiles"
                      value={selected.estimate}
                      onChange={(event) =>
                        updateZone(selected.id, {
                          estimate: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="admin-shipping-editor-actions">
                  <label className="admin-shipping-toggle">
                    <input
                      type="checkbox"
                      checked={selected.active}
                      onChange={(event) =>
                        updateZone(selected.id, {
                          active: event.target.checked,
                        })
                      }
                    />
                    Excepción activa
                  </label>
                  <button
                    type="button"
                    className="admin-remove"
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.filter(
                          (zone) => zone.id !== selected.id,
                        ),
                      }))
                      setSelectedId(null)
                      setRemovedZones((current) => [...current, selected])
                      setMessageIsError(false)
                      setMessage(
                        'La excepción se quitará al guardar. La tarifa general seguirá cubriendo esa ubicación.',
                      )
                    }}
                  >
                    Quitar excepción
                  </button>
                </div>
              </fieldset>
            ) : null}
          </div>
        </section>
        <div className="admin-shipping-footer">
          <div className="admin-shipping-feedback">
            <span className={dirty ? 'is-unsaved' : 'is-saved'}>
              {dirty ? 'Cambios sin guardar' : 'Todo guardado'}
            </span>
            {messageIsError ? (
              <p className="admin-form-notice" role="alert">
                {message}
              </p>
            ) : (
              <AdminNotice>{message}</AdminNotice>
            )}
          </div>
          {removedZones.length ? (
            <button
              className="admin-shipping-undo"
              type="button"
              onClick={undoRemove}
            >
              Deshacer eliminación
            </button>
          ) : null}
          <button
            className="button button--primary"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </div>
  )
}
