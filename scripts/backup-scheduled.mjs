import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { backupEnvironment } from './backup-development.mjs'
import { restoreDevelopmentBackup } from './restore-development-backup.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
assert.equal(process.platform, 'win32')
assert.equal(process.argv.length, 2, 'scheduled-backup-accepts-no-arguments')
assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0')
process.env.DO_NOT_TRACK = '1'
process.env.WRANGLER_SEND_METRICS = 'false'
const report = {
  scope: 'local-scheduled-protected-backups',
  startedAt: new Date().toISOString(),
  result: 'failed',
  profiles: [],
}
for (const environmentName of ['development', 'production']) {
  const entry = { environmentName, result: 'failed' }
  try {
    const exported = await backupEnvironment({
      confirmed: true,
      environmentName,
    })
    entry.export = exported
    if (exported.result === 'passed') {
      entry.restore = await restoreDevelopmentBackup({
        directory: path.join(root, exported.directory),
        confirmed: true,
      })
      entry.result = entry.restore.result
    }
  } catch {
    entry.error = 'protected-backup-operation-failed'
  }
  report.profiles.push(entry)
}
report.finishedAt = new Date().toISOString()
report.result = report.profiles.every((profile) => profile.result === 'passed')
  ? 'passed'
  : 'failed'
const output = path.join(root, 'artifacts/backup-readiness')
await mkdir(output, { recursive: true })
await writeFile(
  path.join(output, 'latest-scheduled.json'),
  JSON.stringify(report, null, 2) + '\n',
  { mode: 0o600 },
)
process.exitCode = report.result === 'passed' ? 0 : 1
