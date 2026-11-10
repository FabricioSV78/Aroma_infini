import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { test } from 'node:test'
import { promisify } from 'node:util'
import {
  parseSupabaseDumpPlan,
  validateBackupInventory,
  backupDevelopment,
  backupEnvironment,
  backupProfiles,
} from '../scripts/backup-development.mjs'

function plan(overrides = {}) {
  const data = {
    PGHOST: 'aws-0-us-east-1.pooler.supabase.com',
    PGPORT: '5432',
    PGUSER: 'cli_login_postgres',
    PGPASSWORD: 'synthetic-password-only',
    PGDATABASE: 'postgres',
    ...overrides,
  }
  return Object.entries(data)
    .map(([key, value]) => `export ${key}="${value}"`)
    .join('\n')
}
const id = '00000000-0000-4000-8000-000000000001'
const hash = 'a'.repeat(64)
const master = {
  key: `public/dynamic/${id}/${hash}/960.webp`,
  sha256: hash,
  byteSize: 100,
}
const derivative = {
  key: `public/dynamic/${id}/${hash}/480.webp`,
  sha256: 'b'.repeat(64),
  byteSize: 50,
}
const inventory = () => [{ id, status: 'ready', objects: [derivative, master] }]

test('official dry-run exports are parsed as data without executing shell text', () => {
  const result = parseSupabaseDumpPlan(
    `${plan()}\n# Ignored shell body\necho do-not-execute\n`,
  )
  assert.equal(result.PGPORT, '5432')
  assert.equal(result.PGUSER, 'cli_login_postgres')
  assert.equal(result.PGPASSWORD, 'synthetic-password-only')
})
test('production uses a separate fixed profile and accepts only its known project ref', () => {
  assert.notEqual(
    backupProfiles.production.projectRef,
    backupProfiles.development.projectRef,
  )
  assert.notEqual(
    backupProfiles.production.bucket,
    backupProfiles.development.bucket,
  )
  assert.notEqual(
    backupProfiles.production.workdir,
    backupProfiles.development.workdir,
  )
  assert.equal(
    parseSupabaseDumpPlan(
      plan({
        PGHOST: `db.${backupProfiles.production.projectRef}.supabase.co`,
      }),
      backupProfiles.production.projectRef,
    ).PGDATABASE,
    'postgres',
  )
})
test('unsafe origins, database names and transaction poolers are rejected before I/O', () => {
  for (const values of [
    { PGHOST: '127.0.0.1' },
    { PGHOST: 'outside.invalid' },
    { PGPORT: '6543' },
    { PGDATABASE: 'other' },
    { PGUSER: 'other-user' },
  ]) {
    assert.throws(() => parseSupabaseDumpPlan(plan(values)), {
      message: 'invalid-official-dump-plan',
    })
  }
  assert.throws(() => parseSupabaseDumpPlan(plan(), 'abcdefghijklmnopqrst'), {
    message: 'invalid-official-dump-plan',
  })
})
test('shell expansions, duplicate exports, incomplete plans and injected newlines never become credentials', () => {
  for (const source of [
    plan({ PGPASSWORD: '$(not-executed)' }),
    plan({ PGPASSWORD: '`not-executed`' }),
    `${plan()}\nexport PGHOST="outside.invalid"`,
    plan().replace(/^export PGPASSWORD=.*$/m, ''),
    plan({ PGPASSWORD: 'line\nbreak' }),
    plan({ PGHOST: 'safe"\nexport EXTRA="unsafe' }),
  ]) {
    assert.throws(() => parseSupabaseDumpPlan(source), {
      message: 'invalid-official-dump-plan',
    })
  }
})
test('literal safe shell quote escaping is decoded without evaluating substitutions', () => {
  const source = plan().replace(
    '"synthetic-password-only"',
    '"literal\\$value\\"quote\\\\slash"',
  )
  assert.equal(
    parseSupabaseDumpPlan(source).PGPASSWORD,
    'literal$value"quote\\slash',
  )
})
test('valid inventory retains independent derivative checksums and safe local destinations', () => {
  const result = validateBackupInventory(inventory())
  assert.equal(result.objectCount, 2)
  assert.equal(result.byteSize, 150)
  assert.equal(result.assets[0].objects[0].sha256, 'b'.repeat(64))
  assert.equal(result.assets[0].objects[1].path, `objects/${master.key}`)
})
test('unpublished transient lifecycle states and incomplete image inventories cannot be called a backup', () => {
  for (const status of ['pending', 'deleting', 'deleted'])
    assert.throws(
      () => validateBackupInventory([{ ...inventory()[0], status }]),
      { message: 'invalid-media-inventory' },
    )
  assert.throws(
    () => validateBackupInventory([{ id, status: 'ready', objects: [] }]),
    { message: 'invalid-media-inventory' },
  )
})
test('path traversal, external keys, missing master hashes and duplicates are rejected', () => {
  for (const object of [
    { ...master, key: '../private.sql' },
    { ...master, key: 'https://outside.invalid/image.webp' },
    {
      ...master,
      key: master.key.replace(id, '00000000-0000-4000-8000-000000000002'),
    },
    { ...master, sha256: 'b'.repeat(64) },
  ])
    assert.throws(
      () =>
        validateBackupInventory([{ id, status: 'ready', objects: [object] }]),
      { message: 'invalid-media-inventory' },
    )
  assert.throws(
    () => validateBackupInventory([inventory()[0], inventory()[0]]),
    { message: 'invalid-media-inventory' },
  )
  assert.throws(
    () =>
      validateBackupInventory([
        { id, status: 'ready', objects: [master, master] },
      ]),
    { message: 'invalid-media-inventory' },
  )
})
test('declared media sizes and object counts have hard upper bounds', () => {
  for (const byteSize of [0, -1, 1.5, Infinity, 4 * 1024 * 1024 + 1])
    assert.throws(
      () =>
        validateBackupInventory([
          { id, status: 'ready', objects: [{ ...master, byteSize }] },
        ]),
      { message: 'invalid-media-inventory' },
    )
  assert.throws(
    () =>
      validateBackupInventory(
        Array.from({ length: 1001 }, () => inventory()[0]),
      ),
    { message: 'invalid-media-inventory' },
  )
})
test('video inventory has exactly one object with its own complete-file checksum', () => {
  const video = {
    key: `public/dynamic/${id}/${hash}/video.mp4`,
    byteSize: 1000,
    sha256: hash,
  }
  assert.equal(
    validateBackupInventory([{ id, status: 'disabled', objects: [video] }])
      .objectCount,
    1,
  )
  assert.throws(
    () =>
      validateBackupInventory([
        { id, status: 'ready', objects: [video, master] },
      ]),
    { message: 'invalid-media-inventory' },
  )
})
test('export requires explicit confirmation before reading credentials or creating private folders', async () => {
  await assert.rejects(
    backupDevelopment(),
    /explicit-windows-development-export-required/,
  )
  await assert.rejects(
    backupEnvironment({ confirmed: true, environmentName: 'arbitrary' }),
    /explicit-backup-profile-required/,
  )
})

test('export authorization and profile guards run before platform-specific work on every supported test host', async () => {
  const execute = promisify(execFile)
  const moduleUrl = new URL(
    '../scripts/backup-development.mjs',
    import.meta.url,
  ).href
  for (const platform of ['win32', 'linux', 'darwin']) {
    await execute(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import assert from 'node:assert/strict';
          const { backupEnvironment } = await import(${JSON.stringify(moduleUrl)});
          Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
          await assert.rejects(backupEnvironment(), /explicit-windows-development-export-required/);
          await assert.rejects(
            backupEnvironment({ confirmed: true, environmentName: 'arbitrary' }),
            /explicit-backup-profile-required/,
          );
          if (process.platform !== 'win32') {
            for (const environmentName of ['development', 'production']) {
              await assert.rejects(
                backupEnvironment({ confirmed: true, environmentName }),
                /explicit-windows-development-export-required/,
              );
            }
          }
        `,
      ],
      { windowsHide: true },
    )
  }
})
