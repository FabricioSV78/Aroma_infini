import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { verifyBackupPackage } from '../scripts/backup-verify.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const mediaId = '50000000-0000-4000-8000-000000000001'

async function fixture(run) {
  const base = path.resolve('artifacts/backup-verifier-tests')
  await mkdir(base, { recursive: true })
  const directory = await mkdtemp(path.join(base, 'case-'))
  const files = new Map()
  const sql = ['roles', 'schema', 'data'].map((kind) => {
    const bytes = Buffer.from(
      `-- Synthetic local ${kind} fixture, never a real database backup.\n`,
    )
    const source = `database/${kind}.sql`
    files.set(source, bytes)
    return { kind, path: source, byteSize: bytes.length, sha256: digest(bytes) }
  })
  const master = Buffer.from('Synthetic fixture master image bytes')
  const derivative = Buffer.from('Different synthetic resized image bytes')
  const masterHash = digest(master)
  const objects = [
    [480, derivative],
    [960, master],
  ].map(([width, bytes]) => {
    const key = `public/dynamic/${mediaId}/${masterHash}/${width}.webp`
    const source = `objects/${key}`
    files.set(source, bytes)
    return { key, path: source, byteSize: bytes.length, sha256: digest(bytes) }
  })
  const manifest = {
    version: 1,
    projectRef: 'abcdefghijklmnopqrst',
    createdAt: '2026-11-01T12:00:00.000Z',
    database: {
      tool: 'supabase-cli',
      toolVersion: '2.122.0',
      schemas: ['app', 'api', 'private', 'auth'],
      files: sql,
    },
    media: {
      bucket: 'aroma-infini-media-fixture',
      inventorySource: 'same-database-snapshot',
      assets: [{ id: mediaId, status: 'ready', objects }],
    },
  }
  const save = async () => {
    for (const [relative, bytes] of files) {
      const filename = path.join(directory, relative)
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, bytes)
    }
    await writeFile(
      path.join(directory, 'backup-manifest.json'),
      JSON.stringify(manifest),
    )
  }
  try {
    await save()
    await run({ directory, manifest, files, save })
  } finally {
    const relative = path.relative(base, path.resolve(directory))
    assert(
      relative.startsWith('case-') &&
        !relative.includes('..') &&
        !path.isAbsolute(relative),
    )
    await rm(directory, { recursive: true, force: true })
  }
}

test('valid local package verifies SQL and every rendition while preserving honest restore limits', async () => {
  await fixture(async ({ directory }) => {
    const result = await verifyBackupPackage(directory)
    assert.equal(result.result, 'passed')
    assert.deepEqual(result.totals, {
      sqlFiles: 3,
      mediaAssets: 1,
      mediaObjects: 2,
      verifiedFiles: 5,
      bytes: result.totals.bytes,
    })
    assert.equal(result.restoreVerified, false)
    assert.equal(result.inventoryCompletenessVerified, false)
    assert.equal(result.remoteRequests, 0)
  })
})

for (const target of ['database/data.sql', 'derivative']) {
  test(`corruption of ${target} is detected without changing source files`, async () => {
    await fixture(async ({ directory, manifest }) => {
      const relative =
        target === 'derivative'
          ? manifest.media.assets[0].objects[0].path
          : target
      const filename = path.join(directory, relative)
      const bytes = await readFile(filename)
      bytes[0] ^= 1
      await writeFile(filename, bytes)
      const result = await verifyBackupPackage(directory)
      assert.equal(result.result, 'failed')
      assert.deepEqual(await readFile(filename), bytes)
    })
  })
}

test('an original hash in every variant metadata is rejected when derivative bytes differ', async () => {
  await fixture(async ({ directory, manifest, save }) => {
    manifest.media.assets[0].objects[0].sha256 =
      manifest.media.assets[0].objects[1].sha256
    await save()
    assert.equal((await verifyBackupPackage(directory)).result, 'failed')
  })
})

for (const unsafe of [
  '../outside.sql',
  '/absolute.sql',
  'C:/private.sql',
  'database/../private.sql',
  'database\\data.sql',
  'database/CON.sql',
  'database/data.sql:secret',
]) {
  test(`unsafe declared path is rejected (${unsafe})`, async () => {
    await fixture(async ({ directory, manifest, save }) => {
      manifest.database.files[2].path = unsafe
      await save()
      const result = await verifyBackupPackage(directory)
      assert.equal(result.result, 'failed')
      assert.equal(result.totals.verifiedFiles, 0)
      assert(!JSON.stringify(result).includes(unsafe))
    })
  })
}

test('symlinked ancestor is rejected even when linked file content matches', async () => {
  await fixture(async ({ directory, manifest, save }) => {
    await mkdir(path.join(directory, 'actual'))
    await writeFile(
      path.join(directory, 'actual', 'data.sql'),
      await readFile(path.join(directory, 'database/data.sql')),
    )
    await symlink(
      path.join(directory, 'actual'),
      path.join(directory, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    manifest.database.files[2].path = 'database/linked/data.sql'
    await symlink(
      path.join(directory, 'actual'),
      path.join(directory, 'database', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await save()
    assert.equal((await verifyBackupPackage(directory)).result, 'failed')
  })
})

test('missing media object fails without treating partial verification as success', async () => {
  await fixture(async ({ directory, manifest }) => {
    await rm(path.join(directory, manifest.media.assets[0].objects[1].path))
    const result = await verifyBackupPackage(directory)
    assert.equal(result.result, 'failed')
    assert.equal(result.totals.verifiedFiles, 4)
  })
})

for (const mutate of [
  (manifest) => {
    manifest.database.files[1].kind = 'roles'
  },
  (manifest) => {
    manifest.database.schemas = ['public']
  },
  (manifest) => {
    manifest.media.assets.push(manifest.media.assets[0])
  },
  (manifest) => {
    manifest.media.assets[0].objects.push(manifest.media.assets[0].objects[0])
  },
  (manifest) => {
    manifest.media.assets[0].status = 'pending'
  },
  (manifest) => {
    manifest.media.inventorySource = 'public-catalog-sample'
  },
]) {
  test('incomplete, duplicate or unconfirmed inventory is rejected', async () => {
    await fixture(async ({ directory, manifest, save }) => {
      mutate(manifest)
      await save()
      assert.equal((await verifyBackupPackage(directory)).result, 'failed')
    })
  })
}

test('draft-associated ready assets and disabled retained assets can both be backed up', async () => {
  await fixture(async ({ directory, manifest, save }) => {
    manifest.media.assets[0].status = 'disabled'
    await save()
    assert.equal((await verifyBackupPackage(directory)).result, 'passed')
  })
})

test('video byte hash and single object are checked independently from images', async () => {
  await fixture(async ({ directory, manifest, files, save }) => {
    const id = '50000000-0000-4000-8000-000000000002'
    const bytes = Buffer.from('Synthetic local MP4 bytes')
    const key = `public/dynamic/${id}/${digest(bytes)}/video.mp4`
    const source = `objects/${key}`
    files.set(source, bytes)
    manifest.media.assets.push({
      id,
      status: 'ready',
      objects: [
        { key, path: source, byteSize: bytes.length, sha256: digest(bytes) },
      ],
    })
    await save()
    const result = await verifyBackupPackage(directory)
    assert.equal(result.result, 'passed')
    assert.equal(result.totals.mediaObjects, 3)
  })
})

test('unknown secret fields and parser failures never leak into output', async () => {
  await fixture(async ({ directory, manifest, save }) => {
    manifest.password = 'sb_secret_syntheticneverprint'
    await save()
    const result = await verifyBackupPackage(directory)
    assert.equal(result.result, 'failed')
    assert(!JSON.stringify(result).includes(manifest.password))
  })
  const missing = await verifyBackupPackage(
    'https://private.invalid/token-secret',
  )
  assert.equal(missing.result, 'failed')
  assert(!JSON.stringify(missing).includes('token-secret'))
})
