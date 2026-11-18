import ubigeoData from '../data/peru-ubigeo.json' with { type: 'json' }
import type { PeruLocationOption } from './peru-core'
export {
  LIMA_DEPARTMENT,
  LIMA_PROVINCE,
  CALLAO_DEPARTMENT,
  CALLAO_PROVINCE,
  deliveryAreas,
  getDeliveryArea,
  peruDepartments,
  peruUbigeoSummary,
  getPeruProvinceOptions,
  getPeruDepartmentLabel,
  isValidPeruLocation,
  isCoveredDeliveryLocation,
  type PeruLocationOption,
} from './peru-core'
export function getPeruDistrictOptions(
  provinceCode: string,
): PeruLocationOption[] {
  for (const department of ubigeoData.departments) {
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
export function getPeruProvinceLabel(code: string): string {
  for (const department of ubigeoData.departments) {
    const province = department.provinces.find(
      (candidate) => candidate.code === code,
    )
    if (province) return province.label
  }
  return code
}
export function getPeruDistrictLabel(code: string): string {
  for (const department of ubigeoData.departments)
    for (const province of department.provinces) {
      const district = province.districts.find(
        (candidate) => candidate.code === code,
      )
      if (district) return district.label
    }
  return code
}
