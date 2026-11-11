import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCommerceConcurrency } from './sql-commerce-security-audit.mjs'
import {
  auditMediaLibraryConcurrency,
  deleteMediaLibraryFixtureChildren,
} from './sql-media-library-security-audit.mjs'

// This runner ALWAYS creates its own loopback-only, disposable PostgreSQL.
// It deliberately accepts no DATABASE_URL, PGHOST or remote project argument.
// Supabase's Auth service is not reproduced: the fixture is SQL-test-only.
const root = fileURLToPath(new URL('../', import.meta.url))
const restoreCheck = process.argv.includes('--restore-check')
if (
  restoreCheck &&
  process.argv.some((value) =>
    ['--generate-types', '--generate-types-artifact'].includes(value),
  )
)
  throw new Error(
    'The local restore rehearsal cannot generate application types.',
  )
const toolsDir = path.resolve(
  root,
  process.env.SUPABASE_SQL_TOOLS_DIR ?? 'artifacts/supabase-sql-tools',
)
const toolsRequire = createRequire(path.join(toolsDir, 'package.json'))
let pg
let nativeBin
try {
  pg = toolsRequire('pg')
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('This portable runner currently targets Windows x64.')
  nativeBin = path.resolve(
    path.dirname(toolsRequire.resolve('@embedded-postgres/windows-x64')),
    '../native/bin',
  )
} catch {
  throw new Error(
    'Install the isolated SQL tools first: npm install --prefix artifacts/supabase-sql-tools --no-save embedded-postgres@17.10.0-beta.17 pg@8.23.1 (Windows x64). No database service is installed.',
  )
}

const outputRoot = path.join(root, 'artifacts/supabase-sql-tests')
await mkdir(outputRoot, { recursive: true })
const runDir = await mkdtemp(path.join(outputRoot, 'run-'))
if (!runDir.startsWith(outputRoot + path.sep))
  throw new Error('Unsafe local test path.')
const dataDir = path.join(runDir, 'database')
const passwordFile = path.join(runDir, 'init-password')
const password = randomBytes(32).toString('base64url')
const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.on('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close((error) => (error ? reject(error) : resolve(address.port)))
  })
})

function command(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(nativeBin, `${name}.exe`), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      output += data.toString()
    })
    child.on('error', reject)
    // On Windows the daemon can inherit an open pipe after pg_ctl has exited.
    // Wait for this command's exit, not for every inherited handle to close.
    child.on('exit', (code) => {
      child.stdout.destroy()
      child.stderr.destroy()
      if (code === 0) resolve(output)
      else reject(new Error(`${name} failed (${code}): ${output}`))
    })
  })
}

const config = {
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password,
  database: 'postgres',
  connectionTimeoutMillis: 5000,
  // Disposable fixture only: a broken lock barrier cannot hang CI indefinitely.
  statement_timeout: 120000,
  lock_timeout: 30000,
  idle_in_transaction_session_timeout: 60000,
  application_name: 'aroma-isolated-sql-tests',
}
const client = new pg.Client(config)
const report = {
  scope:
    'Isolated native PostgreSQL; SQL Auth fixture only, not Supabase Auth or hosted RLS certification.',
  migrations: [],
  assertions: [],
  concurrency: null,
  testDataRolledBack: false,
}
let started = false
let sourceStartAttempted = false
let connected = false
try {
  await writeFile(passwordFile, password + '\n', { mode: 0o600 })
  try {
    await command('initdb', [
      '-D',
      dataDir,
      '--username=postgres',
      '--auth=scram-sha-256',
      `--pwfile=${passwordFile}`,
      '--encoding=UTF8',
      '--locale=C',
    ])
  } finally {
    await unlink(passwordFile).catch(() => {})
  }
  sourceStartAttempted = true
  await command('pg_ctl', [
    '-D',
    dataDir,
    '-l',
    path.join(runDir, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    '-t',
    '30',
    'start',
  ])
  started = true
  await client.connect()
  connected = true
  report.postgres = (
    await client.query('show server_version')
  ).rows[0].server_version
  // Reproduce the native snapshot behavior which previously made a lock poll
  // depend on whether its first read happened before or after the contenders.
  const activityActor = new pg.Client(config)
  try {
    await client.query('begin')
    await client.query('select pid from pg_stat_activity')
    await activityActor.connect()
    const actorPid = (
      await activityActor.query('select pg_backend_pid() as pid')
    ).rows[0].pid
    const beforeRefresh = (
      await client.query(
        'select count(*)::int as count from pg_stat_activity where pid=$1',
        [actorPid],
      )
    ).rows[0].count
    await client.query('select pg_stat_clear_snapshot()')
    const afterRefresh = (
      await client.query(
        'select count(*)::int as count from pg_stat_activity where pid=$1',
        [actorPid],
      )
    ).rows[0].count
    if (beforeRefresh !== 0 || afterRefresh !== 1)
      throw new Error('The native activity snapshot refresh regression failed.')
    report.activitySnapshotRefresh = {
      connections: 2,
      beforeRefresh,
      afterRefresh,
      nativePostgreSql: true,
    }
    report.assertions.push(
      'Native activity snapshots refresh inside an open transaction',
    )
    console.log('Native activity snapshot refresh: passed')
  } finally {
    await client.query('rollback').catch(() => {})
    await activityActor.end().catch(() => {})
  }
  await client.query("set aroma.test_mode = 'local-fixture'")
  await client.query(
    await readFile(
      path.join(root, 'supabase/tests/fixtures/standalone-auth.sql'),
      'utf8',
    ),
  )

  const migrationDir = path.join(root, 'supabase/migrations')
  for (const filename of (await readdir(migrationDir))
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
    .sort()) {
    const sql = await readFile(path.join(migrationDir, filename), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      error.message = `${filename} / SQLSTATE ${error.code ?? 'unknown'} / position ${error.position ?? 'unknown'}: ${error.message}`
      throw error
    }
    report.migrations.push({
      filename,
      sha256: createHash('sha256').update(sql).digest('hex'),
    })
    console.log(`APPLIED locally: ${filename}`)
  }

  // The same metadata preflight is syntax-checked against a real SQL engine.
  await client.query(
    await readFile(path.join(root, 'supabase/audit/preflight.sql'), 'utf8'),
  )
  // Exercise the same read-only boundary audit used on hosted projects. Its
  // metadata dependencies are temporary fixtures, never remote migrations.
  const foundationAuditSql = await readFile(
    path.join(root, 'supabase/audit/verify_foundation.sql'),
    'utf8',
  )
  await client.query('begin')
  try {
    await client.query('create role authenticator nologin noinherit')
    await client.query('create schema supabase_migrations')
    await client.query(
      'create table supabase_migrations.schema_migrations(version text primary key)',
    )
    await client.query(
      'insert into supabase_migrations.schema_migrations select unnest($1::text[])',
      [report.migrations.map((migration) => migration.filename.slice(0, 14))],
    )
    const baseline = (await client.query(foundationAuditSql)).rows[0]
      .verification
    report.foundationAudit = baseline.checks
    report.anonymousRpcSignatures = (
      await client.query(
        "select n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','api','private') and has_function_privilege('anon',p.oid,'execute') order by 1",
      )
    ).rows.map((row) => row.signature)
    for (const [label, valid] of Object.entries(baseline.checks)) {
      if (valid !== true) throw new Error(`Foundation audit failed: ${label}`)
      report.assertions.push(`Foundation audit: ${label}`)
    }
    const auditMutations = [
      [
        'grant execute on function api.admin_push_device(text,uuid) to anon',
        'only_explicit_public_rpcs_are_anonymous',
        'an unintended anonymous administrative grant',
      ],
      [
        "create function api.catalog_brands(text) returns jsonb language sql as 'select ''[]''::jsonb'; grant execute on function api.catalog_brands(text) to anon",
        'only_explicit_public_rpcs_are_anonymous',
        'an unexpected overload of a public RPC name',
      ],
      [
        'revoke execute on function api.site_settings() from anon',
        'required_public_rpcs_are_available',
        'a missing public read permission',
      ],
      [
        'alter table private.admin_push_subscriptions disable row level security',
        'all_application_tables_have_rls',
        'disabled RLS in the latest push table',
      ],
      [
        'alter table private.admin_push_subscriptions no force row level security',
        'sensitive_tables_force_rls',
        'disabled FORCE RLS in the latest push table',
      ],
      [
        'alter role aro_admin_push_executor login',
        'executor_roles_are_restricted',
        'login enabled on the latest executor',
      ],
      [
        'grant aro_admin_push_executor to authenticated',
        'browser_cannot_inherit_executors',
        'browser membership of the latest executor',
      ],
      [
        'grant select on private.admin_push_subscriptions to authenticated',
        'browser_has_no_raw_table_privileges',
        'direct browser access to a private push table',
      ],
    ]
    for (const [mutation, check, label] of auditMutations) {
      await client.query('savepoint audit_mutation')
      await client.query(mutation)
      const changed = (await client.query(foundationAuditSql)).rows[0]
        .verification
      if (changed.checks[check] !== false)
        throw new Error(`Foundation audit did not detect ${label}.`)
      report.assertions.push(`Foundation audit detects ${label}`)
      await client.query('rollback to savepoint audit_mutation')
    }
  } finally {
    await client.query('rollback')
  }
  for (const filename of (await readdir(path.join(root, 'supabase/tests')))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort()) {
    console.log(`SQL assertions: ${filename}`)
    const result = await client.query(
      await readFile(path.join(root, 'supabase/tests', filename), 'utf8'),
    )
    for (const statement of Array.isArray(result) ? result : [result])
      for (const row of statement.rows)
        for (const value of Object.values(row))
          if (typeof value === 'string' && value.startsWith('PASS: '))
            report.assertions.push(value.slice(6))
  }
  if (!report.assertions.length)
    throw new Error('No SQL assertions were executed.')

  const pool = new pg.Pool({ ...config, max: 10 })
  try {
    const codes = await Promise.all(
      Array.from({ length: 100 }, async () =>
        Number(
          (await pool.query("select nextval('app.product_code_seq') as code"))
            .rows[0].code,
        ),
      ),
    )
    if (
      new Set(codes).size !== 100 ||
      codes.some((code) => code < 10000 || code > 99999)
    )
      throw new Error('Concurrent SKU allocation failed.')
    report.concurrency = {
      requests: 100,
      connections: 10,
      uniqueCodes: new Set(codes).size,
      withinFiveDigitRange: true,
    }

    // These identities exist only in this runner's disposable database. The
    // claims are SQL fixtures, not a claim to testing JWT signature/MFA service.
    const concurrentAdmin = '46000000-0000-4000-8000-000000000001'
    const concurrentBrand = '46000000-0000-4000-8000-000000000002'
    const concurrentProduct = '46000000-0000-4000-8000-000000000003'
    const concurrentVariant = '46000000-0000-4000-8000-000000000004'
    const familyRaceProduct = '48000000-0000-4000-8000-000000000001'
    const skuConcurrencyIds = Array.from(
      { length: 12 },
      (_, index) =>
        `47000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    )
    async function administrativeQuery(sql, values) {
      const connection = await pool.connect()
      try {
        await connection.query('begin')
        await connection.query(
          "select set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub: concurrentAdmin, aal: 'aal2' })],
        )
        await connection.query('set local role authenticated')
        const result = await connection.query(sql, values)
        await connection.query('commit')
        return result.rows[0].value
      } catch (error) {
        await connection.query('rollback').catch(() => {})
        throw error
      } finally {
        connection.release()
      }
    }
    try {
      await client.query('begin')
      await client.query(
        'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',
        [concurrentAdmin, 'concurrency-sql@example.invalid', '{}'],
      )
      await client.query(
        'insert into private.admin_memberships(user_id,active) values($1,true)',
        [concurrentAdmin],
      )
      await client.query(
        "insert into app.brands(id,name,slug) values($1,'SQL Concurrent Base','sql-concurrent-base')",
        [concurrentBrand],
      )
      await client.query(
        "insert into app.products(id,name,slug,brand_id,short_description,description,active) values($1,'SQL Concurrent Product','sql-concurrent-product',$2,'SQL fixture','SQL fixture',false)",
        [concurrentProduct, concurrentBrand],
      )
      await client.query(
        'insert into app.product_variants(id,product_id,ml,price_cents,stock) values($1,$2,50,30000,5)',
        [concurrentVariant, concurrentProduct],
      )
      await client.query('commit')

      const names = Array.from(
        { length: 100 },
        (_, index) => `SQL Concurrent Brand ${index + 1}`,
      )
      const batches = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          administrativeQuery(
            'select api.admin_register_brands($1::jsonb) as value',
            [JSON.stringify(names)],
          ),
        ),
      )
      const successfulBatches = batches.filter(
        (result) => result.status === 'fulfilled',
      )
      const created = successfulBatches.flatMap(
        (result) => result.value.created,
      )
      const registeredNames = new Set(created.map((brand) => brand.name))
      const registeredSlugs = new Set(created.map((brand) => brand.slug))
      const existingCount = successfulBatches.reduce(
        (sum, result) => sum + result.value.existing.length,
        0,
      )
      if (
        successfulBatches.length !== 10 ||
        created.length !== 100 ||
        registeredNames.size !== 100 ||
        registeredSlugs.size !== 100 ||
        existingCount !== 900
      )
        throw new Error(
          'Concurrent brand registration created duplicates or lost records.',
        )

      const stockWrites = await Promise.allSettled(
        [10, 20].map((stock) =>
          administrativeQuery('select api.admin_set_stock($1,$2,1) as value', [
            concurrentVariant,
            stock,
          ]),
        ),
      )
      const successfulStock = stockWrites.filter(
        (result) => result.status === 'fulfilled',
      )
      const conflictedStock = stockWrites.filter(
        (result) =>
          result.status === 'rejected' && result.reason.code === 'PT409',
      )
      const finalStock = (
        await client.query(
          'select v.stock,p.version from app.product_variants v join app.products p on p.id=v.product_id where v.id=$1',
          [concurrentVariant],
        )
      ).rows[0]
      if (
        successfulStock.length !== 1 ||
        conflictedStock.length !== 1 ||
        ![10, 20].includes(finalStock.stock) ||
        Number(finalStock.version) !== 2
      )
        throw new Error(
          'Concurrent stock writes did not enforce optimistic versions: ' +
            JSON.stringify({
              writes: stockWrites.map((result) =>
                result.status === 'fulfilled'
                  ? { status: result.status, version: result.value.version }
                  : {
                      status: result.status,
                      code: result.reason.code,
                      message: result.reason.message,
                    },
              ),
              finalStock,
            }),
        )
      report.catalogConcurrency = {
        connections: 10,
        brandBatches: 10,
        submittedNames: 1000,
        createdBrands: 100,
        existingNames: 900,
        uniqueSlugs: 100,
        stockWrites: 2,
        successfulStockWrites: 1,
        versionConflicts: 1,
      }

      // Presentation SKU fixtures use the same real transactional RPC from
      // ten independent connections. This local sequence reset is never an
      // application command and never runs against hosted Supabase.
      function skuRecord(id, sku) {
        return {
          product: {
            id,
            name: 'SQL presentation SKU concurrency',
            slug: `sql-sku-concurrency-${id}`,
            brandId: concurrentBrand,
            productType: 'perfume',
            image: '',
            family: '',
            olfactoryFamilies: [],
            discount: null,
            variants: [
              { id, sku, ml: 100, priceCents: 12000, stock: 2, active: true },
            ],
          },
          detail: {
            shortDescription: 'SQL-only concurrency fixture',
            description: 'SQL-only concurrency fixture, never commercial.',
            olfactoryImage: null,
            intensityLevel: null,
            occasion: '',
            season: '',
            gallery: [],
            notes: { top: [], heart: [], base: [] },
            recommendationIds: [],
          },
          active: false,
          gender: 'unisex',
          popularity: 0,
          newest: 0,
          lowStockThreshold: 2,
        }
      }
      await client.query(
        'alter sequence app.variant_merchant_sku_seq restart with 1000',
      )
      const automaticSkuWrites = await Promise.all(
        skuConcurrencyIds
          .slice(0, 10)
          .map((id) =>
            administrativeQuery(
              'select api.admin_save_product($1::jsonb) as value',
              [JSON.stringify(skuRecord(id))],
            ),
          ),
      )
      const automaticSkus = automaticSkuWrites.map(
        (saved) => saved.record.product.variants[0].sku,
      )
      if (
        new Set(automaticSkus).size !== 10 ||
        automaticSkus.some((sku) => !/^100[0-9]$/.test(sku))
      )
        throw new Error(
          'Concurrent automatic presentation SKUs were not unique from 1000.',
        )
      await client.query('delete from app.products where id=any($1::uuid[])', [
        skuConcurrencyIds.slice(0, 10),
      ])
      await client.query(
        'alter sequence app.variant_merchant_sku_seq restart with 1000',
      )
      const racedSkuWrites = await Promise.allSettled([
        administrativeQuery(
          'select api.admin_save_product($1::jsonb) as value',
          [JSON.stringify(skuRecord(skuConcurrencyIds[10], '1000'))],
        ),
        administrativeQuery(
          'select api.admin_save_product($1::jsonb) as value',
          [JSON.stringify(skuRecord(skuConcurrencyIds[11]))],
        ),
      ])
      const [manualWrite, automaticWrite] = racedSkuWrites
      if (
        automaticWrite.status !== 'fulfilled' ||
        (manualWrite.status === 'fulfilled'
          ? manualWrite.value.record.product.variants[0].sku !== '1000'
          : manualWrite.reason.code !== '23505')
      )
        throw new Error(
          'A concurrent manual SKU was overwritten or an automatic write was lost.',
        )
      const committedRace = (
        await client.query(
          'select merchant_sku from app.product_variants where product_id=any($1::uuid[])',
          [skuConcurrencyIds.slice(10)],
        )
      ).rows.map((row) => row.merchant_sku)
      if (
        new Set(committedRace).size !== committedRace.length ||
        !committedRace.includes('1000')
      )
        throw new Error(
          'Manual/automatic racing writes created duplicate presentation SKUs.',
        )
      report.variantSkuConcurrency = {
        connections: 10,
        automaticWrites: 10,
        uniqueAutomaticSkus: new Set(automaticSkus).size,
        automaticStart: Math.min(...automaticSkus.map(Number)),
        manualAutomaticRaceRequests: 2,
        committedRaceVariants: committedRace.length,
        manualCodePreserved: manualWrite.status === 'fulfilled',
        manualCollisionRejected: manualWrite.status === 'rejected',
        noDuplicates: true,
      }

      const familyCreates = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          administrativeQuery(
            'select api.admin_save_olfactory_family($1) as value',
            [index % 2 ? ' SQL CÓNCURRENT   FAMILY ' : 'SQL Concurrent Family'],
          ),
        ),
      )
      const createdFamilies = familyCreates.filter(
        (entry) => entry.status === 'fulfilled',
      )
      const duplicateFamilies = familyCreates.filter(
        (entry) => entry.status === 'rejected' && entry.reason.code === '23505',
      )
      if (createdFamilies.length !== 1 || duplicateFamilies.length !== 9)
        throw new Error(
          'Concurrent family registration duplicated a normalized name or lost its conflict.',
        )
      const familyCode = createdFamilies[0].value.family.value
      if (familyCode !== 'sql-concurrent-family')
        throw new Error(
          'Concurrent family registration changed its stable code.',
        )
      const familyRenames = await Promise.allSettled(
        ['SQL Renamed Family A', 'SQL Renamed Family B'].map((label) =>
          administrativeQuery(
            'select api.admin_save_olfactory_family($1,$2,true,1) as value',
            [label, familyCode],
          ),
        ),
      )
      const successfulRenames = familyRenames.filter(
        (entry) => entry.status === 'fulfilled',
      )
      const conflictedRenames = familyRenames.filter(
        (entry) => entry.status === 'rejected' && entry.reason.code === 'PT409',
      )
      if (successfulRenames.length !== 1 || conflictedRenames.length !== 1)
        throw new Error(
          'Concurrent family renames did not preserve optimistic revisions.',
        )
      const classification = skuRecord(familyRaceProduct, 'FAMILY-RACE')
      classification.product.olfactoryFamilies = [familyCode]
      const assignmentRace = await Promise.allSettled([
        administrativeQuery(
          'select api.admin_save_olfactory_family($1,$2,false,2) as value',
          [successfulRenames[0].value.family.label, familyCode],
        ),
        administrativeQuery(
          'select api.admin_save_product($1::jsonb) as value',
          [JSON.stringify(classification)],
        ),
      ])
      const [deactivation, assignment] = assignmentRace
      if (
        deactivation.status !== 'fulfilled' ||
        (assignment.status === 'rejected' && assignment.reason.code !== '22023')
      )
        throw new Error(
          'Concurrent classification/deactivation did not serialize valid outcomes.',
        )
      const familyState = (
        await client.query(
          'select f.active,(select count(*)::int from app.product_olfactory_families p where p.family_code=f.code) as products from app.olfactory_families f where f.code=$1',
          [familyCode],
        )
      ).rows[0]
      if (
        familyState.active ||
        familyState.products !== (assignment.status === 'fulfilled' ? 1 : 0)
      )
        throw new Error(
          'Deactivation lost an existing classification or accepted a stale new assignment.',
        )
      report.familyConcurrency = {
        registrationRequests: 10,
        createdDefinitions: createdFamilies.length,
        normalizedNameConflicts: duplicateFamilies.length,
        competingRenames: 2,
        committedRenames: successfulRenames.length,
        revisionConflicts: conflictedRenames.length,
        deactivationAssignmentRequests: 2,
        deactivated: true,
        previousAssociationRetained: assignment.status === 'fulfilled',
        staleNewAssignmentRejected: assignment.status === 'rejected',
        noLostAssociations: true,
      }
    } finally {
      await client.query('rollback').catch(() => {})
      await client.query('begin')
      try {
        await client.query(
          'delete from app.products where id=$1 or id=$3 or id=any($2::uuid[])',
          [concurrentProduct, skuConcurrencyIds, familyRaceProduct],
        )
        await client.query(
          "delete from app.olfactory_families where code='sql-concurrent-family'",
        )
        await client.query(
          "delete from app.brands where id=$1 or name like 'SQL Concurrent Brand %'",
          [concurrentBrand],
        )
        await client.query('delete from auth.users where id=$1', [
          concurrentAdmin,
        ])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => {})
        report.catalogCleanupError = {
          code: error.code ?? null,
          message: error.message,
        }
      }
    }
    if (report.catalogCleanupError)
      throw new Error(
        'Catalog concurrency fixtures could not be removed. See the local test report.',
      )

    const mediaAdmin = '56000000-0000-4000-8000-000000000001'
    const otherMediaAdmin = '56000000-0000-4000-8000-000000000002'
    const mediaBrand = '56000000-0000-4000-8000-000000000003'
    const mediaProduct = '56000000-0000-4000-8000-000000000004'
    const mediaOperation = '56000000-0000-4000-8000-000000000005'
    const competingOperation = '56000000-0000-4000-8000-000000000006'
    let heldAttachment
    async function mediaQuery(sql, values, owner = mediaAdmin, server = false) {
      const connection = await pool.connect()
      try {
        await connection.query('begin')
        await connection.query(
          "select set_config('request.jwt.claims',$1,true)",
          [JSON.stringify({ sub: owner, aal: 'aal2' })],
        )
        await connection.query(
          server
            ? 'set local role service_role'
            : 'set local role authenticated',
        )
        const result = await connection.query(sql, values)
        await connection.query('commit')
        return result.rows[0].value
      } catch (error) {
        await connection.query('rollback').catch(() => {})
        throw error
      } finally {
        connection.release()
      }
    }
    function verifiedImage(id, hash) {
      const image = (width, height, sha256) => ({
        width,
        height,
        sha256,
        mimeType: 'image/webp',
        byteSize: 2000,
        objectKey: `public/dynamic/${id}/${hash}/${width}.webp`,
      })
      return {
        ...image(1600, 2000, hash),
        variants: [image(480, 600, 'b'.repeat(64)), image(1600, 2000, hash)],
      }
    }
    try {
      await client.query('begin')
      await client.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'media-concurrency-a@example.invalid','{}'),($2,'media-concurrency-b@example.invalid','{}')",
        [mediaAdmin, otherMediaAdmin],
      )
      await client.query(
        'insert into private.admin_memberships(user_id,active) values($1,true),($2,true)',
        [mediaAdmin, otherMediaAdmin],
      )
      await client.query(
        "insert into app.brands(id,name,slug) values($1,'SQL Media Concurrency','sql-media-concurrency')",
        [mediaBrand],
      )
      await client.query('commit')
      const reservations = await Promise.all(
        Array.from({ length: 10 }, () =>
          mediaQuery(
            "select api.media_upload_reserve($1,'product-gallery') as value",
            [mediaOperation],
          ),
        ),
      )
      const assetId = reservations[0].id
      if (new Set(reservations.map((entry) => entry.id)).size !== 1)
        throw new Error(
          'Concurrent retries created duplicate media reservations.',
        )
      const preparations = await Promise.allSettled(
        ['a', 'c'].map((character) =>
          mediaQuery(
            'select api.media_upload_prepare($1,$2,$3::jsonb) as value',
            [
              assetId,
              mediaAdmin,
              JSON.stringify(verifiedImage(assetId, character.repeat(64))),
            ],
            mediaAdmin,
            true,
          ),
        ),
      )
      if (
        preparations.filter((entry) => entry.status === 'fulfilled').length !==
          1 ||
        preparations.filter(
          (entry) =>
            entry.status === 'rejected' && entry.reason.code === 'PT409',
        ).length !== 1
      )
        throw new Error(
          'Concurrent different image hashes did not reserve exactly one immutable manifest.',
        )
      const prepared = (
        await client.query(
          'select prepared_metadata from app.media_assets where id=$1',
          [assetId],
        )
      ).rows[0].prepared_metadata
      const ready = await mediaQuery(
        'select api.media_upload_complete($1,$2,$3::jsonb) as value',
        [assetId, mediaAdmin, JSON.stringify(prepared)],
        mediaAdmin,
        true,
      )
      const actors = await Promise.allSettled(
        [mediaAdmin, otherMediaAdmin].map((owner) =>
          mediaQuery(
            "select api.media_upload_reserve($1,'product-gallery') as value",
            [competingOperation],
            owner,
          ),
        ),
      )
      if (
        actors.filter((entry) => entry.status === 'fulfilled').length !== 1 ||
        actors.filter(
          (entry) =>
            entry.status === 'rejected' && entry.reason.code === '42501',
        ).length !== 1
      )
        throw new Error(
          'Competing administrators could take over the same media operation.',
        )

      await client.query(
        "update app.media_assets set retire_after=now()-interval '1 hour' where id=$1",
        [assetId],
      )
      heldAttachment = await pool.connect()
      await heldAttachment.query('begin')
      await heldAttachment.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: mediaAdmin, aal: 'aal2' })],
      )
      await heldAttachment.query('set local role authenticated')
      const draft = {
        product: {
          id: mediaProduct,
          name: 'SQL Media Concurrency Product',
          slug: 'sql-media-concurrency-product',
          brandId: mediaBrand,
          productType: 'perfume',
          family: 'Floral',
          olfactoryFamilies: ['floral'],
          image: ready.src,
          discount: null,
          variants: [
            {
              id: mediaProduct,
              ml: 50,
              priceCents: 30000,
              stock: 2,
              active: true,
            },
          ],
        },
        detail: {
          shortDescription: 'SQL fixture',
          description: 'SQL fixture only',
          olfactoryImage: null,
          notes: { top: [], heart: [], base: [] },
          intensityLevel: null,
          recommendationIds: [],
          gallery: [{ image: ready.src, framing: 'full' }],
        },
        active: false,
        gender: 'unisex',
        popularity: 0,
        newest: 0,
        lowStockThreshold: 2,
      }
      await heldAttachment.query('select api.admin_save_product($1::jsonb)', [
        JSON.stringify(draft),
      ])
      const claimedDuringAttachment = await mediaQuery(
        'select api.media_gc_claim(10) as value',
        [],
        mediaAdmin,
        true,
      )
      if (claimedDuringAttachment.some((entry) => entry.id === assetId))
        throw new Error(
          'Cleanup claimed an image locked by an in-flight product attachment.',
        )
      await heldAttachment.query('commit')
      heldAttachment.release()
      heldAttachment = undefined
      const claimedAfterAttachment = await mediaQuery(
        'select api.media_gc_claim(10) as value',
        [],
        mediaAdmin,
        true,
      )
      if (claimedAfterAttachment.some((entry) => entry.id === assetId))
        throw new Error('Cleanup claimed a committed product photograph.')
      report.mediaConcurrency = {
        reservationRequests: 10,
        reservedAssets: 1,
        competingHashPreparations: 2,
        acceptedManifests: 1,
        conflictingManifests: 1,
        competingAdministrators: 2,
        acceptedOwners: 1,
        rejectedTakeovers: 1,
        cleanupSkippedLockedAttachment: true,
        committedAttachmentPreserved: true,
      }
    } finally {
      if (heldAttachment) {
        await heldAttachment.query('rollback').catch(() => {})
        heldAttachment.release()
      }
      await client.query('rollback').catch(() => {})
      await client.query('begin')
      try {
        await client.query('delete from app.products where id=$1', [
          mediaProduct,
        ])
        await deleteMediaLibraryFixtureChildren(
          client,
          (
            await client.query(
              'select id from app.media_assets where uploader_id in ($1,$2)',
              [mediaAdmin, otherMediaAdmin],
            )
          ).rows.map((row) => row.id),
        )
        await client.query(
          'delete from app.media_renditions where asset_id in (select id from app.media_assets where uploader_id in ($1,$2))',
          [mediaAdmin, otherMediaAdmin],
        )
        await client.query(
          'delete from app.media_assets where uploader_id in ($1,$2)',
          [mediaAdmin, otherMediaAdmin],
        )
        await client.query('delete from app.brands where id=$1', [mediaBrand])
        await client.query('delete from auth.users where id in ($1,$2)', [
          mediaAdmin,
          otherMediaAdmin,
        ])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => {})
        report.mediaCleanupError = {
          code: error.code ?? null,
          message: error.message,
        }
      }
    }
    if (report.mediaCleanupError)
      throw new Error(
        'Media concurrency fixtures could not be removed; see the isolated report.',
      )

    // Home uses the same terminal media claims as products and a separate
    // optimistic version paired atomically with the central settings revision.
    const homeAdmin = '96000000-0000-4000-8000-000000000001'
    const homeOperation = '96000000-0000-4000-8000-000000000002'
    const homeVideoOperation = '96000000-0000-4000-8000-000000000003'
    const emptyHomeMedia = {
      hombre: null,
      mujer: null,
      unisex: null,
      complementos: null,
    }
    const homeContent = {
      featuredBrandId: null,
      announcement: {
        deliveryText: 'SQL fixture delivery',
        freeShippingLabel: 'SQL fixture free shipping',
      },
      hero: Array.from({ length: 5 }, () => ({
        eyebrow: 'SQL fixture campaign',
        title: 'SQL fixture title',
        description: 'SQL fixture description',
        cta: 'SQL fixture action',
        alt: 'SQL fixture image',
        desktopImage: null,
        mobileImage: null,
      })),
      film: {
        eyebrow: 'SQL fixture film',
        title: 'SQL fixture film',
        description: 'SQL fixture film description',
        cta: 'SQL fixture action',
        video: null,
        poster: null,
        mobileVideo: null,
        mobilePoster: null,
      },
      finder: {
        eyebrow: 'SQL fixture finder',
        title: 'SQL fixture finder',
        description: 'SQL fixture finder description',
        cta: 'SQL fixture action',
        desktopImage: null,
        mobileImage: null,
        entryLabel: 'SQL fixture first choice',
        entryQuestion: 'SQL fixture question',
        modalTitle: 'SQL fixture modal',
        steps: Object.fromEntries(
          ['family', 'occasion', 'intensity', 'budget'].map((key) => [
            key,
            {
              label: 'SQL fixture label',
              question: 'SQL fixture question',
              description: 'SQL fixture help',
            },
          ]),
        ),
        optionLabels: { family: {}, occasion: {}, intensity: {} },
        enabledOptions: { family: null, occasion: null, intensity: null },
        familyVisuals: {},
        noPreferenceLabel: 'SQL fixture no preference',
        budgets: [100, 400],
        budgetNoLimitLabel: 'SQL fixture no limit',
        resultCopy: Object.fromEntries(
          [
            'matches',
            'partial',
            'budget',
            'empty',
            'unavailable',
            'preferences',
          ].map((key) => [
            key,
            {
              title: 'SQL fixture result',
              description: 'SQL fixture result description',
            },
          ]),
        ),
        singleResultTitle: 'SQL fixture single result',
      },
    }
    const settingsBeforeHome = (
      await client.query('select * from app.store_settings where singleton')
    ).rows[0]
    let heldHome
    try {
      await client.query('begin')
      await client.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'home-concurrency@example.invalid','{}')",
        [homeAdmin],
      )
      await client.query(
        'insert into private.admin_memberships(user_id,active) values($1,true)',
        [homeAdmin],
      )
      await client.query('commit')
      const competingHomes = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          mediaQuery(
            'select api.admin_save_home($1::jsonb,$2::jsonb,0,$3,false) as value',
            [
              JSON.stringify(emptyHomeMedia),
              JSON.stringify(homeContent),
              settingsBeforeHome.version,
            ],
            homeAdmin,
          ),
        ),
      )
      if (
        competingHomes.filter((entry) => entry.status === 'fulfilled')
          .length !== 1 ||
        competingHomes.filter(
          (entry) =>
            entry.status === 'rejected' && entry.reason.code === 'PT409',
        ).length !== 9
      )
        throw new Error(
          'Competing Home saves did not commit exactly one matching revision.',
        )
      const initialHome = competingHomes.find(
        (entry) => entry.status === 'fulfilled',
      ).value
      const homeAsset = await mediaQuery(
        "select api.media_upload_reserve($1,'category') as value",
        [homeOperation],
        homeAdmin,
      )
      const homeImage = verifiedImage(homeAsset.id, 'a'.repeat(64))
      await mediaQuery(
        'select api.media_upload_prepare($1,$2,$3::jsonb) as value',
        [homeAsset.id, homeAdmin, JSON.stringify(homeImage)],
        homeAdmin,
        true,
      )
      await mediaQuery(
        'select api.media_upload_complete($1,$2,$3::jsonb) as value',
        [homeAsset.id, homeAdmin, JSON.stringify(homeImage)],
        homeAdmin,
        true,
      )
      await client.query(
        "update app.media_assets set retire_after=now()-interval '1 hour' where id=$1",
        [homeAsset.id],
      )
      heldHome = await pool.connect()
      await heldHome.query('begin')
      await heldHome.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: homeAdmin, aal: 'aal2' }),
      ])
      await heldHome.query('set local role authenticated')
      const attached = (
        await heldHome.query(
          'select api.admin_save_home($1::jsonb,$2::jsonb,1,$3,false) as value',
          [
            JSON.stringify({ ...emptyHomeMedia, hombre: homeAsset.id }),
            JSON.stringify(homeContent),
            initialHome.settingsVersion,
          ],
        )
      ).rows[0].value
      const claimsDuringHome = await mediaQuery(
        'select api.media_gc_claim(50) as value',
        [],
        homeAdmin,
        true,
      )
      if (claimsDuringHome.some((entry) => entry.id === homeAsset.id))
        throw new Error('GC claimed a Home image held by a pending attachment.')
      await heldHome.query('commit')
      heldHome.release()
      heldHome = undefined
      const claimsAfterHome = await mediaQuery(
        'select api.media_gc_claim(50) as value',
        [],
        homeAdmin,
        true,
      )
      if (claimsAfterHome.some((entry) => entry.id === homeAsset.id))
        throw new Error('GC claimed a committed Home image.')
      const detached = await mediaQuery(
        'select api.admin_save_home($1::jsonb,$2::jsonb,2,$3,false) as value',
        [
          JSON.stringify(emptyHomeMedia),
          JSON.stringify(homeContent),
          attached.settingsVersion,
        ],
        homeAdmin,
      )
      await client.query(
        "update app.media_assets set retire_after=now()-interval '1 hour' where id=$1",
        [homeAsset.id],
      )
      const terminalClaim = await mediaQuery(
        'select api.media_gc_claim(50) as value',
        [],
        homeAdmin,
        true,
      )
      if (!terminalClaim.some((entry) => entry.id === homeAsset.id))
        throw new Error('Detached expired Home image was not claimable.')
      const deniedAttachment = await Promise.allSettled([
        mediaQuery(
          'select api.admin_save_home($1::jsonb,$2::jsonb,3,$3,false) as value',
          [
            JSON.stringify({ ...emptyHomeMedia, hombre: homeAsset.id }),
            JSON.stringify(homeContent),
            detached.settingsVersion,
          ],
          homeAdmin,
        ),
      ])
      if (
        deniedAttachment[0].status !== 'rejected' ||
        deniedAttachment[0].reason.code !== '22023'
      )
        throw new Error('A terminal Home image claim was resurrected.')
      const videoReservation = await mediaQuery(
        "select api.media_upload_reserve($1,'film-video') as value",
        [homeVideoOperation],
        homeAdmin,
      )
      const videoPreparations = await Promise.allSettled(
        ['a', 'c'].map((character) =>
          mediaQuery(
            'select api.media_upload_prepare_video($1,$2,$3::jsonb) as value',
            [
              videoReservation.id,
              homeAdmin,
              JSON.stringify({
                width: 1280,
                height: 720,
                durationMs: 12000,
                byteSize: 5242880,
                sha256: character.repeat(64),
              }),
            ],
            homeAdmin,
            true,
          ),
        ),
      )
      if (
        videoPreparations.filter((entry) => entry.status === 'fulfilled')
          .length !== 1 ||
        videoPreparations.filter(
          (entry) =>
            entry.status === 'rejected' && entry.reason.code === 'PT409',
        ).length !== 1
      )
        throw new Error(
          'Competing video hashes did not bind exactly one immutable manifest.',
        )
      const videoManifest = (
        await client.query(
          'select prepared_metadata from app.media_assets where id=$1',
          [videoReservation.id],
        )
      ).rows[0].prepared_metadata
      const completedVideo = await mediaQuery(
        'select api.media_upload_complete_video($1,$2,$3::jsonb) as value',
        [videoReservation.id, homeAdmin, JSON.stringify(videoManifest)],
        homeAdmin,
        true,
      )
      if (
        completedVideo.byteSize !== 5242880 ||
        completedVideo.mimeType !== 'video/mp4'
      )
        throw new Error(
          'Verified video receipt metadata drifted after its concurrency race.',
        )
      report.homeConcurrency = {
        competingSaves: 10,
        committedRevisions: 1,
        versionConflicts: 9,
        cleanupSkippedLockedHomeAttachment: true,
        committedHomeAttachmentPreserved: true,
        terminalClaimCannotReattach: true,
        competingVideoManifests: 2,
        acceptedVideoManifests: 1,
        conflictingVideoManifests: 1,
        verifiedVideoByteSize: completedVideo.byteSize,
      }
    } finally {
      if (heldHome) {
        await heldHome.query('rollback').catch(() => {})
        heldHome.release()
      }
      await client.query('rollback').catch(() => {})
      await client.query('begin')
      try {
        await client.query('delete from app.home_document')
        await deleteMediaLibraryFixtureChildren(
          client,
          (
            await client.query(
              'select id from app.media_assets where uploader_id=$1',
              [homeAdmin],
            )
          ).rows.map((row) => row.id),
        )
        await client.query(
          'delete from app.media_renditions where asset_id in(select id from app.media_assets where uploader_id=$1)',
          [homeAdmin],
        )
        await client.query(
          'delete from app.media_assets where uploader_id=$1',
          [homeAdmin],
        )
        await client.query('delete from auth.users where id=$1', [homeAdmin])
        await client.query(
          'update app.store_settings set complements_enabled=$1,featured_brand_id=$2,version=$3 where singleton',
          [
            settingsBeforeHome.complements_enabled,
            settingsBeforeHome.featured_brand_id,
            settingsBeforeHome.version,
          ],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => {})
        report.homeCleanupError = {
          code: error.code ?? null,
          message: error.message,
        }
      }
    }
    if (report.homeCleanupError)
      throw new Error(
        'Home concurrency fixtures could not be removed; see the isolated report.',
      )
  } finally {
    await pool.end()
  }

  // Commerce uses committed fixtures only inside this disposable loopback DB.
  // None of these credentials, tariffs, users or orders reach a hosted service.
  const commerceIds = {
    admin: randomUUID(),
    customer: randomUUID(),
    brand: randomUUID(),
    product: randomUUID(),
    variant: randomUUID(),
    media: randomUUID(),
    operation: randomUUID(),
    upload: randomUUID(),
  }
  const commercePool = new pg.Pool({ ...config, max: 10 })
  async function commerceQuery(
    sql,
    values,
    role = 'service_role',
    actor = commerceIds.admin,
  ) {
    const connection = await commercePool.connect()
    try {
      await connection.query('begin')
      if (role === 'authenticated')
        await connection.query(
          "select set_config('request.jwt.claims',$1,true)",
          [JSON.stringify({ sub: actor, aal: 'aal2' })],
        )
      await connection.query(`set local role ${role}`)
      const response = await connection.query(sql, values)
      await connection.query('commit')
      return response.rows[0].value
    } catch (error) {
      await connection.query('rollback').catch(() => {})
      throw error
    } finally {
      connection.release()
    }
  }
  try {
    if (
      Number(
        (
          await client.query(
            'select count(*)::int as total from app.shipping_settings',
          )
        ).rows[0].total,
      ) !== 0
    )
      throw new Error(
        'Commerce concurrency needs an empty isolated shipping configuration.',
      )
    await client.query('begin')
    await client.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'commerce-race-admin@example.invalid','{}'),($2,'commerce-race-owner@example.invalid','{}')",
      [commerceIds.admin, commerceIds.customer],
    )
    await client.query(
      'insert into private.admin_memberships(user_id,active) values($1,true)',
      [commerceIds.admin],
    )
    await client.query(
      "insert into app.brands(id,name,slug) values($1,'SQL Commerce Race','sql-commerce-race')",
      [commerceIds.brand],
    )
    await client.query(
      "insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256) values($1::uuid,'r2','public/dynamic/'||$1::uuid::text||'/'||repeat('a',64)||'/800.webp','image/webp',800,1000,'ready',now(),$2,'product-gallery',2000,repeat('a',64))",
      [commerceIds.media, commerceIds.upload],
    )
    await client.query(
      'insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key) select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id=$1',
      [commerceIds.media],
    )
    await client.query(
      "insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values($1,'SQL Commerce Race','sql-commerce-race',$2,'SQL fixture','SQL fixture',true,'unisex')",
      [commerceIds.product, commerceIds.brand],
    )
    await client.query(
      "insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values($1,$2,50,12000,5,true,'SQL-RACE-COMMERCE')",
      [commerceIds.variant, commerceIds.product],
    )
    await client.query(
      'insert into app.product_images(product_id,position,media_id) values($1,0,$2)',
      [commerceIds.product, commerceIds.media],
    )
    await client.query(
      "insert into app.shipping_settings(singleton,free_threshold_cents,province_shipping_enabled,national_courier_fee_cents,national_estimate) values(true,30000,false,2500,'SQL fixture')",
    )
    await client.query(
      "insert into app.shipping_zones(id,name,department,province,district,courier_fee_cents,motorizado_fee_cents,estimate,active) values('commerce-race-zone','SQL fixture','lima','1501',null,1000,1500,'SQL fixture',true)",
    )
    await client.query('commit')
    const cart = [{ variantId: commerceIds.variant, quantity: 1 }]
    const quote = (
      await client.query(
        "select api.checkout_quote($1::jsonb,'lima','1501','150131','courier') as value",
        [JSON.stringify(cart)],
      )
    ).rows[0].value
    const checkout = {
      lines: cart,
      contact: {
        firstName: 'SQL concurrent',
        lastName: 'Fixture',
        email: 'race@example.invalid',
        phone: '912345678',
      },
      address: {
        department: 'lima',
        province: '1501',
        district: '150131',
        street: 'SQL fixture street 123',
        reference: '',
      },
      alternateRecipient: null,
      deliveryMethod: 'courier',
      promotionCode: null,
      expectedQuoteHash: quote.quoteHash,
    }
    const creationArgs = [
      commerceIds.operation,
      'R'.repeat(64),
      JSON.stringify(checkout),
      commerceIds.customer,
    ]
    const repeated = await Promise.all(
      Array.from({ length: 10 }, () =>
        commerceQuery(
          'select api.create_simulated_order($1,$2,$3::jsonb,$4) as value',
          creationArgs,
        ),
      ),
    )
    if (new Set(repeated.map((entry) => entry.order.id)).size !== 1)
      throw new Error('A checkout retry created duplicate orders.')
    const conflict = await Promise.allSettled([
      commerceQuery(
        'select api.create_simulated_order($1,$2,$3::jsonb,$4) as value',
        [
          commerceIds.operation,
          'R'.repeat(64),
          JSON.stringify({
            ...checkout,
            contact: { ...checkout.contact, firstName: 'Different' },
          }),
          commerceIds.customer,
        ],
      ),
    ])
    if (
      conflict[0].status !== 'rejected' ||
      conflict[0].reason.code !== 'PT409'
    )
      throw new Error('A reused operation accepted different checkout data.')
    await Promise.all(
      Array.from({ length: 99 }, () =>
        commerceQuery(
          'select api.create_simulated_order($1,$2,$3::jsonb,$4) as value',
          [
            randomUUID(),
            'S'.repeat(64),
            JSON.stringify(checkout),
            commerceIds.customer,
          ],
        ),
      ),
    )
    const rows = (
      await client.query(
        'select reference,version from app.orders where user_id=$1 order by reference',
        [commerceIds.customer],
      )
    ).rows
    if (
      rows.length !== 100 ||
      new Set(rows.map((row) => row.reference)).size !== 100
    )
      throw new Error('Concurrent simulations lost or duplicated an order.')
    const statusSql =
      'select api.admin_set_order_statuses($1::jsonb,$2,$3,$4,$5) as value'
    const changes = (list) =>
      list.map((row) => ({
        reference: row.reference,
        expectedVersion: Number(row.version),
      }))
    const ten = await commerceQuery(
      statusSql,
      [
        JSON.stringify(changes(rows.slice(0, 10))),
        'preparing',
        randomUUID(),
        false,
        'bulk',
      ],
      'authenticated',
    )
    const fifty = await commerceQuery(
      statusSql,
      [
        JSON.stringify(changes(rows.slice(10, 60))),
        'preparing',
        randomUUID(),
        false,
        'bulk',
      ],
      'authenticated',
    )
    const mixedRows = (
      await client.query(
        'select reference,version from app.orders where user_id=$1 order by reference',
        [commerceIds.customer],
      )
    ).rows
    const hundredOperation = randomUUID(),
      hundredArgs = [
        JSON.stringify(changes(mixedRows)),
        'preparing',
        hundredOperation,
        false,
        'bulk',
      ]
    const hundred = await commerceQuery(statusSql, hundredArgs, 'authenticated')
    const retry = await commerceQuery(statusSql, hundredArgs, 'authenticated')
    if (
      ten.updated.length !== 10 ||
      fifty.updated.length !== 50 ||
      hundred.updated.length !== 40 ||
      hundred.skipped.length !== 60 ||
      JSON.stringify(hundred) !== JSON.stringify(retry)
    )
      throw new Error(
        'Bulk simulation updates or idempotent status results are inconsistent.',
      )
    const first = (
      await client.query(
        'select reference,version from app.orders where user_id=$1 order by reference limit 1',
        [commerceIds.customer],
      )
    ).rows[0]
    const statusRace = await Promise.all(
      Array.from({ length: 2 }, () =>
        commerceQuery(
          statusSql,
          [
            JSON.stringify(changes([first])),
            'shipped',
            randomUUID(),
            false,
            'individual',
          ],
          'authenticated',
        ),
      ),
    )
    if (
      statusRace.filter((value) => value.updated.length === 1).length !== 1 ||
      statusRace.filter((value) => value.errors.length === 1).length !== 1
    )
      throw new Error(
        'Competing status writes did not preserve optimistic versions.',
      )
    const stored = (
      await client.query(
        'select count(*)::int as orders,count(distinct operation_id)::int as operations,bool_and(payment_status=$2) as pending from app.orders where user_id=$1',
        [commerceIds.customer, 'pending'],
      )
    ).rows[0]
    const inventory = (
      await client.query('select stock from app.product_variants where id=$1', [
        commerceIds.variant,
      ])
    ).rows[0].stock
    if (
      stored.orders !== 100 ||
      stored.operations !== 100 ||
      !stored.pending ||
      inventory !== 5
    )
      throw new Error(
        'Simulation changed real stock/payment or created duplicate operations.',
      )
    report.commerceConcurrency = {
      checkoutRetries: 10,
      ordersForRetriedOperation: 1,
      uniqueSimulatedOrders: 100,
      bulkGroups: [10, 50, 100],
      mixedStateUpdated: 40,
      mixedStateSkipped: 60,
      competingStatusWrites: 2,
      successfulStatusWrites: 1,
      versionConflicts: 1,
      stockUnchanged: true,
      paymentRemainsPending: true,
      reusedChangedPayloadRejected: true,
      idempotentStatusRetry: true,
    }
    report.commerceSecurity = await auditCommerceConcurrency({
      client,
      query: commerceQuery,
      ids: commerceIds,
      checkout,
      expectLegacyLocks: process.argv.includes(
        '--expect-legacy-checkout-locks',
      ),
    })
  } finally {
    await client.query('rollback').catch(() => {})
    await client.query('begin')
    try {
      await client.query('delete from app.orders where user_id=$1', [
        commerceIds.customer,
      ])
      await client.query(
        'delete from private.order_status_operations where actor_id=$1',
        [commerceIds.admin],
      )
      await client.query('delete from app.products where id=$1', [
        commerceIds.product,
      ])
      await client.query('delete from app.brands where id=$1', [
        commerceIds.brand,
      ])
      await deleteMediaLibraryFixtureChildren(client, [commerceIds.media])
      await client.query('delete from app.media_renditions where asset_id=$1', [
        commerceIds.media,
      ])
      await client.query('delete from app.media_assets where id=$1', [
        commerceIds.media,
      ])
      await client.query(
        "delete from app.shipping_zones where id='commerce-race-zone'",
      )
      await client.query('delete from app.shipping_settings where singleton')
      await client.query('delete from auth.users where id=any($1::uuid[])', [
        [commerceIds.admin, commerceIds.customer],
      ])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      report.commerceCleanupError = {
        code: error.code ?? null,
        message: error.message,
      }
    }
    await commercePool.end()
  }
  if (report.commerceCleanupError)
    throw new Error(
      'Commerce concurrency cleanup failed; inspect isolated report.',
    )

  // Account favorites use a per-owner lock/version, rather than one global
  // browser list. These are committed fixtures in this disposable database
  // only, so separate connections can exercise actual competing writes.
  const favoriteIds = {
    owners: [randomUUID(), randomUUID()],
    brand: randomUUID(),
    media: randomUUID(),
    operation: randomUUID(),
    products: Array.from({ length: 502 }, () => randomUUID()),
  }
  const favoritePool = new pg.Pool({ ...config, max: 10 })
  async function favoriteQuery(owner, sql, values = []) {
    const connection = await favoritePool.connect()
    try {
      await connection.query('begin')
      await connection.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: owner, aal: 'aal1' })],
      )
      await connection.query('set local role authenticated')
      const result = (await connection.query(sql, values)).rows[0].value
      await connection.query('commit')
      return result
    } catch (error) {
      await connection.query('rollback').catch(() => {})
      throw error
    } finally {
      connection.release()
    }
  }
  const favoriteWrite =
    'select api.set_customer_favorite($1::uuid,$2::boolean,$3::bigint) as value'
  try {
    await client.query('begin')
    await client.query(
      "insert into auth.users(id,email) select id,'favorites-race-'||id::text||'@example.invalid' from unnest($1::uuid[]) id",
      [favoriteIds.owners],
    )
    await client.query(
      "insert into app.brands(id,name,slug) values($1::uuid,'Favorites race '||$1::uuid::text,'favorites-race-'||$1::uuid::text)",
      [favoriteIds.brand],
    )
    await client.query(
      `insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
       values($1::uuid,'r2','public/dynamic/'||$1::uuid::text||'/'||repeat('a',64)||'/800.webp','image/webp',800,1000,'ready',now(),$2::uuid,'product-gallery',2000,repeat('a',64))`,
      [favoriteIds.media, favoriteIds.operation],
    )
    await client.query(
      'insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key) select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id=$1',
      [favoriteIds.media],
    )
    await client.query(
      `insert into app.products(id,name,slug,brand_id,short_description,description,active,gender)
       select id,'Favorites fixture '||id::text,'favorites-fixture-'||id::text,$2,'Isolated fixture','Isolated fixture',true,'unisex'
       from unnest($1::uuid[]) id`,
      [favoriteIds.products, favoriteIds.brand],
    )
    await client.query(
      `insert into app.product_variants(product_id,ml,price_cents,stock,active,merchant_sku)
       select id,50,12000,5,true,upper('FAV-RACE-'||id::text) from unnest($1::uuid[]) id`,
      [favoriteIds.products],
    )
    await client.query(
      'insert into app.product_images(product_id,position,media_id) select id,0,$2 from unnest($1::uuid[]) id',
      [favoriteIds.products, favoriteIds.media],
    )
    await client.query('commit')
    const competingAdds = await Promise.allSettled(
      favoriteIds.products
        .slice(0, 2)
        .map((id) =>
          favoriteQuery(favoriteIds.owners[0], favoriteWrite, [id, true, 0]),
        ),
    )
    const success = competingAdds.filter(
      (result) => result.status === 'fulfilled',
    )
    const conflicts = competingAdds.filter(
      (result) =>
        result.status === 'rejected' && result.reason.code === 'PT409',
    )
    if (success.length !== 1 || conflicts.length !== 1)
      throw new Error(
        'Concurrent favorite adds did not enforce one owner version.',
      )
    const firstList = success[0].value
    const secondProduct = favoriteIds.products
      .slice(0, 2)
      .find((id) => !firstList.productIds.includes(id))
    const desiredRetries = await Promise.all(
      Array.from({ length: 10 }, () =>
        favoriteQuery(favoriteIds.owners[0], favoriteWrite, [
          secondProduct,
          true,
          1,
        ]),
      ),
    )
    if (
      desiredRetries.some(
        (value) => value.version !== 2 || value.productIds.length !== 2,
      )
    )
      throw new Error('Concurrent desired-state retries duplicated a favorite.')
    const removeRetries = await Promise.all(
      Array.from({ length: 10 }, () =>
        favoriteQuery(favoriteIds.owners[0], favoriteWrite, [
          secondProduct,
          false,
          2,
        ]),
      ),
    )
    if (
      removeRetries.some(
        (value) => value.version !== 3 || value.productIds.length !== 1,
      )
    )
      throw new Error(
        'Concurrent desired-state removals changed the list twice.',
      )
    await client.query('insert into app.favorite_lists(user_id) values($1)', [
      favoriteIds.owners[1],
    ])
    await client.query(
      'insert into app.customer_favorites(user_id,product_id) select $1,id from unnest($2::uuid[]) id',
      [favoriteIds.owners[1], favoriteIds.products.slice(0, 499)],
    )
    const capacityRace = await Promise.allSettled(
      favoriteIds.products
        .slice(499, 501)
        .map((id) =>
          favoriteQuery(favoriteIds.owners[1], favoriteWrite, [id, true, 499]),
        ),
    )
    if (
      capacityRace.filter((result) => result.status === 'fulfilled').length !==
        1 ||
      capacityRace.filter(
        (result) =>
          result.status === 'rejected' && result.reason.code === 'PT409',
      ).length !== 1
    )
      throw new Error('Concurrent capacity writes bypassed the owner CAS lock.')
    const finalCapacity = await favoriteQuery(
      favoriteIds.owners[1],
      'select api.customer_favorites() as value',
    )
    const overCapacity = await Promise.allSettled([
      favoriteQuery(favoriteIds.owners[1], favoriteWrite, [
        favoriteIds.products[501],
        true,
        500,
      ]),
    ])
    if (
      finalCapacity.version !== 500 ||
      finalCapacity.productIds.length !== 500 ||
      overCapacity[0].status !== 'rejected' ||
      overCapacity[0].reason.code !== '54000'
    )
      throw new Error('Concurrent favorites capacity limit was not preserved.')
    const unaffectedOwner = await favoriteQuery(
      favoriteIds.owners[0],
      'select api.customer_favorites() as value',
    )
    if (
      unaffectedOwner.version !== 3 ||
      unaffectedOwner.productIds.length !== 1
    )
      throw new Error(
        'The second account modified the first account favorites.',
      )
    report.favoritesConcurrency = {
      competingAdds: 2,
      successfulAdds: 1,
      optimisticConflicts: 1,
      desiredStateAddRetries: 10,
      desiredStateRemoveRetries: 10,
      capacityRaceStartingAt: 499,
      capacityRaceWrites: 2,
      finalCapacity: 500,
      capacityExceededRejected: true,
      accountIsolation: true,
    }
  } finally {
    await client.query('rollback').catch(() => {})
    await client.query('begin')
    try {
      await client.query('delete from auth.users where id=any($1::uuid[])', [
        favoriteIds.owners,
      ])
      await client.query('delete from app.products where id=any($1::uuid[])', [
        favoriteIds.products,
      ])
      await client.query('delete from app.brands where id=$1', [
        favoriteIds.brand,
      ])
      await deleteMediaLibraryFixtureChildren(client, [favoriteIds.media])
      await client.query('delete from app.media_renditions where asset_id=$1', [
        favoriteIds.media,
      ])
      await client.query('delete from app.media_assets where id=$1', [
        favoriteIds.media,
      ])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      report.favoritesCleanupError = {
        code: error.code ?? null,
        message: error.message,
      }
    }
    await favoritePool.end()
  }
  if (report.favoritesCleanupError)
    throw new Error(
      'Favorites concurrency cleanup failed; inspect isolated report.',
    )

  report.mediaLibrarySecurity = await auditMediaLibraryConcurrency({
    client,
    config,
    pg,
  })

  const counts = (
    await client.query(
      'select (select count(*) from auth.users)::int as users, (select count(*) from app.products)::int as products, (select count(*) from private.admin_memberships)::int as admins, (select count(*) from app.brands)::int as brands, (select count(*) from app.media_assets)::int as media, (select count(*) from app.home_document)::int as home, (select count(*) from app.home_media)::int as homeMedia, (select count(*) from app.orders)::int as orders, (select count(*) from app.order_items)::int as orderItems, (select count(*) from app.coupons)::int as coupons, (select count(*) from app.shipping_settings)::int as shipping, (select count(*) from app.favorite_lists)::int as favoriteLists, (select count(*) from app.customer_favorites)::int as customerFavorites',
    )
  ).rows[0]
  if (Object.values(counts).some((count) => count !== 0))
    throw new Error('SQL test fixture rows were not rolled back.')
  report.testDataRolledBack = true
  if (restoreCheck) {
    const { rehearseLocalRecovery } =
      await import('./local-postgres-recovery.mjs')
    report.recovery = await rehearseLocalRecovery({
      client,
      pg,
      config,
      runDir,
      dataDir,
      command,
      onSourceDisconnected: () => {
        connected = false
      },
      onSourceStopped: () => {
        started = false
      },
    })
  }
  if (
    process.argv.includes('--generate-types') ||
    process.argv.includes('--generate-types-artifact')
  ) {
    // The official generator receives only this disposable loopback database.
    // Never log argv/DB URL or persist its random password in diagnostics.
    const generated = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(root, 'node_modules/supabase/dist/supabase.js'),
          'gen',
          'types',
          'typescript',
          '--db-url',
          `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres?sslmode=disable`,
          '--schema',
          'api,app,private,public',
          '--agent',
          'no',
          '--output-format',
          'text',
          '--log-level',
          'none',
        ],
        { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = '',
        stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0)
          reject(
            new Error(
              `Official local type generation failed (${code}): ${stderr
                .replaceAll(password, '[redacted]')
                .replace(
                  /postgres(?:ql)?:\/\/[^\s]+/g,
                  '[redacted database URL]',
                )
                .slice(-2000)}`,
            ),
          )
        else resolve(stdout)
      })
    })
    await writeFile(
      path.join(runDir, 'generated-types-output.txt'),
      generated
        .replaceAll(password, '[redacted]')
        .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted database URL]'),
      'utf8',
    )
    if (
      !generated.trimStart().startsWith('export type Json =') ||
      !/"?admin_save_home"?:/.test(generated) ||
      !/"?home_document"?:/.test(generated) ||
      !/"?set_customer_favorite"?:/.test(generated)
    )
      throw new Error(
        'Official generator did not return the expected migrated database types.',
      )
    const typesDestination = process.argv.includes('--generate-types-artifact')
      ? path.join(runDir, 'database.generated.ts')
      : path.join(root, 'src/types/database.generated.ts')
    await writeFile(typesDestination, generated, 'utf8')
    report.generatedTypes = {
      source: 'official Supabase CLI against disposable loopback SQL',
      schemas: ['api', 'app', 'private', 'public'],
      credentialsWritten: false,
      destination: path.relative(root, typesDestination),
    }
  }
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.error = { code: error.code ?? null, message: error.message }
  console.error(`${error.code ?? 'SQL_TEST_ERROR'}: ${error.message}`)
  process.exitCode = 1
} finally {
  if (connected) {
    await client.end().catch(() => {})
    connected = false
  }
  const ambiguousSource =
    sourceStartAttempted &&
    (await readdir(dataDir).catch(() => [])).includes('postmaster.pid')
  if (started || ambiguousSource)
    await command('pg_ctl', [
      '-D',
      dataDir,
      '-m',
      'fast',
      '-w',
      '-t',
      '30',
      'stop',
    ])
      .then(() => {
        started = false
      })
      .catch((error) => {
        report.result = 'failed'
        report.shutdownError = error.message
        process.exitCode = 1
      })
  if (restoreCheck && report.result === 'passed' && !report.shutdownError) {
    // This path was freshly allocated by mkdtemp above. Other local databases
    // and previous diagnostic runs are never candidates for removal.
    if (
      !runDir.startsWith(outputRoot + path.sep) ||
      path.dirname(dataDir) !== runDir ||
      path.basename(dataDir) !== 'database' ||
      connected ||
      started ||
      !report.recovery?.cleanup?.backupRemoved ||
      !report.recovery?.cleanup?.restoredRemoved
    ) {
      report.result = 'failed'
      report.recoveryCleanupError =
        'Disposable cluster shutdown could not be confirmed.'
      process.exitCode = 1
    } else {
      try {
        await rm(dataDir, { recursive: true, force: true })
        report.recovery.sourceFixtureRemoved = true
        report.recovery.cleanup.sourceRetainedForRunner = false
        await writeFile(
          path.join(runDir, 'recovery-result.json'),
          JSON.stringify(report.recovery, null, 2),
        )
      } catch {
        report.result = 'failed'
        report.recoveryCleanupError =
          'The new disposable cluster could not be removed.'
        process.exitCode = 1
      }
    }
  }
  await writeFile(
    path.join(runDir, 'result.json'),
    JSON.stringify(report, null, 2),
  )
  await writeFile(
    path.join(outputRoot, 'latest-result.json'),
    JSON.stringify(report, null, 2),
  )
  console.log(
    JSON.stringify({
      postgres: report.postgres,
      migrations: report.migrations.length,
      sqlAssertions: report.assertions.length,
      activitySnapshotRefresh: report.activitySnapshotRefresh,
      concurrency: report.concurrency,
      catalogConcurrency: report.catalogConcurrency,
      variantSkuConcurrency: report.variantSkuConcurrency,
      familyConcurrency: report.familyConcurrency,
      mediaConcurrency: report.mediaConcurrency,
      homeConcurrency: report.homeConcurrency,
      commerceConcurrency: report.commerceConcurrency,
      commerceSecurity: report.commerceSecurity,
      favoritesConcurrency: report.favoritesConcurrency,
      ...(restoreCheck ? { recovery: report.recovery } : {}),
      testDataRolledBack: report.testDataRolledBack,
      result: report.result,
    }),
  )
  console.log(
    `Report: ${path.relative(root, path.join(runDir, 'result.json'))}`,
  )
  // Default runs keep their new cluster for diagnostics. Successful restore
  // rehearsals remove only their own disposable cluster after verified shutdown.
}
