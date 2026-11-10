import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { loadEnv } from 'vite'
import { createBuildTarget } from './build-identity.ts'
import { privilegedPublicValue } from './public-environment.mjs'

const manifestName = '_build-manifest.json'
const maximumBytes = 512 * 1024 * 1024
const maximumFiles = 10000

function safePath(value) {
  return (
    typeof value === 'string' &&
    value.length <= 500 &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.includes(':') &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
  )
}

async function readJson(filename, limit) {
  const info = await lstat(filename)
  assert(info.isFile() && !info.isSymbolicLink() && info.size <= limit)
  return JSON.parse(await readFile(filename, 'utf8'))
}

async function inventory(directory) {
  assert((await lstat(directory)).isDirectory())
  assert(!(await lstat(directory)).isSymbolicLink())
  const files = []
  let bytes = 0
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = join(current, entry.name)
      const name = relative(directory, filename).split(sep).join('/')
      assert(safePath(name) && !entry.isSymbolicLink())
      if (name === manifestName) continue
      const info = await lstat(filename)
      assert(!info.isSymbolicLink())
      if (info.isDirectory()) await visit(filename)
      else {
        assert(info.isFile())
        bytes += info.size
        assert(bytes <= maximumBytes && files.length < maximumFiles)
        const hash = createHash('sha256')
        for await (const chunk of createReadStream(filename)) hash.update(chunk)
        files.push({ path: name, bytes: info.size, sha256: hash.digest('hex') })
      }
    }
  }
  await visit(directory)
  assert(files.some((file) => file.path === 'index.html'))
  assert(files.some((file) => file.path === '__app_shell.html'))
  assert(files.some((file) => /^assets\/.+\.js$/.test(file.path)))
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

/** Runs after prerender, so the hashes describe the final assets Wrangler sends. */
export async function sealWorkerBuild(directory, mode) {
  assert(['staging', 'production'].includes(mode))
  const target = await readJson(join(directory, '_build-target.json'), 4096)
  assert.equal(target.version, 1)
  assert.equal(target.mode, mode)
  assert.equal(target.environment, mode)
  assert.match(target.configurationHash, /^[a-f0-9]{64}$/)
  const manifest = { version: 1, target, files: await inventory(directory) }
  await writeFile(join(directory, manifestName), JSON.stringify(manifest))
  return { mode, files: manifest.files.length }
}

/** Prevent accidentally attaching development frontend data to production APIs. */
export async function verifyWorkerBuild({
  directory,
  environment,
  env,
  config,
}) {
  try {
    assert(['staging', 'production'].includes(environment))
    const selected = config.env?.[environment]
    assert(selected?.vars?.APP_ENVIRONMENT === environment)
    assert(
      !Object.entries(env).some(
        ([name, value]) =>
          name.startsWith('VITE_') && privilegedPublicValue(name, value),
      ),
    )
    const manifest = await readJson(
      join(directory, manifestName),
      2 * 1024 * 1024,
    )
    assert.equal(manifest.version, 1)
    assert.equal(manifest.target?.mode, environment)
    assert.equal(manifest.target?.environment, environment)
    assert.deepEqual(manifest.target, createBuildTarget(environment, env))
    // Published application builds default to the remote adapter. Preserve
    // that supported default while rejecting an explicit local fixture build.
    assert.equal(env.VITE_CATALOG_SOURCE || 'supabase', 'supabase')
    assert.equal(env.VITE_SUPABASE_URL, selected.vars.SUPABASE_URL)
    const database = new URL(env.VITE_SUPABASE_URL)
    assert.equal(database.protocol, 'https:')
    assert.equal(database.origin, env.VITE_SUPABASE_URL)
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      assert(/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))
      assert.equal(
        JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role,
        'anon',
      )
    }
    assert.equal(
      env.VITE_ALLOW_INDEXING || 'false',
      selected.vars.SEO_ALLOW_INDEXING,
    )
    assert.equal(
      env.VITE_CATALOG_IS_REAL || 'false',
      selected.vars.SEO_CATALOG_IS_REAL,
    )
    if (environment === 'production') {
      assert(
        ![
          config.vars?.SUPABASE_URL,
          config.env?.staging?.vars?.SUPABASE_URL,
        ].includes(env.VITE_SUPABASE_URL),
      )
      assert.notEqual(selected.vars.CHECKOUT_SIMULATION_ENABLED, 'true')
    }
    assert(
      Array.isArray(manifest.files) && manifest.files.length <= maximumFiles,
    )
    for (const file of manifest.files) {
      assert(safePath(file.path) && file.path !== manifestName)
      assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0)
      assert.match(file.sha256, /^[a-f0-9]{64}$/)
    }
    assert.deepEqual(await inventory(directory), manifest.files)
    return {
      result: 'passed',
      environment,
      verifiedFiles: manifest.files.length,
    }
  } catch {
    // Parser and environment values never enter a deployment log.
    throw new Error('build-environment-or-integrity-mismatch')
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [action, environment, ...extra] = process.argv.slice(2)
    let result
    // Wrangler also invokes custom builds while discovering Worker exports for
    // `types`. That operation precedes the frontend build and cannot validate
    // its final assets. Wrangler sets this command itself for each invocation;
    // deploy/dev still enter the mandatory environment/integrity checks below.
    if (
      action === 'check' &&
      process.env.WRANGLER_COMMAND === 'types' &&
      extra.length === 0 &&
      [undefined, 'staging', 'production'].includes(environment)
    ) {
      result = { result: 'not-required', operation: 'type-generation' }
    } else {
      assert(
        extra.length === 0 && ['staging', 'production'].includes(environment),
      )
      if (action === 'seal')
        result = await sealWorkerBuild(resolve('dist'), environment)
      else {
        assert.equal(action, 'check')
        const parsed = ts.parseConfigFileTextToJson(
          'wrangler.jsonc',
          await readFile('wrangler.jsonc', 'utf8'),
        )
        assert(!parsed.error)
        result = await verifyWorkerBuild({
          directory: resolve('dist'),
          environment,
          env: loadEnv(environment, process.cwd(), 'VITE_'),
          config: parsed.config,
        })
      }
    }
    console.log(JSON.stringify(result))
  } catch {
    console.error(
      'Compilación rechazada: reconstruye el entorno elegido antes de desplegar. No se publicó ningún cambio.',
    )
    process.exitCode = 1
  }
}
