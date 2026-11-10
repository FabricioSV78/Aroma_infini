import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import {
  assessProductionConfiguration,
  inspectProduction,
} from '../scripts/check-production.mjs'
import {
  readSeoEnvironment,
  resolveBuildMode,
} from '../scripts/seo-environment.mjs'

function productionFixture() {
  const site = 'https://www.aromainfini.pe'
  const database = 'https://productionproject.supabase.co'
  return {
    env: {
      VITE_APP_ENV: 'production',
      VITE_SITE_URL: site,
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: database,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_syntheticpublickey',
      VITE_ALLOW_INDEXING: 'false',
      VITE_CATALOG_IS_REAL: 'false',
    },
    config: {
      name: 'aroma-frontend',
      compatibility_flags: ['nodejs_compat', 'enable_request_signal'],
      vars: { SUPABASE_URL: 'https://developmentproject.supabase.co' },
      r2_buckets: [{ binding: 'MEDIA_BUCKET', bucket_name: 'aroma-media-dev' }],
      observability: {
        enabled: true,
        redact_query_string: true,
        traces: { enabled: true },
      },
      env: {
        staging: {
          name: 'aroma-frontend-staging',
          vars: { SUPABASE_URL: 'https://stagingproject.supabase.co' },
          r2_buckets: [
            { binding: 'MEDIA_BUCKET', bucket_name: 'aroma-media-staging' },
          ],
        },
        production: {
          name: 'aroma-frontend-production',
          vars: {
            APP_ENVIRONMENT: 'production',
            SUPABASE_URL: database,
            MEDIA_ALLOWED_ORIGINS: site,
            SEO_ALLOW_INDEXING: 'false',
            SEO_CATALOG_IS_REAL: 'false',
            SEO_SITE_URL: site,
          },
          r2_buckets: [
            { binding: 'MEDIA_BUCKET', bucket_name: 'aroma-media-prod' },
          ],
          routes: [{ pattern: 'www.aromainfini.pe', custom_domain: true }],
          workers_dev: false,
          preview_urls: false,
        },
      },
    },
  }
}

function check(result, code) {
  const entry = result.checks.find((item) => item.code === code)
  assert.ok(entry, `Missing check: ${code}`)
  return entry.status
}

test('production requires an effective request disconnect signal flag', () => {
  const fixture = productionFixture()
  assert.equal(
    check(assessProductionConfiguration(fixture), 'request-disconnect-signal'),
    'pass',
  )
  fixture.config.compatibility_flags = ['nodejs_compat']
  assert.equal(
    check(assessProductionConfiguration(fixture), 'request-disconnect-signal'),
    'blocked',
  )
  fixture.config.compatibility_flags = [
    'nodejs_compat',
    'enable_request_signal',
  ]
  fixture.config.env.production.compatibility_flags = ['nodejs_compat']
  assert.equal(
    check(assessProductionConfiguration(fixture), 'request-disconnect-signal'),
    'blocked',
  )
})

test('production requires query-string redaction while preserving logs and traces', () => {
  const fixture = productionFixture()
  assert.equal(
    check(
      assessProductionConfiguration(fixture),
      'observability-query-redaction',
    ),
    'pass',
  )
  fixture.config.observability.redact_query_string = false
  const result = assessProductionConfiguration(fixture)
  assert.equal(check(result, 'observability-query-redaction'), 'blocked')
  assert.equal(check(result, 'observability'), 'pass')
})

function legacyKey(role) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.synthetic`
}

async function isolatedDirectory(run) {
  const base = resolve('artifacts', 'production-readiness-tests')
  await mkdir(base, { recursive: true })
  const directory = await mkdtemp(join(base, 'case-'))
  try {
    return await run(directory)
  } finally {
    const child = relative(base, resolve(directory))
    assert.ok(
      child.startsWith('case-') && !child.includes('..') && !isAbsolute(child),
    )
    await rm(directory, { recursive: true, force: true })
  }
}

async function isolatedPublicEnvironment(run) {
  const previous = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')),
  )
  for (const key of Object.keys(previous)) delete process.env[key]
  try {
    return await run()
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('VITE_')) delete process.env[key]
    }
    Object.assign(process.env, previous)
  }
}

test('coherent isolated configuration remains commercially closed', () => {
  const result = assessProductionConfiguration(productionFixture())
  assert.equal(result.scope, 'offline-production-configuration')
  assert.equal(result.configurationReady, true)
  assert.equal(result.commercialReady, false)
  assert.equal(check(result, 'real-payments'), 'pending')
  assert.equal(check(result, 'live-environment-validation'), 'pending')
  assert.equal(
    result.checks.filter((item) => item.status === 'blocked').length,
    0,
  )
})

test('missing production never substitutes root or staging configuration', () => {
  const fixture = productionFixture()
  fixture.config.vars = { ...fixture.config.env.production.vars }
  fixture.config.r2_buckets = fixture.config.env.production.r2_buckets
  delete fixture.config.env.production
  const result = assessProductionConfiguration(fixture)
  assert.equal(result.configurationReady, false)
  assert.equal(check(result, 'production-environment'), 'blocked')
  assert.equal(check(result, 'environment-markers'), 'blocked')
  assert.equal(check(result, 'database-isolation'), 'blocked')
  assert.equal(check(result, 'media-isolation'), 'blocked')
})

test('Wrangler non-inheritable vars and buckets must exist in production', () => {
  const fixture = productionFixture()
  fixture.config.vars = { ...fixture.config.env.production.vars }
  fixture.config.r2_buckets = fixture.config.env.production.r2_buckets
  delete fixture.config.env.production.vars
  delete fixture.config.env.production.r2_buckets
  const result = assessProductionConfiguration(fixture)
  assert.equal(check(result, 'environment-markers'), 'blocked')
  assert.equal(check(result, 'database-isolation'), 'blocked')
  assert.equal(check(result, 'media-isolation'), 'blocked')
})

test('production Worker identity cannot reuse another environment', () => {
  for (const name of [
    '',
    'aroma-frontend',
    'aroma-frontend-staging',
    'aroma-test-worker',
  ]) {
    const fixture = productionFixture()
    fixture.config.env.production.name = name
    assert.equal(
      check(assessProductionConfiguration(fixture), 'worker-identity'),
      'blocked',
    )
  }
})

test('server credentials belong in secrets and are never included in diagnostics', () => {
  for (const entry of [
    ['SUPABASE_COMMERCE_SECRET_KEY', 'synthetic-server-credential'],
    ['UNRELATED_SETTING', 'sb_secret_synthetic-server-credential'],
    ['lowercase_private_key', '-----BEGIN PRIVATE KEY-----synthetic'],
  ]) {
    const fixture = productionFixture()
    fixture.config.env.production.vars[entry[0]] = entry[1]
    const result = assessProductionConfiguration(fixture)
    assert.equal(check(result, 'server-secrets'), 'blocked')
    assert.ok(!JSON.stringify(result).includes(entry[1]))
  }
})

test('development and staging databases cannot be reused', () => {
  for (const source of ['root', 'staging']) {
    const fixture = productionFixture()
    const database =
      source === 'root'
        ? fixture.config.vars.SUPABASE_URL
        : fixture.config.env.staging.vars.SUPABASE_URL
    fixture.env.VITE_SUPABASE_URL = database
    fixture.config.env.production.vars.SUPABASE_URL = database
    assert.equal(
      check(assessProductionConfiguration(fixture), 'database-isolation'),
      'blocked',
    )
  }
})

test('frontend and Worker must agree on the database', () => {
  const fixture = productionFixture()
  fixture.config.env.production.vars.SUPABASE_URL =
    'https://anotherproject.supabase.co'
  assert.equal(
    check(assessProductionConfiguration(fixture), 'database-isolation'),
    'blocked',
  )
})

test('development, staging and misleadingly named media buckets are rejected', () => {
  for (const name of [
    'aroma-media-dev',
    'aroma-media-staging',
    'unlisted-test-media',
  ]) {
    const fixture = productionFixture()
    fixture.config.env.production.r2_buckets[0].bucket_name = name
    assert.equal(
      check(assessProductionConfiguration(fixture), 'media-isolation'),
      'blocked',
    )
  }
})

test('simulation flags or a declared simulation origin cannot enter production', () => {
  for (const extra of [
    { CHECKOUT_SIMULATION_ENABLED: 'true' },
    { CHECKOUT_SIMULATION_ORIGIN: 'https://www.aromainfini.pe' },
    { CHECKOUT_SIMULATION_ENABLED: true },
  ]) {
    const fixture = productionFixture()
    Object.assign(fixture.config.env.production.vars, extra)
    assert.equal(
      check(assessProductionConfiguration(fixture), 'simulation-disabled'),
      'blocked',
    )
  }
  const fixture = productionFixture()
  fixture.config.env.production.vars.CHECKOUT_SIMULATION_ENABLED = 'false'
  assert.equal(
    check(assessProductionConfiguration(fixture), 'simulation-disabled'),
    'pass',
  )
})

test('both environment declarations must explicitly be production', () => {
  const fixture = productionFixture()
  fixture.env.VITE_APP_ENV = 'staging'
  assert.equal(
    check(assessProductionConfiguration(fixture), 'environment-markers'),
    'blocked',
  )
  fixture.env.VITE_APP_ENV = 'production'
  fixture.config.env.production.vars.APP_ENVIRONMENT = 'development'
  assert.equal(
    check(assessProductionConfiguration(fixture), 'environment-markers'),
    'blocked',
  )
})

test('public domains reject unsafe, temporary and placeholder URLs', () => {
  for (const domain of [
    'http://www.aromainfini.pe',
    'https://localhost',
    'https://127.0.0.1',
    'https://www.dominio-confirmado.pe',
    'https://sample.workers.dev',
    'https://sample.r2.dev',
    'https://productionproject.supabase.co',
    'https://user:password@www.aromainfini.pe',
    'https://www.aromainfini.pe/path',
    'https://www.aromainfini.pe/?key=value',
    'https://www.aromainfini.pe/#section',
    'https://www.aromainfini.pe:8443',
  ]) {
    const fixture = productionFixture()
    fixture.env.VITE_SITE_URL = domain
    assert.equal(
      check(assessProductionConfiguration(fixture), 'public-domain'),
      'blocked',
    )
  }
})

test('publishable and legacy anon keys remain valid public configuration', () => {
  for (const key of ['sb_publishable_syntheticpublickey', legacyKey('anon')]) {
    const fixture = productionFixture()
    fixture.env.VITE_SUPABASE_PUBLISHABLE_KEY = key
    const result = assessProductionConfiguration(fixture)
    assert.equal(check(result, 'public-key'), 'pass')
    assert.equal(check(result, 'public-secrets'), 'pass')
  }
})

test('secret values in any public variable are blocked and never echoed', () => {
  for (const secret of [
    'sb_secret_synthetic_server_only',
    legacyKey('service_role'),
  ]) {
    const fixture = productionFixture()
    fixture.env.VITE_UNRELATED_SETTING = secret
    const result = assessProductionConfiguration(fixture)
    assert.equal(check(result, 'public-secrets'), 'blocked')
    assert.ok(!JSON.stringify(result).includes(secret))
  }
  const fixture = productionFixture()
  const secret = 'private-only-synthetic-password'
  fixture.env.VITE_DATABASE_PASSWORD = secret
  const result = assessProductionConfiguration(fixture)
  assert.equal(check(result, 'public-secrets'), 'blocked')
  assert.ok(!JSON.stringify(result).includes(secret))
})

test('an invalid or privileged Supabase browser key is rejected', () => {
  for (const key of [
    '',
    'not-a-key',
    'sb_secret_synthetic_server_only',
    legacyKey('service_role'),
  ]) {
    const fixture = productionFixture()
    fixture.env.VITE_SUPABASE_PUBLISHABLE_KEY = key
    assert.equal(
      check(assessProductionConfiguration(fixture), 'public-key'),
      'blocked',
    )
  }
})

test('remote catalog, same-origin API and managed media remain required', () => {
  const fixture = productionFixture()
  fixture.env.VITE_CATALOG_SOURCE = 'local'
  fixture.env.VITE_MEDIA_API_BASE_URL = 'https://anotherworker.workers.dev'
  fixture.env.VITE_MEDIA_BASE_URL = 'https://cdn.aromainfini.pe'
  const result = assessProductionConfiguration(fixture)
  assert.equal(check(result, 'catalog-source'), 'blocked')
  assert.equal(check(result, 'api-origin'), 'blocked')
  assert.equal(check(result, 'static-media-origin'), 'blocked')
  const valid = productionFixture()
  valid.env.VITE_MEDIA_API_BASE_URL = valid.env.VITE_SITE_URL
  assert.equal(
    check(assessProductionConfiguration(valid), 'api-origin'),
    'pass',
  )
})

test('media origin allowlist rejects localhost, wildcards and extra hosts', () => {
  for (const origins of [
    '',
    '*',
    'https://www.aromainfini.pe,http://localhost:5173',
    'https://www.aromainfini.pe,https://another.aromainfini.pe',
  ]) {
    const fixture = productionFixture()
    fixture.config.env.production.vars.MEDIA_ALLOWED_ORIGINS = origins
    assert.equal(
      check(assessProductionConfiguration(fixture), 'media-origins'),
      'blocked',
    )
  }
})

test('custom domain binding and private platform URLs must be explicit', () => {
  const fixture = productionFixture()
  fixture.config.env.production.routes = [{ pattern: 'www.aromainfini.pe' }]
  fixture.config.env.production.workers_dev = true
  delete fixture.config.env.production.preview_urls
  const result = assessProductionConfiguration(fixture)
  assert.equal(check(result, 'worker-domain'), 'blocked')
  assert.equal(check(result, 'private-worker-urls'), 'blocked')
})

test('logging and traces must remain enabled', () => {
  const fixture = productionFixture()
  fixture.config.env.production.observability = { enabled: true }
  assert.equal(
    check(assessProductionConfiguration(fixture), 'observability'),
    'blocked',
  )
})

test('noindex is mandatory until publication is separately validated', () => {
  for (const indexing of ['true', undefined]) {
    const fixture = productionFixture()
    fixture.env.VITE_ALLOW_INDEXING = indexing
    const result = assessProductionConfiguration(fixture)
    assert.equal(check(result, 'no-premature-indexing'), 'blocked')
    assert.equal(result.commercialReady, false)
  }
})

test('server and browser SEO declarations must use the same flags and canonical domain', () => {
  for (const mutate of [
    (fixture) => {
      fixture.config.env.production.vars.SEO_ALLOW_INDEXING = 'true'
    },
    (fixture) => {
      fixture.config.env.production.vars.SEO_CATALOG_IS_REAL = 'true'
    },
    (fixture) => {
      fixture.config.env.production.vars.SEO_SITE_URL =
        'https://another.aromainfini.pe'
    },
    (fixture) => {
      delete fixture.config.env.production.vars.SEO_ALLOW_INDEXING
    },
  ]) {
    const fixture = productionFixture()
    mutate(fixture)
    assert.equal(
      check(
        assessProductionConfiguration(fixture),
        'seo-configuration-alignment',
      ),
      'blocked',
    )
  }
})

test('build mode resolver handles staging hooks before NODE_ENV', () => {
  assert.equal(
    resolveBuildMode({
      npm_lifecycle_event: 'prebuild:staging',
      NODE_ENV: 'production',
    }),
    'staging',
  )
  assert.equal(
    resolveBuildMode({
      npm_lifecycle_event: 'postbuild:staging',
      NODE_ENV: 'development',
    }),
    'staging',
  )
  assert.equal(
    resolveBuildMode({ npm_lifecycle_event: 'build', NODE_ENV: 'production' }),
    'production',
  )
  assert.equal(resolveBuildMode({ NODE_ENV: 'development' }), 'development')
  assert.equal(resolveBuildMode({}), 'production')
})

test('SEO loader uses Vite mode precedence, quoting and expansion', async () => {
  await isolatedPublicEnvironment(() =>
    isolatedDirectory(async (directory) => {
      await writeFile(
        join(directory, '.env'),
        'VITE_SITE_URL=https://base.aromainfini.pe\nVITE_PRIORITY=base\nPRIVATE_SERVER_KEY=never-public\n',
      )
      await writeFile(join(directory, '.env.local'), 'VITE_PRIORITY=local\n')
      await writeFile(
        join(directory, '.env.production'),
        'VITE_SITE_URL=https://production.aromainfini.pe\nVITE_PRIORITY=production\n',
      )
      await writeFile(
        join(directory, '.env.staging'),
        'VITE_SITE_URL=https://staging.aromainfini.pe\nVITE_PRIORITY=staging\nVITE_ALLOW_INDEXING=true\nVITE_QUOTED="a # quoted value"\nVITE_EXPANDED=${VITE_SITE_URL}/catalog\n',
      )
      await writeFile(
        join(directory, '.env.staging.local'),
        'VITE_PRIORITY=staging-local\n',
      )
      const staging = await readSeoEnvironment('staging', directory)
      assert.equal(staging.VITE_PRIORITY, 'staging-local')
      assert.equal(staging.VITE_SITE_URL, 'https://staging.aromainfini.pe')
      assert.equal(
        staging.VITE_EXPANDED,
        'https://staging.aromainfini.pe/catalog',
      )
      assert.equal(staging.VITE_QUOTED, 'a # quoted value')
      assert.equal(staging.VITE_ALLOW_INDEXING, 'false')
      assert.equal(staging.PRIVATE_SERVER_KEY, undefined)
      const production = await readSeoEnvironment('production', directory)
      assert.equal(production.VITE_PRIORITY, 'production')
      assert.equal(
        production.VITE_SITE_URL,
        'https://production.aromainfini.pe',
      )
    }),
  )
})

test('process overrides win but staging still cannot enable indexing', async () => {
  await isolatedPublicEnvironment(() =>
    isolatedDirectory(async (directory) => {
      await writeFile(
        join(directory, '.env.staging'),
        'VITE_SITE_URL=https://file.aromainfini.pe\nVITE_ALLOW_INDEXING=true\n',
      )
      process.env.VITE_SITE_URL = 'https://process.aromainfini.pe'
      process.env.VITE_ALLOW_INDEXING = 'true'
      const result = await readSeoEnvironment('staging', directory)
      assert.equal(result.VITE_SITE_URL, 'https://process.aromainfini.pe')
      assert.equal(result.VITE_ALLOW_INDEXING, 'false')
      process.env.VITE_APP_ENV = 'staging'
      assert.equal(
        (await readSeoEnvironment('production', directory)).VITE_ALLOW_INDEXING,
        'false',
      )
    }),
  )
})

test('inspection parses JSONC safely without truncating https origins', async () => {
  await isolatedPublicEnvironment(() =>
    isolatedDirectory(async (directory) => {
      const fixture = productionFixture()
      const configuration = JSON.stringify(fixture.config, null, 2).replace(
        /\n}$/,
        ',\n}',
      )
      await writeFile(
        join(directory, 'wrangler.jsonc'),
        `// Synthetic isolated configuration\n${configuration}\n`,
      )
      await writeFile(
        join(directory, '.env.production'),
        Object.entries(fixture.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      )
      const result = await inspectProduction(directory)
      assert.equal(result.configurationReady, true)
      assert.equal(result.commercialReady, false)
      assert.equal(check(result, 'database-isolation'), 'pass')
      assert.match(
        await readFile(join(directory, 'wrangler.jsonc'), 'utf8'),
        /https:\/\//,
      )
    }),
  )
})

test('invalid JSONC is rejected without echoing its contents', async () => {
  await isolatedPublicEnvironment(() =>
    isolatedDirectory(async (directory) => {
      const sensitive = 'synthetic-private-value-do-not-echo'
      await writeFile(
        join(directory, 'wrangler.jsonc'),
        `{ "invalid": ${sensitive} broken!`,
      )
      await assert.rejects(inspectProduction(directory), (error) => {
        assert.equal(error.message, 'invalid-worker-configuration')
        assert.ok(!String(error).includes(sensitive))
        return true
      })
    }),
  )
})
