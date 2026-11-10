import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createBuildTarget } from '../scripts/build-identity.ts'
import { sealWorkerBuild, verifyWorkerBuild } from '../scripts/worker-build.mjs'

test('type generation is independent of final assets while deploy/dev still require their verified package', async () => {
  const directory = await mkdtemp(resolve('artifacts/type-generation-check-'))
  const script = resolve('scripts/worker-build.mjs')
  const execute = promisify(execFile)
  try {
    for (const args of [
      ['check'],
      ['check', 'staging'],
      ['check', 'production'],
    ]) {
      const { stdout } = await execute(
        process.execPath,
        ['--experimental-strip-types', script, ...args],
        {
          cwd: directory,
          env: { ...process.env, WRANGLER_COMMAND: 'types' },
          windowsHide: true,
        },
      )
      assert.deepEqual(JSON.parse(stdout), {
        result: 'not-required',
        operation: 'type-generation',
      })
    }
    for (const command of ['deploy', 'dev', 'versions upload', ''])
      await assert.rejects(
        execute(
          process.execPath,
          ['--experimental-strip-types', script, 'check', 'production'],
          {
            cwd: directory,
            env: { ...process.env, WRANGLER_COMMAND: command },
            windowsHide: true,
          },
        ),
        (error) =>
          error.code === 1 && error.stderr.includes('Compilación rechazada'),
      )
    await assert.rejects(
      execute(
        process.execPath,
        ['--experimental-strip-types', script, 'seal'],
        {
          cwd: directory,
          env: { ...process.env, WRANGLER_COMMAND: 'types' },
          windowsHide: true,
        },
      ),
      (error) => error.code === 1,
    )
  } finally {
    const target = resolve(directory)
    assert.ok(
      target.startsWith(
        resolve('artifacts') + (process.platform === 'win32' ? '\\' : '/'),
      ),
    )
    await rm(target, { recursive: true, force: true })
  }
})

const config = {
  vars: { SUPABASE_URL: 'https://developmentproject.supabase.co' },
  env: {
    staging: {
      vars: {
        APP_ENVIRONMENT: 'staging',
        SUPABASE_URL: 'https://developmentproject.supabase.co',
        SEO_ALLOW_INDEXING: 'false',
        SEO_CATALOG_IS_REAL: 'false',
      },
    },
    production: {
      vars: {
        APP_ENVIRONMENT: 'production',
        SUPABASE_URL: 'https://productionproject.supabase.co',
        SEO_ALLOW_INDEXING: 'false',
        SEO_CATALOG_IS_REAL: 'false',
        CHECKOUT_SIMULATION_ENABLED: 'false',
      },
    },
  },
}
function environment(name) {
  return {
    VITE_APP_ENV: name,
    VITE_CATALOG_SOURCE: 'supabase',
    VITE_SUPABASE_URL: config.env[name].vars.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    VITE_ALLOW_INDEXING: 'false',
    VITE_CATALOG_IS_REAL: 'false',
  }
}
async function fixture(name, callback) {
  const parent = resolve('artifacts/worker-build-tests')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'case-'))
  try {
    const env = environment(name)
    await mkdir(join(directory, 'assets'))
    await writeFile(
      join(directory, 'index.html'),
      '<html><script src="/assets/app.js"></script></html>',
    )
    await writeFile(
      join(directory, '__app_shell.html'),
      '<html>private shell</html>',
    )
    await writeFile(
      join(directory, 'assets/app.js'),
      'console.log("compiled application")',
    )
    await writeFile(
      join(directory, '_build-target.json'),
      JSON.stringify(createBuildTarget(name, env)),
    )
    await sealWorkerBuild(directory, name)
    const check = (overrides = {}) =>
      verifyWorkerBuild({
        directory,
        environment: name,
        env,
        config: structuredClone(config),
        ...overrides,
      })
    await callback({ directory, env, check })
  } finally {
    const scoped = relative(parent, resolve(directory))
    assert(
      scoped.startsWith('case-') &&
        !isAbsolute(scoped) &&
        !scoped.includes('..'),
    )
    await rm(directory, { recursive: true, force: true })
  }
}

test('identity records the effective Vite environment without public or server credential values', () => {
  const env = {
    ...environment('staging'),
    SUPABASE_SECRET_KEY: 'not-public',
    VITE_MARKER: 'public-config-value',
  }
  const target = createBuildTarget('staging', env)
  const serialized = JSON.stringify(target)
  assert.equal(target.environment, 'staging')
  for (const value of [
    'not-public',
    'public-config-value',
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_URL,
  ])
    assert(!serialized.includes(value))
  assert.deepEqual(
    target,
    createBuildTarget('staging', {
      ...env,
      SUPABASE_SECRET_KEY: 'rotated-server-only',
    }),
  )
  assert.notEqual(
    target.configurationHash,
    createBuildTarget('staging', { ...env, VITE_MARKER: 'changed' })
      .configurationHash,
  )
})

for (const name of ['staging', 'production']) {
  test(`${name} accepts only its final sealed assets and current configuration`, () =>
    fixture(name, async ({ check }) => {
      assert.deepEqual(await check(), {
        result: 'passed',
        environment: name,
        verifiedFiles: 4,
      })
    }))
}

test('a staging build cannot be sent to production or a production build to staging', async () => {
  for (const name of ['staging', 'production'])
    await fixture(name, async ({ check }) => {
      const wrong = name === 'staging' ? 'production' : 'staging'
      await assert.rejects(
        check({ environment: wrong, env: environment(wrong) }),
        /build-environment-or-integrity-mismatch/,
      )
    })
})

test('a changed browser key or API origin requires recompilation', () =>
  fixture('production', async ({ env, check }) => {
    for (const field of [
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_MEDIA_API_BASE_URL',
      'VITE_SITE_URL',
    ])
      await assert.rejects(
        check({ env: { ...env, [field]: 'changed-public-value' } }),
        /build-environment-or-integrity-mismatch/,
      )
  }))

test('a matching fingerprint still cannot point browser and Worker to different databases', () =>
  fixture('production', async ({ check }) => {
    const invalid = structuredClone(config)
    invalid.env.production.vars.SUPABASE_URL =
      config.env.staging.vars.SUPABASE_URL
    await assert.rejects(
      check({ config: invalid }),
      /build-environment-or-integrity-mismatch/,
    )
  }))

test('production rejects simulation and mismatched SEO declarations', () =>
  fixture('production', async ({ check }) => {
    for (const [field, value] of [
      ['CHECKOUT_SIMULATION_ENABLED', 'true'],
      ['SEO_ALLOW_INDEXING', 'true'],
      ['APP_ENVIRONMENT', 'staging'],
    ]) {
      const invalid = structuredClone(config)
      invalid.env.production.vars[field] = value
      await assert.rejects(
        check({ config: invalid }),
        /build-environment-or-integrity-mismatch/,
      )
    }
  }))

for (const mutation of ['replace', 'delete', 'append']) {
  test(`a ${mutation} of final generated files blocks deployment`, () =>
    fixture('staging', async ({ directory, check }) => {
      const filename = join(directory, 'assets/app.js')
      if (mutation === 'replace') await writeFile(filename, 'different build')
      else if (mutation === 'delete') await rm(filename)
      else
        await writeFile(
          join(directory, 'assets/old-production.js'),
          'stale production asset',
        )
      await assert.rejects(check(), /build-environment-or-integrity-mismatch/)
    }))
}

test('unsealed, malformed and unsafe manifests fail without revealing values or reading arbitrary files', () =>
  fixture('production', async ({ directory, check }) => {
    const filename = join(directory, '_build-manifest.json'),
      original = await readFile(filename, 'utf8')
    await rm(filename)
    await assert.rejects(check(), /build-environment-or-integrity-mismatch/)
    await writeFile(filename, 'invalid-sensitive-data')
    await assert.rejects(
      check(),
      (error) => error.message === 'build-environment-or-integrity-mismatch',
    )
    const manifest = JSON.parse(original)
    manifest.files[0].path = '../outside'
    await writeFile(filename, JSON.stringify(manifest))
    await assert.rejects(check(), /build-environment-or-integrity-mismatch/)
  }))

test('sealing a build under the wrong mode is rejected before deployment', () =>
  fixture('staging', async ({ directory }) => {
    await assert.rejects(sealWorkerBuild(directory, 'production'))
  }))

test('the supported remote default can deploy without a redundant catalog-source variable', () =>
  fixture('staging', async ({ directory, env, check }) => {
    delete env.VITE_CATALOG_SOURCE
    await writeFile(
      join(directory, '_build-target.json'),
      JSON.stringify(createBuildTarget('staging', env)),
    )
    await sealWorkerBuild(directory, 'staging')
    assert.equal((await check()).result, 'passed')
  }))

test('missing or privileged browser keys cannot pass even after a fresh build', () =>
  fixture('production', async ({ directory, env, check }) => {
    for (const key of ['', 'sb_secret_forbidden']) {
      env.VITE_SUPABASE_PUBLISHABLE_KEY = key
      await writeFile(
        join(directory, '_build-target.json'),
        JSON.stringify(createBuildTarget('production', env)),
      )
      await sealWorkerBuild(directory, 'production')
      await assert.rejects(check(), /build-environment-or-integrity-mismatch/)
    }
  }))

test('arbitrary VITE server credentials cannot be deployed even with a matching build seal', () =>
  fixture('staging', async ({ directory, env, check }) => {
    env.VITE_ADMIN_PASSWORD = 'synthetic-private-value'
    await writeFile(
      join(directory, '_build-target.json'),
      JSON.stringify(createBuildTarget('staging', env)),
    )
    await sealWorkerBuild(directory, 'staging')
    await assert.rejects(
      check(),
      (error) => error.message === 'build-environment-or-integrity-mismatch',
    )
  }))
