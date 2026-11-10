import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = path.resolve('src')

async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(filename)))
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
      files.push(filename)
  }
  return files
}

/** Static runtime imports only: erased types and deferred imports are not cycles. */
function runtimeImports(filename, source) {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  return parsed.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (clause?.isTypeOnly) return []
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly)
      )
        return []
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) return []
      if (
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.every((element) => element.isTypeOnly)
      )
        return []
    } else return []
    return statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : []
  })
}

async function importGraph() {
  const files = await sourceFiles(root)
  const known = new Set(files)
  const graph = new Map()
  for (const filename of files) {
    const edges = []
    for (const specifier of runtimeImports(
      filename,
      await readFile(filename, 'utf8'),
    )) {
      if (!specifier.startsWith('.')) continue
      const target = path.resolve(path.dirname(filename), specifier)
      const resolved = [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        path.join(target, 'index.ts'),
        path.join(target, 'index.tsx'),
      ].find((candidate) => known.has(candidate))
      if (resolved) edges.push(resolved)
    }
    graph.set(filename, edges)
  }
  return graph
}

function label(filename) {
  return path.relative(root, filename).replaceAll(path.sep, '/')
}

test('application runtime modules have no eager circular dependencies', async () => {
  const graph = await importGraph()
  const complete = new Set()
  const stack = []
  function visit(filename) {
    const position = stack.indexOf(filename)
    assert.equal(
      position,
      -1,
      `Runtime cycle: ${[...stack.slice(position), filename].map(label).join(' -> ')}`,
    )
    if (complete.has(filename)) return
    stack.push(filename)
    for (const target of graph.get(filename) ?? []) visit(target)
    stack.pop()
    complete.add(filename)
  }
  for (const filename of graph.keys()) visit(filename)
})

test('domain rules do not initialize application, UI or service modules', async () => {
  for (const [filename, targets] of await importGraph()) {
    if (!label(filename).startsWith('domain/')) continue
    for (const target of targets)
      assert(
        !/^(?:app|components|features|pages|services)\//.test(label(target)),
        `${label(filename)} imports ${label(target)}`,
      )
  }
})

test('service modules do not depend on feature components or UI storage adapters', async () => {
  for (const [filename, targets] of await importGraph()) {
    if (!label(filename).startsWith('services/')) continue
    for (const target of targets)
      assert(
        !/^(?:app|components|features|pages)\//.test(label(target)),
        `${label(filename)} imports ${label(target)}`,
      )
  }
})

test('customer order validation and photo preparation remain independent of admin UI/state', async () => {
  const graph = await importGraph()
  const roots = ['services/order-response.ts', 'services/prepare-image-file.ts']
  for (const entry of roots) {
    const start = path.join(root, entry)
    assert(graph.has(start), `Missing shared module: ${entry}`)
    const seen = new Set()
    function visit(filename) {
      if (seen.has(filename)) return
      seen.add(filename)
      assert(
        !label(filename).startsWith('features/'),
        `${entry} reaches UI module ${label(filename)}`,
      )
      assert.notEqual(
        label(filename),
        'services/admin-service.ts',
        `${entry} initializes the administrative store`,
      )
      for (const target of graph.get(filename) ?? []) visit(target)
    }
    visit(start)
  }
})
