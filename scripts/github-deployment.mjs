import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryName = 'FabricioSV78/Aroma_infini'
const branches = Object.freeze({ staging: 'develop', production: 'main' })

class DeploymentBlocked extends Error {}

function requireCondition(valid, code) {
  if (!valid) throw new DeploymentBlocked(code)
}

/** No credentials, mutable branch checkout or pull-request events are accepted. */
export function validateGithubRequest({
  environment,
  eventName,
  ref,
  sha,
  repository,
  event,
  productionEnabled,
}) {
  requireCondition(Object.hasOwn(branches, environment), 'unknown-environment')
  requireCondition(
    repository === repositoryName &&
      event?.repository?.full_name === repositoryName,
    'unexpected-repository',
  )
  const branch = branches[environment]
  requireCondition(ref === `refs/heads/${branch}`, 'unexpected-branch')
  requireCondition(/^[a-f0-9]{40}$/.test(sha || ''), 'invalid-commit')
  if (environment === 'production') {
    requireCondition(
      eventName === 'workflow_dispatch',
      'manual-release-required',
    )
    requireCondition(productionEnabled === 'true', 'production-disabled')
    requireCondition(
      event.inputs?.confirm === true || event.inputs?.confirm === 'true',
      'production-confirmation-required',
    )
  } else {
    requireCondition(
      ['push', 'workflow_dispatch'].includes(eventName),
      'unsupported-event',
    )
    if (eventName === 'push')
      requireCondition(
        event.after === sha && event.ref === ref && event.deleted !== true,
        'unexpected-push-revision',
      )
  }
  return { environment, branch, sha }
}

function publicKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value || '')) return true
  try {
    return (
      /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) &&
      JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon'
    )
  } catch {
    return false
  }
}

/** Derive public build values from the same config as the Worker, not local files. */
export function deploymentBuildEnvironment({
  environment,
  config,
  publishableKey,
  mapTileUrl = '',
  mapAttribution = '',
}) {
  requireCondition(Object.hasOwn(branches, environment), 'unknown-environment')
  const selected = config.env?.[environment]
  const other =
    config.env?.[environment === 'staging' ? 'production' : 'staging']
  const vars = selected?.vars
  requireCondition(
    vars?.APP_ENVIRONMENT === environment &&
      selected.name === `aroma-infini-frontend-${environment}` &&
      selected.name !== other?.name,
    'worker-environment-mismatch',
  )
  requireCondition(
    /^https:\/\/[a-z]{20}\.supabase\.co$/.test(vars.SUPABASE_URL || '') &&
      vars.SUPABASE_URL !== other?.vars?.SUPABASE_URL,
    'database-environment-mismatch',
  )
  requireCondition(publicKey(publishableKey), 'missing-or-invalid-public-key')
  // JWT anon keys expose their project ref; verify it when the format permits.
  // New publishable keys are opaque and require the hosted smoke test as well.
  if (publishableKey.startsWith('eyJ')) {
    const claims = JSON.parse(
      Buffer.from(publishableKey.split('.')[1], 'base64url'),
    )
    requireCondition(
      !claims.ref || vars.SUPABASE_URL === `https://${claims.ref}.supabase.co`,
      'public-key-project-mismatch',
    )
  }
  const buckets = selected.r2_buckets || []
  requireCondition(
    buckets.some(
      (bucket) =>
        bucket.binding === 'MEDIA_BUCKET' &&
        bucket.bucket_name ===
          `aroma-infini-media-${environment === 'staging' ? 'dev' : 'prod'}` &&
        !(other?.r2_buckets || []).some(
          (entry) => entry.bucket_name === bucket.bucket_name,
        ),
    ),
    'media-environment-mismatch',
  )
  requireCondition(
    vars.SEO_ALLOW_INDEXING === 'false' &&
      ['false', 'true'].includes(vars.SEO_CATALOG_IS_REAL),
    'indexing-not-approved',
  )
  if (environment === 'production') {
    // Preparing CI is not authorization for a public/commercial launch.
    // Review this explicit gate together with production:check when the final
    // domain and the real payment integration are approved.
    requireCondition(
      selected.workers_dev === false &&
        selected.preview_urls === false &&
        (selected.routes || []).length === 0 &&
        vars.CHECKOUT_SIMULATION_ENABLED === 'false' &&
        !vars.CHECKOUT_SIMULATION_ORIGIN &&
        vars.ADMIN_PUSH_ENABLED === 'false',
      'production-must-remain-closed',
    )
  } else {
    requireCondition(
      vars.CHECKOUT_SIMULATION_ENABLED === 'true' &&
        vars.CHECKOUT_SIMULATION_ORIGIN ===
          'https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev',
      'staging-origin-mismatch',
    )
  }
  const values = {
    VITE_APP_ENV: environment,
    VITE_CATALOG_SOURCE: 'supabase',
    VITE_SUPABASE_URL: vars.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_MEDIA_API_BASE_URL: '',
    VITE_MEDIA_BASE_URL: '',
    VITE_SITE_URL: vars.SEO_SITE_URL || '',
    VITE_ALLOW_INDEXING: 'false',
    VITE_CATALOG_IS_REAL: vars.SEO_CATALOG_IS_REAL,
    VITE_ADDRESS_MAP_TILE_URL: mapTileUrl,
    VITE_ADDRESS_MAP_ATTRIBUTION: mapAttribution,
  }
  requireCondition(
    Object.values(values).every(
      (value) => typeof value === 'string' && !/[\r\n\0]/.test(value),
    ),
    'invalid-public-setting',
  )
  return values
}

/** Avoid publishing a completed old run after a newer commit reached its branch. */
export async function requireCurrentBranch({
  repository,
  branch,
  sha,
  token,
  fetchImpl = fetch,
}) {
  requireCondition(
    repository === repositoryName &&
      Object.values(branches).includes(branch) &&
      /^[a-f0-9]{40}$/.test(sha || '') &&
      typeof token === 'string' &&
      token.length > 0,
    'invalid-revision-check',
  )
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/git/ref/heads/${branch}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'aroma-infini-deployment',
        'Cache-Control': 'no-cache',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    },
  )
  requireCondition(response.ok, 'github-revision-unavailable')
  const current = await response.json()
  requireCondition(
    current.ref === `refs/heads/${branch}` &&
      current.object?.type === 'commit' &&
      current.object?.sha === sha,
    'branch-advanced-rerun-latest',
  )
}

async function requestFromRunner(environment) {
  requireCondition(
    process.env.GITHUB_ACTIONS === 'true',
    'github-runner-required',
  )
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'),
  )
  return validateGithubRequest({
    environment,
    event,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    repository: process.env.GITHUB_REPOSITORY,
    productionEnabled: process.env.PRODUCTION_DEPLOY_ENABLED,
  })
}

async function main() {
  const [action, environment, ...extra] = process.argv.slice(2)
  requireCondition(
    extra.length === 0 &&
      ['request', 'configure', 'check-head', 'credentials', 'summary'].includes(
        action,
      ),
    'unsupported-deployment-command',
  )
  const request = await requestFromRunner(environment)
  if (action === 'configure') {
    // Loaded only after npm ci; the authorization job needs no dependencies.
    const { default: ts } = await import('typescript')
    const parsed = ts.parseConfigFileTextToJson(
      'wrangler.jsonc',
      await readFile('wrangler.jsonc', 'utf8'),
    )
    requireCondition(!parsed.error, 'invalid-worker-configuration')
    const values = deploymentBuildEnvironment({
      environment,
      config: parsed.config,
      publishableKey: process.env.DEPLOY_SUPABASE_PUBLISHABLE_KEY,
      mapTileUrl: process.env.DEPLOY_ADDRESS_MAP_TILE_URL || '',
      mapAttribution: process.env.DEPLOY_ADDRESS_MAP_ATTRIBUTION || '',
    })
    requireCondition(
      Boolean(process.env.GITHUB_ENV),
      'github-environment-file-required',
    )
    await appendFile(
      process.env.GITHUB_ENV,
      Object.entries(values)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(''),
    )
  } else if (action === 'check-head') {
    await requireCurrentBranch({
      ...request,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    })
  } else if (action === 'credentials') {
    requireCondition(
      /^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID || '') &&
        Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()),
      'missing-cloudflare-deployment-credentials',
    )
  } else if (action === 'summary') {
    requireCondition(
      Boolean(process.env.GITHUB_STEP_SUMMARY),
      'summary-file-required',
    )
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Worker **${environment}** desplegado desde el commit [${request.sha}](https://github.com/${repositoryName}/commit/${request.sha}).\n\n` +
        (environment === 'staging'
          ? 'Comprobación alojada de solo lectura completada. No sustituye pruebas manuales ni certifica pagos reales.\n'
          : 'Producción cerrada: sin dominio, rutas públicas, indexación, pagos ni push habilitados. Este job no prueba el servicio alojado ni modifica SQL, Auth o R2.\n'),
    )
  }
  console.log(`Deployment ${action}: passed (${environment}).`)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main()
  } catch (error) {
    // No stack, payload, URLs, keys or fetch responses enter deployment logs.
    console.error(
      `Deployment blocked: ${error instanceof DeploymentBlocked ? error.message : 'deployment-validation-failed'}.`,
    )
    process.exitCode = 1
  }
}
