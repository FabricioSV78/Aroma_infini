// Generated from the complete ubigeo source. District labels stay in the lazy
// forms module; validators retain the exact same hierarchy and coverage.
import departments from '../data/peru-location-index.json' with { type: 'json' }
export interface PeruLocationOption {
  value: string
  label: string
}
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
        (sum, province) => sum + province.districts.split(',').length,
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
export function getPeruDepartmentLabel(value: string): string {
  return (
    departments.find((department) => department.value === value)?.label ?? value
  )
}
export function isValidPeruLocation(
  departmentValue: string,
  provinceCode: string,
  districtCode: string,
) {
  const province = departments
    .find((department) => department.value === departmentValue)
    ?.provinces.find((province) => province.code === provinceCode)
  return Boolean(
    province &&
    districtCode.length === 6 &&
    districtCode.startsWith(province.code) &&
    province.districts.split(',').includes(districtCode.slice(4)),
  )
}
/** Solo Lima y Callao admiten pedidos nuevos durante la cobertura temporal. */
export function isCoveredDeliveryLocation(
  departmentValue: string,
  provinceCode: string,
  districtCode: string,
) {
  const area = getDeliveryArea(departmentValue)
  return Boolean(
    area &&
    provinceCode === area.province &&
    isValidPeruLocation(area.department, area.province, districtCode),
  )
}
