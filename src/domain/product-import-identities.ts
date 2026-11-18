/** Only the workbook's proposed identities are sent for conflict validation.
 * Catalog documents, photographs, prices and private data are not needed. */
export interface ProductImportIdentity {
  row: number
  slug: string
  name: string
  brandId: string
  sku: string
}
export type ProductImportConflictReason = 'slug' | 'name' | 'sku'
export interface ProductImportConflict {
  row: number
  reasons: ProductImportConflictReason[]
}
export type ProductImportConflictLookup = (
  identities: readonly ProductImportIdentity[],
) => Promise<readonly ProductImportConflict[]>
