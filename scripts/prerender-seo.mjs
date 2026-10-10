/* global window */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }
import { readSeoEnvironment } from './seo-environment.mjs'

const env = await readSeoEnvironment()
const shellFile = join('dist', 'index.html')
const shell = await readFile(shellFile, 'utf8')
const privateShell = shell.replace(
  /(<meta name="robots" content=")[^"]+/,
  '$1noindex,nofollow',
)
await writeFile(join('dist', '__app_shell.html'), privateShell)

if (env.VITE_ALLOW_INDEXING !== 'true') {
  console.log('Prerender omitido: esta compilación permanece en noindex.')
  process.exit(0)
}

// Solo contenido público del catálogo incluido en este build. El navegador se
// crea sin cookies ni IndexedDB para no copiar datos locales del administrador.
const paths = [
  ...indexablePaths,
  '/nosotros',
  '/contacto',
  '/envios',
  '/devoluciones',
  '/privacidad',
  '/terminos',
  '/libro-de-reclamaciones',
]
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
})
const address = server.httpServer.address()
if (!address || typeof address === 'string')
  throw new Error('No se pudo iniciar la vista previa para prerenderizar.')
const base = `http://127.0.0.1:${address.port}`
let browser

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const snapshots = new Map()
  for (const path of paths) {
    const page = await context.newPage()
    try {
      const response = await page.goto(new URL(path, base).toString(), {
        waitUntil: 'domcontentloaded',
      })
      if (!response?.ok())
        throw new Error(`No se pudo abrir ${path}: HTTP ${response?.status()}`)
      await page.locator('main h1').first().waitFor({ timeout: 20_000 })
      if (indexablePaths.includes(path)) {
        await page.waitForFunction(
          (expectedPath) => {
            const canonical = window.document.querySelector(
              'link[rel="canonical"]',
            )
            return (
              canonical &&
              new URL(
                canonical.getAttribute('href') || '',
                window.location.href,
              ).pathname === expectedPath
            )
          },
          path,
          { timeout: 20_000 },
        )
        const canonical = await page
          .locator('link[rel="canonical"]')
          .getAttribute('href')
        if (!canonical?.startsWith(new URL(env.VITE_SITE_URL).origin))
          throw new Error(`Canonical de ${path} no usa el dominio configurado.`)
      } else {
        await page.waitForFunction(
          () =>
            window.document.title !==
            'Aroma Infini | Perfumería de autor en Perú',
          undefined,
          { timeout: 20_000 },
        )
      }
      const heading = (await page.locator('main h1').first().innerText()).trim()
      if (!heading || /no encontramos|no está en la selección/i.test(heading))
        throw new Error(`La ruta ${path} no tiene contenido publicable.`)
      snapshots.set(path, await page.content())
    } finally {
      await page.close()
    }
  }
  await context.close()
  for (const [path, html] of snapshots) {
    const filename =
      path === '/' ? shellFile : join('dist', path.slice(1), 'index.html')
    await mkdir(dirname(filename), { recursive: true })
    await writeFile(filename, html)
  }
  console.log(`${snapshots.size} páginas públicas prerenderizadas.`)
} finally {
  await browser?.close()
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  )
}
