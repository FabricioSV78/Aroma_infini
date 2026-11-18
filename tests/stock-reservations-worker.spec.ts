import { expect, test } from '@playwright/test'
import { expireStockReservations } from '../worker/stock-reservations'

const env = {
  APP_ENVIRONMENT: 'staging',
  CHECKOUT_SIMULATION_ENABLED: 'true',
  SUPABASE_URL: 'https://tkxvexfapszilzhogvgu.supabase.co',
  SUPABASE_COMMERCE_SECRET_KEY: 'sb_secret_test-only',
}
test('reservation expiry runs only in enabled staging, using a bounded server RPC', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json(7)
  }
  await expireStockReservations({ ...env, APP_ENVIRONMENT: 'production' }, transport)
  await expireStockReservations({ ...env, CHECKOUT_SIMULATION_ENABLED: 'false' }, transport)
  await expireStockReservations({ ...env, SUPABASE_COMMERCE_SECRET_KEY: undefined }, transport)
  expect(calls).toHaveLength(0)
  await expireStockReservations(env, transport)
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe(env.SUPABASE_URL + '/rest/v1/rpc/expire_stock_reservations')
  expect(calls[0].init?.body).toBe('{"p_limit":100}')
  expect(calls[0].init?.redirect).toBe('manual')
  expect(calls[0].init?.headers).not.toHaveProperty('Authorization')
})
test('reservation expiry does not hide service errors or retry a failed sweep', async () => {
  let calls = 0
  await expect(expireStockReservations(env, async () => {
    calls++
    return new Response('not authorized', { status: 403 })
  })).rejects.toThrow('Reservation expiry service failed')
  expect(calls).toBe(1)
  await expect(expireStockReservations({ ...env, SUPABASE_URL: 'https://anotherproject.supabase.co' }, async () => {
    throw new Error('Must never contact another project')
  })).rejects.toThrow('Invalid reservation service origin')
  await expect(expireStockReservations(env, async () => Response.json(101)))
    .rejects.toThrow('Invalid reservation expiry result')
})
