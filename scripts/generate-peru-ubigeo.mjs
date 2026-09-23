import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [, , inputArg, outputArg = 'src/data/peru-ubigeo.json'] = process.argv

if (!inputArg) {
  throw new Error(
    'Uso: node scripts/generate-peru-ubigeo.mjs <archivo.csv> [salida.json]',
  )
}

const connectors = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el'])
const exactLabels = new Map([
  ['ANCASH', 'Áncash'],
  ['APURIMAC', 'Apurímac'],
  ['HUANUCO', 'Huánuco'],
  ['JUNIN', 'Junín'],
  ['SAN MARTIN', 'San Martín'],
])

function displayName(raw) {
  if (exactLabels.has(raw)) return exactLabels.get(raw)
  return raw
    .toLocaleLowerCase('es-PE')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && connectors.has(word)
        ? word
        : `${word.slice(0, 1).toLocaleUpperCase('es-PE')}${word.slice(1)}`,
    )
    .join(' ')
}

function slugify(raw) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const source = await readFile(resolve(inputArg), 'latin1')
const lines = source
  .replace(/^\uFEFF/, '')
  .trim()
  .split(/\r?\n/)
const departments = new Map()

for (const line of lines.slice(1)) {
  const [districtCode, departmentName, provinceName, districtName] =
    line.split(';')
  if (!/^\d{6}$/.test(districtCode)) continue
  const departmentCode = districtCode.slice(0, 2)
  const provinceCode = districtCode.slice(0, 4)
  let department = departments.get(departmentCode)
  if (!department) {
    department = {
      code: departmentCode,
      value: slugify(departmentName),
      label: displayName(departmentName),
      provinces: new Map(),
    }
    departments.set(departmentCode, department)
  }
  let province = department.provinces.get(provinceCode)
  if (!province) {
    province = {
      code: provinceCode,
      label: displayName(provinceName),
      districts: [],
    }
    department.provinces.set(provinceCode, province)
  }
  province.districts.push({
    code: districtCode,
    label: displayName(districtName),
  })
}

const data = {
  source:
    'Instituto Nacional de Estadística e Informática (INEI), UBIGEOS 2022 — 1,891 distritos',
  sourceUrl:
    'https://www.inei.gob.pe/media/DATOS_ABIERTOS/UBIGEOS/UBIGEOS_2022_1891_distritos.zip',
  license: 'Open Data Commons Open Database License (ODbL)',
  departments: [...departments.values()].map((department) => ({
    ...department,
    provinces: [...department.provinces.values()],
  })),
}

await writeFile(resolve(outputArg), `${JSON.stringify(data)}\n`, 'utf8')

const provinces = data.departments.reduce(
  (total, department) => total + department.provinces.length,
  0,
)
const districts = data.departments.reduce(
  (total, department) =>
    total +
    department.provinces.reduce(
      (provinceTotal, province) => provinceTotal + province.districts.length,
      0,
    ),
  0,
)

console.log(
  `Ubigeo generado: ${data.departments.length} departamentos, ${provinces} provincias, ${districts} distritos.`,
)
