import assert from 'node:assert/strict'
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { viteTestCache } from '../scripts/vite-test-cache.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const marked = { AROMA_TEST_PORT: '5373' }
function resolve(port, environment, command = 'serve', extra = {}) {
  return resolveConfig(
    {
      configFile: false,
      envDir: false,
      root,
      logLevel: 'silent',
      server: { port },
      plugins: environment ? [viteTestCache(environment)] : [],
      ...extra,
    },
    command,
  )
}

test('stock Vite ports share one optimizer directory before test isolation', async () => {
  const first = await resolve(5175)
  const second = await resolve(5176)
  assert.equal(first.cacheDir, second.cacheDir)
})

test('marked test servers resolve distinct caches from actual ports, not the common marker', async () => {
  const ports = [5175, 5176, 5395, 5397]
  const configurations = await Promise.all(
    ports.map((port) => resolve(port, marked)),
  )
  assert.equal(
    new Set(configurations.map((config) => config.cacheDir)).size,
    ports.length,
  )
  for (let index = 0; index < ports.length; index++) {
    assert.equal(configurations[index].server.port, ports[index])
    assert.equal(
      path.resolve(configurations[index].cacheDir),
      path.join(
        root,
        'node_modules/.cache/aroma-tests',
        `vite-${ports[index]}`,
      ),
    )
  }
})

test('unmarked development and marked builds retain the original Vite cache', async () => {
  const development = await resolve(5173)
  assert.equal((await resolve(5173, {})).cacheDir, development.cacheDir)
  const build = await resolve(5173, undefined, 'build')
  assert.equal((await resolve(5173, marked, 'build')).cacheDir, build.cacheDir)
})

test('the config hook sees the inline CLI/API port after the file default is merged', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aroma-vite-config-'))
  const fixture = path.join(directory, 'vite.config.mjs')
  const helperUrl = new URL('../scripts/vite-test-cache.mjs', import.meta.url)
    .href
  try {
    await writeFile(
      fixture,
      `import { viteTestCache } from ${JSON.stringify(helperUrl)}\nexport default { plugins: [viteTestCache({ AROMA_TEST_PORT: '5373' })], server: { port: 5173 } }\n`,
    )
    const configuration = await resolve(6395, undefined, 'serve', {
      configFile: fixture,
      configLoader: 'native',
    })
    assert.equal(configuration.server.port, 6395)
    assert.equal(
      path.resolve(configuration.cacheDir),
      path.join(root, 'node_modules/.cache/aroma-tests/vite-6395'),
    )
  } finally {
    await rm(fixture, { force: true })
    await rmdir(directory)
  }
})
