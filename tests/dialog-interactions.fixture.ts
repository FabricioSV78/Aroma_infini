import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog } from '../src/components/ui/Dialog'

/** Let Vite resolve React with the same optimizer/cache as the application. */
export function mountBusyDialogFixture() {
  const host = document.createElement('div')
  const trigger = document.createElement('button')
  trigger.textContent = 'Abrir diálogo de prueba'
  document.body.append(trigger, host)
  trigger.focus()
  const root = createRoot(host)
  const returnFocusRef = { current: trigger }
  let closes = 0
  const render = (busy: boolean) =>
    root.render(
      createElement(Dialog, {
        id: 'audit-busy-dialog',
        title: 'Operación en curso',
        open: true,
        closeDisabled: busy,
        returnFocusRef,
        onClose: () => {
          closes += 1
          host.dataset.closes = String(closes)
          root.unmount()
        },
        children: createElement(
          'button',
          { onClick: () => render(false) },
          'Finalizar operación',
        ),
      }),
    )
  render(true)
}
