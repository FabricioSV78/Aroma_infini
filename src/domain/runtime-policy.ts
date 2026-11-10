export type RuntimeEnvironment =
  'development' | 'staging' | 'production' | 'test'
export const DEVELOPMENT_SUPABASE_ORIGIN =
  'https://tkxvexfapszilzhogvgu.supabase.co'
export const STAGING_ORIGIN =
  'https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev'

/** Unknown/missing deployment declarations fail closed in built applications. */
export function resolveRuntimeEnvironment(
  requested: string | undefined,
  mode: string,
  development: boolean,
): RuntimeEnvironment {
  if (requested === 'production') return 'production'
  if (requested === 'staging') return 'staging'
  if (development && (requested === 'development' || requested === 'test'))
    return requested
  if (development) return 'development'
  if (mode === 'test') return 'test'
  return mode === 'staging' ? 'staging' : 'production'
}
export function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
  } catch {
    return false
  }
}
export function permitsCheckoutSimulation(
  environment: string | undefined,
  origin: string,
  declaredOrigin: string | undefined,
  enabled: string | undefined,
  supabaseOrigin: string | undefined,
) {
  if (enabled !== 'true' || supabaseOrigin !== DEVELOPMENT_SUPABASE_ORIGIN)
    return false
  if (environment === 'development') return isLoopbackOrigin(origin)
  return (
    environment === 'staging' &&
    origin === STAGING_ORIGIN &&
    declaredOrigin === STAGING_ORIGIN
  )
}
