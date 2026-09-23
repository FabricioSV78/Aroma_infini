const penFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPEN(priceCents: number): string {
  return penFormatter.format(priceCents / 100)
}
