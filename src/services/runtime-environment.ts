import {
  isLoopbackOrigin,
  resolveRuntimeEnvironment,
  STAGING_ORIGIN,
} from '../domain/runtime-policy'

const mode = import.meta.env?.MODE ?? 'test'
const development = import.meta.env?.DEV ?? mode === 'test'
export const runtimeEnvironment = resolveRuntimeEnvironment(
  import.meta.env?.VITE_APP_ENV,
  mode,
  development,
)
export const isProductionEnvironment = runtimeEnvironment === 'production'
export const canUseLocalFixtures =
  development &&
  ['development', 'test'].includes(runtimeEnvironment) &&
  (import.meta.env?.VITE_CATALOG_SOURCE === 'local' ||
    (!import.meta.env?.VITE_CATALOG_SOURCE &&
      !import.meta.env?.VITE_SUPABASE_URL))
const origin = typeof window === 'undefined' ? '' : window.location.origin
export const canSimulateCheckout = ['development', 'test'].includes(
  runtimeEnvironment,
)
  ? typeof window === 'undefined' || isLoopbackOrigin(origin)
  : runtimeEnvironment === 'staging' && origin === STAGING_ORIGIN
