import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

test('SQL checkouts preserve the LF source required by guarded function patches', async () => {
  const files = []
  for (const directory of [
    'supabase/migrations',
    'supabase/tests',
    'supabase/audit',
  ]) {
    for (const entry of await readdir(directory, { recursive: true })) {
      if (entry.endsWith('.sql'))
        files.push(path.join(directory, entry).replaceAll(path.sep, '/'))
    }
  }
  assert(files.length > 0)
  const execute = promisify(execFile)
  const { stdout } = await execute(
    'git',
    ['check-attr', '-z', 'text', 'eol', '--', ...files],
    { windowsHide: true },
  )
  const attributes = stdout.split('\0')
  assert.equal(attributes.pop(), '')
  assert.equal(attributes.length, files.length * 6)
  for (let index = 0; index < attributes.length; index += 3) {
    const [filename, attribute, value] = attributes.slice(index, index + 3)
    assert.equal(
      value,
      attribute === 'text' ? 'set' : 'lf',
      `${filename}: ${attribute}`,
    )
  }
  for (const filename of files) {
    const source = await readFile(filename, 'utf8')
    assert(
      !source.includes('\r'),
      `${filename}: SQL must use LF; refresh the checkout with its .gitattributes policy`,
    )
  }
})
