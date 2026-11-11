import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyBackupPackage } from './backup-verify.mjs'
import { captureDatabaseState } from './backup-database-verification.mjs'
import { STATIC_SVG_MAX_BYTES } from '../src/domain/static-svg.js'

const root = fileURLToPath(new URL('../', import.meta.url))
export const backupProfiles = Object.freeze({
  development: Object.freeze({
    projectRef: 'tkxvexfapszilzhogvgu',
    bucket: 'aroma-infini-media-dev',
    workdir: root,
  }),
  production: Object.freeze({
    projectRef: 'ogpfhhucnaldgxyqajkc',
    bucket: 'aroma-infini-media-prod',
    workdir: path.join(
      root,
      'artifacts/production-bootstrap-2026-11-01/workspace',
    ),
  }),
})
const projectRef = backupProfiles.development.projectRef
const maximumOutput = 4 * 1024 * 1024
const maximumBackupBytes = 512 * 1024 * 1024
const caFingerprint =
  '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa'
const tools = path.join(root, 'artifacts/postgresql-backup-tools')
const allowedVariables = [
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
]

/** Parse data from the official dry-run; the returned shell is NEVER executed. */
export function parseSupabaseDumpPlan(plan, expectedProject = projectRef) {
  try {
    assert(
      Object.values(backupProfiles).some(
        (profile) => profile.projectRef === expectedProject,
      ),
    )
    assert.equal(typeof plan, 'string')
    assert(plan.length < maximumOutput)
    const result = {}
    for (const line of plan.split(/\r?\n/)) {
      const match = line.match(/^export (PG[A-Z_]+)=(.*)$/)
      if (!match || !allowedVariables.includes(match[1])) continue
      assert(!Object.hasOwn(result, match[1]))
      const quoted = match[2]
      assert(quoted.length >= 2 && quoted.length <= 2048)
      let value
      if (quoted.startsWith("'") && quoted.endsWith("'")) {
        value = quoted.slice(1, -1)
        assert(!value.includes("'"))
      } else {
        assert(quoted.startsWith('"') && quoted.endsWith('"'))
        const source = quoted.slice(1, -1)
        value = ''
        for (let index = 0; index < source.length; index++) {
          const character = source[index]
          if (character === '\\') {
            const escaped = source[++index]
            assert(escaped && '\\"$`'.includes(escaped))
            value += escaped
          } else {
            assert(!'"$`'.includes(character))
            value += character
          }
        }
      }
      assert(
        value &&
          [...value].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
      )
      result[match[1]] = value
    }
    assert.deepEqual(Object.keys(result).sort(), [...allowedVariables].sort())
    assert.equal(result.PGPORT, '5432') // Exported snapshots require a session.
    assert.equal(result.PGDATABASE, 'postgres')
    assert(
      [
        'cli_login_postgres',
        `postgres.${expectedProject}`,
        'postgres',
      ].includes(result.PGUSER),
    )
    assert(
      result.PGHOST === `db.${expectedProject}.supabase.co` ||
        /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(result.PGHOST),
    )
    return result
  } catch {
    throw new Error('invalid-official-dump-plan')
  }
}

export function validateBackupInventory(rows) {
  try {
    assert(Array.isArray(rows) && rows.length <= 1000)
    const ids = new Set(),
      keys = new Set()
    let bytes = 0
    const assets = rows.map((row) => {
      assert(
        row && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(row.id),
      )
      assert(!ids.has(row.id))
      ids.add(row.id)
      assert(['ready', 'disabled'].includes(row.status))
      assert(
        Array.isArray(row.objects) &&
          row.objects.length >= 1 &&
          row.objects.length <= 3,
      )
      let prefixHash,
        masterWidth = 0,
        masterSha
      const objects = row.objects.map((object) => {
        const match =
          typeof object.key === 'string' &&
          object.key.match(
            /^public\/dynamic\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([1-9][0-9]{1,4}\.webp|video\.mp4|vector\.svg)$/,
          )
        assert(match && match[1] === row.id && !keys.has(object.key))
        keys.add(object.key)
        assert(/^[a-f0-9]{64}$/.test(object.sha256))
        const byteSize = Number(object.byteSize)
        assert(
          Number.isSafeInteger(byteSize) &&
            byteSize > 0 &&
            byteSize <= 10 * 1024 * 1024,
        )
        prefixHash ??= match[2]
        assert.equal(prefixHash, match[2])
        if (match[3] === 'video.mp4' || match[3] === 'vector.svg') {
          assert.equal(row.objects.length, 1)
          assert.equal(object.sha256, prefixHash)
          if (match[3] === 'vector.svg')
            assert(byteSize <= STATIC_SVG_MAX_BYTES)
        } else {
          const width = Number(match[3].split('.')[0])
          assert(width <= 2304 && byteSize <= 4 * 1024 * 1024)
          if (width > masterWidth) {
            masterWidth = width
            masterSha = object.sha256
          }
        }
        bytes += byteSize
        assert(bytes <= maximumBackupBytes)
        return {
          key: object.key,
          path: `objects/${object.key}`,
          byteSize,
          sha256: object.sha256,
        }
      })
      if (masterWidth) assert.equal(masterSha, prefixHash)
      return { id: row.id, status: row.status, objects }
    })
    return { assets, byteSize: bytes, objectCount: keys.size }
  } catch {
    throw new Error('invalid-media-inventory')
  }
}

function command(executable, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    const chunks = []
    let size = 0
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('backup-process-timeout'))
    }, 180000)
    child.stdout.on('data', (chunk) => {
      size += chunk.length
      if (size > maximumOutput) {
        child.kill()
        reject(new Error('backup-process-output'))
      } else chunks.push(chunk)
    })
    // CLI/database stderr can contain private values. Never persist or forward it.
    child.stderr.on('data', () => {})
    child.on('error', () => {
      clearTimeout(timer)
      reject(new Error('backup-process'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error('backup-process'))
    })
  })
}
function powershell(source, env = process.env) {
  return command(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from(
        `$ErrorActionPreference='Stop'\n${source}`,
        'utf16le',
      ).toString('base64'),
    ],
    { env },
  )
}
async function privateDirectory(directory) {
  await mkdir(directory, { recursive: false })
  const sidOutput = await command('whoami.exe', ['/user', '/fo', 'csv', '/nh'])
  const sid = sidOutput.match(/S-1-5-(?:[0-9]+-)*[0-9]+/)?.[0]
  assert(sid)
  await command('icacls.exe', [
    directory,
    '/inheritance:r',
    '/grant:r',
    `*${sid}:(OI)(CI)F`,
    '*S-1-5-18:(OI)(CI)F',
  ])
  const result = await powershell(
    `$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl=Get-Acl -LiteralPath $env:AROMA_BACKUP_DIRECTORY
if(-not $acl.AreAccessRulesProtected){throw 'private-acl'}
foreach($rule in $acl.Access){$identity=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($identity -notin @($sid,'S-1-5-18') -or $rule.AccessControlType -ne 'Allow'){throw 'private-acl'}}
Write-Output 'protected'`,
    { ...process.env, AROMA_BACKUP_DIRECTORY: directory },
  )
  assert.equal(result.trim(), 'protected')
}
async function fileHash(filename) {
  const value = await lstat(filename)
  assert(
    value.isFile() &&
      !value.isSymbolicLink() &&
      value.nlink === 1 &&
      value.size > 0 &&
      value.size <= maximumBackupBytes,
  )
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return { byteSize: value.size, sha256: hash.digest('hex') }
}
async function deleteOwnFile(directory, filename) {
  assert.equal(path.dirname(filename), directory)
  assert.equal(await realpath(directory), directory)
  const value = await lstat(filename)
  assert(value.isFile() && !value.isSymbolicLink() && value.nlink === 1)
  await rm(filename)
}
async function validatePackageTree(directory, expected) {
  const seen = new Set()
  async function visit(current) {
    assert.equal(await realpath(current), current)
    for (const name of await readdir(current)) {
      const filename = path.join(current, name),
        value = await lstat(filename)
      assert(!value.isSymbolicLink())
      if (value.isDirectory()) await visit(filename)
      else {
        assert(value.isFile() && value.nlink === 1)
        const relative = path
          .relative(directory, filename)
          .replaceAll(path.sep, '/')
        assert(expected.has(relative))
        seen.add(relative)
      }
    }
  }
  await visit(directory)
  assert.equal(seen.size, expected.size)
}
async function encryptPackage(directory, packageDirectory) {
  const zip = path.join(directory, 'backup.zip'),
    encrypted = path.join(directory, 'backup.zip.aesgcm')
  // Windows PowerShell's .NET Framework ZIP traversal truncates these deeply
  // nested UUID/hash paths at MAX_PATH. The system libarchive tool streams ZIP
  // entries and supports the full canonical filesystem paths.
  await command(path.join(process.env.SystemRoot, 'System32/tar.exe'), [
    '-a',
    '-c',
    '-f',
    zip,
    '-C',
    packageDirectory,
    '.',
  ])
  const zipped = await fileHash(zip)
  const key = randomBytes(32),
    iv = randomBytes(12)
  let encryptionStage = 'dpapi'
  try {
    const wrapped = (
      await powershell(
        `Add-Type -AssemblyName System.Security
$key=[Convert]::FromBase64String($env:AROMA_PACKAGE_KEY)
$entropy=[Text.Encoding]::UTF8.GetBytes('aroma-infini-development-backup-v1')
$protected=[Security.Cryptography.ProtectedData]::Protect($key,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$verified=[Security.Cryptography.ProtectedData]::Unprotect($protected,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
if([Convert]::ToBase64String($verified) -ne [Convert]::ToBase64String($key)){throw 'key-protection'}
Write-Output ([Convert]::ToBase64String($protected))`,
        { ...process.env, AROMA_PACKAGE_KEY: key.toString('base64') },
      )
    ).trim()
    assert(/^[A-Za-z0-9+/]+=*$/.test(wrapped) && wrapped.length < 4096)
    encryptionStage = 'cipher'
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    await pipeline(
      createReadStream(zip),
      cipher,
      createWriteStream(encrypted, { flags: 'wx', mode: 0o600 }),
    )
    const tag = cipher.getAuthTag(),
      decrypt = createDecipheriv('aes-256-gcm', key, iv)
    encryptionStage = 'round-trip'
    decrypt.setAuthTag(tag)
    const hash = createHash('sha256')
    const stream = createReadStream(encrypted).pipe(decrypt)
    for await (const chunk of stream) hash.update(chunk)
    assert.equal(hash.digest('hex'), zipped.sha256)
    encryptionStage = 'envelope'
    await writeFile(
      path.join(directory, 'archive-envelope.json'),
      JSON.stringify(
        {
          version: 1,
          encryption: 'AES-256-GCM',
          keyProtection: 'Windows-DPAPI-CurrentUser',
          entropy: 'aroma-infini-development-backup-v1',
          wrappedKey: wrapped,
          iv: iv.toString('base64'),
          tag: tag.toString('base64'),
          archive: 'backup.zip.aesgcm',
          plaintextSha256: zipped.sha256,
          plaintextBytes: zipped.byteSize,
          portability:
            'Requires the same Windows user profile and DPAPI keys; not an independent off-site disaster-recovery copy.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    await deleteOwnFile(directory, zip)
    return {
      encryptedBytes: (await stat(encrypted)).size,
      authenticatedRoundTrip: true,
    }
  } catch {
    throw new Error(`backup-encryption-${encryptionStage}`)
  } finally {
    key.fill(0)
  }
}

/** Re-protect only a package created by this exporter, without reconnecting remotely. */
export async function protectDevelopmentBackup(directory) {
  const output = path.join(root, 'artifacts/protected-backups')
  assert.equal(process.platform, 'win32')
  assert.equal(path.dirname(directory), output)
  assert(
    /^(development|production)-[0-9TZ-]+-[a-f0-9-]{36}$/.test(
      path.basename(directory),
    ),
  )
  assert.equal(await realpath(directory), directory)
  const packageDirectory = path.join(directory, 'package')
  const verified = await verifyBackupPackage(packageDirectory)
  assert.equal(verified.result, 'passed')
  const oldZip = path.join(directory, 'backup.zip')
  try {
    await deleteOwnFile(directory, oldZip)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return encryptPackage(directory, packageDirectory)
}

/** Exports ONLY the linked, explicitly named development project and private R2 bucket. */
export async function backupEnvironment({
  confirmed = false,
  keepVerifiedPackage = false,
  environmentName = 'development',
} = {}) {
  assert(confirmed === true, 'explicit-windows-development-export-required')
  // Validate the explicit target independently of the host before any I/O.
  // Linux CI must reject an unknown profile as well as Windows; this never
  // permits the Windows/DPAPI exporter to run on an unsupported platform.
  assert(
    Object.hasOwn(backupProfiles, environmentName),
    'explicit-backup-profile-required',
  )
  assert(
    process.platform === 'win32',
    'explicit-windows-development-export-required',
  )
  assert(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    'backup-tls-verification-required',
  )
  const { projectRef, bucket, workdir } = backupProfiles[environmentName]
  const output = path.join(root, 'artifacts/protected-backups')
  await mkdir(output, { recursive: true })
  assert.equal(await realpath(output), output)
  const directory = path.join(
    output,
    `${environmentName}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`,
  )
  await privateDirectory(directory)
  const packageDirectory = path.join(directory, 'package')
  await mkdir(path.join(packageDirectory, 'database'), { recursive: true })
  let client,
    stage = 'identity'
  const report = {
    scope: 'official-allowlisted-database-and-r2-export',
    environmentName,
    result: 'failed',
    projectRef,
    bucket,
    remoteWrites: 0,
    tlsVerified: false,
    snapshotConsistent: false,
    packageVerified: false,
    encrypted: false,
    plaintextPackageRetained: keepVerifiedPackage,
    directory: path.relative(root, directory).replaceAll(path.sep, '/'),
    limitations: [
      'Only the explicitly selected project and its matching R2 bucket; no catalog or object writes.',
      'Local Windows DPAPI protection is not portable or an off-site backup.',
      'A verified export does not prove recovery of the hosted Auth service, JWT keys, SMTP or external settings.',
    ],
  }
  try {
    assert.equal(
      (
        await readFile(path.join(workdir, 'supabase/.temp/project-ref'), 'utf8')
      ).trim(),
      projectRef,
    )
    const caPath = path.join(tools, 'prod-ca-2021.crt'),
      ca = await readFile(caPath, 'utf8'),
      certificate = new X509Certificate(ca)
    assert(certificate.ca && certificate.verify(certificate.publicKey))
    assert.equal(
      certificate.fingerprint256.replaceAll(':', '').toLowerCase(),
      caFingerprint,
    )
    assert(
      Date.parse(certificate.validTo) > Date.now() &&
        Date.parse(certificate.validFrom) < Date.now(),
    )
    const plan = await command(process.execPath, [
      'node_modules/supabase/dist/supabase.js',
      'db',
      'dump',
      '--linked',
      '--workdir',
      workdir,
      '--dry-run',
      '--agent',
      'no',
      '--output-format',
      'text',
    ])
    const connection = parseSupabaseDumpPlan(plan, projectRef)
    const environment = {
      ...process.env,
      ...connection,
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: caPath,
      PGCONNECT_TIMEOUT: '15',
    }
    for (const name of [
      'PGSERVICE',
      'PGSERVICEFILE',
      'PGOPTIONS',
      'PGSSLCERT',
      'PGSSLKEY',
      'PGSSLCRL',
      'PGSSLCRLDIR',
    ])
      delete environment[name]
    const toolVersion = (
      await command(path.join(tools, 'pg_dump.exe'), ['--version'])
    ).match(/\b(17\.[0-9]+)\b/)?.[1]
    assert(toolVersion)
    const pg = createRequire(
      path.join(root, 'artifacts/supabase-sql-tools/package.json'),
    )('pg')
    client = new pg.Client({
      host: connection.PGHOST,
      port: Number(connection.PGPORT),
      user: connection.PGUSER,
      password: connection.PGPASSWORD,
      database: connection.PGDATABASE,
      ssl: { ca, rejectUnauthorized: true },
      connectionTimeoutMillis: 15000,
      statement_timeout: 30000,
    })
    await client.connect()
    report.tlsVerified = true
    await client.query('set role postgres')
    const serverVersion = (
      await client.query(
        "select current_setting('server_version_num')::int as version",
      )
    ).rows[0].version
    assert(serverVersion >= 170000 && serverVersion < 180000)
    const roleFingerprint = async () =>
      createHash('sha256')
        .update(
          JSON.stringify({
            roles: (
              await client.query(
                `select row_to_json(r) as role from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig from pg_roles order by rolname) r`,
              )
            ).rows,
            memberships: (
              await client.query(
                `select r.rolname as role,m.rolname as member,g.rolname as grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor order by r.rolname,m.rolname,g.rolname`,
              )
            ).rows,
            parameters: (
              await client.query(
                `select parname,paracl::text from pg_parameter_acl order by parname`,
              )
            ).rows,
          }),
        )
        .digest('hex')
    const rolesBefore = await roleFingerprint()
    stage = 'database-snapshot'
    await client.query('begin isolation level repeatable read read only')
    const snapshot = (
      await client.query('select pg_export_snapshot() as snapshot')
    ).rows[0].snapshot
    assert(/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(snapshot))
    const rows = (
      await client.query(`select a.id::text,a.status,
      case when a.mime_type in ('video/mp4','image/svg+xml') then jsonb_build_array(jsonb_build_object('key',a.object_key,'byteSize',a.byte_size,'sha256',a.sha256))
      else coalesce((select jsonb_agg(jsonb_build_object('key',r.object_key,'byteSize',r.byte_size,'sha256',r.sha256) order by r.width) from app.media_renditions r where r.asset_id=a.id),'[]'::jsonb) end as objects
      from app.media_assets a where a.storage_kind='r2' and a.status in ('ready','disabled') order by a.id`)
    ).rows
    const inventory = validateBackupInventory(rows)
    const databaseState = await captureDatabaseState(client)
    await writeFile(
      path.join(packageDirectory, 'database-verification.json'),
      JSON.stringify(databaseState) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    const schemas = ['app', 'api', 'private', 'auth']
    const files = []
    stage = 'official-postgresql-export'
    for (const kind of ['roles', 'schema', 'data']) {
      const relative = `database/${kind}.sql`,
        filename = path.join(packageDirectory, relative)
      const args =
        kind === 'roles'
          ? [
              '--roles-only',
              '--no-role-passwords',
              '--role=postgres',
              '--file',
              filename,
            ]
          : [
              kind === 'schema' ? '--schema-only' : '--data-only',
              '--role=postgres',
              '--snapshot',
              snapshot,
              '--quote-all-identifiers',
              ...schemas.flatMap((schema) => ['--schema', schema]),
              '--file',
              filename,
            ]
      await command(
        path.join(tools, kind === 'roles' ? 'pg_dumpall.exe' : 'pg_dump.exe'),
        args,
        { env: environment },
      )
      files.push({ kind, path: relative, ...(await fileHash(filename)) })
    }
    report.snapshotConsistent = true
    stage = 'r2-objects'
    for (const asset of inventory.assets)
      for (const object of asset.objects) {
        const filename = path.join(packageDirectory, object.path)
        assert(filename.startsWith(packageDirectory + path.sep))
        await mkdir(path.dirname(filename), { recursive: true })
        await command(
          process.execPath,
          [
            'node_modules/wrangler/bin/wrangler.js',
            'r2',
            'object',
            'get',
            `${bucket}/${object.key}`,
            '--remote',
            '--file',
            filename,
            '--env',
            environmentName === 'development' ? 'staging' : 'production',
          ],
          {
            env: {
              ...process.env,
              WRANGLER_SEND_METRICS: 'false',
              WRANGLER_LOG: 'none',
              WRANGLER_LOG_PATH: path.join(directory, 'wrangler-read.log'),
            },
          },
        )
        const actual = await fileHash(filename)
        assert.equal(actual.byteSize, object.byteSize)
        assert.equal(actual.sha256, object.sha256)
      }
    await client.query('commit')
    assert.equal(await roleFingerprint(), rolesBefore)
    await client.end()
    client = undefined
    await writeFile(
      path.join(packageDirectory, 'backup-manifest.json'),
      JSON.stringify(
        {
          version: 1,
          projectRef,
          createdAt: new Date().toISOString(),
          database: {
            tool: 'pg_dump',
            toolVersion,
            schemas: ['api', 'app', 'auth', 'private'],
            files,
          },
          media: {
            bucket,
            inventorySource: 'same-database-snapshot',
            assets: inventory.assets,
          },
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    stage = 'package-integrity'
    assert(
      files.reduce((sum, file) => sum + file.byteSize, 0) +
        inventory.byteSize <=
        maximumBackupBytes,
    )
    const expectedFiles = new Set([
      'backup-manifest.json',
      'database-verification.json',
      ...files.map((file) => file.path),
      ...inventory.assets.flatMap((asset) =>
        asset.objects.map((object) => object.path),
      ),
    ])
    await validatePackageTree(packageDirectory, expectedFiles)
    const verified = await verifyBackupPackage(packageDirectory)
    assert.equal(verified.result, 'passed')
    report.packageVerified = true
    stage = 'protected-encryption'
    report.encryption = await encryptPackage(directory, packageDirectory)
    report.encrypted = true
    report.counts = verified.totals
    if (!keepVerifiedPackage) {
      assert.equal(await realpath(packageDirectory), packageDirectory)
      assert.equal(path.dirname(packageDirectory), directory)
      await validatePackageTree(packageDirectory, expectedFiles)
      await rm(packageDirectory, { recursive: true })
    }
    report.result = 'passed'
  } catch (error) {
    report.failedStage = stage
    if (/^backup-encryption-[a-z-]+$/.test(String(error.message)))
      report.failedCheck = error.message
  } finally {
    if (client) {
      await client.query('rollback').catch(() => {})
      await client.end().catch(() => {})
    }
    report.plaintextPackageRetained = await lstat(packageDirectory)
      .then((value) => value.isDirectory())
      .catch(() => false)
  }
  await writeFile(
    path.join(directory, 'export-result.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  return report
}

export function backupDevelopment(options = {}) {
  return backupEnvironment({ ...options, environmentName: 'development' })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2)
    assert(
      (args.includes('--confirm-development-export') ||
        args.includes('--confirm-production-export')) &&
        !(
          args.includes('--confirm-development-export') &&
          args.includes('--confirm-production-export')
        ) &&
        args.every((arg) =>
          [
            '--confirm-development-export',
            '--confirm-production-export',
            '--keep-verified-package',
          ].includes(arg),
        ),
    )
    const report = await backupEnvironment({
      confirmed: true,
      environmentName: args.includes('--confirm-production-export')
        ? 'production'
        : 'development',
      keepVerifiedPackage: args.includes('--keep-verified-package'),
    })
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.result === 'passed' ? 0 : 1
  } catch {
    console.error(
      'No se pudo preparar el respaldo protegido. Revisa las herramientas oficiales, la sesión y el certificado; no se modificó el proyecto remoto.',
    )
    process.exitCode = 1
  }
}
