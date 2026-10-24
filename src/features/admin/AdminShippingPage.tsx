import { useRef, useState, type FormEvent } from 'react'
import {
  getPeruDistrictOptions,
  getPeruDistrictLabel,
  getPeruDepartmentLabel,
  getPeruProvinceLabel,
  getPeruProvinceOptions,
  getDeliveryArea,
  deliveryAreas,
  LIMA_DEPARTMENT,
  peruDepartments,
} from '../../content/peru'
import {
  adminService,
  type AdminShippingSettings,
  type AdminShippingZone,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { getAreaBaseShipping } from '../../services/shipping-service'
import { AdminNotice, AdminPageHeader, AdminStatus } from './AdminShared'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminNotice } from './AdminNoticeProvider'

const pageSize = 5

function moneyInputValue(cents: number): number | '' {
  return Number.isFinite(cents) ? cents / 100 : ''
}

function parseMoneyInput(value: string): number {
  return value === '' ? Number.NaN : Math.round(Number(value) * 100)
}

function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim()
}

function scopeLabel(zone: AdminShippingZone) {
  return `${getDeliveryArea(zone.department)?.label ?? zone.department} · ${zone.district ? getPeruDistrictLabel(zone.district) : 'Todos los distritos'}`
}

function isAreaBaseZone(zone: AdminShippingZone, department: string) {
  const area = getDeliveryArea(department)
  return Boolean(
    area &&
    zone.department.trim().toLowerCase() === area.department &&
    zone.province === area.province &&
    !zone.district,
  )
}

function isCoveredExceptionZone(zone: AdminShippingZone) {
  const area = getDeliveryArea(zone.department)
  return Boolean(
    area &&
    zone.province === area.province &&
    zone.district &&
    getPeruDistrictOptions(area.province).some(
      (district) => district.value === zone.district,
    ),
  )
}

function nextExceptionScope(zones: AdminShippingZone[]) {
  const used = new Set(
    zones.map((zone) => `${zone.department}:${zone.district}`),
  )
  for (const area of deliveryAreas) {
    const district = getPeruDistrictOptions(area.province).find(
      (item) => !used.has(`${area.department}:${item.value}`),
    )
    if (district)
      return {
        department: area.department,
        province: area.province,
        district: district.value,
        name: district.label,
      }
  }
  return null
}

function isProvinceZone(zone: AdminShippingZone) {
  return (
    !deliveryAreas.some((area) => isAreaBaseZone(zone, area.department)) &&
    !isCoveredExceptionZone(zone)
  )
}

function provinceScopeLabel(zone: AdminShippingZone) {
  const department = getPeruDepartmentLabel(zone.department)
  const province = zone.province ? getPeruProvinceLabel(zone.province) : null
  const district = zone.district ? getPeruDistrictLabel(zone.district) : null
  if (district && district === province)
    return `${department} · ${district} (distrito)`
  return [department, province, district].filter(Boolean).join(' · ')
}

function provinceOptions(department: string) {
  return getPeruProvinceOptions(department).filter(
    (province) =>
      !deliveryAreas.some(
        (area) =>
          area.department === department && area.province === province.value,
      ),
  )
}

function nextProvinceScope(zones: AdminShippingZone[]) {
  const used = new Set(
    zones.map(
      (zone) =>
        `${zone.department}:${zone.province ?? '*'}:${zone.district ?? '*'}`,
    ),
  )
  for (const department of peruDepartments) {
    if (deliveryAreas.some((area) => area.department === department.value))
      continue
    if (!used.has(`${department.value}:*:*`))
      return {
        department: department.value,
        province: null,
        district: null,
        name: department.label,
      }
  }
  for (const department of peruDepartments) {
    for (const province of provinceOptions(department.value)) {
      if (!used.has(`${department.value}:${province.value}:*`))
        return {
          department: department.value,
          province: province.value,
          district: null,
          name: province.label,
        }
    }
  }
  return null
}

export function AdminShippingPage() {
  const state = useAdminStore()
  const notice = useAdminNotice()
  const [form, setForm] = useState<AdminShippingSettings>(() =>
    structuredClone(state.shipping),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [provinceOpen, setProvinceOpen] = useState(false)
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(
    null,
  )
  const [provinceSearch, setProvinceSearch] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [removedZones, setRemovedZones] = useState<AdminShippingZone[]>([])
  const persistence = useAdminSave()
  const saving = persistence.saving
  const editorRef = useRef<HTMLFieldSetElement>(null)
  const provinceEditorRef = useRef<HTMLFieldSetElement>(null)
  const [savedVersion, setSavedVersion] = useState(() => JSON.stringify(form))
  const [savedProvinceEnabled, setSavedProvinceEnabled] = useState(
    Boolean(form.provinceShippingEnabled),
  )
  const dirty = JSON.stringify(form) !== savedVersion
  useUnsavedChanges(dirty || saving || persistence.persistenceFailed)
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
  function selectProvinceZone(id: string) {
    setSelectedProvinceId(id)
    if (window.matchMedia('(max-width: 860px)').matches) {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      window.requestAnimationFrame(() =>
        provinceEditorRef.current?.scrollIntoView({
          behavior: reduceMotion ? 'instant' : 'smooth',
          block: 'start',
        }),
      )
    }
  }
  const coveredExceptions = form.zones.filter(isCoveredExceptionZone)
  const provinceZones = form.zones.filter(isProvinceZone)
  const selected = coveredExceptions.find((zone) => zone.id === selectedId)
  const selectedProvinceZone = provinceZones.find(
    (zone) => zone.id === selectedProvinceId,
  )
  const filteredProvinceZones = provinceZones.filter((zone) =>
    searchText(zone.name + ' ' + provinceScopeLabel(zone)).includes(
      searchText(provinceSearch),
    ),
  )
  const provinceStatus = form.provinceShippingEnabled
    ? savedProvinceEnabled
      ? 'Activos'
      : 'Activación pendiente'
    : savedProvinceEnabled
      ? 'Desactivación pendiente'
      : 'Desactivados'
  const activeZoneCount = coveredExceptions.filter((zone) => zone.active).length
  const filtered = coveredExceptions.filter((zone) =>
    searchText(zone.name + ' ' + scopeLabel(zone)).includes(searchText(search)),
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

  function updateBase(
    department: string,
    changes: Partial<ReturnType<typeof getAreaBaseShipping>>,
  ) {
    setForm((current) => {
      const area = getDeliveryArea(department)!
      const rate = { ...getAreaBaseShipping(current, department), ...changes }
      const baseZone: AdminShippingZone = {
        id: `zone-${area.department}`,
        name: area.label,
        department: area.department,
        province: area.province,
        district: null,
        ...rate,
        active: true,
      }
      return {
        ...current,
        zones: current.zones.some((zone) => isAreaBaseZone(zone, department))
          ? current.zones.map((zone) =>
              isAreaBaseZone(zone, department)
                ? { ...zone, ...rate, active: true }
                : zone,
            )
          : [...current.zones, baseZone],
      }
    })
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
    const scope = nextExceptionScope([...coveredExceptions, ...removedZones])
    if (!scope) return
    const id = 'zone-' + crypto.randomUUID().slice(0, 8)
    setForm((current) => ({
      ...current,
      zones: [
        ...current.zones,
        {
          id,
          ...scope,
          courierFeeCents: getAreaBaseShipping(current, scope.department)
            .courierFeeCents,
          motorizadoFeeCents: null,
          estimate: getAreaBaseShipping(current, scope.department).estimate,
          active: false,
        },
      ],
    }))
    selectZone(id)
    setSearch('')
    setPage(Math.ceil((coveredExceptions.length + 1) / pageSize))
    setMessage('')
    setMessageIsError(false)
    notice.toast('Tarifa preparada. Complétala y guarda para aplicarla.')
  }

  function addProvinceZone() {
    const scope = nextProvinceScope([...form.zones, ...removedZones])
    if (!scope) {
      setMessageIsError(true)
      setMessage('Ya existe una tarifa para cada departamento y provincia.')
      return
    }
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
    setProvinceOpen(true)
    selectProvinceZone(id)
    setProvinceSearch('')
    setMessage('')
    setMessageIsError(false)
    notice.toast('Tarifa inactiva preparada. Configúrala y guarda los cambios.')
  }

  function updateProvinceScope(
    zone: AdminShippingZone,
    department: string,
    scope: 'department' | 'province' | 'district',
    province = zone.province,
  ) {
    // Lima Metropolitana mantiene su propia tarifa; en Lima solo se preparan
    // tarifas para las demás provincias o sus distritos.
    const nextScope =
      department === LIMA_DEPARTMENT && scope === 'department'
        ? 'province'
        : scope
    const provinceOption =
      provinceOptions(department).find((item) => item.value === province) ??
      provinceOptions(department)[0]
    const districtOption = getPeruDistrictOptions(
      provinceOption?.value ?? '',
    )[0]
    const nextProvince =
      nextScope === 'department' ? null : (provinceOption?.value ?? null)
    const nextDistrict =
      nextScope === 'district' ? (districtOption?.value ?? null) : null
    updateZone(zone.id, {
      department,
      province: nextProvince,
      district: nextDistrict,
      name:
        districtOption?.label && nextScope === 'district'
          ? districtOption.label
          : nextProvince
            ? (provinceOption?.label ?? getPeruDepartmentLabel(department))
            : getPeruDepartmentLabel(department),
    })
  }

  function undoRemove() {
    const removedZone = removedZones.at(-1)
    if (!removedZone) return
    setForm((current) => ({
      ...current,
      zones: [...current.zones, removedZone],
    }))
    if (isProvinceZone(removedZone)) {
      setSelectedProvinceId(removedZone.id)
      setProvinceOpen(true)
    } else {
      setSelectedId(removedZone.id)
    }
    setSearch('')
    setPage(Math.ceil((coveredExceptions.length + 1) / pageSize))
    setRemovedZones((current) => current.slice(0, -1))
    setMessage('')
    setMessageIsError(false)
    notice.toast('Tarifa recuperada. Guarda para conservarla.')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setMessageIsError(false)
    if (form.provinceShippingEnabled !== savedProvinceEnabled) {
      const confirmed = await notice.confirm({
        title: form.provinceShippingEnabled
          ? '¿Activar envíos a provincias?'
          : '¿Desactivar envíos a provincias?',
        description: form.provinceShippingEnabled
          ? 'Las provincias estarán disponibles durante la compra con las tarifas configuradas.'
          : 'La compra volverá a ofrecer entregas solo en Lima y Callao. Las tarifas provinciales se conservarán.',
        confirmLabel: form.provinceShippingEnabled
          ? 'Activar y guardar'
          : 'Desactivar y guardar',
      })
      if (!confirmed) return
    }
    const result = await persistence.save(
      () => adminService.saveShipping(form),
      () => {
        setSavedVersion(JSON.stringify(form))
        setSavedProvinceEnabled(form.provinceShippingEnabled)
        setRemovedZones([])
        notice.toast('Configuración aplicada a la tienda.')
      },
    )
    if (result?.kind === 'validation') {
      if (
        !Number.isInteger(form.nationalCourierFeeCents) ||
        form.nationalCourierFeeCents < 0 ||
        !form.nationalEstimate.trim() ||
        provinceZones.some(
          (zone) =>
            !zone.name.trim() ||
            !Number.isInteger(zone.courierFeeCents) ||
            zone.courierFeeCents < 0 ||
            (zone.motorizadoFeeCents !== null &&
              (!Number.isInteger(zone.motorizadoFeeCents) ||
                zone.motorizadoFeeCents < 0)) ||
            form.zones.some(
              (other) =>
                other.id !== zone.id &&
                other.department === zone.department &&
                other.province === zone.province &&
                other.district === zone.district,
            ) ||
            !zone.estimate.trim(),
        )
      )
        setProvinceOpen(true)
      setMessageIsError(true)
      setMessage(result.message)
      return
    }
  }

  return (
    <div className="admin-page admin-shipping-page">
      <AdminPageHeader
        eyebrow="Configuración de la tienda"
        title="Tarifas de envío"
        description={
          savedProvinceEnabled
            ? 'Gestiona las tarifas locales y la cobertura provincial habilitada para la compra.'
            : 'Define el precio y plazo para entregas en Lima y Callao. Solo sus distritos están disponibles durante la compra.'
        }
      />
      <form className="admin-shipping-form" onSubmit={save}>
        <div
          className="admin-editor-content"
          inert={saving || persistence.persistenceFailed}
          aria-busy={saving}
        >
          <section
            className="admin-shipping-card"
            aria-labelledby="national-title"
          >
            <div className="admin-shipping-card-heading">
              <div>
                <p className="eyebrow">
                  {savedProvinceEnabled
                    ? 'Tarifas locales'
                    : 'Cobertura actual'}
                </p>
                <h2 id="national-title">Lima y Callao</h2>
              </div>
              <span className="admin-shipping-coverage">
                {savedProvinceEnabled ? '2 zonas locales' : '2 zonas'}
              </span>
            </div>
            {deliveryAreas.map((area) => {
              const rate = getAreaBaseShipping(form, area.department)
              return (
                <div className="admin-shipping-area" key={area.department}>
                  <div className="admin-shipping-area-heading">
                    <h3>{area.label}</h3>
                    <span>
                      {getPeruDistrictOptions(area.province).length} distritos
                    </span>
                  </div>
                  <div className="admin-shipping-fields">
                    <label>
                      Courier en {area.label} (S/)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={moneyInputValue(rate.courierFeeCents)}
                        onChange={(event) =>
                          updateBase(area.department, {
                            courierFeeCents: parseMoneyInput(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Motorizado en {area.label} (S/)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="No disponible"
                        value={
                          rate.motorizadoFeeCents === null
                            ? ''
                            : moneyInputValue(rate.motorizadoFeeCents)
                        }
                        onChange={(event) =>
                          updateBase(area.department, {
                            motorizadoFeeCents: event.target.value
                              ? parseMoneyInput(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      Plazo estimado en {area.label}
                      <input
                        required
                        maxLength={80}
                        placeholder="Por ejemplo: hasta 48 horas"
                        value={rate.estimate}
                        onChange={(event) =>
                          updateBase(area.department, {
                            estimate: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )
            })}
            <div className="admin-shipping-fields admin-shipping-common-fields">
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
              Las tarifas especiales reemplazan la tarifa base de su distrito.
              Usa 0 para desactivar el envío gratis.
            </p>
          </section>
          <section
            className="admin-shipping-card"
            aria-labelledby="exceptions-title"
          >
            <div className="admin-shipping-card-heading">
              <div>
                <p className="eyebrow">Ajustes opcionales</p>
                <h2 id="exceptions-title">Tarifas por distrito</h2>
                {activeZoneCount > 0 ? (
                  <p>
                    {activeZoneCount}{' '}
                    {activeZoneCount === 1
                      ? 'tarifa especial activa'
                      : 'tarifas especiales activas'}
                    . Se aplican solo al distrito indicado.
                  </p>
                ) : null}
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={addZone}
              >
                Agregar tarifa por distrito
              </button>
            </div>
            <div
              className={
                'admin-shipping-workspace' + (selected ? ' has-selection' : '')
              }
            >
              <div className="admin-shipping-list">
                {coveredExceptions.length ? (
                  <label className="admin-shipping-search">
                    Buscar distrito
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setPage(1)
                      }}
                      placeholder="Distrito o nombre"
                    />
                  </label>
                ) : null}
                {coveredExceptions.length ? (
                  <p
                    className="admin-shipping-count"
                    role="status"
                    aria-live="polite"
                  >
                    {search
                      ? `${filtered.length} de ${coveredExceptions.length} distritos`
                      : `${coveredExceptions.length} ${coveredExceptions.length === 1 ? 'distrito' : 'distritos'} con tarifa especial`}
                  </p>
                ) : null}
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
                        aria-controls={
                          selectedId === zone.id
                            ? 'admin-shipping-zone-editor'
                            : undefined
                        }
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
                      {coveredExceptions.length === 0
                        ? 'No hay tarifas especiales. Las tarifas base cubren todos los distritos de Lima y Callao.'
                        : 'No hay distritos para esa búsqueda. Prueba otro nombre.'}
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
                <fieldset
                  id="admin-shipping-zone-editor"
                  ref={editorRef}
                  className="admin-shipping-editor"
                >
                  <legend>Tarifa del distrito: {selected.name}</legend>
                  <div className="admin-shipping-editor-fields">
                    <label>
                      Nombre visible de la tarifa
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
                      Zona
                      <select
                        value={selected.department}
                        onChange={(event) => {
                          const area = getDeliveryArea(event.target.value)!
                          const district = getPeruDistrictOptions(
                            area.province,
                          )[0]
                          updateZone(selected.id, {
                            department: area.department,
                            province: area.province,
                            district: district?.value ?? null,
                            name: district?.label ?? area.label,
                          })
                        }}
                      >
                        {deliveryAreas.map((area) => (
                          <option key={area.department} value={area.department}>
                            {area.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Distrito
                      <select
                        value={selected.district ?? ''}
                        onChange={(event) =>
                          updateZone(selected.id, {
                            district: event.target.value,
                          })
                        }
                      >
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
                            courierFeeCents: parseMoneyInput(
                              event.target.value,
                            ),
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
                      Tarifa especial activa
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
                        setMessage('')
                        setMessageIsError(false)
                        notice.toast(
                          'Tarifa retirada del borrador. Puedes deshacer antes de guardar.',
                        )
                      }}
                    >
                      Quitar tarifa especial
                    </button>
                  </div>
                </fieldset>
              ) : null}
            </div>
          </section>
          <section
            className="admin-shipping-card admin-shipping-provinces"
            aria-labelledby="provinces-title"
          >
            <div className="admin-shipping-card-heading admin-shipping-provinces-heading">
              <div>
                <p className="eyebrow">Configuración futura</p>
                <h2 id="provinces-title">Envíos a provincias</h2>
                <p>Prepara tarifas para cuando amplíes la cobertura.</p>
              </div>
              <div className="admin-shipping-provinces-controls">
                <span
                  className={
                    'admin-shipping-provinces-status' +
                    (form.provinceShippingEnabled && savedProvinceEnabled
                      ? ' is-active'
                      : '')
                  }
                  role="status"
                >
                  {provinceStatus}
                </span>
                <button
                  type="button"
                  className="admin-shipping-provinces-disclosure"
                  aria-expanded={provinceOpen}
                  aria-controls="admin-shipping-provinces-content"
                  onClick={() => setProvinceOpen((current) => !current)}
                >
                  {provinceOpen ? 'Ocultar configuración' : 'Ver configuración'}
                  <span
                    aria-hidden="true"
                    className="admin-shipping-provinces-chevron"
                  />
                </button>
              </div>
            </div>
            {provinceOpen ? (
              <div
                id="admin-shipping-provinces-content"
                className="admin-shipping-provinces-content"
              >
                <label className="admin-shipping-provinces-switch">
                  <input
                    type="checkbox"
                    checked={form.provinceShippingEnabled}
                    onChange={(event) =>
                      updateGeneral({
                        provinceShippingEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Permitir envíos a provincias</strong>
                    <small>
                      Al activar y guardar, el checkout aceptará direcciones
                      fuera de Lima y Callao.
                    </small>
                  </span>
                </label>
                <p className="admin-shipping-provinces-note">
                  Abrir este apartado o registrar tarifas no las publica. La
                  cobertura cambia únicamente al activar esta opción y guardar.
                </p>
                <div className="admin-shipping-provinces-base">
                  <div className="admin-shipping-area-heading">
                    <h3>Tarifa general</h3>
                    <span>
                      Se aplica donde no exista una tarifa especial activa
                    </span>
                  </div>
                  <div className="admin-shipping-fields">
                    <label>
                      Courier a provincias (S/)
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
                      Plazo estimado
                      <input
                        maxLength={80}
                        required
                        value={form.nationalEstimate}
                        onChange={(event) =>
                          updateGeneral({
                            nationalEstimate: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="admin-shipping-provinces-exceptions">
                  <div className="admin-shipping-card-heading">
                    <div>
                      <h3>Tarifas especiales por zona</h3>
                      <p>
                        Opcionales: delimitan un departamento, provincia o
                        distrito.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={addProvinceZone}
                    >
                      Registrar tarifa especial
                    </button>
                  </div>
                  <div
                    className={
                      'admin-shipping-workspace' +
                      (selectedProvinceZone ? ' has-selection' : '')
                    }
                  >
                    <div className="admin-shipping-list">
                      {provinceZones.length ? (
                        <label className="admin-shipping-search">
                          Buscar zona
                          <input
                            type="search"
                            value={provinceSearch}
                            onChange={(event) =>
                              setProvinceSearch(event.target.value)
                            }
                            placeholder="Nombre o ubicación"
                          />
                        </label>
                      ) : null}
                      <div className="admin-shipping-rows">
                        {filteredProvinceZones.length ? (
                          filteredProvinceZones.map((zone) => (
                            <button
                              type="button"
                              key={zone.id}
                              className={
                                'admin-shipping-row' +
                                (selectedProvinceId === zone.id
                                  ? ' is-selected'
                                  : '')
                              }
                              aria-pressed={selectedProvinceId === zone.id}
                              aria-controls={
                                selectedProvinceId === zone.id
                                  ? 'admin-shipping-province-editor'
                                  : undefined
                              }
                              onClick={() => selectProvinceZone(zone.id)}
                            >
                              <span>
                                <strong>{zone.name}</strong>
                                <small>{provinceScopeLabel(zone)}</small>
                              </span>
                              <span className="admin-shipping-row-meta">
                                <strong>
                                  {formatPEN(zone.courierFeeCents)}
                                </strong>
                                {zone.active &&
                                !form.provinceShippingEnabled ? (
                                  <small className="admin-shipping-province-ready">
                                    Preparada
                                  </small>
                                ) : (
                                  <AdminStatus active={zone.active} />
                                )}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="admin-shipping-empty">
                            {provinceZones.length
                              ? 'No hay zonas para esa búsqueda.'
                              : 'Aún no hay tarifas especiales. Puedes usar la tarifa general cuando actives esta cobertura.'}
                          </p>
                        )}
                      </div>
                    </div>
                    {selectedProvinceZone ? (
                      <fieldset
                        id="admin-shipping-province-editor"
                        ref={provinceEditorRef}
                        className="admin-shipping-editor"
                      >
                        <legend>
                          Tarifa especial: {selectedProvinceZone.name}
                        </legend>
                        <div className="admin-shipping-editor-fields">
                          <label className="admin-shipping-span">
                            Nombre de la tarifa
                            <input
                              required
                              maxLength={60}
                              value={selectedProvinceZone.name}
                              onChange={(event) =>
                                updateZone(selectedProvinceZone.id, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Alcance
                            <select
                              value={
                                selectedProvinceZone.district
                                  ? 'district'
                                  : selectedProvinceZone.province
                                    ? 'province'
                                    : 'department'
                              }
                              onChange={(event) =>
                                updateProvinceScope(
                                  selectedProvinceZone,
                                  selectedProvinceZone.department,
                                  event.target.value as
                                    'department' | 'province' | 'district',
                                )
                              }
                            >
                              <option value="department">Departamento</option>
                              <option value="province">Provincia</option>
                              <option value="district">Distrito</option>
                            </select>
                          </label>
                          <label>
                            Departamento
                            <select
                              value={selectedProvinceZone.department}
                              onChange={(event) =>
                                updateProvinceScope(
                                  selectedProvinceZone,
                                  event.target.value,
                                  selectedProvinceZone.district
                                    ? 'district'
                                    : selectedProvinceZone.province
                                      ? 'province'
                                      : 'department',
                                  null,
                                )
                              }
                            >
                              {peruDepartments.map((department) => (
                                <option
                                  key={department.value}
                                  value={department.value}
                                  disabled={department.value === 'callao'}
                                >
                                  {department.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedProvinceZone.province !== null ? (
                            <label>
                              Provincia
                              <select
                                value={selectedProvinceZone.province}
                                onChange={(event) =>
                                  updateProvinceScope(
                                    selectedProvinceZone,
                                    selectedProvinceZone.department,
                                    selectedProvinceZone.district
                                      ? 'district'
                                      : 'province',
                                    event.target.value,
                                  )
                                }
                              >
                                {provinceOptions(
                                  selectedProvinceZone.department,
                                ).map((province) => (
                                  <option
                                    key={province.value}
                                    value={province.value}
                                  >
                                    {province.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {selectedProvinceZone.district !== null ? (
                            <label>
                              Distrito
                              <select
                                value={selectedProvinceZone.district}
                                onChange={(event) => {
                                  const district = getPeruDistrictOptions(
                                    selectedProvinceZone.province ?? '',
                                  ).find(
                                    (item) => item.value === event.target.value,
                                  )
                                  updateZone(selectedProvinceZone.id, {
                                    district: event.target.value,
                                    name:
                                      district?.label ??
                                      selectedProvinceZone.name,
                                  })
                                }}
                              >
                                {getPeruDistrictOptions(
                                  selectedProvinceZone.province ?? '',
                                ).map((district) => (
                                  <option
                                    key={district.value}
                                    value={district.value}
                                  >
                                    {district.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label>
                            Courier (S/)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={moneyInputValue(
                                selectedProvinceZone.courierFeeCents,
                              )}
                              onChange={(event) =>
                                updateZone(selectedProvinceZone.id, {
                                  courierFeeCents: parseMoneyInput(
                                    event.target.value,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="admin-shipping-span">
                            Plazo estimado
                            <input
                              required
                              maxLength={80}
                              value={selectedProvinceZone.estimate}
                              onChange={(event) =>
                                updateZone(selectedProvinceZone.id, {
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
                              checked={selectedProvinceZone.active}
                              onChange={(event) =>
                                updateZone(selectedProvinceZone.id, {
                                  active: event.target.checked,
                                })
                              }
                            />
                            {form.provinceShippingEnabled
                              ? 'Aplicar esta tarifa especial'
                              : 'Dejar lista para cuando se activen los envíos'}
                          </label>
                          <button
                            type="button"
                            className="admin-remove"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                zones: current.zones.filter(
                                  (zone) => zone.id !== selectedProvinceZone.id,
                                ),
                              }))
                              setSelectedProvinceId(null)
                              setRemovedZones((current) => [
                                ...current,
                                selectedProvinceZone,
                              ])
                              setMessage('')
                              setMessageIsError(false)
                              notice.toast(
                                'Tarifa retirada del borrador. Puedes deshacer antes de guardar.',
                              )
                            }}
                          >
                            Quitar tarifa especial
                          </button>
                        </div>
                        {!form.provinceShippingEnabled ? (
                          <p className="admin-shipping-help">
                            Esta tarifa se conserva, pero no se aplica mientras
                            los envíos a provincias estén desactivados.
                          </p>
                        ) : null}
                      </fieldset>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        <div className={`admin-shipping-footer${dirty ? ' is-dirty' : ''}`}>
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
            <AdminSaveFeedback {...persistence} />
          </div>
          {removedZones.length ? (
            <button
              className="admin-shipping-undo"
              type="button"
              disabled={saving || persistence.persistenceFailed}
              onClick={undoRemove}
            >
              Deshacer eliminación
            </button>
          ) : null}
          <button
            className="button button--primary"
            type="submit"
            disabled={saving || persistence.persistenceFailed}
            aria-busy={saving}
          >
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </div>
  )
}
