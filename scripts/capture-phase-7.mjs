import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Capture the current account-access interfaces. The retired demo activation
// is deliberately unavailable; authorized account states belong in test fixtures.
const cli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
)
const result = spawnSync(
  process.execPath,
  [
    cli,
    'test',
    'tests/auth-interfaces.spec.ts',
    '--grep',
    'interfaces completas',
    '--workers=1',
  ],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  },
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
