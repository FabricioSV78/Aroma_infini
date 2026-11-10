import { expect, test } from './test'

test('un diálogo ocupado bloquea Escape y fondo y recupera el foco al terminar', async ({
  page,
}) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await page.evaluate(async () => {
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const dialogPath = '/src/components/ui/Dialog.tsx'
    const { default: react } = (await import(reactPath)) as {
      default: typeof import('react')
    }
    const { default: dom } = (await import(domPath)) as {
      default: typeof import('react-dom/client')
    }
    const { createElement } = react
    const { createRoot } = dom
    const { Dialog } = (await import(
      dialogPath
    )) as typeof import('../src/components/ui/Dialog')
    const host = document.createElement('div')
    const trigger = document.createElement('button')
    trigger.textContent = 'Abrir diálogo de prueba'
    document.body.append(trigger, host)
    trigger.focus()
    const root = createRoot(host)
    let closes = 0
    const render = (busy: boolean) =>
      root.render(
        createElement(Dialog, {
          id: 'audit-busy-dialog',
          title: 'Operación en curso',
          open: true,
          closeDisabled: busy,
          returnFocusRef: { current: trigger },
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
  })
  const dialog = page.getByRole('dialog', { name: 'Operación en curso' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Cerrar', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Finalizar operación' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Abrir diálogo de prueba' }),
  ).toBeFocused()
})
