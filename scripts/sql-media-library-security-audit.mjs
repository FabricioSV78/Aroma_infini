import { randomUUID } from 'node:crypto'

async function requireLocalFixture(client) {
  const scope = (
    await client.query(
      "select current_setting('aroma.test_mode',true) as mode,host(inet_server_addr()) as host",
    )
  ).rows[0]
  if (scope.mode !== 'local-fixture' || scope.host !== '127.0.0.1')
    throw new Error('Media races require the disposable loopback SQL fixture.')
}

// Operator-only teardown of explicit disposable IDs. Production GC preserves
// registry tombstones and never removes its metadata or audit history.
export async function deleteMediaLibraryFixtureChildren(client, ids) {
  await requireLocalFixture(client)
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
    throw new Error('Explicit fixture asset IDs are required.')
  if (!ids.length) return
  await client.query(
    'delete from private.media_lifecycle_events where asset_id=any($1::uuid[])',
    [ids],
  )
  await client.query(
    'delete from app.media_library where asset_id=any($1::uuid[])',
    [ids],
  )
}

export async function auditMediaLibraryConcurrency({ client, config, pg }) {
  await requireLocalFixture(client)
  const pool = new pg.Pool({ ...config, max: 4 })
  const admin = randomUUID()
  const ids = Array.from({ length: 5 }, () => randomUUID())
  const slots = ['about.story', 'about.hero.mobile']
  const originals = (
    await client.query(
      'select slot,asset_id,alt,version,updated_at from app.site_media_slots where slot=any($1::text[]) order by slot',
      [slots],
    )
  ).rows
  const hasAliases = (
    await client.query(
      "select to_regclass('app.media_builtin_aliases') is not null as present",
    )
  ).rows[0].present
  const aliasPaths = ['/images/ambre-480.webp', '/images/cedre-480.webp']
  const originalAliases = hasAliases
    ? (
        await client.query(
          'select path,asset_id,version,updated_at,updated_by from app.media_builtin_aliases where path=any($1::text[])',
          [aliasPaths],
        )
      ).rows
    : []
  const pending = new Set()
  const assertions = {}
  const requireState = (value, message) => {
    if (!value) throw new Error(message)
  }
  async function begin(role) {
    const connection = await pool.connect()
    await connection.query('begin')
    await connection.query("set local statement_timeout='8s'")
    if (role === 'authenticated')
      await connection.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: admin, aal: 'aal2' })],
      )
    await connection.query(`set local role ${role}`)
    return connection
  }
  async function execute(role, statement, values) {
    const connection = await begin(role)
    try {
      const result = (await connection.query(statement, values)).rows[0]?.value
      await connection.query('commit')
      return result
    } catch (error) {
      await connection.query('rollback').catch(() => {})
      throw error
    } finally {
      connection.release()
    }
  }
  function track(operation) {
    pending.add(operation)
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    )
    return operation
  }
  const save = (slot, asset, version) =>
    execute(
      'authenticated',
      'select api.admin_save_site_media($1,$2,$3,$4) as value',
      [slot, asset, 'Disposable concurrency fixture', version],
    )
  async function slotVersion(slot) {
    return Number(
      (
        await client.query(
          'select version from app.site_media_slots where slot=$1',
          [slot],
        )
      ).rows[0].version,
    )
  }
  async function seed(id, expired = true, width = 1600, height = 2000) {
    await client.query(
      "insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,uploader_id,purpose,byte_size,sha256,retire_after) values($1::uuid,'r2','public/dynamic/'||$1::text||'/'||repeat('a',64)||'/'||$5::text||'.webp','image/webp',$5::integer,$6::integer,'ready',now(),$2,$3,'site-image',2000,repeat('a',64),clock_timestamp()+case when $4 then interval '-1 second' else interval '24 hours' end)",
      [id, randomUUID(), admin, expired, width, height],
    )
    await client.query(
      'insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key) select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id=$1',
      [id],
    )
  }
  async function waitForBlockedSiteSave() {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      await client.query('select pg_stat_clear_snapshot()')
      const result = await client.query(
        "select count(*)::int as count from pg_stat_activity where wait_event_type='Lock' and query like '%api.admin_save_site_media($1,$2,$3,$4)%'",
      )
      if (result.rows[0].count >= 1) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('The site editor never reached the held deletion row lock.')
  }

  let heldEditor
  let heldCollector
  let failure
  let result
  try {
    await client.query(
      "insert into auth.users(id,email,encrypted_password) values($1::uuid,'media-library-race-'||$1::text||'@example.invalid','fixture-only')",
      [admin],
    )
    await client.query(
      'insert into private.admin_memberships(user_id) values($1)',
      [admin],
    )
    await seed(ids[0])

    // Attachment commits after GC has actually attempted SKIP LOCKED. Its
    // uncommitted FK-backed placement and asset lock must protect every byte.
    heldEditor = await begin('authenticated')
    await heldEditor.query('select api.admin_save_site_media($1,$2,$3,$4)', [
      slots[0],
      ids[0],
      'Attach wins',
      await slotVersion(slots[0]),
    ])
    const skipped = await execute(
      'service_role',
      'select api.media_gc_claim(50) as value',
      [],
    )
    requireState(
      !skipped.some((entry) => entry.id === ids[0]),
      'GC claimed a site asset while its attachment transaction held the row.',
    )
    await heldEditor.query('commit')
    heldEditor.release()
    heldEditor = undefined
    const attached = (
      await client.query(
        'select status,retire_after from app.media_assets where id=$1',
        [ids[0]],
      )
    ).rows[0]
    requireState(
      attached.status === 'ready' && attached.retire_after === null,
      'A successful site attachment failed to cancel retirement.',
    )
    assertions.attachmentWinsAndCancelsCleanup = true

    // Conversely, hold a real terminal claim and prove the editor blocks on
    // that asset before it rejects it after the collector commits.
    await seed(ids[1])
    heldCollector = await begin('service_role')
    const claimed = (
      await heldCollector.query('select api.media_gc_claim(50) as value')
    ).rows[0].value.find((entry) => entry.id === ids[1])
    requireState(claimed, 'The expired unreferenced fixture was not claimed.')
    const blockedSave = track(
      save(slots[0], ids[1], await slotVersion(slots[0])).then(
        () => ({ code: 'success' }),
        (error) => ({ code: error.code }),
      ),
    )
    await waitForBlockedSiteSave()
    await heldCollector.query('commit')
    heldCollector.release()
    heldCollector = undefined
    requireState(
      (await blockedSave).code === '22023',
      'A site editor attached an asset after its terminal deletion claim.',
    )
    requireState(
      (
        await client.query(
          'select asset_id from app.site_media_slots where slot=$1',
          [slots[0]],
        )
      ).rows[0].asset_id === ids[0],
      'A rejected replacement changed the existing site placement.',
    )
    assertions.claimWinsAndBlocksAttachment = true
    const recheck = await execute(
      'service_role',
      'select api.media_gc_recheck($1,$2) as value',
      [ids[1], claimed.claimId],
    )
    requireState(recheck === true, 'A valid terminal claim failed rechecking.')
    await client.query(
      "update app.media_assets set deletion_lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [ids[1]],
    )
    const retry = (
      await execute(
        'service_role',
        'select api.media_gc_claim(50) as value',
        [],
      )
    ).find((entry) => entry.id === ids[1])
    requireState(
      retry?.claimId === claimed.claimId,
      'Lease expiry changed the immutable deletion identity.',
    )
    assertions.leaseRetryPreservesTerminalIdentity = true

    await seed(ids[2], false)
    const edits = await Promise.allSettled(
      ['First editor', 'Second editor'].map((name) =>
        track(
          execute(
            'authenticated',
            'select api.admin_media_metadata($1,$2,$3,$4,$5) as value',
            [ids[2], name, '', 'other', 1],
          ),
        ),
      ),
    )
    requireState(
      edits.filter((entry) => entry.status === 'fulfilled').length === 1 &&
        edits.filter(
          (entry) =>
            entry.status === 'rejected' && entry.reason.code === 'PT409',
        ).length === 1,
      'Concurrent metadata editors did not produce exactly one version conflict.',
    )
    assertions.metadataOptimisticConflict = true

    await save(slots[1], ids[2], await slotVersion(slots[1]))
    const versions = await Promise.all(slots.map(slotVersion))
    const swaps = await Promise.allSettled([
      track(save(slots[0], ids[2], versions[0])),
      track(save(slots[1], ids[0], versions[1])),
    ])
    requireState(
      swaps.every((entry) => entry.status === 'fulfilled'),
      'Reversed site replacements deadlocked instead of locking UUIDs in order.',
    )
    const afterSwap = (
      await client.query(
        'select slot,asset_id from app.site_media_slots where slot=any($1::text[])',
        [slots],
      )
    ).rows
    requireState(
      afterSwap.find((row) => row.slot === slots[0]).asset_id === ids[2] &&
        afterSwap.find((row) => row.slot === slots[1]).asset_id === ids[0],
      'The committed site swap lost a placement.',
    )
    requireState(
      (
        await client.query(
          'select bool_and(retire_after is null) as retained from app.media_assets where id=any($1::uuid[])',
          [[ids[0], ids[2]]],
        )
      ).rows[0].retained === true,
      'A shared image lost retention while site placements were swapped.',
    )
    assertions.reversedReplacementsLockInUuidOrder = true
    if (originalAliases.length === 2) {
      const aliasVersion = async (path) =>
        Number(
          (
            await client.query(
              'select version from app.media_builtin_aliases where path=$1',
              [path],
            )
          ).rows[0].version,
        )
      const bind = (path, asset, version) =>
        execute(
          'authenticated',
          'select api.admin_save_media_alias($1,$2,$3) as value',
          [path, asset, version],
        )
      await seed(ids[3], true, 480, 600)
      const aliasVersions = await Promise.all(aliasPaths.map(aliasVersion))
      const bindings = await Promise.allSettled(
        aliasPaths.map((path, index) =>
          track(bind(path, ids[3], aliasVersions[index])),
        ),
      )
      requireState(
        bindings.every((entry) => entry.status === 'fulfilled'),
        'Concurrent aliases could not bind the same verified image.',
      )
      requireState(
        (
          await client.query(
            'select count(*)::int as uses from app.media_builtin_aliases where asset_id=$1',
            [ids[3]],
          )
        ).rows[0].uses === 2,
        'Concurrent aliases lost one of their shared references.',
      )
      const protectedClaims = await execute(
        'service_role',
        'select api.media_gc_claim(50) as value',
        [],
      )
      requireState(
        !protectedClaims.some((entry) => entry.id === ids[3]),
        'GC claimed an image used by concurrently committed aliases.',
      )
      assertions.concurrentAliasesRetainSharedImage = true
      await seed(ids[4], false, 480, 600)
      await bind(aliasPaths[1], ids[4], await aliasVersion(aliasPaths[1]))
      const swapVersions = await Promise.all(aliasPaths.map(aliasVersion))
      const aliasSwaps = await Promise.allSettled([
        track(bind(aliasPaths[0], ids[4], swapVersions[0])),
        track(bind(aliasPaths[1], ids[3], swapVersions[1])),
      ])
      requireState(
        aliasSwaps.every((entry) => entry.status === 'fulfilled'),
        'Reversed alias replacements deadlocked or lost a version.',
      )
      requireState(
        (
          await client.query(
            'select bool_and(retire_after is null) as retained from app.media_assets where id=any($1::uuid[])',
            [[ids[3], ids[4]]],
          )
        ).rows[0].retained === true,
        'An alias replacement retired bytes still in use.',
      )
      assertions.reversedAliasesLockInUuidOrder = true
    }
    result = {
      scope:
        'Disposable loopback PostgreSQL, real migrated RPCs, four independent connections.',
      scenarios: assertions,
    }
  } catch (error) {
    failure = error
  } finally {
    for (const connection of [heldEditor, heldCollector]) {
      if (!connection) continue
      await connection.query('rollback').catch(() => {})
      connection.release()
    }
    await Promise.allSettled([...pending])
    try {
      await client.query('begin')
      for (const original of originals)
        await client.query(
          'update app.site_media_slots set asset_id=$2,alt=$3,version=$4,updated_at=$5 where slot=$1',
          [
            original.slot,
            original.asset_id,
            original.alt,
            original.version,
            original.updated_at,
          ],
        )
      for (const original of originalAliases)
        await client.query(
          'update app.media_builtin_aliases set asset_id=$2,version=$3,updated_at=$4,updated_by=$5 where path=$1',
          [
            original.path,
            original.asset_id,
            original.version,
            original.updated_at,
            original.updated_by,
          ],
        )
      await deleteMediaLibraryFixtureChildren(client, ids)
      await client.query(
        'delete from app.media_renditions where asset_id=any($1::uuid[])',
        [ids],
      )
      await client.query(
        'delete from app.media_assets where id=any($1::uuid[])',
        [ids],
      )
      await client.query(
        'delete from private.admin_memberships where user_id=$1',
        [admin],
      )
      await client.query('delete from auth.users where id=$1', [admin])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      failure ??= error
    } finally {
      await pool.end().catch((error) => {
        failure ??= error
      })
    }
  }
  if (failure) throw failure
  return result
}
