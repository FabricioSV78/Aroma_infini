import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  validateBackupDirectory,
  validateEnvelope,
  validateArchivePaths,
  parseCopyTableCounts,
  prepareRoleReplay,
  parseRlsExpectations,
  parseSequenceStates,
  restoreDevelopmentBackup,
} from '../scripts/restore-development-backup.mjs'
import { validateDatabaseState } from '../scripts/backup-database-verification.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const validDirectory = path.join(
  root,
  'artifacts/protected-backups/development-2026-11-02T00-00-00-000Z-00000000-0000-4000-8000-000000000001',
)
const envelope = () => ({
  version: 1,
  encryption: 'AES-256-GCM',
  keyProtection: 'Windows-DPAPI-CurrentUser',
  entropy: 'aroma-infini-development-backup-v1',
  archive: 'backup.zip.aesgcm',
  plaintextSha256: 'a'.repeat(64),
  plaintextBytes: 100,
  iv: Buffer.alloc(12).toString('base64'),
  tag: Buffer.alloc(16).toString('base64'),
  wrappedKey: 'YWJjZA==',
})

test('restore accepts only its own allowlisted export directory naming and scope', () => {
  assert.equal(validateBackupDirectory(validDirectory), validDirectory)
  assert.equal(
    validateBackupDirectory(
      validDirectory.replace('development-', 'production-'),
    ),
    validDirectory.replace('development-', 'production-'),
  )
  for (const target of [
    root,
    path.join(root, 'artifacts/other'),
    path.join(validDirectory, 'nested'),
    path.join(path.dirname(validDirectory), 'production-2026'),
    'postgres://outside/db',
  ])
    assert.throws(() => validateBackupDirectory(target))
})
test('protected envelope is validated before invoking DPAPI or creating PostgreSQL', () => {
  assert.equal(validateEnvelope(envelope()).version, 1)
  for (const change of [
    { version: 2 },
    { encryption: 'none' },
    { keyProtection: 'none' },
    { entropy: 'other' },
    { archive: '../outside.zip' },
    { plaintextSha256: 'x' },
    { plaintextBytes: 0 },
    { plaintextBytes: 513 * 1024 * 1024 },
    { iv: 'invalid' },
    { tag: Buffer.alloc(15).toString('base64') },
    { wrappedKey: '$(not-executed)' },
  ])
    assert.throws(() => validateEnvelope({ ...envelope(), ...change }))
})
test('archive path validation rejects traversal, alternate streams, unknown roots and duplicate entries', () => {
  assert.equal(
    validateArchivePaths(
      './\n./database/\n./database/schema.sql\n./objects/public/dynamic/a/file.webp\n',
    ).length,
    4,
  )
  for (const source of [
    '../outside',
    'C:/outside',
    './database/../../outside',
    './database/file.sql:secret',
    './database\\file.sql',
    './unexpected.sql',
    './database/schema.sql\n./database/schema.sql',
    './database/new\0line',
  ])
    assert.throws(() => validateArchivePaths(source))
})
test('COPY parser counts escaped data lines without outputting or transforming their values', () => {
  const source =
    'COPY "app"."products" ("id", "name") FROM stdin;\n1\tline\\ncontinued\n2\tother\n\\.\nCOPY "auth"."users" ("id") FROM stdin;\n\\.\n'
  assert.deepEqual(parseCopyTableCounts(source), [
    { schema: 'app', name: 'products', rows: 2 },
    { schema: 'auth', name: 'users', rows: 0 },
  ])
  for (const invalid of [
    'COPY "outside"."users" ("id") FROM stdin;\n\\.',
    'COPY "app"."products" ("id") FROM stdin;\nmissing-end',
    source + source,
  ])
    assert.throws(() => parseCopyTableCounts(invalid))
})
test('a local restore requires explicit opt-in before any filesystem or database action', async () => {
  await assert.rejects(
    restoreDevelopmentBackup({ directory: validDirectory }),
    /explicit-local-restore-required/,
  )
})
test('role replay preserves PostgreSQL17 bootstrap and original membership grantors', () => {
  const source =
    'CREATE ROLE supabase_admin;\nCREATE ROLE anon;\nGRANT anon TO postgres WITH ADMIN OPTION GRANTED BY supabase_admin;\n'
  const replay = prepareRoleReplay(source)
  assert(!replay.includes('CREATE ROLE supabase_admin;'))
  assert(
    replay.includes(
      'SET ROLE "supabase_admin";\nGRANT anon TO postgres WITH ADMIN OPTION GRANTED BY supabase_admin;\nRESET ROLE;',
    ),
  )
  assert.throws(() => prepareRoleReplay('CREATE ROLE other;'))
})
test('RLS and sequence metadata are derived from actual SQL export instructions', () => {
  const rls = parseRlsExpectations(
    'ALTER TABLE "app"."products" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "app"."products" FORCE ROW LEVEL SECURITY;\n',
  )
  assert.deepEqual(rls.get('app.products'), { enabled: true, forced: true })
  assert.deepEqual(
    parseSequenceStates(
      `SELECT pg_catalog.setval('"app"."variant_merchant_sku_seq"', 1002, true);\n`,
    ),
    [
      {
        schema: 'app',
        name: 'variant_merchant_sku_seq',
        value: '1002',
        called: true,
      },
    ],
  )
  assert.throws(() => parseSequenceStates('no sequence exported'))
})
test('snapshot verification accepts only unique known-schema tables with content hashes', () => {
  const table = {
    schema: 'auth',
    name: 'users',
    rows: 2,
    digest: 'a'.repeat(32),
  }
  assert.equal(
    validateDatabaseState({ version: 1, tables: [table] }).tables.length,
    1,
  )
  for (const change of [
    { schema: 'outside' },
    { name: 'users;drop' },
    { rows: -1 },
    { digest: 'invalid' },
  ])
    assert.throws(() =>
      validateDatabaseState({ version: 1, tables: [{ ...table, ...change }] }),
    )
  assert.throws(() =>
    validateDatabaseState({ version: 1, tables: [table, table] }),
  )
})
