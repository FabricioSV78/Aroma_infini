import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

function valuesOfProperty(source, name) {
  const result = []
  const parsed = ts.createSourceFile('config.ts', source, ts.ScriptTarget.Latest, true)
  function strings(node) {
    if (ts.isStringLiteralLike(node)) result.push(node.text)
    else ts.forEachChild(node, strings)
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === name) strings(node.initializer)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return result
}

test('real-SDK browser contracts never run against the generic local-fixture server', async () => {
  const configuration = await readFile('playwright.config.ts', 'utf8')
  const ignored = new Set(valuesOfProperty(configuration, 'testIgnore').map((pattern) => pattern.split('/').at(-1)))
  const configurations = (await readdir('.')).filter((name) => /^playwright\..+\.config\.ts$/.test(name))
  const dedicated = new Map()
  for (const name of configurations) {
    for (const match of valuesOfProperty(await readFile(name, 'utf8'), 'testMatch')) dedicated.set(match, name)
  }
  const specs = (await readdir('tests')).filter((name) => name.endsWith('.spec.ts'))
  const sdkSpecs = []
  for (const name of specs) {
    if (!/from\s+['"]\.\/supabase-auth-fixture['"]/.test(await readFile(`tests/${name}`, 'utf8'))) continue
    sdkSpecs.push(name)
    assert(ignored.has(name), `${name} must use its isolated SDK configuration, not the developer's local environment`)
    assert(dedicated.has(name), `${name} must remain covered by an explicit dedicated Playwright configuration`)
  }
  assert(sdkSpecs.length >= 18, 'Expected the current SDK contract inventory')
  assert.equal(dedicated.get('admin-notifications.spec.ts'), 'playwright.admin-notifications.config.ts')
})

test('the generic browser server overrides live project and media settings explicitly', async () => {
  const source = ts.createSourceFile('playwright.config.ts', await readFile('playwright.config.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const environment = {}
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text.startsWith('VITE_') && ts.isStringLiteralLike(node.initializer))
      environment[node.name.text] = node.initializer.text
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(environment.VITE_APP_ENV, 'development')
  assert.equal(environment.VITE_CATALOG_SOURCE, 'local')
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_MEDIA_API_BASE_URL']) assert.equal(environment[key], '', `${key} must not inherit .env.local`)
})
