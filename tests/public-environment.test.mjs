import assert from 'node:assert/strict'
import { test } from 'node:test'
import { privilegedPublicValue } from '../scripts/public-environment.mjs'

const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`

test('build and preflight reject server credentials by name or value without requiring their use in a component', () => {
  for (const [name, value] of [
    ['VITE_ADMIN_PASSWORD', 'synthetic-password'],
    ['VITE_R2_SECRET_ACCESS_KEY', 'synthetic-secret'],
    ['VITE_DATABASE_URL', 'postgresql://synthetic'],
    ['VITE_VAPID_PRIVATE_KEY', 'synthetic-private-key'],
    ['VITE_SETTING', ' sb_secret_synthetic '],
    ['VITE_SETTING', jwt('service_role')],
    ['VITE_SETTING', '-----BEGIN PRIVATE KEY-----synthetic'],
    ['lowercase_private_key', 'synthetic'],
  ])
    assert.equal(privilegedPublicValue(name, value), true, name)
})

test('publishable keys, anon JWT, public VAPID keys and feature flags remain valid', () => {
  for (const [name, value] of [
    ['VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic'],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', jwt('anon')],
    ['VITE_VAPID_PUBLIC_KEY', 'synthetic-public-key'],
    ['VITE_ALLOW_INDEXING', 'false'],
    ['VITE_APP_ENV', 'staging'],
    ['VITE_SETTING', 'eyJmalformed'],
    ['VITE_ADMIN_PASSWORD', ''],
  ])
    assert.equal(privilegedPublicValue(name, value), false, name)
})

test('the actual Vite configuration stops before building when a server password is put in VITE_', async () => {
  const { loadConfigFromFile } = await import('vite')
  const previous = process.env.VITE_ADMIN_PASSWORD
  process.env.VITE_ADMIN_PASSWORD = 'synthetic-must-never-be-emitted'
  try {
    await assert.rejects(
      loadConfigFromFile(
        { command: 'build', mode: 'staging' },
        'vite.config.ts',
      ),
      (error) =>
        error.message ===
        'Las credenciales de servidor no pueden utilizarse en variables VITE_.',
    )
  } finally {
    if (previous === undefined) delete process.env.VITE_ADMIN_PASSWORD
    else process.env.VITE_ADMIN_PASSWORD = previous
  }
})
