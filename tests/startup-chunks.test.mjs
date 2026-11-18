import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyPublicStartup } from '../scripts/startup-chunks.ts'

function chunk(name, modules = {}, imports = [], dynamicImports = []) {
  return {
    type: 'chunk',
    fileName: name,
    isEntry: name === 'index.js',
    facadeModuleId: name === 'index.js' ? 'C:/workspace/index.html' : null,
    modules,
    imports,
    dynamicImports,
  }
}
function output(extra = {}) {
  return {
    'index.js': chunk('index.js', {}, ['startup.js']),
    'startup.js': chunk(
      'startup.js',
      {
        'C:/workspace/src/services/admin-runtime.ts': { renderedLength: 800 },
      },
      [],
      ['admin.js'],
    ),
    'admin.js': chunk('admin.js', {
      'C:/workspace/src/services/admin-service.ts': { renderedLength: 40000 },
    }),
    ...extra,
  }
}

test('the SDK stays available dynamically without blocking public React startup', () => {
  const sdk = chunk('sdk.js', {
    'C:/workspace/node_modules/@supabase/supabase-js/dist/index.mjs': {
      renderedLength: 100,
    },
  })
  assert.equal(verifyPublicStartup(output({ 'sdk.js': sdk })), 2)
  assert.throws(
    () => verifyPublicStartup(output({
      'startup.js': chunk('startup.js', {}, ['sdk.js']),
      'sdk.js': sdk,
    })),
    /Supabase SDK entered/,
  )
})

test('the real build guard traverses startup imports without pulling lazy administration', () => {
  assert.equal(verifyPublicStartup(output()), 2)
})
test('a merged private module is rejected even when its chunk has a public name', () => {
  assert.throws(
    () =>
      verifyPublicStartup(
        output({
          'startup.js': chunk('startup.js', {
            'C:\\workspace\\src\\features\\admin\\AdminNoticeProvider.tsx': {
              renderedLength: 3000,
            },
          }),
        }),
      ),
    /Administrative code/,
  )
})
test('a removed re-export contains no private runtime code', () => {
  assert.equal(
    verifyPublicStartup(
      output({
        'startup.js': chunk('startup.js', {
          'C:/workspace/src/services/admin-messages.ts': { renderedLength: 0 },
        }),
      }),
    ),
    2,
  )
})

test('the full district-label data stays outside the initial public graph', () => {
  assert.throws(
    () =>
      verifyPublicStartup(
        output({
          'startup.js': chunk('startup.js', {
            'C:/workspace/src/data/peru-ubigeo.json': {
              renderedLength: 143656,
            },
          }),
        }),
      ),
    /Deferred location/,
  )
})
test('a missing entry or dependency cannot produce a false successful inventory', () => {
  assert.throws(() => verifyPublicStartup({}), /entry/)
  assert.throws(
    () =>
      verifyPublicStartup(
        output({ 'startup.js': chunk('startup.js', {}, ['missing.js']) }),
      ),
    /dependency/,
  )
})
