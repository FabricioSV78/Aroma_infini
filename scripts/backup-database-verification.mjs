import assert from 'node:assert/strict'

const schemas = ['api', 'app', 'auth', 'private']
const identifier = (value) => `"${value.replaceAll('"', '""')}"`

/** Content hashes remain inside the encrypted archive. No account values are
 * returned to a console/report. Run this using the very same exported snapshot. */
export async function captureDatabaseState(client) {
  await client.query("set timezone='UTC'")
  const tables = (
    await client.query(
      `select n.nspname as schema,c.relname as name from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) and c.relkind='r' order by n.nspname,c.relname`,
      [schemas],
    )
  ).rows
  assert(tables.length > 0 && tables.length <= 1000)
  const result = []
  for (const table of tables) {
    assert(schemas.includes(table.schema) && /^[a-z0-9_]+$/.test(table.name))
    const row = (
      await client.query(
        `select count(*)::int as rows,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"),'[]'::jsonb)::text) as digest from ${identifier(table.schema)}.${identifier(table.name)} t`,
      )
    ).rows[0]
    assert(
      Number.isSafeInteger(row.rows) &&
        row.rows >= 0 &&
        /^[a-f0-9]{32}$/.test(row.digest),
    )
    result.push({ ...table, ...row })
  }
  return { version: 1, tables: result }
}

export function validateDatabaseState(value) {
  assert(
    value &&
      value.version === 1 &&
      Array.isArray(value.tables) &&
      value.tables.length > 0 &&
      value.tables.length <= 1000,
  )
  const names = new Set()
  for (const table of value.tables) {
    assert(schemas.includes(table.schema) && /^[a-z0-9_]+$/.test(table.name))
    assert(
      Number.isSafeInteger(table.rows) &&
        table.rows >= 0 &&
        /^[a-f0-9]{32}$/.test(table.digest),
    )
    const key = `${table.schema}.${table.name}`
    assert(!names.has(key))
    names.add(key)
  }
  return value
}
