import { createECDH } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Deliberate operator command. Secrets travel only through stdin, never argv or
// console output. Existing VAPID keys are reused: rotation invalidates opt-ins.
const environment = process.argv[process.argv.indexOf('--env') + 1]
if (
  !['staging', 'production'].includes(environment) ||
  !process.argv.includes(`--confirm-${environment}`)
)
  throw new Error(
    'Indica --env staging --confirm-staging o --env production --confirm-production.',
  )
const expectedAccount = '31e2c008e7876f8a1e5c0fc083fef6ee'
const expectedProject =
  environment === 'staging' ? 'tkxvexfapszilzhogvgu' : 'ogpfhhucnaldgxyqajkc'
const serverFile = `.dev.vars.${environment}`
const cli = path.resolve('node_modules/wrangler/bin/wrangler.js')
function command(args, input) {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      input,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: 'false',
        CLOUDFLARE_ACCOUNT_ID: expectedAccount,
        DO_NOT_TRACK: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(
      'No se pudo completar la configuración en Cloudflare. Verifica el login y el entorno. No se imprimieron secretos.',
    )
  }
}
async function variables(filename) {
  const result = {}
  const source = await readFile(filename, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) result[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return result
}
const specific = await variables(serverFile)
// Production never inherits development service credentials.
const existing =
  environment === 'staging'
    ? { ...(await variables('.dev.vars')), ...specific }
    : specific
const browser = await variables(
  environment === 'staging' ? '.env.local' : '.env.production.local',
)
if (
  new URL(browser.VITE_SUPABASE_URL || 'https://invalid.local').hostname !==
  `${expectedProject}.supabase.co`
)
  throw new Error(
    'El archivo público no corresponde al proyecto Supabase del entorno elegido.',
  )
let service =
  existing.SUPABASE_PUSH_SECRET_KEY || existing.SUPABASE_COMMERCE_SECRET_KEY
if (!service && environment === 'production') {
  // Reuse the correct project's existing server key through the authenticated
  // operator CLI. Capture it only in memory; never print the command output.
  try {
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/supabase/dist/supabase.js',
        'projects',
        'api-keys',
        '--project-ref',
        expectedProject,
        '--reveal',
        '--agent',
        'no',
        '--output',
        'json',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, DO_NOT_TRACK: '1' },
      },
    )
    const rows = JSON.parse(output)
    service = rows.find((row) => row.type === 'secret')?.api_key
    if (
      rows.find((row) => row.type === 'publishable')?.api_key !==
      browser.VITE_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error('Project public key mismatch')
  } catch {
    throw new Error(
      'No pudimos verificar la clave del proyecto de producción. No se modificaron secretos.',
    )
  }
}
if (
  !service ||
  !(service.startsWith('sb_secret_') || service.startsWith('eyJ'))
)
  throw new Error(
    `Configura una clave de servidor en ${serverFile}; nunca en VITE_ ni en el chat.`,
  )
if (!command(['whoami', '--json']).includes(expectedAccount))
  throw new Error('La cuenta Cloudflare no coincide con Aroma Infini.')
let publicKey = existing.VAPID_PUBLIC_KEY,
  privateKey = existing.VAPID_PRIVATE_KEY
if (Boolean(publicKey) !== Boolean(privateKey))
  throw new Error(
    'La pareja VAPID está incompleta. Corrígela antes de continuar.',
  )
if (!publicKey) {
  const pair = createECDH('prime256v1')
  pair.generateKeys()
  publicKey = pair.getPublicKey().toString('base64url')
  privateKey = pair.getPrivateKey().toString('base64url')
}
const verify = createECDH('prime256v1')
verify.setPrivateKey(Buffer.from(privateKey, 'base64url'))
if (verify.getPublicKey().toString('base64url') !== publicKey)
  throw new Error('La pareja VAPID no coincide.')
const secrets = {
  SUPABASE_PUBLISHABLE_KEY: browser.VITE_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_PUSH_SECRET_KEY: service,
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT: 'mailto:aromainfiniweb@gmail.com',
}
// This filename is ignored by Git. Save before uploading so an interrupted
// operation can retry with the same key instead of silently rotating it.
const local = { ...existing, ...secrets }
await writeFile(
  serverFile,
  Object.entries(local)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
  { mode: 0o600 },
)
command(['secret', 'bulk', '--env', environment], JSON.stringify(secrets))
console.log(
  JSON.stringify({
    environment,
    configuredSecrets: Object.keys(secrets),
    serverFile,
    privateValuesPrinted: false,
  }),
)
