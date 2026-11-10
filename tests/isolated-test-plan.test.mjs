import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import path from 'node:path'
import {
  isolatedSuites,
  isolatedTestEnvironment,
  selectIsolatedSuites,
} from '../scripts/isolated-test-plan.mjs'

test('the isolated plan includes every Playwright configuration exactly once', async () => {
  const configurations = (await readdir('.'))
    .filter((name) => /^playwright(?:\..+)?\.config\.ts$/.test(name))
    .sort()
  const selected = selectIsolatedSuites('all')
  assert.equal(selected.length, new Set(selected).size)
  assert.deepEqual([...selected].sort(), configurations)
  for (const name of Object.keys(isolatedSuites))
    assert(selectIsolatedSuites(name).length > 0)
  assert.deepEqual(selectIsolatedSuites('node'), [])
  assert.throws(() => selectIsolatedSuites('cloudflare:deploy'))
})

test('the runner overrides public service values and drops privileged environment variables', () => {
  const environment = isolatedTestEnvironment({
    PATH: 'preserve-platform-tools',
    VITE_SUPABASE_URL: 'https://hosted-project.invalid',
    VITE_MEDIA_API_BASE_URL: 'https://hosted-media.invalid',
    VITE_SITE_URL: 'https://commercial.invalid',
    VITE_ALLOW_INDEXING: 'true',
    SUPABASE_ACCESS_TOKEN: 'synthetic-value',
    CLOUDFLARE_API_TOKEN: 'synthetic-value',
    CF_API_TOKEN: 'synthetic-value',
    DATABASE_URL: 'synthetic-value',
    PGPASSWORD: 'synthetic-value',
  })
  assert.equal(environment.PATH, 'preserve-platform-tools')
  assert.equal(environment.VITE_CATALOG_SOURCE, 'local')
  assert.equal(environment.VITE_APP_ENV, 'development')
  assert.equal(environment.VITE_ALLOW_INDEXING, 'false')
  for (const name of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_MEDIA_API_BASE_URL',
    'VITE_MEDIA_BASE_URL',
    'VITE_SITE_URL',
  ])
    assert.equal(environment[name], '')
  for (const name of [
    'SUPABASE_ACCESS_TOKEN',
    'CLOUDFLARE_API_TOKEN',
    'CF_API_TOKEN',
    'DATABASE_URL',
    'PGPASSWORD',
  ])
    assert.equal(environment[name], undefined)
})

test('all root test configurations are included in the Node TypeScript project', async () => {
  const configuration = JSON.parse(await readFile('tsconfig.node.json', 'utf8'))
  assert(configuration.include.includes('playwright*.config.ts'))
})

test('every application public environment setting has an explicit isolated override', async () => {
  const overrides = isolatedTestEnvironment({})
  const files = await readdir('src', { recursive: true })
  for (const file of files.filter((name) => /\.tsx?$/.test(name))) {
    const content = await readFile(path.join('src', file), 'utf8')
    for (const match of content.matchAll(
      /import\.meta\.env\.(VITE_[A-Z_0-9]+)/g,
    ))
      assert(
        Object.hasOwn(overrides, match[1]),
        `${file}: explicitly isolate ${match[1]}`,
      )
  }
})
