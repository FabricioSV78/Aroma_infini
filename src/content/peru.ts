import ubigeoData from '../data/peru-ubigeo.json' with { type: 'json' }

export interface PeruLocationOption {
  value: string
  label: string
}

interface PeruDistrictRecord {
  code: string
  label: string
}

interface PeruProvinceRecord {
  code: string
  label: string
  districts: PeruDistrictRecord[]
}

interface PeruDepartmentRecord {
  code: string
  value: string
  label: string
  provinces: PeruProvinceRecord[]
}

const departments = ubigeoData.departments as PeruDepartmentRecord[]

export const LIMA_DEPARTMENT = 'lima'
export const LIMA_PROVINCE = '1501'
export const CALLAO_DEPARTMENT = 'callao'
export const CALLAO_PROVINCE = '0701'

export const deliveryAreas = [
  { department: LIMA_DEPARTMENT, province: LIMA_PROVINCE, label: 'Lima' },
  { department: CALLAO_DEPARTMENT, province: CALLAO_PROVINCE, label: 'Callao' },
] as const

export function getDeliveryArea(departmentValue: string) {
  return deliveryAreas.find(
    (area) => area.department === departmentValue.trim().toLowerCase(),
  )
}

export const peruDepartments: PeruLocationOption[] = departments.map(
  ({ value, label }) => ({ value, label }),
)

export const peruUbigeoSummary = {
  departments: departments.length,
  provinces: departments.reduce(
    (total, department) => total + department.provinces.length,
    0,
  ),
  districts: departments.reduce(
    (total, department) =>
      total +
      department.provinces.reduce(
        (provinceTotal, province) => provinceTotal + province.districts.length,
        0,
      ),
    0,
  ),
}

export function getPeruProvinceOptions(
  departmentValue: string,
): PeruLocationOption[] {
  return (
    departments
      .find((department) => department.value === departmentValue)
      ?.provinces.map((province) => ({
        value: province.code,
        label: province.label,
      })) ?? []
  )
}

export function getPeruDistrictOptions(
  provinceCode: string,
): PeruLocationOption[] {
  for (const department of departments) {
    const province = department.provinces.find(
      (candidate) => candidate.code === provinceCode,
    )
    if (province)
      return province.districts.map((district) => ({
        value: district.code,
        label: district.label,
      }))
  }
  return []
}

export function getPeruDepartmentLabel(value: string): string {
  return (
    departments.find((department) => department.value === value)?.label ?? value
  )
}

export function getPeruProvinceLabel(code: string): string {
  for (const department of departments) {
    const province = department.provinces.find(
      (candidate) => candidate.code === code,
    )
    if (province) return province.label
  }
  return code
}

export function getPeruDistrictLabel(code: string): string {
  for (const department of departments)
    for (const province of department.provinces) {
      const district = province.districts.find(
        (candidate) => candidate.code === code,
      )
      if (district) return district.label
    }
  return code
}

export function isValidPeruLocation(
  departmentValue: string,
  provinceCode: string,
  districtCode: string,
) {
  const department = departments.find(
    (candidate) => candidate.value === departmentValue,
  )
  const province = department?.provinces.find(
    (candidate) => candidate.code === provinceCode,
  )
  return Boolean(
    province?.districts.some((district) => district.code === districtCode),
  )
}

/** Solo Lima y Callao admiten pedidos nuevos durante la cobertura temporal. */
export function isCoveredDeliveryLocation(
  departmentValue: string,
  provinceCode: string,
  districtCode: string,
) {
  const area = getDeliveryArea(departmentValue)
  if (!area) return false
  return (
    provinceCode === area.province &&
    isValidPeruLocation(area.department, area.province, districtCode)
  )
}
