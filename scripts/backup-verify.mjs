import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const maximumManifestBytes = 4 * 1024 * 1024
const maximumSqlBytes = 16 * 1024 * 1024 * 1024
const maximumMediaBytes = 10 * 1024 * 1024
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const hash = /^[a-f0-9]{64}$/
const objectKey =
  /^public\/dynamic\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([1-9][0-9]{1,4}\.webp|video\.mp4)$/

function fields(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
}
function localPath(value) {
  assert(typeof value === 'string' && value.length <= 300)
  assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  assert(!path.isAbsolute(value) && !value.includes('\\'))
  const parts = value.split('/')
  for (const part of parts) {
    assert(part && part !== '.' && part !== '..' && !/[. ]$/.test(part))
    assert(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
  }
  return value
}
function fileMetadata(value, maximum) {
  assert(typeof value.sha256 === 'string' && hash.test(value.sha256))
  assert(
    Number.isSafeInteger(value.byteSize) &&
      value.byteSize > 0 &&
      value.byteSize <= maximum,
  )
  localPath(value.path)
}
function manifestDocument(value) {
  fields(value, ['version', 'projectRef', 'createdAt', 'database', 'media'])
  assert.equal(value.version, 1)
  assert.match(value.projectRef, /^[a-z]{20}$/)
  assert(typeof value.createdAt === 'string')
  assert.equal(new Date(value.createdAt).toISOString(), value.createdAt)
  fields(value.database, ['tool', 'toolVersion', 'schemas', 'files'])
  assert(['supabase-cli', 'pg_dump'].includes(value.database.tool))
  assert.match(value.database.toolVersion, /^[0-9]+(?:\.[0-9]+){1,3}$/)
  assert.deepEqual([...value.database.schemas].sort(), [
    'api',
    'app',
    'auth',
    'private',
  ])
  assert(
    Array.isArray(value.database.files) && value.database.files.length === 3,
  )
  const kinds = new Set(),
    paths = new Set(),
    keys = new Set()
  const files = []
  for (const file of value.database.files) {
    fields(file, ['kind', 'path', 'byteSize', 'sha256'])
    assert(
      ['roles', 'schema', 'data'].includes(file.kind) && !kinds.has(file.kind),
    )
    kinds.add(file.kind)
    fileMetadata(file, maximumSqlBytes)
    assert(/^database\/[A-Za-z0-9._/-]+\.sql$/.test(file.path))
    assert(!paths.has(file.path.toLowerCase()))
    paths.add(file.path.toLowerCase())
    files.push({ ...file, category: 'sql' })
  }
  fields(value.media, ['bucket', 'inventorySource', 'assets'])
  assert.match(value.media.bucket, /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
  assert.equal(value.media.inventorySource, 'same-database-snapshot')
  assert(
    Array.isArray(value.media.assets) && value.media.assets.length <= 100000,
  )
  const assetIds = new Set()
  let mediaObjects = 0
  for (const asset of value.media.assets) {
    fields(asset, ['id', 'status', 'objects'])
    assert(
      typeof asset.id === 'string' &&
        uuid.test(asset.id) &&
        !assetIds.has(asset.id),
    )
    assetIds.add(asset.id)
    assert(['ready', 'disabled'].includes(asset.status))
    assert(
      Array.isArray(asset.objects) &&
        asset.objects.length >= 1 &&
        asset.objects.length <= 3,
    )
    let prefixHash,
      masterWidth = 0,
      masterSha,
      video = false
    for (const object of asset.objects) {
      fields(object, ['key', 'path', 'byteSize', 'sha256'])
      fileMetadata(object, maximumMediaBytes)
      const match = object.key.match(objectKey)
      assert(match && match[1] === asset.id)
      prefixHash ??= match[2]
      assert.equal(match[2], prefixHash)
      assert.equal(object.path, `objects/${object.key}`)
      assert(!keys.has(object.key) && !paths.has(object.path.toLowerCase()))
      keys.add(object.key)
      paths.add(object.path.toLowerCase())
      if (match[3] === 'video.mp4') {
        assert.equal(asset.objects.length, 1)
        assert.equal(object.sha256, prefixHash)
        video = true
      } else {
        assert(object.byteSize <= 4 * 1024 * 1024)
        const width = Number(match[3].split('.')[0])
        assert(width <= 2304)
        if (width > masterWidth) {
          masterWidth = width
          masterSha = object.sha256
        }
      }
      files.push({ ...object, category: 'media' })
      mediaObjects++
    }
    // All renditions share the master's path hash, but have their own byte hashes.
    if (!video) assert.equal(masterSha, prefixHash)
  }
  return {
    files,
    sqlFiles: kinds.size,
    mediaAssets: assetIds.size,
    mediaObjects,
  }
}

async function safeFile(root, relative) {
  localPath(relative)
  let target = root
  const parts = relative.split('/')
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part)
    const stat = await lstat(target)
    assert(!stat.isSymbolicLink())
    assert(index === parts.length - 1 ? stat.isFile() : stat.isDirectory())
    assert.equal(path.relative(target, await realpath(target)), '')
    if (index === parts.length - 1) assert.equal(stat.nlink, 1)
  }
  const contained = path.relative(root, target)
  assert(
    contained && !contained.startsWith('..') && !path.isAbsolute(contained),
  )
  return target
}

async function readVerifiedFile(root, relative, maximum, expected) {
  const target = await safeFile(root, relative)
  const entry = await lstat(target)
  assert(entry.size > 0 && entry.size <= maximum)
  if (expected) assert.equal(entry.size, expected.byteSize)
  const handle = await open(target, 'r')
  try {
    const before = await handle.stat()
    assert(
      before.isFile() && before.ino === entry.ino && before.dev === entry.dev,
    )
    assert.equal(before.nlink, 1)
    const digest = createHash('sha256'),
      chunks = []
    let byteSize = 0
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      byteSize += chunk.byteLength
      assert(byteSize <= maximum)
      digest.update(chunk)
      if (!expected) chunks.push(chunk)
    }
    const after = await handle.stat()
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeMs, before.mtimeMs)
    assert.equal(byteSize, before.size)
    const sha256 = digest.digest('hex')
    if (expected) assert.equal(sha256, expected.sha256)
    await safeFile(root, relative)
    return expected ? { byteSize } : Buffer.concat(chunks)
  } finally {
    await handle.close()
  }
}

/** Verifies local files only; never exports, executes SQL, restores or deletes. */
export async function verifyBackupPackage(directory) {
  const checks = [],
    totals = {
      sqlFiles: 0,
      mediaAssets: 0,
      mediaObjects: 0,
      verifiedFiles: 0,
      bytes: 0,
    }
  let stage = 'manifest'
  try {
    assert(
      typeof directory === 'string' &&
        directory.length > 0 &&
        !directory.includes('://'),
    )
    const root = path.resolve(directory)
    const info = await lstat(root)
    assert(info.isDirectory() && !info.isSymbolicLink())
    assert.equal(path.relative(root, await realpath(root)), '')
    const contents = await readVerifiedFile(
      root,
      'backup-manifest.json',
      maximumManifestBytes,
    )
    const document = manifestDocument(JSON.parse(contents.toString('utf8')))
    checks.push({ code: stage, status: 'passed' })
    totals.sqlFiles = document.sqlFiles
    totals.mediaAssets = document.mediaAssets
    totals.mediaObjects = document.mediaObjects
    for (const [index, file] of document.files.entries()) {
      stage = `${file.category}-file-${index + 1}`
      const verified = await readVerifiedFile(
        root,
        file.path,
        file.category === 'sql' ? maximumSqlBytes : maximumMediaBytes,
        file,
      )
      totals.verifiedFiles++
      totals.bytes += verified.byteSize
      checks.push({ code: stage, status: 'passed' })
    }
  } catch {
    // Paths, SQL data, credentials and parser messages never enter the report.
    checks.push({
      code: stage,
      status: 'failed',
      reason: 'invalid-manifest-path-or-file-integrity',
    })
  }
  return {
    scope: 'local-backup-package-integrity',
    result: checks.every((item) => item.status === 'passed')
      ? 'passed'
      : 'failed',
    checks,
    totals,
    restoreVerified: false,
    inventoryCompletenessVerified: false,
    remoteRequests: 0,
    limitation:
      'Verifies every declared local SQL file and media object. Does not prove official export provenance, upstream inventory completeness, SQL semantics, successful restoration, protected off-site retention or scheduling.',
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const arguments_ = process.argv.slice(2)
  if (arguments_.length !== 1) {
    console.error(
      'Uso: node scripts/backup-verify.mjs <directorio-del-respaldo>',
    )
    process.exitCode = 1
  } else {
    const result = await verifyBackupPackage(arguments_[0])
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.result === 'passed' ? 0 : 1
  }
}
