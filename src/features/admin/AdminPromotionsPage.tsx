import { commerceSettingsService } from '../../services/commerce-settings-service'
import { isRemoteCatalog } from '../../services/catalog-source'
import './admin-operations.css'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useSearchParams } from 'react-router'
import { type AdminPromotion } from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { AdminPagination } from './AdminPagination'
import { AdminBadge, AdminPageHeader } from './AdminShared'
import { getPromotionStatus } from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminProductOffers } from './AdminProductOffers'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { useAdminNotice } from './AdminNoticeProvider'

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function createPromotionDraft(): AdminPromotion {
  return {
    id: isRemoteCatalog ? crypto.randomUUID() : `promo-${crypto.randomUUID()}`,
    code: '',
    active: false,
    type: 'percent',
    value: 10,
    minimumCents: 0,
    startsAt: '',
    endsAt: '',
    usageLimit: null,
    used: 0,
  }
}

function promotionDatetimeLocal(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function AdminPromotionCodesPage() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const [form, setForm] = useState<AdminPromotion | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminPromotion | null>(null)
  const [error, setError] = useState('')
  const [editingExisting, setEditingExisting] = useState(false)
  const [saveAction, setSaveAction] = useState<'finish' | 'create-another'>(
    'finish',
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const codesSectionRef = useRef<HTMLElement>(null)
  const focusCodeAfterSave = useRef(false)
  const deletingRef = useRef(false)
  const persistence = useAdminSave({ catalog: true })
  const formId = form?.id
  useEffect(() => {
    if (
      !formId ||
      persistence.saving ||
      persistence.persistenceFailed ||
      !focusCodeAfterSave.current
    )
      return
    const frame = window.requestAnimationFrame(() => {
      codeRef.current?.focus()
      focusCodeAfterSave.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [formId, persistence.saving, persistence.persistenceFailed])
  const promotions = [...state.promotions].sort((first, second) =>
    first.code.localeCompare(second.code),
  )
  const pagination = useAdminPagination(promotions, 10)
  const dirty = Boolean(
    form &&
    originalForm &&
    JSON.stringify(form) !== JSON.stringify(originalForm),
  )
  useUnsavedChanges(
    dirty || persistence.saving || persistence.persistenceFailed,
  )

  function openEditor(nextForm: AdminPromotion) {
    setEditingExisting(state.promotions.some((item) => item.id === nextForm.id))
    focusCodeAfterSave.current = false
    setError('')
    const draft = isRemoteCatalog
      ? {
          ...nextForm,
          startsAt: promotionDatetimeLocal(nextForm.startsAt),
          endsAt: promotionDatetimeLocal(nextForm.endsAt),
        }
      : nextForm
    setForm(draft)
    setOriginalForm(draft)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Descartar los cambios de la promoción?',
        description: 'El código conservará su última configuración guardada.',
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form || persistence.saving || persistence.persistenceFailed) return
    const createAnother =
      !editingExisting &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
        'create-another'
    setSaveAction(createAnother ? 'create-another' : 'finish')
    setError('')
    const result = await persistence.save(
      () => commerceSettingsService.savePromotion(form),
      () => {
        notice.toast('Promoción guardada.')
        if (createAnother) {
          const next = createPromotionDraft()
          setForm(next)
          setOriginalForm({ ...next })
          setError('')
          focusCodeAfterSave.current = true
        } else {
          setForm(null)
          setOriginalForm(null)
        }
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function togglePromotion(promotion: AdminPromotion) {
    if (persistence.saving || persistence.persistenceFailed) return
    if (
      promotion.active &&
      !(await notice.confirm({
        title: `¿Desactivar ${promotion.code}?`,
        description:
          'El código dejará de aplicarse a las nuevas compras. Los pedidos anteriores se conservarán.',
        confirmLabel: 'Desactivar código',
        destructive: true,
      }))
    )
      return
    setError('')
    const result = await persistence.save(
      () =>
        commerceSettingsService.setPromotionActive(
          promotion.id,
          !promotion.active,
          promotion.version,
        ),
      () =>
        notice.toast(
          `Promoción ${promotion.code} ${promotion.active ? 'desactivada' : 'activada'}.`,
        ),
    )
    if (result?.kind === 'validation') setError(result.message)
  }

  async function deletePromotion(promotion: AdminPromotion) {
    if (
      form ||
      persistence.saving ||
      persistence.persistenceFailed ||
      deletingRef.current
    )
      return
    deletingRef.current = true
    try {
      if (
        !(await notice.confirm({
          title: `¿Eliminar el cupón ${promotion.code}?`,
          description:
            'El código dejará de estar disponible para nuevas compras. Los pedidos anteriores se conservarán.',
          confirmLabel: 'Eliminar cupón',
          destructive: true,
        }))
      )
        return
      setError('')
      setDeletingId(promotion.id)
      const result = await persistence.save(
        () =>
          commerceSettingsService.deletePromotion(
            promotion.id,
            promotion.version ?? 0,
          ),
        () => {
          notice.toast(`Cupón ${promotion.code} eliminado.`)
          window.requestAnimationFrame(() => codesSectionRef.current?.focus())
        },
      )
      if (result?.kind === 'validation') setError(result.message)
    } finally {
      setDeletingId(null)
      deletingRef.current = false
    }
  }

  return (
    <section
      className="admin-promotions-codes"
      aria-label="Cupones"
      ref={codesSectionRef}
      tabIndex={-1}
    >
      {!form ? (
        <div className="admin-list-toolbar">
          <p>
            {state.promotions.length}{' '}
            {state.promotions.length === 1 ? 'promoción' : 'promociones'}
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={persistence.saving || persistence.persistenceFailed}
            onClick={() => openEditor(createPromotionDraft())}
          >
            Nueva promoción
          </button>
        </div>
      ) : null}
      {form ? (
        <form
          className="admin-editor admin-promotion-form"
          onSubmit={submit}
          aria-busy={persistence.saving}
          inert={persistence.saving || persistence.persistenceFailed}
        >
          <section aria-labelledby="promotion-editor-title">
            <header>
              <span>01</span>
              <div>
                <h2
                  id="promotion-editor-title"
                  ref={editorHeadingRef}
                  tabIndex={-1}
                >
                  {editingExisting ? 'Editar promoción' : 'Nueva promoción'}
                </h2>
                <p>Las fechas son opcionales si la vigencia no tiene límite.</p>
              </div>
            </header>
            <div className="admin-fields">
              <label>
                Código
                <input
                  ref={codeRef}
                  value={form.code}
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            type: event.target.value as AdminPromotion['type'],
                          }
                        : current,
                    )
                  }
                >
                  <option value="percent">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </label>
              <label>
                {form.type === 'percent' ? 'Descuento (%)' : 'Monto (S/)'}
                <input
                  type="number"
                  min="0.01"
                  max={form.type === 'percent' ? '100' : undefined}
                  step="0.01"
                  value={form.value}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, value: Number(event.target.value) }
                        : current,
                    )
                  }
                  required
                />
              </label>
              <label>
                Compra mínima (S/)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumCents / 100}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            minimumCents: Math.round(
                              Number(event.target.value) * 100,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Inicio
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, startsAt: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Final
                <input
                  type="datetime-local"
                  min={form.startsAt || undefined}
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, endsAt: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Límite de usos
                <input
                  type="number"
                  min="1"
                  value={form.usageLimit ?? ''}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            usageLimit: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : current,
                    )
                  }
                  placeholder="Sin límite"
                />
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, active: event.target.checked }
                        : current,
                    )
                  }
                />
                Promoción activa
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
                name="afterSave"
                value="finish"
                disabled={persistence.saving || persistence.persistenceFailed}
                aria-busy={persistence.saving && saveAction === 'finish'}
              >
                {persistence.saving && saveAction === 'finish'
                  ? 'Guardando…'
                  : 'Guardar promoción'}
              </button>
              {!editingExisting ? (
                <button
                  className="button button--secondary"
                  type="submit"
                  name="afterSave"
                  value="create-another"
                  disabled={persistence.saving || persistence.persistenceFailed}
                  aria-busy={
                    persistence.saving && saveAction === 'create-another'
                  }
                >
                  {persistence.saving && saveAction === 'create-another'
                    ? 'Guardando…'
                    : 'Guardar y crear otra'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void closeEditor()}
                disabled={persistence.saving || persistence.persistenceFailed}
              >
                Cancelar
              </button>
            </div>
          </section>
        </form>
      ) : null}
      <AdminSaveFeedback {...persistence} />
      {error && !form ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!promotions.length && !form ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon="percent"
          title="Aún no hay códigos"
          description="Crea un código cuando tengas una campaña o descuento para ofrecer."
        />
      ) : null}
      <ul className="admin-promotion-list">
        {pagination.items.map((promotion) => {
          const status = getPromotionStatus(promotion)
          const tone =
            status.label === 'Aplicable'
              ? 'success'
              : status.label === 'Programada'
                ? 'info'
                : status.label === 'Vencida' ||
                    status.label === 'Límite alcanzado'
                  ? 'danger'
                  : 'neutral'
          return (
            <li key={promotion.id}>
              <div>
                <strong>{promotion.code}</strong>
                <span>
                  {promotion.type === 'percent'
                    ? `${promotion.value} %`
                    : formatPEN(promotion.value * 100)}{' '}
                  {promotion.minimumCents > 0
                    ? ` · compra mínima ${formatPEN(promotion.minimumCents)}`
                    : ''}
                </span>
                <small>
                  {promotion.startsAt || promotion.endsAt
                    ? `Vigencia: ${promotion.startsAt ? formatShortDate(promotion.startsAt) : 'sin inicio'} – ${promotion.endsAt ? formatShortDate(promotion.endsAt) : 'sin final'}`
                    : 'Sin fechas de vigencia'}
                  {promotion.usageLimit !== null
                    ? ` · ${promotion.used}/${promotion.usageLimit} usos`
                    : promotion.used > 0
                      ? ` · ${promotion.used} usos`
                      : ''}
                </small>
              </div>
              <AdminBadge tone={tone}>{status.label}</AdminBadge>
              <div className="admin-row-actions">
                <button
                  type="button"
                  disabled={persistence.saving || persistence.persistenceFailed}
                  onClick={() => openEditor({ ...promotion })}
                  aria-label={`Editar ${promotion.code}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={persistence.saving || persistence.persistenceFailed}
                  onClick={() => void togglePromotion(promotion)}
                  className={
                    promotion.active ? 'admin-action-danger' : undefined
                  }
                  aria-label={`${promotion.active ? 'Desactivar' : 'Activar'} ${promotion.code}`}
                >
                  {promotion.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  className="admin-action-danger"
                  disabled={
                    Boolean(form) ||
                    persistence.saving ||
                    persistence.persistenceFailed
                  }
                  onClick={() => void deletePromotion(promotion)}
                  aria-label={`Eliminar cupón ${promotion.code}`}
                  aria-busy={persistence.saving && deletingId === promotion.id}
                >
                  {persistence.saving && deletingId === promotion.id
                    ? 'Eliminando…'
                    : 'Eliminar cupón'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <AdminPagination
        label="promociones"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </section>
  )
}

export function AdminPromotionsPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('vista') === 'ofertas' ? 'ofertas' : 'codigos'
  const codesTabRef = useRef<HTMLButtonElement>(null)
  const offersTabRef = useRef<HTMLButtonElement>(null)
  const focusAfterNavigation = useRef<'codigos' | 'ofertas' | null>(null)

  useEffect(() => {
    if (focusAfterNavigation.current !== view) return
    const frame = window.requestAnimationFrame(() => {
      if (view === 'codigos') codesTabRef.current?.focus()
      else offersTabRef.current?.focus()
      focusAfterNavigation.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  function setView(nextView: 'ofertas' | 'codigos') {
    focusAfterNavigation.current = nextView
    const next = new URLSearchParams(params)
    if (nextView === 'ofertas') next.set('vista', 'ofertas')
    else next.delete('vista')
    setParams(next)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextView =
      event.key === 'Home'
        ? 'codigos'
        : event.key === 'End'
          ? 'ofertas'
          : view === 'codigos'
            ? 'ofertas'
            : 'codigos'
    setView(nextView)
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Gestión comercial"
        title="Promociones"
        description="Gestiona ofertas de productos y códigos de descuento."
      />
      <div
        className="admin-promotion-tabs"
        role="tablist"
        aria-label="Tipo de promoción"
      >
        <button
          ref={codesTabRef}
          type="button"
          id="admin-promotion-codes-tab"
          role="tab"
          aria-selected={view === 'codigos'}
          aria-controls="admin-promotion-codes-panel"
          tabIndex={view === 'codigos' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setView('codigos')}
        >
          Cupones
        </button>
        <button
          ref={offersTabRef}
          type="button"
          id="admin-promotion-offers-tab"
          role="tab"
          aria-selected={view === 'ofertas'}
          aria-controls="admin-promotion-offers-panel"
          tabIndex={view === 'ofertas' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setView('ofertas')}
        >
          Ofertas de productos
        </button>
      </div>
      <div
        id="admin-promotion-codes-panel"
        role="tabpanel"
        aria-labelledby="admin-promotion-codes-tab"
        hidden={view !== 'codigos'}
        tabIndex={0}
      >
        {view === 'codigos' ? <AdminPromotionCodesPage /> : null}
      </div>
      <div
        id="admin-promotion-offers-panel"
        role="tabpanel"
        aria-labelledby="admin-promotion-offers-tab"
        hidden={view !== 'ofertas'}
        tabIndex={0}
      >
        {view === 'ofertas' ? <AdminProductOffers /> : null}
      </div>
    </div>
  )
}
