let penFormatter: Intl.NumberFormat | undefined

export function formatPEN(priceCents: number): string {
  // Locale initialization can be expensive on a throttled mobile CPU. Importing
  // the shared module must not block route loaders before any price is shown.
  penFormatter ??= new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return penFormatter.format(priceCents / 100)
}
