import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  isolatedTestEnvironment,
  selectIsolatedSuites,
} from './isolated-test-plan.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
if (args.filter((argument) => !argument.startsWith('--')).length > 1)
  throw new Error('Select one isolated test group at a time.')
const group = args.find((argument) => !argument.startsWith('--')) ?? 'all'
if (args.some((argument) => argument.startsWith('--') && argument !== '--list'))
  throw new Error('Only --list is supported; test commands cannot be injected.')
const suites = selectIsolatedSuites(group)
const nodeTests =
  group === 'node' || group === 'all'
    ? (await readdir(new URL('../tests/', import.meta.url)))
        .filter((name) => name.endsWith('.test.mjs'))
        .sort()
        .map((name) => `tests/${name}`)
    : []
if (args.includes('--list')) {
  console.log(JSON.stringify({ group, nodeTests, suites }, null, 2))
} else {
  const environment = isolatedTestEnvironment()
  async function execute(arguments_) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, arguments_, {
        cwd: root,
        env: environment,
        windowsHide: true,
        stdio: 'inherit',
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(`Isolated tests failed (${signal ?? code}).`))
      })
    })
  }
  if (nodeTests.length)
    await execute(['--experimental-strip-types', '--test', ...nodeTests])
  // Configurations share fixture ports. Sequential execution is intentional.
  for (const suite of suites) {
    console.log(`\nIsolated suite: ${suite}`)
    await execute([
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      suite,
      // The broad legacy suite starts many complete app/browser contexts.
      // Bound local CPU/memory rather than inheriting half of a large host's
      // CPUs. Dedicated configurations retain their own concurrency limits.
      ...(suite === 'playwright.config.ts' ? ['--workers', '2'] : []),
    ])
  }
}
