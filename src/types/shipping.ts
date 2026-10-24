export interface ShippingZone {
  id: string
  name: string
  department: string
  province: string | null
  district: string | null
  courierFeeCents: number
  motorizadoFeeCents: number | null
  estimate: string
  active: boolean
}

export interface ShippingSettings {
  freeThresholdCents: number
  /** Public checkout coverage; preparing a provincial rate never enables it. */
  provinceShippingEnabled: boolean
  nationalCourierFeeCents: number
  nationalEstimate: string
  zones: ShippingZone[]
}
