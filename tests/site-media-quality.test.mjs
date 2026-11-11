import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('all nine site-image minimum dimensions share the same UI and SQL contract', async () => {
  const [domain, migration] = await Promise.all([
    readFile(
      new URL('../src/domain/site-media-slots.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20261111000200_media_library.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  ])
  const table = domain.match(
    /export const SITE_MEDIA_MINIMUM_DIMENSIONS\s*=\s*\{([\s\S]*?)\}\s*as const/,
  )?.[1]
  const boundary = migration.match(
    /create function private\.site_image_compatible\([\s\S]*?\$\$;/,
  )?.[0]
  assert(table, 'The domain must expose its single placement-resolution table')
  assert(
    boundary,
    'The database must enforce the corresponding placement boundary',
  )
  // Derive both CSV tables from their real source, without duplicating a third
  // list of dimensions. SQL execution tests verify each one-pixel boundary.
  const uiRows = [
    ...table.matchAll(
      /'([^']+)'\s*:\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*,?\s*\}/g,
    ),
  ].map((match) => match.slice(1).join(','))
  const sqlRows = [
    ...boundary.matchAll(
      /when\s+'([^']+)'\s+then\s+p_width\s*>=\s*(\d+)\s+and\s+p_height\s*>=\s*(\d+)/g,
    ),
  ].map((match) => match.slice(1).join(','))
  assert.equal(uiRows.length, 9)
  assert.equal(sqlRows.length, 9)
  assert.equal(uiRows.sort().join('\n'), sqlRows.sort().join('\n'))
  assert.match(
    boundary,
    /when p_mime='image\/svg\+xml' then p_slot='identity\.logo'/,
  )
})
