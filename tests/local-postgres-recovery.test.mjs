import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { rehearseLocalRecovery } from '../scripts/local-postgres-recovery.mjs'

async function isolatedGuard(run) {
  const base = path.resolve('artifacts/supabase-sql-tests')
  await mkdir(base, { recursive: true })
  const runDir = await mkdtemp(path.join(base, 'run-guard-'))
  const dataDir = path.join(runDir, 'database')
  await mkdir(dataDir)
  let calls = 0
  const unexpected = () => {
    calls++
    throw new Error('Unexpected database or process operation')
  }
  const params = {
    client: { query: unexpected, end: unexpected },
    pg: {
      Client: class {
        constructor() {
          unexpected()
        }
      },
    },
    config: {
      host: '127.0.0.1',
      port: 54321,
      database: 'postgres',
      user: 'postgres',
      password: 'synthetic-private-test-value',
    },
    runDir,
    dataDir,
    command: unexpected,
    onSourceDisconnected: unexpected,
    onSourceStopped: unexpected,
  }
  try {
    await run(params)
    assert.equal(calls, 0, 'Invalid input must not query or stop any database')
  } finally {
    const relative = path.relative(base, path.resolve(runDir))
    assert(
      relative.startsWith('run-guard-') &&
        !relative.includes('..') &&
        !path.isAbsolute(relative),
    )
    await rm(runDir, { recursive: true, force: true })
  }
}

for (const [field, value] of [
  ['host', 'db.remote.example.invalid'],
  ['host', 'localhost'],
  ['database', 'commercial'],
  ['user', 'customer'],
  ['connectionString', 'postgresql://private-value@remote.invalid/db'],
  ['port', 0],
  ['port', 65536],
  ['port', '54321'],
]) {
  test(`recovery rejects unsafe ${field} without database calls (${String(value)})`, async () => {
    await isolatedGuard(async (params) => {
      params.config[field] = value
      await assert.rejects(rehearseLocalRecovery(params), (error) => {
        assert(!String(error).includes(params.config.password))
        assert(!String(error).includes('private-value'))
        return true
      })
    })
  })
}

test('recovery cannot use a source directory outside its freshly allocated run', async () => {
  await isolatedGuard(async (params) => {
    params.dataDir = path.dirname(params.runDir)
    await assert.rejects(rehearseLocalRecovery(params))
  })
})

for (const directory of ['recovery-backup', 'recovery-restored']) {
  test(`recovery refuses to overwrite an existing ${directory}`, async () => {
    await isolatedGuard(async (params) => {
      await mkdir(path.join(params.runDir, directory))
      await assert.rejects(rehearseLocalRecovery(params))
    })
  })
}

test('recovery requires lifecycle callbacks before attempting shutdown', async () => {
  await isolatedGuard(async (params) => {
    delete params.onSourceStopped
    await assert.rejects(rehearseLocalRecovery(params))
  })
})
