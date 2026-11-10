import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import ts from 'typescript'
import {
  deploymentBuildEnvironment,
  requireCurrentBranch,
  validateGithubRequest,
} from '../scripts/github-deployment.mjs'

const repository = 'FabricioSV78/Aroma_infini'
const sha = 'a'.repeat(40)
const nextSha = 'b'.repeat(40)
const publishableKey = 'sb_publishable_fixture'
const rawConfiguration = await readFile('wrangler.jsonc', 'utf8')
const parsedConfiguration = ts.parseConfigFileTextToJson(
  'wrangler.jsonc',
  rawConfiguration,
)
assert.equal(parsedConfiguration.error, undefined)
const configuration = parsedConfiguration.config

function request(environment = 'staging') {
  const branch = environment === 'production' ? 'main' : 'develop'
  return {
    environment,
    eventName: environment === 'production' ? 'workflow_dispatch' : 'push',
    ref: `refs/heads/${branch}`,
    sha,
    repository,
    productionEnabled: 'true',
    event: {
      repository: { full_name: repository },
      after: sha,
      ref: `refs/heads/${branch}`,
      inputs: { confirm: 'true' },
    },
  }
}

function build(environment = 'staging') {
  return {
    environment,
    config: structuredClone(configuration),
    publishableKey,
  }
}

function jwt(claims) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    Buffer.from('synthetic-signature').toString('base64url'),
  ].join('.')
}

test('develop pushes and manual retries select their immutable commit', () => {
  for (const eventName of ['push', 'workflow_dispatch']) {
    assert.deepEqual(validateGithubRequest({ ...request(), eventName }), {
      environment: 'staging',
      branch: 'develop',
      sha,
    })
  }
})

test('only an explicitly enabled and confirmed manual main release is accepted', () => {
  for (const confirm of ['true', true]) {
    const input = request('production')
    input.event.inputs.confirm = confirm
    assert.deepEqual(validateGithubRequest(input), {
      environment: 'production',
      branch: 'main',
      sha,
    })
  }
  for (const productionEnabled of [undefined, '', 'false', 'TRUE'])
    assert.throws(
      () =>
        validateGithubRequest({ ...request('production'), productionEnabled }),
      /production-disabled/,
    )
  for (const confirm of [false, 'false', undefined, 1, 'yes']) {
    const input = request('production')
    input.event.inputs.confirm = confirm
    assert.throws(
      () => validateGithubRequest(input),
      /production-confirmation-required/,
    )
  }
  const noInputs = request('production')
  delete noInputs.event.inputs
  assert.throws(
    () => validateGithubRequest(noInputs),
    /production-confirmation-required/,
  )
})

test('pull requests, forks, arbitrary branches and mutable revision names cannot deploy', () => {
  for (const eventName of [
    'pull_request',
    'pull_request_target',
    'workflow_run',
  ])
    assert.throws(
      () => validateGithubRequest({ ...request(), eventName }),
      /unsupported-event/,
    )
  assert.throws(
    () =>
      validateGithubRequest({ ...request('production'), eventName: 'push' }),
    /manual-release-required/,
  )
  for (const ref of [
    'refs/heads/main',
    'refs/tags/develop',
    'refs/pull/1/merge',
  ])
    assert.throws(
      () => validateGithubRequest({ ...request(), ref }),
      /unexpected-branch/,
    )
  for (const shaValue of ['', 'develop', 'a'.repeat(39), 'A'.repeat(40)])
    assert.throws(
      () => validateGithubRequest({ ...request(), sha: shaValue }),
      /invalid-commit/,
    )
  assert.throws(
    () => validateGithubRequest({ ...request(), repository: 'attacker/fork' }),
    /unexpected-repository/,
  )
  const forkPayload = request()
  forkPayload.event.repository.full_name = 'attacker/fork'
  assert.throws(
    () => validateGithubRequest(forkPayload),
    /unexpected-repository/,
  )
  assert.throws(
    () => validateGithubRequest({ ...request(), environment: 'preview' }),
    /unknown-environment/,
  )
})

test('a push must match the tested SHA and cannot be a deleted branch', () => {
  for (const change of [
    { after: nextSha },
    { ref: 'refs/heads/main' },
    { deleted: true },
  ]) {
    const input = request()
    Object.assign(input.event, change)
    assert.throws(
      () => validateGithubRequest(input),
      /unexpected-push-revision/,
    )
  }
})

test('public build settings derive from the selected isolated Worker configuration', () => {
  for (const environment of ['staging', 'production']) {
    const input = build(environment)
    const values = deploymentBuildEnvironment(input)
    assert.equal(values.VITE_APP_ENV, environment)
    assert.equal(values.VITE_CATALOG_SOURCE, 'supabase')
    assert.equal(
      values.VITE_SUPABASE_URL,
      input.config.env[environment].vars.SUPABASE_URL,
    )
    assert.equal(values.VITE_SUPABASE_PUBLISHABLE_KEY, publishableKey)
    assert.equal(values.VITE_ALLOW_INDEXING, 'false')
    assert.equal(values.VITE_MEDIA_API_BASE_URL, '')
    assert.equal(values.VITE_MEDIA_BASE_URL, '')
    assert.equal(
      values.VITE_SITE_URL,
      input.config.env[environment].vars.SEO_SITE_URL,
    )
    assert(Object.keys(values).every((name) => name.startsWith('VITE_')))
  }
})

test('Worker, database and R2 environment mixups fail closed', () => {
  for (const change of [
    (input) => {
      input.config.env.staging.name = input.config.env.production.name
    },
    (input) => {
      input.config.env.staging.vars.APP_ENVIRONMENT = 'production'
    },
    (input) => {
      input.config.env.staging.vars.SUPABASE_URL =
        input.config.env.production.vars.SUPABASE_URL
    },
    (input) => {
      input.config.env.staging.vars.SUPABASE_URL = 'http://localhost:54321'
    },
    (input) => {
      input.config.env.staging.r2_buckets = structuredClone(
        input.config.env.production.r2_buckets,
      )
    },
  ]) {
    const input = build()
    change(input)
    assert.throws(
      () => deploymentBuildEnvironment(input),
      /environment-mismatch/,
    )
  }
})

test('unreviewed public launch, indexing, payments and push cannot be enabled by this workflow', () => {
  for (const change of [
    (selected) => {
      selected.workers_dev = true
    },
    (selected) => {
      selected.preview_urls = true
    },
    (selected) => {
      selected.routes = [{ pattern: 'shop.invalid', custom_domain: true }]
    },
    (selected) => {
      selected.vars.CHECKOUT_SIMULATION_ENABLED = 'true'
    },
    (selected) => {
      selected.vars.CHECKOUT_SIMULATION_ORIGIN = 'https://shop.invalid'
    },
    (selected) => {
      selected.vars.ADMIN_PUSH_ENABLED = 'true'
    },
  ]) {
    const input = build('production')
    change(input.config.env.production)
    assert.throws(
      () => deploymentBuildEnvironment(input),
      /production-must-remain-closed/,
    )
  }
  for (const environment of ['staging', 'production']) {
    const input = build(environment)
    input.config.env[environment].vars.SEO_ALLOW_INDEXING = 'true'
    assert.throws(
      () => deploymentBuildEnvironment(input),
      /indexing-not-approved/,
    )
    input.config.env[environment].vars.SEO_ALLOW_INDEXING = 'false'
    input.config.env[environment].vars.SEO_CATALOG_IS_REAL = 'maybe'
    assert.throws(
      () => deploymentBuildEnvironment(input),
      /indexing-not-approved/,
    )
  }
  const wrongOrigin = build()
  wrongOrigin.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN =
    'https://other.invalid'
  assert.throws(
    () => deploymentBuildEnvironment(wrongOrigin),
    /staging-origin-mismatch/,
  )
})

test('privileged and mismatched project keys never enter the frontend environment', () => {
  for (const key of [
    undefined,
    '',
    'sb_secret_fixture',
    jwt({ role: 'service_role' }),
    'eyJ.invalid.payload',
  ])
    assert.throws(
      () => deploymentBuildEnvironment({ ...build(), publishableKey: key }),
      /missing-or-invalid-public-key/,
    )
  const input = build()
  const ref = new URL(
    input.config.env.staging.vars.SUPABASE_URL,
  ).hostname.split('.')[0]
  const key = jwt({ role: 'anon', ref })
  assert.equal(
    deploymentBuildEnvironment({ ...input, publishableKey: key })
      .VITE_SUPABASE_PUBLISHABLE_KEY,
    key,
  )
  assert.throws(
    () =>
      deploymentBuildEnvironment({
        ...input,
        publishableKey: jwt({ role: 'anon', ref: 'x'.repeat(20) }),
      }),
    /public-key-project-mismatch/,
  )
})

test('GitHub environment-file injection is rejected in every configurable string', () => {
  for (const value of [
    'legitimate\nCLOUDFLARE_API_TOKEN=attacker',
    'bad\rvalue',
    'bad\0value',
  ]) {
    for (const property of ['mapTileUrl', 'mapAttribution'])
      assert.throws(
        () => deploymentBuildEnvironment({ ...build(), [property]: value }),
        /invalid-public-setting/,
      )
    const input = build()
    input.config.env.staging.vars.SEO_SITE_URL = value
    assert.throws(
      () => deploymentBuildEnvironment(input),
      /invalid-public-setting/,
    )
  }
})

test('revision checks query only the fixed GitHub endpoint without following redirects', async () => {
  let calls = 0
  await requireCurrentBranch({
    repository,
    branch: 'develop',
    sha,
    token: 'synthetic-token',
    fetchImpl: async (url, options) => {
      calls++
      assert.equal(
        url,
        `https://api.github.com/repos/${repository}/git/ref/heads/develop`,
      )
      assert.equal(options.redirect, 'error')
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token')
      assert.equal(options.headers['Cache-Control'], 'no-cache')
      assert(options.signal instanceof AbortSignal)
      return Response.json({
        ref: 'refs/heads/develop',
        object: { type: 'commit', sha },
      })
    },
  })
  assert.equal(calls, 1)
})

test('advanced branches, unexpected objects and unavailable API stop publication', async () => {
  for (const response of [
    { ref: 'refs/heads/develop', object: { type: 'commit', sha: nextSha } },
    { ref: 'refs/heads/main', object: { type: 'commit', sha } },
    { ref: 'refs/heads/develop', object: { type: 'tag', sha } },
  ])
    await assert.rejects(
      requireCurrentBranch({
        repository,
        branch: 'develop',
        sha,
        token: 'synthetic-token',
        fetchImpl: async () => Response.json(response),
      }),
      /branch-advanced-rerun-latest/,
    )
  for (const status of [302, 403, 404, 500])
    await assert.rejects(
      requireCurrentBranch({
        repository,
        branch: 'develop',
        sha,
        token: 'synthetic-token',
        fetchImpl: async () => new Response('', { status }),
      }),
      /github-revision-unavailable/,
    )
  await assert.rejects(
    requireCurrentBranch({
      repository,
      branch: 'develop',
      sha,
      token: 'synthetic-token',
      fetchImpl: async () => {
        throw new Error('network unavailable')
      },
    }),
    /network unavailable/,
  )
})

test('invalid revision inputs cannot send a token anywhere', async () => {
  let calls = 0
  for (const invalid of [
    { repository: 'attacker/fork' },
    { branch: '../evil' },
    { sha: 'main' },
    { token: '' },
  ])
    await assert.rejects(
      requireCurrentBranch({
        repository,
        branch: 'develop',
        sha,
        token: 'synthetic-token',
        ...invalid,
        fetchImpl: async () => {
          calls++
          throw new Error('must not fetch')
        },
      }),
      /invalid-revision-check/,
    )
  assert.equal(calls, 0)
})

test('CLI failures are sanitized and cannot echo secret-bearing network or payload errors', async () => {
  await mkdir(resolve('artifacts'), { recursive: true })
  const directory = await mkdtemp(resolve('artifacts/github-deployment-test-'))
  const execute = promisify(execFile)
  try {
    const eventPath = resolve(directory, 'event.json')
    await writeFile(eventPath, '{ synthetic-secret-malformed-payload')
    await assert.rejects(
      execute(
        process.execPath,
        [resolve('scripts/github-deployment.mjs'), 'request', 'staging'],
        {
          env: {
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REF: 'refs/heads/develop',
            GITHUB_SHA: sha,
            GITHUB_REPOSITORY: repository,
          },
          windowsHide: true,
        },
      ),
      (error) => {
        assert.equal(error.code, 1)
        assert.equal(error.stdout, '')
        assert.match(
          error.stderr,
          /^Deployment blocked: deployment-validation-failed\.\r?\n$/,
        )
        assert(!error.stderr.includes('synthetic-secret'))
        return true
      },
    )
  } finally {
    const target = resolve(directory)
    assert(target.startsWith(resolve('artifacts') + sep))
    await rm(target, { recursive: true, force: true })
  }
})
