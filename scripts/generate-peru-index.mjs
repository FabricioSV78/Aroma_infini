import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const source = JSON.parse(
  await readFile(
    new URL('../src/data/peru-ubigeo.json', import.meta.url),
    'utf8',
  ),
)
export function compactPeruIndex(data) {
  return data.departments.map(({ value, label, provinces }) => ({
    value,
    label,
    provinces: provinces.map(({ code, label, districts }) => {
      if (
        !/^\d{4}$/.test(code) ||
        !districts.every(
          (d) => /^\d{6}$/.test(d.code) && d.code.startsWith(code),
        )
      )
        throw new Error(
          'The ubigeo index cannot represent this source hierarchy.',
        )
      return {
        code,
        label,
        districts: districts.map((d) => d.code.slice(4)).join(','),
      }
    }),
  }))
}
const target = new URL('../src/data/peru-location-index.json', import.meta.url)
const result = JSON.stringify(compactPeruIndex(source)) + '\n'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    if (
      JSON.stringify(JSON.parse(await readFile(target, 'utf8'))) !==
      JSON.stringify(JSON.parse(result))
    )
      throw new Error(
        'The location index is stale. Run node scripts/generate-peru-index.mjs.',
      )
  } else await writeFile(target, result)
}
