import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { build } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { versionedPublicFonts } from '../scripts/versioned-public-fonts.ts'
import { selectPublicFontPreloads } from '../scripts/public-route-hints.mjs'

test('fonts use fingerprinted identical bytes, one preload URL and the existing mobile condition', async () => {
  const directory = await mkdtemp(resolve('artifacts/font-cache-contract-'))
  const entry = '/' + relative(process.cwd(), directory).replaceAll('\\', '/') + '/entry.mjs'
  const cssEntry = entry.replace('/entry.mjs', '/fonts.css')
  await writeFile(directory + '/entry.mjs', `import '${cssEntry}'`)
  await writeFile(directory + '/fonts.css', "@import 'tailwindcss' source(none); @import '../../src/styles/brand-font.css'; @import '../../src/styles/font-options.css';")
  await writeFile(directory + '/index.html', `<html><head><link rel="preload" as="font" href="/fonts/lato-latin-300-normal.woff2" crossorigin></head><body><script type="module" src="${entry}"></script></body></html>`)
  const warnings = []
  const result = await build({
    configFile: false, logLevel: 'silent', plugins: [tailwindcss(), versionedPublicFonts()],
    build: { write: false, rollupOptions: { input: directory + '/index.html', onwarn: warning => warnings.push({ code: warning.code, message: warning.message }) } },
  })
  const output = (Array.isArray(result) ? result[0] : result).output
  const fonts = output.filter(file => file.fileName.endsWith('.woff2'))
  assert.equal(fonts.length, 8)
  const digest = value => createHash('sha256').update(value).digest('hex')
  for (const font of fonts) {
    assert.match(font.fileName, /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.woff2$/)
    assert.equal(digest(font.source), digest(await readFile('public/fonts/' + font.names[0])))
  }
  const css = output.filter(file => file.fileName.endsWith('.css')).map(file => file.source).join('\n')
  const html = output.find(file => file.fileName.endsWith('.html')).source
  const light = fonts.find(file => file.names.includes('lato-latin-300-normal.woff2'))
  assert(html.includes(`href="/${light.fileName}"`))
  assert(css.includes(`url(/${light.fileName})`))
  assert(!css.includes('/public/fonts/') && !css.includes('/fonts/'))
  const selected = selectPublicFontPreloads(html, '/tienda')
  assert(selected.includes('media="(min-width: 1024px)" data-public-font="light"'))
  assert.equal(selectPublicFontPreloads(selected, '/contacto'), html)
  // Hook timing diagnostics depend on shared CI load; unresolved assets or
  // other build warnings still fail this byte/URL correctness contract.
  assert.deepEqual(warnings.filter(warning => warning.code !== 'PLUGIN_TIMINGS'), [])
  assert.equal(versionedPublicFonts().apply, 'build')
})
