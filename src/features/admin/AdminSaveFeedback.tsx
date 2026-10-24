import { InlineStatus } from '../../components/ui/InlineStatus'

interface AdminSaveFeedbackProps {
  saving: boolean
  persistenceFailed: boolean
  retry: () => Promise<void>
}

export function AdminSaveFeedback({
  saving,
  persistenceFailed,
  retry,
}: AdminSaveFeedbackProps) {
  if (!saving && !persistenceFailed) return null
  return (
    <div className="admin-save-feedback">
      <InlineStatus
        busy={saving}
        role={persistenceFailed && !saving ? 'alert' : 'status'}
      >
        {saving
          ? 'Guardando en este navegador…'
          : 'El cambio está aplicado en esta sesión, pero no se pudo guardar. Reintenta antes de salir.'}
      </InlineStatus>
      {persistenceFailed ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={saving}
          onClick={() => void retry()}
        >
          {saving ? 'Guardando…' : 'Reintentar guardado'}
        </button>
      ) : null}
    </div>
  )
}
