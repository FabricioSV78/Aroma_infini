import { DEVELOPMENT_SUPABASE_ORIGIN } from '../src/domain/runtime-policy'

interface ReservationEnvironment {
  APP_ENVIRONMENT?: string
  CHECKOUT_SIMULATION_ENABLED?: string
  SUPABASE_URL: string
  SUPABASE_COMMERCE_SECRET_KEY?: string
}

/** Server-scheduled bookkeeping only. Availability excludes expired holds in
 * SQL even if this bounded sweep is delayed or temporarily unavailable. */
export async function expireStockReservations(
  env: ReservationEnvironment,
  transport: typeof fetch = fetch,
): Promise<void> {
  if (
    env.APP_ENVIRONMENT !== 'staging' ||
    env.CHECKOUT_SIMULATION_ENABLED !== 'true' ||
    !env.SUPABASE_COMMERCE_SECRET_KEY
  )
    return
  const base = new URL(env.SUPABASE_URL)
  if (base.origin !== DEVELOPMENT_SUPABASE_ORIGIN)
    throw new Error('Invalid reservation service origin')
  const secret = env.SUPABASE_COMMERCE_SECRET_KEY
  const headers: Record<string, string> = {
    apikey: secret,
    'Content-Type': 'application/json',
    'Content-Profile': 'api',
    'Accept-Profile': 'api',
  }
  if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`
  const response = await transport(
    new URL('/rest/v1/rpc/expire_stock_reservations', base),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_limit: 100 }),
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    },
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Reservation expiry service failed')
  }
  const result: unknown = await response.json()
  if (!Number.isInteger(result) || Number(result) < 0 || Number(result) > 100)
    throw new Error('Invalid reservation expiry result')
}
