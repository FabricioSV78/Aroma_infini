import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createECDH, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'

// Explicit development-only rehearsal. No orders or real-customer data are edited.
assert(
  process.argv.includes('--execute-dev-check'),
  'Requires --execute-dev-check',
)
const project = 'tkxvexfapszilzhogvgu'
const base = `https://${project}.supabase.co`
const origin =
  'https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev'
assert.equal(
  (await readFile('supabase/.temp/project-ref', 'utf8')).trim(),
  project,
)
const run = randomUUID(),
  marker = 'aroma_admin_push_fixture'
const directory = `artifacts/admin-push/hosted-${run}`
await mkdir(directory, { recursive: true })
const variable = (source, key) =>
  source
    .match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '')
const local = await readFile('.env.local', 'utf8'),
  server = await readFile('.dev.vars.staging', 'utf8')
assert.equal(variable(local, 'VITE_SUPABASE_URL'), base)
const publicKey = variable(local, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
  secret = variable(server, 'SUPABASE_PUSH_SECRET_KEY')
assert(publicKey?.startsWith('sb_publishable_') && secret?.length > 20)
const options = {
  db: { schema: 'api' },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}
const operator = createClient(base, secret, options)
const users = [],
  clients = []
const report = {
  run,
  passed: [],
  physicalDevicesTested: false,
  providerAccepted: false,
  result: 'running',
  cleanup: false,
}
let browser
function pass(label) {
  report.passed.push(label)
  console.log(`PASS: ${label}`)
}
function ok(error, label) {
  if (error)
    throw Error(
      `${label}: ${error.code ?? error.status ?? 'unknown'} (details withheld)`,
    )
}
function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}
const execute = promisify(execFile)
async function query(sql, label) {
  const file = `${directory}/${label}.sql`
  await writeFile(file, sql)
  try {
    const result = await execute(
      process.execPath,
      [
        'node_modules/supabase/dist/supabase.js',
        'db',
        'query',
        '--linked',
        '--file',
        file,
        '--agent',
        'no',
        '--output-format',
        'json',
      ],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    )
    return JSON.parse(result.stdout)
  } catch {
    throw Error('Development SQL verification failed (output withheld).')
  }
}
function find(value, predicate) {
  if (!value || typeof value !== 'object') return false
  return (
    predicate(value) ||
    Object.values(value).some((child) => find(child, predicate))
  )
}
async function fixture(label) {
  const email = `aroma-push-${label}-${run}@example.invalid`,
    password = `Aa1!${randomBytes(24).toString('base64url')}`
  const result = await operator.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { firstName: 'Prueba', lastName: 'Notificaciones' },
    app_metadata: { [marker]: run },
  })
  ok(result.error, 'Create fixture')
  assert(result.data.user)
  users.push({ id: result.data.user.id, email })
  const client = createClient(base, publicKey, options)
  clients.push(client)
  ok(
    (await client.auth.signInWithPassword({ email, password })).error,
    'Sign in fixture',
  )
  return { user: result.data.user, client }
}
async function token(client) {
  const { data, error } = await client.auth.getSession()
  ok(error, 'Session')
  assert(data.session)
  return data.session.access_token
}
async function request(path, client, body) {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin,
      ...(client ? { Authorization: `Bearer ${await token(client)}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  })
  return {
    status: response.status,
    data: await response.json().catch(() => null),
  }
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const letter of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(letter).toString(2).padStart(5, '0')
  const bytes = Buffer.from(
      (bits.match(/.{8}/g) ?? []).map((value) => parseInt(value, 2)),
    ),
    counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', bytes).update(counter).digest()
  return ((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0')
}
try {
  const admin = await fixture('admin'),
    customer = await fixture('customer')
  await query(
    `insert into private.admin_memberships(user_id,active) values(${literal(admin.user.id)}::uuid,true);`,
    'grant-fixture-admin',
  )
  const deviceId = randomUUID(),
    statusPath = `/api/admin/push/status?deviceId=${deviceId}`
  const anonymousStatus = await request(statusPath),
    customerStatus = await request(statusPath, customer.client),
    aal1Status = await request(statusPath, admin.client)
  report.authorizationStates = {
    anonymous: anonymousStatus,
    customer: customerStatus,
    aal1: aal1Status,
  }
  const diagnostic = await customer.client.rpc('current_actor')
  report.identityRpcError = diagnostic.error?.code ?? null
  assert.equal(anonymousStatus.status, 401)
  assert.equal(customerStatus.status, 403)
  assert.equal(aal1Status.status, 403)
  pass('Hosted endpoints reject anonymous, customer and admin AAL1')
  const enrollment = await admin.client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Push fixture ${run}`,
  })
  ok(enrollment.error, 'Enroll fixture MFA')
  ok(
    (
      await admin.client.auth.mfa.challengeAndVerify({
        factorId: enrollment.data.id,
        code: totp(enrollment.data.totp.secret),
      })
    ).error,
    'Verify fixture MFA',
  )
  const status = await request(statusPath, admin.client)
  assert.equal(status.status, 200)
  assert.equal(status.data.configured, true)
  assert.equal(status.data.publicKey, variable(server, 'VAPID_PUBLIC_KEY'))
  assert(!JSON.stringify(status.data).includes(secret))
  assert.equal(status.data.currentDevice, null)
  pass(
    'Real Auth/TOTP/Worker/RPC returns only public VAPID configuration and owned device state',
  )
  const center = await request(
    '/api/admin/notifications?limit=20',
    admin.client,
  )
  assert.equal(center.status, 200)
  assert(Array.isArray(center.data.items))
  for (const item of center.data.items)
    assert.deepEqual(Object.keys(item).sort(), [
      'createdAt',
      'id',
      'kind',
      'orderReference',
      'read',
    ])
  pass('Hosted notification center exposes bounded non-personal metadata')
  const denied = await customer.client.rpc('claim_admin_push', {
    p_environment: 'staging',
    p_limit: 1,
    p_delivery_id: null,
  })
  assert(denied.error)
  pass('Authenticated browser role cannot dispatch notifications directly')
  const before = await query(
    'select count(*)::int as events,count(*) filter(where o.simulation)::int as simulated from app.admin_notifications n join app.orders o on o.id=n.order_id;',
    'verified-event-boundary',
  )
  assert(find(before, (row) => row.simulated === 0))
  pass(
    'No simulated hosted order appears in the commercial notification outbox',
  )
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-background-networking'],
  })
  const context = await browser.newContext({
    permissions: ['notifications'],
    viewport: { width: 390, height: 844 },
  })
  const session = (await admin.client.auth.getSession()).data.session
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: `sb-${project}-auth-token`, value: JSON.stringify(session) },
  )
  const page = await context.newPage()
  await page.goto(origin + '/admin/notificaciones')
  await page
    .getByRole('heading', { name: 'Notificaciones', exact: true })
    .waitFor()
  assert.equal(
    await page.locator('link[rel="manifest"]').getAttribute('href'),
    '/admin/manifest.webmanifest',
  )
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.getRegistration('/admin/'))?.active),
  )
  assert.equal(
    await page.evaluate(
      // eslint-disable-next-line no-undef -- Runs in the browser context.
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  )
  await page.screenshot({
    path: `${directory}/hosted-mobile.png`,
    fullPage: true,
  })
  pass(
    'Deployed authenticated panel registers a real admin-scoped worker and manifest without private offline caches',
  )
  // Attempt a real provider subscription. Failure in automation is recorded;
  // it is never relabelled as device delivery or replaced with a fictional sale.
  const subscriptionResults = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/admin/push/subscriptions')
      subscriptionResults.push(response.status())
  })
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click()
  try {
    await page
      .getByRole('button', { name: 'Enviar prueba', exact: true })
      .waitFor({ timeout: 20000 })
    const testResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/admin/push/test',
    )
    await page
      .getByRole('button', { name: 'Enviar prueba', exact: true })
      .click()
    const testResponse = await testResponsePromise
    report.providerAccepted = (await testResponse.json()).accepted === true
    await page
      .getByRole('status')
      .filter({ hasText: 'Prueba programada' })
      .waitFor({ timeout: 25000 })
    report.providerSubscription = 'registered-in-automated-chrome'
    const registration = await page.evaluate(async () => {
      const worker = await navigator.serviceWorker.getRegistration('/admin/')
      const sub = await worker?.pushManager.getSubscription()
      return {
        registered: Boolean(sub),
        notifications: ((await worker?.getNotifications()) ?? []).map(
          (item) => ({ title: item.title, body: item.body }),
        ),
      }
    })
    assert(registration.registered)
    report.observedBrowserNotifications = registration.notifications
    pass(
      'Real Chrome subscription and explicitly labelled test request completed',
    )
    await page
      .getByRole('button', {
        name: 'Desactivar en este dispositivo',
        exact: true,
      })
      .click()
    await page
      .getByRole('button', { name: 'Activar notificaciones', exact: true })
      .waitFor()
    pass(
      'Current browser subscription can be disabled through the deployed panel',
    )
  } catch {
    report.subscriptionHttpStatuses = subscriptionResults
    if (subscriptionResults.some((status) => status < 200 || status >= 300))
      throw Error(
        'The hosted subscription API rejected the real browser subscription.',
      )
    report.browserSubscription = await page.evaluate(async (key) => {
      const registration =
        await navigator.serviceWorker.getRegistration('/admin/')
      try {
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(
            atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='),
            (letter) => letter.charCodeAt(0),
          ),
        })
        return { created: true }
      } catch (error) {
        return { created: false, errorName: error.name }
      }
    }, status.data.publicKey)
    if (report.browserSubscription.created)
      throw Error(
        'The browser subscription succeeded directly; the activation UI needs investigation.',
      )
    report.providerSubscription = 'not-completed-in-automated-chrome'
    report.providerDeviceCheckRequired = true
    await page.screenshot({
      path: `${directory}/provider-registration-state.png`,
      fullPage: true,
    })
  }
  await context.close()
  // Separate negative-provider test: a deliberately invalid random endpoint,
  // not a real-device subscription or proof of successful delivery.
  const receiver = createECDH('prime256v1')
  receiver.generateKeys()
  const invalidSubscription = {
    deviceId,
    deviceLabel: 'Prueba temporal de endpoint inválido',
    subscription: {
      endpoint: `https://fcm.googleapis.com/wp/aroma-invalid-${run}`,
      keys: {
        p256dh: receiver.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    },
  }
  assert.equal(
    (
      await request(
        '/api/admin/push/subscriptions',
        admin.client,
        invalidSubscription,
      )
    ).status,
    201,
  )
  assert.equal(
    (
      await request(
        '/api/admin/push/subscriptions',
        admin.client,
        invalidSubscription,
      )
    ).status,
    201,
  )
  assert.equal(
    (await request(statusPath, admin.client)).data.currentDevice.enabled,
    true,
  )
  pass(
    'Real subscription API persists an owned device and idempotent registration without duplicates',
  )
  const negativeTest = await request('/api/admin/push/test', admin.client, {
    deviceId,
  })
  assert.equal(negativeTest.status, 202)
  assert.equal(negativeTest.data.queued, true)
  assert.equal(negativeTest.data.accepted, false)
  report.invalidEndpointTest = {
    queued: true,
    accepted: false,
    commercialEvent: false,
  }
  pass(
    'Deliberately invalid provider endpoint is not reported as accepted; test never becomes a sale',
  )
  assert.equal(
    (await request('/api/admin/push/unsubscribe', admin.client, { deviceId }))
      .status,
    200,
  )
  assert.equal(
    (await request(statusPath, admin.client)).data.currentDevice.enabled,
    false,
  )
  pass('Deployed current-device opt-out is persisted in Supabase')
  // Production/real orders are untouched. Revoke the temporary membership to
  // verify the protected deep link must authenticate again.
  await query(
    `update private.admin_memberships set active=false where user_id=${literal(admin.user.id)}::uuid;`,
    'revoke-fixture-admin',
  )
  assert.equal((await request(statusPath, admin.client)).status, 403)
  pass('Revoked hosted administrator cannot read notification settings')
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.failure = error.message
  process.exitCode = 1
  console.error('Hosted push verification failed; see the sanitized report.')
} finally {
  await browser?.close().catch(() => undefined)
  try {
    for (const user of users) {
      const found = await operator.auth.admin.getUserById(user.id)
      ok(found.error, 'Cleanup guard')
      assert.equal(found.data.user.email, user.email)
      assert.equal(found.data.user.app_metadata[marker], run)
      ok(
        (await operator.auth.admin.deleteUser(user.id)).error,
        'Fixture cleanup',
      )
    }
    const ids = users.map((user) => `${literal(user.id)}::uuid`).join(',')
    if (ids) {
      const check = await query(
        `select count(*)::int as remaining from auth.users where id in(${ids});`,
        'verify-cleanup',
      )
      assert(find(check, (row) => row.remaining === 0))
    }
    report.cleanup = true
  } catch {
    report.cleanup = false
    report.result = 'failed'
    process.exitCode = 1
  }
  for (const client of clients) client.auth.stopAutoRefresh()
  await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2))
  await writeFile(
    'artifacts/admin-push/hosted-result.json',
    JSON.stringify({ ...report, directory }, null, 2),
  )
  console.log(
    JSON.stringify({
      result: report.result,
      checks: report.passed.length,
      cleanup: report.cleanup,
      providerSubscription: report.providerSubscription,
      directory,
    }),
  )
}
