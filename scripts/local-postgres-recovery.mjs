import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import {
  access,
  cp,
  lstat,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const schemas = ['auth', 'app', 'api', 'private']
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`

function samePath(left, right) {
  return path.relative(path.resolve(left), path.resolve(right)) === ''
}

function within(directory, candidate) {
  const relative = path.relative(directory, candidate)
  return (
    Boolean(relative) &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

async function absent(filename) {
  try {
    await access(filename)
    return false
  } catch (error) {
    if (error.code === 'ENOENT') return true
    throw error
  }
}

async function loopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

async function identity(client, directory, port, requireFixture = false) {
  const row = (
    await client.query(`select current_database() as database,
      host(inet_server_addr()) as host, inet_server_port() as port,
      current_setting('data_directory') as directory,
      current_setting('aroma.test_mode',true) as fixture,
      current_setting('server_version_num') as version`)
  ).rows[0]
  assert.equal(row.database, 'postgres', 'identity-database')
  assert.equal(row.host, '127.0.0.1', 'identity-loopback')
  assert.equal(row.port, port, 'identity-port')
  if (requireFixture)
    assert.equal(row.fixture, 'local-fixture', 'identity-fixture')
  assert(samePath(row.directory, directory), 'identity-data-directory')
  assert(
    samePath(await realpath(directory), directory),
    'identity-canonical-path',
  )
  return row
}

async function fileManifest(directory) {
  assert(samePath(await realpath(directory), directory))
  const entries = []
  async function visit(relative = '') {
    const current = path.join(directory, relative)
    const metadata = await lstat(current)
    assert(!metadata.isSymbolicLink(), 'A local recovery path contains a link.')
    if (metadata.isDirectory()) {
      for (const name of (await readdir(current)).sort())
        await visit(path.join(relative, name))
    } else {
      assert(metadata.isFile(), 'A local recovery path is not a regular file.')
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(current)) hash.update(chunk)
      entries.push({
        path: relative.split(path.sep).join('/'),
        bytes: metadata.size,
        sha256: hash.digest('hex'),
      })
    }
  }
  await visit()
  return entries
}

async function snapshot(client) {
  const tables = (
    await client.query(
      `select n.nspname as schema,c.relname as name
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname=any($1::text[]) and c.relkind in ('r','p')
      order by n.nspname,c.relname`,
      [schemas],
    )
  ).rows
  const data = []
  for (const table of tables) {
    const row = (
      await client.query(`select count(*)::int as rows,
        md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text) as hash
        from ${identifier(table.schema)}.${identifier(table.name)} t`)
    ).rows[0]
    data.push({ table: `${table.schema}.${table.name}`, ...row })
  }
  const security = (
    await client.query(
      `select jsonb_build_object(
      'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,
        'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,
        'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,
        'settings',rolconfig) order by rolname) from pg_catalog.pg_roles),
      'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member,grantor),'[]'::jsonb)
        from pg_catalog.pg_auth_members m),
      'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl)
        order by nspname) from pg_catalog.pg_namespace where nspname=any($1::text[])),
      'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
        'kind',c.relkind,'owner',c.relowner,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
        'acl',c.relacl) order by n.nspname,c.relname) from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[])),
      'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
        from pg_catalog.pg_policies p where schemaname=any($1::text[])),
      'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
        'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',p.proowner,
        'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,
        'definition',md5(pg_catalog.pg_get_functiondef(p.oid))) order by n.nspname,p.proname,p.oid)
        from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname=any($1::text[]) and p.prokind in ('f','p')),
      'defaultPrivileges',(select coalesce(jsonb_agg(to_jsonb(d) order by defaclrole,defaclnamespace,defaclobjtype),'[]'::jsonb)
        from pg_catalog.pg_default_acl d),
      'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.conname,
        'type',c.contype,'valid',c.convalidated,'definition',pg_catalog.pg_get_constraintdef(c.oid))
        order by n.nspname,c.conrelid,c.conname) from pg_catalog.pg_constraint c
        join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname=any($1::text[])),
      'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
        'name',t.tgname,'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid))
        order by n.nspname,c.relname,t.tgname) from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid=t.tgrelid
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname=any($1::text[]) and not t.tgisinternal)
      ) as value`,
      [schemas],
    )
  ).rows[0].value
  const descriptors = (
    await client.query(
      `select n.nspname as schema,c.relname as name,s.seqincrement::text as increment
      from pg_catalog.pg_sequence s join pg_catalog.pg_class c on c.oid=s.seqrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname=any($1::text[]) order by n.nspname,c.relname`,
      [schemas],
    )
  ).rows
  const sequences = []
  for (const sequence of descriptors) {
    const row = (
      await client.query(`select last_value::text as value,is_called as called
      from ${identifier(sequence.schema)}.${identifier(sequence.name)}`)
    ).rows[0]
    sequences.push({ ...sequence, ...row })
  }
  return {
    data: digest(data),
    security: digest(security),
    sequences,
    dataTables: data.length,
    dataRows: data.reduce((sum, table) => sum + table.rows, 0),
  }
}

async function seed(client) {
  const ids = {
    a: randomUUID(),
    b: randomUUID(),
    brand: randomUUID(),
    product: randomUUID(),
    variantA: randomUUID(),
    variantB: randomUUID(),
  }
  await client.query('begin')
  try {
    for (const [index, user] of [ids.a, ids.b].entries()) {
      const letter = index === 0 ? 'A' : 'B'
      await client.query(
        'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',
        [
          user,
          `recovery-${letter.toLowerCase()}-${user}@example.invalid`,
          JSON.stringify({
            firstName: `Restore ${letter}`,
            lastName: 'Local only',
            phone: '912345678',
          }),
        ],
      )
      await client.query(
        `insert into app.addresses(user_id,label,recipient,department,province,district,street)
        values($1,$2,$3,'lima','1501','150101',$4)`,
        [
          user,
          `Restore ${letter}`,
          `Restore ${letter} Local only`,
          `Local recovery fixture ${letter} 123`,
        ],
      )
    }
    await client.query(
      "insert into app.brands(id,name,slug) values($1,'Local recovery fixture','local-recovery-fixture')",
      [ids.brand],
    )
    await client.query(
      `insert into app.products(id,name,slug,brand_id,short_description,description,active)
      values($1,'Local recovery fixture','local-recovery-fixture',$2,'Local recovery fixture','Never commercial data',false)`,
      [ids.product, ids.brand],
    )
    for (const [variant, ml, price, stock] of [
      [ids.variantA, 50, 12345, 7],
      [ids.variantB, 100, 23456, 3],
    ])
      await client.query(
        `insert into app.product_variants(id,product_id,ml,merchant_sku,price_cents,stock)
        values($1,$2,$3,nextval('app.variant_merchant_sku_seq')::text,$4,$5)`,
        [variant, ids.product, ml, price, stock],
      )
    await client.query('insert into app.favorite_lists(user_id) values($1)', [
      ids.a,
    ])
    await client.query(
      'insert into app.customer_favorites(user_id,product_id) values($1,$2)',
      [ids.a, ids.product],
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
  return ids
}

async function restrictedQuery(client, role, user, sql) {
  assert(['anon', 'authenticated'].includes(role))
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(
        user ? { sub: user, aal: 'aal1', role: 'authenticated' } : {},
      ),
    ])
    await client.query(`set local role ${role}`)
    return await client.query(sql)
  } finally {
    await client.query('rollback')
  }
}

/** Same-version cold recovery of this runner's NEW, disposable cluster only. */
export async function rehearseLocalRecovery({
  client,
  pg,
  config,
  runDir,
  dataDir,
  command,
  onSourceDisconnected,
  onSourceStopped,
}) {
  const outputRoot = path.join(projectRoot, 'artifacts/supabase-sql-tests')
  assert(within(outputRoot, runDir))
  assert.match(path.relative(outputRoot, runDir), /^run-[^/\\]+$/)
  assert(samePath(dataDir, path.join(runDir, 'database')))
  assert(samePath(await realpath(runDir), runDir))
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.database, 'postgres')
  assert.equal(config.user, 'postgres')
  assert(!config.connectionString)
  assert.equal(typeof onSourceDisconnected, 'function')
  assert.equal(typeof onSourceStopped, 'function')
  assert(
    Number.isInteger(config.port) && config.port > 0 && config.port < 65536,
  )
  const backupDir = path.join(runDir, 'recovery-backup')
  const restoredDir = path.join(runDir, 'recovery-restored')
  assert(await absent(backupDir))
  assert(await absent(restoredDir))
  const report = {
    result: 'running',
    method: 'cold physical backup, same native PostgreSQL version',
    scope:
      'Disposable loopback PostgreSQL and SQL-only Auth fixture; not Supabase Auth, hosted backups or R2 object recovery.',
    remoteConnections: 0,
    plainCredentialsInReports: false,
    checks: [],
    fixtureGraph: {
      localOnly: true,
      users: 2,
      profiles: 2,
      addresses: 2,
      brands: 1,
      products: 1,
      variants: 2,
      favorites: 1,
    },
    cleanup: {
      sourceRetainedForRunner: true,
      backupRemoved: false,
      restoredRemoved: false,
    },
  }
  let stage = 'source-identity',
    restored,
    restoredStartAttempted = false,
    restoredStarted = false,
    restoredConnected = false
  const pass = (check) => report.checks.push(check)
  try {
    const source = await identity(client, dataDir, config.port, true)
    report.postgresVersion = source.version
    pass(
      'Source database is the verified new loopback cluster and expected PGDATA',
    )
    stage = 'seed-local-fixture'
    const ids = await seed(client)
    const before = await snapshot(client)
    assert(before.dataRows >= 10)
    report.sourceFingerprints = {
      data: before.data,
      security: before.security,
      sequences: digest(before.sequences),
    }
    pass(
      'Nonempty committed local ownership and product/variant/FK fixture graph recorded',
    )
    stage = 'source-shutdown'
    await client.end()
    onSourceDisconnected()
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
    onSourceStopped()
    assert(await absent(path.join(dataDir, 'postmaster.pid')))
    pass('Original PostgreSQL stopped cleanly before any physical file copy')
    stage = 'cold-backup'
    const sourceManifest = await fileManifest(dataDir)
    assert(sourceManifest.length > 0)
    await cp(dataDir, backupDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
    })
    const backupManifest = await fileManifest(backupDir)
    assert.deepEqual(backupManifest, sourceManifest)
    stage = 'restore-files'
    await cp(backupDir, restoredDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
    })
    assert.deepEqual(await fileManifest(restoredDir), sourceManifest)
    report.backup = {
      files: sourceManifest.length,
      bytes: sourceManifest.reduce((sum, file) => sum + file.bytes, 0),
      manifestSha256: digest(sourceManifest),
    }
    pass(
      'Complete cold PGDATA backup and restored file manifests match SHA-256 before startup',
    )
    stage = 'restored-startup'
    let port = await loopbackPort()
    while (port === config.port) port = await loopbackPort()
    restoredStartAttempted = true
    await command('pg_ctl', [
      '-D',
      restoredDir,
      '-l',
      path.join(runDir, 'recovery-postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      '-w',
      '-t',
      '30',
      'start',
    ])
    restoredStarted = true
    restored = new pg.Client({ ...config, port })
    await restored.connect()
    restoredConnected = true
    const target = await identity(restored, restoredDir, port)
    assert.equal(target.version, source.version)
    pass(
      'Restored database runs from distinct PGDATA and loopback port on the same PostgreSQL version',
    )
    stage = 'restored-fingerprints'
    const after = await snapshot(restored)
    assert.equal(after.data, before.data)
    assert.equal(after.security, before.security)
    assert.deepEqual(after.sequences, before.sequences)
    report.restoredFingerprints = {
      data: after.data,
      security: after.security,
      sequences: digest(after.sequences),
    }
    report.dataTables = after.dataTables
    report.dataRows = after.dataRows
    pass(
      'Restored table data, roles, grants, policies, forced RLS, function owners and sequence states match',
    )
    stage = 'restored-permissions'
    for (const [user, firstName] of [
      [ids.a, 'Restore A'],
      [ids.b, 'Restore B'],
    ]) {
      const profile = (
        await restrictedQuery(
          restored,
          'authenticated',
          user,
          'select api.get_profile() as value',
        )
      ).rows[0].value
      const address = (
        await restrictedQuery(
          restored,
          'authenticated',
          user,
          'select api.get_address() as value',
        )
      ).rows[0].value
      assert.equal(profile.user_id, user)
      assert.equal(profile.first_name, firstName)
      assert.equal(address.user_id, user)
      assert.equal(address.label, firstName)
    }
    const favorites = (
      await restrictedQuery(
        restored,
        'authenticated',
        ids.a,
        'select api.customer_favorites() as value',
      )
    ).rows[0].value
    const otherFavorites = (
      await restrictedQuery(
        restored,
        'authenticated',
        ids.b,
        'select api.customer_favorites() as value',
      )
    ).rows[0].value
    assert.deepEqual(favorites.productIds, [ids.product])
    assert.deepEqual(otherFavorites.productIds, [])
    pass(
      'Restored RPCs preserve separate profile, address and saved-product ownership for two SQL fixture users',
    )
    for (const [role, user, sql] of [
      ['anon', null, 'select api.get_profile()'],
      ['authenticated', ids.a, 'select * from app.profiles'],
      ['authenticated', ids.a, 'select * from private.admin_memberships'],
      ['authenticated', ids.a, 'select api.admin_catalog_page(1,0)'],
    ])
      await assert.rejects(
        restrictedQuery(restored, role, user, sql),
        (error) => error.code === '42501',
      )
    const catalog = (
      await restrictedQuery(
        restored,
        'anon',
        null,
        'select api.catalog_products(10,0) as value',
      )
    ).rows[0].value
    assert.equal(catalog.total, 0)
    pass(
      'Restored anonymous/customer roles still reject private reads/admin calls and do not publish the inactive fixture',
    )
    stage = 'restored-sequences'
    for (const name of ['product_code_seq', 'variant_merchant_sku_seq']) {
      const state = before.sequences.find(
        (sequence) => sequence.schema === 'app' && sequence.name === name,
      )
      assert(state)
      const value = (
        await restored.query(`select nextval('app.${name}')::text as value`)
      ).rows[0].value
      assert.equal(
        BigInt(value),
        BigInt(state.value) + (state.called ? BigInt(state.increment) : 0n),
      )
    }
    pass(
      'Both commercial identifier sequences continue at the expected next value after restoration',
    )
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = {
      stage,
      code: /^[A-Z0-9_]{1,30}$/.test(String(error.code || ''))
        ? error.code
        : 'LOCAL_RECOVERY_CHECK_FAILED',
      ...(typeof error.message === 'string' &&
      /^identity-[a-z-]+$/.test(error.message)
        ? { check: error.message }
        : {}),
    }
    throw Object.assign(
      new Error(
        `Local recovery check failed at ${stage}; diagnostic values withheld.`,
      ),
      { code: 'LOCAL_RECOVERY_CHECK_FAILED' },
    )
  } finally {
    if (restoredConnected) await restored.end().catch(() => {})
    // pg_ctl -w can time out after starting its daemon. Never treat an ambiguous
    // start as proof that no process exists; inspect only this fresh PGDATA.
    const ambiguousProcess =
      restoredStartAttempted &&
      !(await absent(path.join(restoredDir, 'postmaster.pid')))
    let stopped = !restoredStarted && !ambiguousProcess
    if (restoredStarted || ambiguousProcess) {
      try {
        await command('pg_ctl', [
          '-D',
          restoredDir,
          '-m',
          'fast',
          '-w',
          '-t',
          '30',
          'stop',
        ])
        stopped = true
      } catch {
        report.result = 'failed'
        report.shutdownFailed = true
      }
    }
    if (report.result === 'passed' && stopped) {
      for (const [directory, property] of [
        [restoredDir, 'restoredRemoved'],
        [backupDir, 'backupRemoved'],
      ]) {
        assert(within(runDir, directory))
        assert(samePath(await realpath(directory), directory))
        await fileManifest(directory) // reject links before recursive removal
        await rm(directory, { recursive: true, force: false })
        report.cleanup[property] = true
      }
    }
    await writeFile(
      path.join(runDir, 'recovery-result.json'),
      JSON.stringify(report, null, 2),
    )
  }
  if (report.shutdownFailed)
    throw new Error(
      'Restored local cluster shutdown failed; recovery files retained.',
    )
  return report
}
