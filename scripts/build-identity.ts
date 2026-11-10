import { createHash } from 'node:crypto'

export interface BuildTarget {
  version: 1
  mode: string
  environment: string
  configurationHash: string
}

/** Only a digest leaves the build process; never serialize environment values. */
export function createBuildTarget(
  mode: string,
  environment: Record<string, string | undefined>,
): BuildTarget {
  const effective =
    environment.VITE_APP_ENV ||
    (mode === 'staging'
      ? 'staging'
      : mode === 'development'
        ? 'development'
        : 'production')
  const values = Object.entries({ ...environment, VITE_APP_ENV: effective })
    .filter(([key]) => key.startsWith('VITE_'))
    .map(([key, value]) => [key, value ?? ''])
    .sort(([first], [second]) => first.localeCompare(second, 'en'))
  return {
    version: 1,
    mode,
    environment: effective,
    configurationHash: createHash('sha256')
      .update(JSON.stringify(values))
      .digest('hex'),
  }
}
