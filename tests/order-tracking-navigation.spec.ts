import { expect, test, type Page } from './test'

const firstReference = 'AI-0123456789ABCDEF'
const secondReference = 'AI-FEDCBA9876543210'
const firstToken = '1'.repeat(64)
const secondToken = '2'.repeat(64)

interface TrackingRead {
  reference: string
  token: string | null
}

function record(reference: string, status = 'received') {
  return {
    reference,
    placedAt: '2026-11-01T12:00:00.000Z',
    status,
    mode: 'guest',
    simulation: true,
  }
}

// Isolate the UI's asynchronous read boundary. These tests never query a
// hosted order or claim to verify the Supabase tracking contract.
async function controlTracking(
  page: Page,
  read: (request: TrackingRead) => Promise<unknown> | unknown,
) {
  await page.route(
    (url) => url.pathname === '/src/services/order-tracking-service.ts',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `\nloadTrackingRecord = async (reference, token) => {
            const query = new URLSearchParams({ reference });
            if (token) query.set('token', token);
            const response = await fetch('/__tracking-ui-fixture?' + query);
            if (!response.ok) throw new Error('Isolated tracking failure');
            return response.json();
          };`,
      })
    },
  )
  await page.route('**/__tracking-ui-fixture?*', async (route) => {
    const query = new URL(route.request().url()).searchParams
    try {
      await route.fulfill({
        json: await read({
          reference: query.get('reference')!,
          token: query.get('token'),
        }),
      })
    } catch {
      await route.fulfill({ status: 503, json: {} })
    }
  })
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('El código visible sigue la consulta al retroceder y avanzar', async ({
  page,
}) => {
  await controlTracking(page, ({ reference }) => record(reference))
  await page.goto(`/seguir-pedido?codigo=${firstReference}`)
  const input = page.getByLabel('Código de pedido')
  await expect(
    page.getByRole('heading', { name: 'Estado: recibido' }),
  ).toBeVisible()
  await input.fill(secondReference)
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page).toHaveURL(`/seguir-pedido?codigo=${secondReference}`)
  await page.goBack()
  await expect(page).toHaveURL(`/seguir-pedido?codigo=${firstReference}`)
  await expect(input).toHaveValue(firstReference)
  await page.goForward()
  await expect(page).toHaveURL(`/seguir-pedido?codigo=${secondReference}`)
  await expect(input).toHaveValue(secondReference)
})

test('Reconsultar conserva el enlace privado y una respuesta no borra lo escrito', async ({
  page,
}) => {
  const calls: TrackingRead[] = []
  const pending = deferred()
  let waitForReply = false
  await controlTracking(page, async (request) => {
    calls.push(request)
    if (waitForReply) await pending.promise
    return record(request.reference)
  })
  await page.goto(
    `/seguir-pedido?codigo=${firstReference}#acceso=${firstToken}`,
  )
  const heading = page.getByRole('heading', { name: 'Estado: recibido' })
  await expect(heading).toBeVisible()
  const initialReads = calls.length
  waitForReply = true
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(
    page.getByText('Consultando pedido…', { exact: true }),
  ).toBeVisible()
  await expect(heading).toHaveCount(0)
  await expect.poll(() => calls.length).toBeGreaterThan(initialReads)
  expect(calls.at(-1)).toEqual({ reference: firstReference, token: firstToken })
  const input = page.getByLabel('Código de pedido')
  await input.fill(secondReference)
  waitForReply = false
  pending.release()
  await expect(heading).toBeVisible()
  await expect(input).toHaveValue(secondReference)
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page).toHaveURL(`/seguir-pedido?codigo=${secondReference}`)
  await expect.poll(() => calls.at(-1)?.reference).toBe(secondReference)
  expect(calls.at(-1)).toEqual({ reference: secondReference, token: null })
})

test('Un cambio de acceso descarta la respuesta anterior de la misma referencia', async ({
  page,
}) => {
  const oldRead = deferred()
  let oldStarted = false
  await controlTracking(page, async ({ reference, token }) => {
    if (token === firstToken) {
      oldStarted = true
      await oldRead.promise
      return record(reference)
    }
    return record(reference, 'preparing')
  })
  await page.goto(
    `/seguir-pedido?codigo=${firstReference}#acceso=${firstToken}`,
  )
  await expect.poll(() => oldStarted).toBe(true)
  await page.evaluate((token) => {
    window.location.hash = `acceso=${token}`
  }, secondToken)
  await expect(
    page.getByRole('heading', { name: 'Estado: en preparación' }),
  ).toBeVisible()
  const staleResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/__tracking-ui-fixture' &&
      new URL(response.url()).searchParams.get('token') === firstToken,
  )
  oldRead.release()
  await (await staleResponse).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
  await expect(
    page.getByRole('heading', { name: 'Estado: recibido' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Estado: en preparación' }),
  ).toBeVisible()
})

test('Reintentar la misma consulta sustituye el error por el estado de carga', async ({
  page,
}) => {
  let fail = true
  const pending = deferred()
  await controlTracking(page, async ({ reference }) => {
    if (fail) throw new Error('Isolated failed read')
    await pending.promise
    return record(reference)
  })
  await page.goto(`/seguir-pedido?codigo=${firstReference}`)
  await expect(page.getByRole('alert')).toContainText('No pudimos consultar')
  fail = false
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page.getByText('Consultando pedido…', { exact: true }),
  ).toBeVisible()
  pending.release()
  await expect(
    page.getByRole('heading', { name: 'Estado: recibido' }),
  ).toBeVisible()
})
