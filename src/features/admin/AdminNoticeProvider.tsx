import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Icon } from '../../components/ui/Icon'
import { Spinner } from '../../components/ui/Spinner'
import {
  getAdminErrorMessage,
  type AdminMessageContext,
} from '../../services/admin-messages'
import './admin-notices.css'

export interface AdminNoticeAction {
  label: string
  onClick?: () => void | boolean | Promise<void | boolean>
}
export interface AdminNoticeOptions {
  kind: 'error' | 'warning' | 'info' | 'success'
  title: string
  description: string
  details?: string[]
  primary?: AdminNoticeAction
  secondary?: AdminNoticeAction
}
interface ConfirmationOptions {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}
interface NoticeRequest extends AdminNoticeOptions {
  id: number
  destructive?: boolean
  resolve?: (confirmed: boolean) => void
  previousFocus: HTMLElement | null
}
interface AdminNoticeApi {
  show(options: AdminNoticeOptions): void
  confirm(options: ConfirmationOptions): Promise<boolean>
  error(error: unknown, context?: AdminMessageContext): void
  toast(message: string): void
}
const NoticeContext = createContext<AdminNoticeApi | null>(null)

// The hook shares this module with its provider so integrations use one entry point.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminNotice() {
  const api = useContext(NoticeContext)
  if (!api) throw new Error('AdminNoticeProvider is required.')
  return api
}

function NoticeDialog({
  request,
  finish,
}: {
  request: NoticeRequest
  finish: (request: NoticeRequest, confirmed: boolean) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const safeButtonRef = useRef<HTMLButtonElement>(null)
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const id = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const previousOverflow = document.body.style.overflow
    // A feedback message temporarily replaces an editor dialog instead of
    // stacking two visible windows. The editor draft remains mounted.
    const parents = [
      ...document.querySelectorAll<HTMLDialogElement>('dialog[open]'),
    ].filter((parent) => parent !== dialog)
    parents.forEach((parent) => parent.close())
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    safeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      parents.forEach((parent) => {
        if (parent.isConnected && !parent.open) parent.showModal()
      })
      if (request.previousFocus?.isConnected)
        request.previousFocus.focus({ preventScroll: true })
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return
        if (
          request.previousFocus?.isConnected &&
          !request.previousFocus.closest('[inert]') &&
          !request.previousFocus.matches(':disabled')
        ) {
          request.previousFocus.focus({ preventScroll: true })
          return
        }
        // After dismissing a storage error the form stays protected. Return
        // focus to its recovery action, rather than to an inert submit button.
        const recovery = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '.admin-save-feedback button:not([disabled]), .admin-product-import__pending-save button:not([disabled])',
          ),
        ].find((button) => button.getClientRects().length > 0)
        recovery?.focus({ preventScroll: true })
      })
    }
  }, [request])

  function dismiss() {
    if (!pendingRef.current) finish(request, false)
  }
  async function act(
    action: AdminNoticeAction | undefined,
    confirmed: boolean,
  ) {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setActionError('')
    try {
      const result = await action?.onClick?.()
      if (result !== false) finish(request, confirmed)
    } catch (error) {
      setActionError(getAdminErrorMessage(error).description)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
      ),
    ]
    const first = buttons[0]
    const last = buttons.at(-1)
    if (!first) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  const confirmation = Boolean(request.resolve)
  return (
    <dialog
      ref={dialogRef}
      className={`admin-notice-dialog admin-notice-dialog--${request.kind}`}
      role={
        request.kind === 'info' || request.kind === 'success'
          ? 'dialog'
          : 'alertdialog'
      }
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault()
        dismiss()
      }}
      onKeyDown={trapFocus}
    >
      <div className="admin-notice-body">
        <span className="admin-notice-icon">
          <Icon
            name={
              request.kind === 'success'
                ? 'check'
                : request.kind === 'info'
                  ? 'chat'
                  : 'alert'
            }
          />
        </span>
        <h2 id={`${id}-title`}>{request.title}</h2>
        <p id={`${id}-description`}>{request.description}</p>
        {request.details?.length ? (
          <ul className="admin-notice-details">
            {request.details.slice(0, 5).map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
            {request.details.length > 5 ? (
              <li>
                Y {request.details.length - 5} más. Consulta el detalle en la
                pantalla.
              </li>
            ) : null}
          </ul>
        ) : null}
        {actionError ? (
          <p className="admin-notice-action-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="admin-notice-actions">
          {confirmation || request.secondary ? (
            <button
              ref={confirmation ? safeButtonRef : undefined}
              type="button"
              className="button button--secondary"
              disabled={pending}
              onClick={() => void act(request.secondary, false)}
            >
              {request.secondary?.label ?? 'Cancelar'}
            </button>
          ) : null}
          <button
            ref={confirmation ? undefined : safeButtonRef}
            type="button"
            className={`button button--primary${request.destructive ? ' admin-notice-danger' : ''}`}
            disabled={pending}
            onClick={() => void act(request.primary, true)}
          >
            {pending ? (
              <>
                <Spinner /> Un momento…
              </>
            ) : (
              (request.primary?.label ?? 'Entendido')
            )}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export function AdminNoticeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<NoticeRequest | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  )
  const activeRef = useRef<NoticeRequest | null>(null)
  const queued = useRef<NoticeRequest | null>(null)
  const sequence = useRef(0)
  const finish = useCallback((request: NoticeRequest, confirmed: boolean) => {
    if (activeRef.current?.id !== request.id) return
    const next = queued.current
    queued.current = null
    activeRef.current = next
    setActive(next)
    request.resolve?.(confirmed)
  }, [])
  const present = useCallback(
    (
      options: AdminNoticeOptions & {
        destructive?: boolean
        resolve?: (value: boolean) => void
      },
    ) => {
      const request = {
        ...options,
        id: ++sequence.current,
        previousFocus:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
      }
      // One decision at a time. Queue a different outcome while a retry finishes,
      // but never repeat an identical error or queue another confirmation.
      if (activeRef.current) {
        if (options.resolve) options.resolve(false)
        else if (activeRef.current.title !== options.title)
          queued.current = request
        return
      }
      activeRef.current = request
      setToast(null)
      setActive(request)
    },
    [],
  )
  const api = useMemo<AdminNoticeApi>(
    () => ({
      show: present,
      confirm: (options) =>
        new Promise((resolve) =>
          present({
            kind: 'warning',
            title: options.title,
            description: options.description,
            destructive: options.destructive,
            primary: { label: options.confirmLabel },
            secondary: { label: options.cancelLabel ?? 'Cancelar' },
            resolve,
          }),
        ),
      error: (error, context) => present(getAdminErrorMessage(error, context)),
      toast: (message) => setToast({ id: ++sequence.current, message }),
    }),
    [present],
  )
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6500)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(
    () => () => {
      activeRef.current?.resolve?.(false)
    },
    [],
  )
  return (
    <NoticeContext.Provider value={api}>
      {children}
      {active ? (
        <NoticeDialog key={active.id} request={active} finish={finish} />
      ) : null}
      <div
        className="admin-toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && !active ? (
          <div className="admin-toast" key={toast.id}>
            <Icon name="check" />
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setToast(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        ) : null}
      </div>
    </NoticeContext.Provider>
  )
}
