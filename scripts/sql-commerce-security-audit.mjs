import { randomBytes, randomUUID } from 'node:crypto'

// Called only by the disposable PostgreSQL runner. This module does not open
// connections and has no path to a hosted service or payment provider.
export async function auditCommerceConcurrency({
  client,
  query: executeQuery,
  ids,
  checkout,
  expectLegacyLocks = false,
}) {
  const scope = (
    await client.query(
      "select current_setting('aroma.test_mode',true) as mode,host(inet_server_addr()) as host",
    )
  ).rows[0]
  if (scope.mode !== 'local-fixture' || scope.host !== '127.0.0.1')
    throw new Error(
      'Commerce security scenarios require the disposable loopback fixture.',
    )
  const pendingQueries = new Set()
  function query(...args) {
    const pending = executeQuery(...args)
    pendingQueries.add(pending)
    void pending.then(
      () => pendingQueries.delete(pending),
      () => pendingQueries.delete(pending),
    )
    return pending
  }
  const owners = Array.from({ length: 10 }, () => randomUUID())
  const secondAdmin = randomUUID()
  const second = {
    product: randomUUID(),
    variant: randomUUID(),
    media: randomUUID(),
    upload: randomUUID(),
  }
  const token = () => randomBytes(48).toString('base64url')
  const report = {
    scope:
      'Native PostgreSQL, real migrated RPCs, ten independent pool connections; SQL Auth fixtures, not GoTrue or payments.',
    commercialPurchaseValidated: false,
    scenarios: {},
  }
  const quote = async (lines = checkout.lines) =>
    (
      await client.query(
        "select api.checkout_quote($1::jsonb,'lima','1501','150131','courier') as value",
        [JSON.stringify(lines)],
      )
    ).rows[0].value
  const payload = async (lines = checkout.lines) => ({
    ...checkout,
    lines,
    expectedQuoteHash: (await quote(lines)).quoteHash,
  })
  const create = (
    body,
    owner = owners[0],
    operation = randomUUID(),
    tracking = token(),
  ) =>
    query('select api.create_simulated_order($1,$2,$3::jsonb,$4) as value', [
      operation,
      tracking,
      JSON.stringify(body),
      owner,
    ])
  const state = async () =>
    (
      await client.query(
        'select v.stock,v.price_cents,p.version,p.active from app.product_variants v join app.products p on p.id=v.product_id where v.id=$1',
        [ids.variant],
      )
    ).rows[0]
  const prepare = async (stock) => {
    await client.query('update app.product_variants set stock=$2 where id=$1', [
      ids.variant,
      stock,
    ])
    await client.query(
      'update app.products set active=true,version=version+1 where id=$1',
      [ids.product],
    )
  }
  const requireState = (valid, message) => {
    if (!valid) throw new Error(message)
  }
  const rejectCode = async (operation, code) => {
    try {
      await operation()
    } catch (error) {
      requireState(
        error.code === code,
        `Expected ${code}, received ${error.code}.`,
      )
      return
    }
    throw new Error(`Expected PostgreSQL ${code}, but the operation succeeded.`)
  }
  async function waitForLockWaiters(fragment, minimum) {
    const until = performance.now() + 5000
    while (performance.now() < until) {
      // The control client intentionally holds a transaction open. PostgreSQL
      // retains its first activity snapshot until COMMIT unless explicitly
      // cleared; a first zero would otherwise remain zero throughout this poll.
      await client.query('select pg_stat_clear_snapshot()')
      const count = (
        await client.query(
          "select count(*)::int as total from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like $1",
          [`%${fragment}%`],
        )
      ).rows[0].total
      if (count >= minimum) return count
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(
      `The competing transactions did not reach the lock barrier (${fragment}).`,
    )
  }
  let failure
  try {
    for (const owner of [...owners, secondAdmin])
      await client.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",
        [owner, `security-sql-${owner}@example.invalid`],
      )
    await client.query(
      'insert into private.admin_memberships(user_id,active) values($1,true)',
      [secondAdmin],
    )

    for (const [name, initialStock, customers] of [
      ['A', 1, 2],
      ['B', 5, 10],
    ]) {
      console.log(`Commerce concurrency: scenario ${name}`)
      await prepare(initialStock)
      const body = await payload()
      const start = performance.now()
      const attempts = await Promise.all(
        Array.from({ length: customers }, (_, index) =>
          create(body, owners[index]),
        ),
      )
      const after = await state()
      const orderIds = attempts.map((entry) => entry.order.id)
      const rows = (
        await client.query(
          'select count(*)::int as count,bool_and(simulation and payment_status=$2 and payment_verified_at is null) as simulated from app.orders where id=any($1::uuid[])',
          [orderIds, 'pending'],
        )
      ).rows[0]
      requireState(
        rows.count === customers &&
          rows.simulated &&
          after.stock === initialStock,
        'The simulation changed real inventory or approved a payment.',
      )
      report.scenarios[name] = {
        initialStock,
        distinctCustomers: customers,
        concurrentRequests: customers,
        acceptedPendingSimulations: rows.count,
        committedCommercialUnits: 0,
        finalStock: after.stock,
        negativeStock: after.stock < 0,
        elapsedMs: Math.round(performance.now() - start),
        commercialOversellProtection:
          'BLOCKED: reservation/settlement not implemented; simulations do not commit stock.',
      }
    }

    console.log('Commerce concurrency: scenario C (administrative locks)')
    const beforeC = await state()
    await client.query('begin')
    await client.query('select 1 from app.products where id=$1 for update', [
      ids.product,
    ])
    const competingStocks = Promise.allSettled(
      [10, 20].map((stock, index) =>
        query(
          'select api.admin_set_stock($1,$2,$3) as value',
          [ids.variant, stock, Number(beforeC.version)],
          'authenticated',
          index ? secondAdmin : ids.admin,
        ),
      ),
    )
    const waiting = await waitForLockWaiters('api.admin_set_stock', 2)
    await client.query('commit')
    const outcomes = await competingStocks
    const successes = outcomes.filter((entry) => entry.status === 'fulfilled')
    const conflicts = outcomes.filter(
      (entry) => entry.status === 'rejected' && entry.reason.code === 'PT409',
    )
    const afterC = await state()
    requireState(
      successes.length === 1 &&
        conflicts.length === 1 &&
        Number(afterC.version) === Number(beforeC.version) + 1,
      'Two administrators silently overwrote inventory.',
    )
    report.scenarios.C = {
      distinctAdministrators: 2,
      confirmedConcurrentLockWaiters: waiting,
      writesCommitted: successes.length,
      versionConflicts: conflicts.length,
      finalStock: afterC.stock,
      lostUpdates: false,
    }

    console.log('Commerce concurrency: scenario D (price revalidation)')
    await prepare(5)
    const stale = await payload()
    const document = (
      await client.query('select private.admin_product_document($1) as value', [
        ids.product,
      ])
    ).rows[0].value
    document.product.variants.find(
      (variant) => variant.id === ids.variant,
    ).priceCents = 15000
    const beforeD = await state()
    // Hold a real administrative save open while checkout reaches its SHARE lock.
    await client.query('begin')
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: ids.admin, aal: 'aal2' }),
    ])
    await client.query('set local role authenticated')
    await client.query('select api.admin_save_product($1::jsonb,$2)', [
      JSON.stringify(document),
      Number(beforeD.version),
    ])
    await client.query('reset role')
    const changedPrice = Promise.allSettled([create(stale)])
    const priceWaiters = await waitForLockWaiters(
      'api.create_simulated_order',
      1,
    )
    await client.query('commit')
    const changed = (await changedPrice)[0]
    requireState(
      changed.status === 'rejected' && changed.reason.code === 'PT409',
      'A stale quote was silently accepted after a competing admin price save.',
    )
    const currentQuote = await quote()
    requireState(
      currentQuote.lines[0].unitPriceCents === 15000,
      'A fresh quote did not use the stored server price.',
    )
    const fresh = await payload()
    await rejectCode(
      () =>
        create({ ...fresh, lines: [{ ...fresh.lines[0], unitPriceCents: 1 }] }),
      '22023',
    )
    await rejectCode(() => create({ ...fresh, totalCents: 1 }), '22023')
    await rejectCode(
      () => create({ ...fresh, lines: [{ ...fresh.lines[0], quantity: -1 }] }),
      '22023',
    )
    const beforeZero = await state()
    await query(
      'select api.admin_set_stock($1,0,$2) as value',
      [ids.variant, Number(beforeZero.version)],
      'authenticated',
    )
    await rejectCode(() => create(fresh), '22023')
    requireState(
      (await state()).stock === 0,
      'Checkout accepted exhausted inventory.',
    )
    report.scenarios.D = {
      confirmedConcurrentLockWaiters: priceWaiters,
      stalePriceQuoteRejected: 'PT409',
      currentServerUnitPriceCents: 15000,
      clientPriceRejected: true,
      clientTotalRejected: true,
      negativeQuantityRejected: true,
      exhaustedStockRejected: true,
    }

    await prepare(5)
    const sameBody = await payload(),
      sameOperation = randomUUID(),
      sameToken = token()
    const repeated = await Promise.all(
      Array.from({ length: 10 }, () =>
        create(sameBody, owners[0], sameOperation, sameToken),
      ),
    )
    requireState(
      new Set(repeated.map((entry) => entry.order.id)).size === 1,
      'Double-click retries duplicated orders.',
    )
    await rejectCode(
      () => create(sameBody, owners[1], sameOperation, sameToken),
      '42501',
    )
    await rejectCode(
      () =>
        create(
          {
            ...sameBody,
            contact: { ...sameBody.contact, firstName: 'Changed payload' },
          },
          owners[0],
          sameOperation,
          sameToken,
        ),
      'PT409',
    )
    const interruptedOperation = randomUUID(),
      interruptedToken = token()
    await client.query('begin')
    await client.query('set local role service_role')
    await client.query(
      'select api.create_simulated_order($1,$2,$3::jsonb,$4)',
      [
        interruptedOperation,
        interruptedToken,
        JSON.stringify(sameBody),
        owners[0],
      ],
    )
    await client.query('rollback')
    requireState(
      (
        await client.query(
          'select count(*)::int as count from app.orders where operation_id=$1',
          [interruptedOperation],
        )
      ).rows[0].count === 0,
      'An aborted transaction retained a partial order.',
    )
    const retried = await create(
      sameBody,
      owners[0],
      interruptedOperation,
      interruptedToken,
    )
    const responseLost = await create(
      sameBody,
      owners[0],
      interruptedOperation,
      interruptedToken,
    )
    requireState(
      retried.order.id === responseLost.order.id,
      'A committed response-loss retry duplicated an order.',
    )
    report.scenarios.E = {
      concurrentRetries: 10,
      uniqueOrders: 1,
      otherOwnerRejected: true,
      changedPayloadRejected: true,
      abortedTransactionPartialOrders: 0,
      retryAfterRollback: true,
      retryAfterLostCommittedResponse: true,
      realChargesTested: false,
    }

    // A second, independent image makes cart line order relevant. The delay
    // trigger changes scheduling only: the unchanged RPC takes both real locks.
    await client.query('begin')
    await client.query(
      "insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256) values($1::uuid,'r2','public/dynamic/'||$1::uuid::text||'/'||repeat('b',64)||'/800.webp','image/webp',800,1000,'ready',now(),$2,'product-gallery',2000,repeat('b',64))",
      [second.media, second.upload],
    )
    await client.query(
      'insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key) select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id=$1',
      [second.media],
    )
    await client.query(
      "insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values($1,'SQL security second','sql-security-second',$2,'SQL fixture','SQL fixture',true,'unisex')",
      [second.product, ids.brand],
    )
    await client.query(
      "insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values($1,$2,50,13000,5,true,'SQL-SECURITY-SECOND')",
      [second.variant, second.product],
    )
    await client.query(
      'insert into app.product_images(product_id,position,media_id) values($1,0,$2)',
      [second.product, second.media],
    )
    await client.query(
      `create function public.aroma_security_delay_first_item() returns trigger language plpgsql set search_path='' as $$ begin if new.position=0 then perform pg_catalog.pg_sleep(0.15);end if;return new;end $$`,
    )
    await client.query(
      'create trigger aroma_security_delay_first_item before insert on app.order_items for each row execute function public.aroma_security_delay_first_item()',
    )
    await client.query('commit')
    const twoLines = [
      checkout.lines[0],
      { variantId: second.variant, quantity: 1 },
    ]
    const bodies = await Promise.all([
      payload(twoLines),
      payload([...twoLines].reverse()),
    ])
    const reversed = await Promise.allSettled(
      bodies.map((body, index) => create(body, owners[index])),
    )
    const deadlocks = reversed.filter(
      (entry) => entry.status === 'rejected' && entry.reason.code === '40P01',
    ).length
    const committed = reversed.filter(
      (entry) => entry.status === 'fulfilled',
    ).length
    requireState(
      expectLegacyLocks
        ? deadlocks === 1 && committed === 1
        : deadlocks === 0 && committed === 2,
      `Unexpected reversed-cart locking outcome: committed=${committed}, deadlocks=${deadlocks}.`,
    )
    report.reversedCartImages = {
      distinctCustomers: 2,
      productsPerCart: 2,
      reversedLineOrder: true,
      schedulingOnlyTriggerDelayMs: 150,
      committedPendingSimulations: committed,
      deadlocks,
      expectedLegacyLocks: expectLegacyLocks,
    }
    await client.query(
      'drop trigger aroma_security_delay_first_item on app.order_items',
    )
    await client.query('drop function public.aroma_security_delay_first_item()')
    report.boundedReadMeasurements = []
    for (const [name, sql, parameters] of [
      [
        'catalog-page',
        "select api.catalog_browse('{}'::jsonb,12) as value",
        [],
      ],
      [
        'checkout-quote',
        "select api.checkout_quote($1::jsonb,'lima','1501','150131','courier') as value",
        [JSON.stringify(checkout.lines)],
      ],
    ]) {
      const started = performance.now()
      const responses = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const start = performance.now()
          const value = await query(sql, parameters, 'anon')
          return { value, milliseconds: performance.now() - start }
        }),
      )
      const durations = responses
        .map((entry) => entry.milliseconds)
        .sort((a, b) => a - b)
      requireState(
        responses.every((entry) =>
          name === 'catalog-page'
            ? Array.isArray(entry.value.items) && entry.value.items.length <= 12
            : entry.value.lines[0].unitPriceCents === 15000,
        ),
        'Concurrent read responses changed their data contract.',
      )
      report.boundedReadMeasurements.push({
        name,
        independentConnections: 10,
        requests: 10,
        totalMs: Math.round(performance.now() - started),
        p50Ms: Math.round(durations[4]),
        p95Ms: Math.round(durations[9]),
        rowsPerResponse:
          name === 'catalog-page'
            ? responses[0].value.items.length
            : responses[0].value.lines.length,
        productionCapacityMeasurement: false,
      })
    }
    const final = (
      await client.query(
        'select bool_and(simulation and payment_status=$2 and payment_verified_at is null) as pending,count(*)::int as count from app.orders where user_id=any($1::uuid[])',
        [owners, 'pending'],
      )
    ).rows[0]
    requireState(
      final.pending && (await state()).stock === 5,
      'The SQL exercise approved money or consumed inventory.',
    )
    report.finalInvariants = {
      pendingSimulations: final.count,
      realPayments: 0,
      reservations: 0,
      stock: 5,
      negativeStock: false,
      couponRedemptions: 0,
    }
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
    // Releasing the control lock lets already-started RPCs finish. They must
    // settle before deleting owners/products, including a failed barrier path.
    await Promise.allSettled([...pendingQueries])
    await client.query('begin')
    try {
      await client.query(
        'drop trigger if exists aroma_security_delay_first_item on app.order_items',
      )
      await client.query(
        'drop function if exists public.aroma_security_delay_first_item()',
      )
      await client.query(
        'delete from app.orders where user_id=any($1::uuid[])',
        [owners],
      )
      await client.query('delete from app.products where id=$1', [
        second.product,
      ])
      await client.query('delete from app.media_renditions where asset_id=$1', [
        second.media,
      ])
      await client.query('delete from app.media_assets where id=$1', [
        second.media,
      ])
      await client.query(
        'delete from private.admin_memberships where user_id=$1',
        [secondAdmin],
      )
      await client.query('delete from auth.users where id=any($1::uuid[])', [
        [...owners, secondAdmin],
      ])
      await client.query('commit')
      report.ownFixturesRemoved = true
    } catch (error) {
      await client.query('rollback').catch(() => {})
      report.ownFixturesRemoved = false
      failure ??= error
    }
  }
  if (failure) throw failure
  return report
}
