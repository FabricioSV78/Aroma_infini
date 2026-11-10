import { loadEnv } from 'vite'

export function resolveBuildMode(environment = process.env) {
  if (environment.npm_lifecycle_event?.includes('staging')) return 'staging'
  return environment.NODE_ENV === 'development' ? 'development' : 'production'
}

export async function readSeoEnvironment(
  mode = resolveBuildMode(),
  directory = process.cwd(),
) {
  // Use the same parser, expansion and precedence as Vite. In particular,
  // build:staging must not read .env.production for canonical/robots output.
  // Only public values are needed; never return server credentials.
  const result = loadEnv(mode, directory, 'VITE_')
  const staging = mode === 'staging' || result.VITE_APP_ENV === 'staging'
  if (staging) result.VITE_ALLOW_INDEXING = 'false'
  return result
}
