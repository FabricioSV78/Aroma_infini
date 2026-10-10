import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

function parseEnv(source) {
  const values = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    values[key] = value
  }
  return values
}

export async function readSeoEnvironment() {
  const mode =
    process.env.NODE_ENV === 'development' ? 'development' : 'production'
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const values = {}
  for (const file of files) {
    if (!existsSync(file)) continue
    Object.assign(values, parseEnv(await readFile(file, 'utf8')))
  }
  return { ...values, ...process.env }
}
