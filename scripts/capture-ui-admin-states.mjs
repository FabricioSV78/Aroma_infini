/* global document, window */
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const baseURL = process.env.UI_STATES_CAPTURE_URL ?? 'http://127.0.0.1:5173'
const output =
  process.env.UI_ADMIN_STATES_OUTPUT ??
  'artifacts/ui-states/2026-10-23/admin-states'
const viewports = [
  { name: 'desktop-large', width: 1920, height: 1080 },
  { name: 'desktop-medium', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

await mkdir(output, { recursive: true })
const results = []
const failures = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    let stage = 'admin-save-pending'
    try {
      await page.goto(new URL('/admin/marcas', baseURL).href, {
        waitUntil: 'networkidle',
      })
      await page
        .getByRole('button', { name: 'Nueva marca', exact: true })
        .click()
      await page
        .getByLabel('Nombre', { exact: true })
        .fill(`Casa estados ${viewport.width}`)
      await controlNextWrite(page)
      await page
        .getByRole('button', { name: 'Guardar marca', exact: true })
        .click()
      await page.waitForFunction(
        () => typeof window.__adminStateCapture?.rejectPending === 'function',
      )
      const editor = page.locator('.admin-compact-form')
      const feedback = page.locator('.admin-save-feedback')
      await expect(editor).toHaveAttribute('inert', '')
      await expect(editor).toHaveAttribute('aria-busy', 'true')
      await expect(feedback.getByRole('status')).toContainText(
        'Guardando en este navegador',
      )
      await expect(
        page.getByText('Marca guardada.', { exact: true }),
      ).toHaveCount(0)
      await assertMutationCount(page, 1, 1)
      await capture(page, viewport, stage, pageErrors, consoleErrors)

      stage = 'admin-save-error'
      await page.evaluate(() => window.__adminStateCapture.rejectPending())
      await expect(feedback.getByRole('alert')).toContainText(
        'no se pudo guardar',
      )
      await expect(editor).toHaveAttribute('inert', '')
      const retry = feedback.getByRole('button', {
        name: 'Reintentar guardado',
        exact: true,
      })
      await expect(retry).toBeEnabled()
      await expect(retry).toBeFocused()
      await expect(
        page.getByText('Marca guardada.', { exact: true }),
      ).toHaveCount(0)
      await assertMutationCount(page, 1, 1)
      await capture(page, viewport, stage, pageErrors, consoleErrors)

      stage = 'admin-save-retry'
      await retry.click()
      await expect(editor).toHaveCount(0)
      await expect(feedback).toHaveCount(0)
      await expect(
        page.getByText('Marca guardada.', { exact: true }),
      ).toBeVisible()
      await assertMutationCount(page, 1, 2, true)

      stage = 'admin-product-pending-images'
      await page.goto(
        new URL('/admin/productos/nuevo#product-photos-title', baseURL).href,
        { waitUntil: 'networkidle' },
      )
      const photos = page.locator(
        'section[aria-labelledby="product-photos-title"]',
      )
      await expect(
        photos.getByRole('button', { name: 'Subir fotos', exact: true }),
      ).toBeEnabled()
      await expect(page.locator('#product-photo-count')).toHaveText(
        '0 de 4 fotos',
      )
      await expect(
        photos.locator('.admin-product-upload-placeholder'),
      ).toContainText('Sin imagen')
      await photos.scrollIntoViewIfNeeded()
      await capture(page, viewport, stage, pageErrors, consoleErrors)

      // Import starts in an expandable section; the review modal requires a real file.
      stage = 'admin-import-ready'
      await page.goto(new URL('/admin/productos', baseURL).href, {
        waitUntil: 'networkidle',
      })
      const importer = page.locator('.admin-product-import')
      await importer.locator('summary').click()
      await expect(importer).toHaveAttribute('open', '')
      await expect(
        importer.getByRole('button', {
          name: 'Descargar plantilla .xlsx',
          exact: true,
        }),
      ).toBeEnabled()
      await expect(
        importer.getByRole('button', { name: 'Subir Excel', exact: true }),
      ).toBeEnabled()
      await expect(importer.locator('[aria-busy="true"]')).toHaveCount(0)
      await importer.scrollIntoViewIfNeeded()
      await capture(page, viewport, stage, pageErrors, consoleErrors)
    } catch (error) {
      const failure = {
        name: stage,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        error: error.message,
        pageErrors: [...pageErrors],
        consoleErrors: [...consoleErrors],
      }
      try {
        failure.metrics = await measure(page)
        failure.filename = `${stage}-${viewport.name}-failed.png`
        await page.screenshot({
          path: join(output, failure.filename),
          animations: 'disabled',
        })
      } catch {
        // Preserve the original failed assertion if the page has already closed.
      }
      failures.push(failure)
    } finally {
      await context.close()
    }
    await writeReport()
  }
} finally {
  await browser.close()
  await writeReport()
}

if (failures.length)
  throw new Error(
    `${failures.length} comprobaciones de estados admin requieren revisión. Consulta ${output}/report.json.`,
  )

async function controlNextWrite(page) {
  await page.evaluate(async () => {
    const adminPath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = await import(adminPath)
    const { localAdminStateRepository } = await import(persistencePath)
    await adminService.flush()
    const originalWrite = localAdminStateRepository.write
    const before = structuredClone(adminService.getSnapshot())
    await originalWrite(before)
    const controls = {
      beforeRevision: before.revision,
      writes: 0,
      rejectPending: null,
    }
    window.__adminStateCapture = controls
    localAdminStateRepository.write = async (state) => {
      controls.writes += 1
      if (controls.writes === 1)
        await new Promise((resolve, reject) => {
          controls.rejectPending = () =>
            reject(
              new DOMException(
                'Fallo de almacenamiento de la captura.',
                'QuotaExceededError',
              ),
            )
        })
      await originalWrite(state)
    }
  })
}

async function assertMutationCount(page, revisions, writes, persisted = false) {
  const result = await page.evaluate(async (checkPersistence) => {
    const adminPath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = await import(adminPath)
    const { localAdminStateRepository } = await import(persistencePath)
    const state = adminService.getSnapshot()
    return {
      revisionDelta: state.revision - window.__adminStateCapture.beforeRevision,
      writes: window.__adminStateCapture.writes,
      persistedRevision: checkPersistence
        ? (await localAdminStateRepository.read())?.revision
        : null,
      revision: state.revision,
    }
  }, persisted)
  expect(result.revisionDelta).toBe(revisions)
  expect(result.writes).toBe(writes)
  if (persisted) expect(result.persistedRevision).toBe(result.revision)
}

async function capture(page, viewport, name, pageErrors, consoleErrors) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
    )
  })
  const metrics = await measure(page)
  const result = {
    name,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    filename: `${name}-${viewport.name}.png`,
    metrics,
    pageErrors: [...pageErrors],
    consoleErrors: [...consoleErrors],
  }
  await page.screenshot({
    path: join(output, result.filename),
    animations: 'disabled',
  })
  results.push(result)
  if (
    metrics.documentOverflow ||
    metrics.dialogOverflow ||
    pageErrors.length ||
    consoleErrors.length
  )
    throw new Error(
      'La captura tiene desbordamientos o errores de página/consola.',
    )
}

async function measure(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const dialogs = [...document.querySelectorAll('dialog[open]')]
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      documentOverflow: root.scrollWidth > window.innerWidth + 1,
      dialogOverflow: dialogs.some(
        (dialog) => dialog.scrollWidth > dialog.clientWidth + 1,
      ),
      scrollY: window.scrollY,
      busyRegions: [...document.querySelectorAll('[aria-busy="true"]')].map(
        (element) => element.className,
      ),
      inertRegions: [...document.querySelectorAll('[inert]')].map(
        (element) => element.className,
      ),
      statuses: [
        ...document.querySelectorAll('[role="status"], [role="alert"]'),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          role: element.getAttribute('role'),
          text: element.textContent?.trim(),
        })),
      activeElement: document.activeElement?.textContent?.trim() ?? '',
    }
  })
}

function writeReport() {
  return writeFile(
    join(output, 'report.json'),
    JSON.stringify({ baseURL, viewports, results, failures }, null, 2),
  )
}
