import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compactPeruIndex } from '../scripts/generate-peru-index.mjs'
import {
  isValidPeruLocation,
  getPeruProvinceOptions,
  getPeruDepartmentLabel,
  peruUbigeoSummary,
  isCoveredDeliveryLocation,
} from '../src/content/peru-core.ts'
const data = JSON.parse(
  await readFile(
    new URL('../src/data/peru-ubigeo.json', import.meta.url),
    'utf8',
  ),
)
test('the committed compact index exactly matches the complete ubigeo source', async () => {
  assert.deepEqual(
    JSON.parse(
      await readFile(
        new URL('../src/data/peru-location-index.json', import.meta.url),
        'utf8',
      ),
    ),
    compactPeruIndex(data),
  )
  assert.deepEqual(peruUbigeoSummary, {
    departments: 25,
    provinces: 196,
    districts: 1891,
  })
})
test('all departments, provinces and districts preserve validation and labels', () => {
  for (const department of data.departments) {
    assert.equal(getPeruDepartmentLabel(department.value), department.label)
    assert.deepEqual(
      getPeruProvinceOptions(department.value),
      department.provinces.map((p) => ({ value: p.code, label: p.label })),
    )
    for (const province of department.provinces)
      for (const district of province.districts) {
        assert.equal(
          isValidPeruLocation(department.value, province.code, district.code),
          true,
        )
        for (const other of data.departments)
          if (other.value !== department.value)
            assert.equal(
              isValidPeruLocation(other.value, province.code, district.code),
              false,
            )
        for (const invalid of [
          '',
          district.code + '0',
          ' ' + district.code,
          district.code.slice(1),
          province.code + 'xx',
        ])
          assert.equal(
            isValidPeruLocation(department.value, province.code, invalid),
            false,
          )
        assert.equal(
          isCoveredDeliveryLocation(
            department.value,
            province.code,
            district.code,
          ),
          (department.value === 'lima' && province.code === '1501') ||
            (department.value === 'callao' && province.code === '0701'),
        )
      }
  }
  assert.equal(getPeruDepartmentLabel('unknown'), 'unknown')
  assert.deepEqual(getPeruProvinceOptions('unknown'), [])
})
