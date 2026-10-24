/** Shared store settings; persisted through the administrative repository. */
export interface StoreFeatures {
  complementsEnabled: boolean
}

export function normalizeStoreFeatures(
  value?: Partial<StoreFeatures> | null,
): StoreFeatures {
  return { complementsEnabled: value?.complementsEnabled === true }
}

export function validateStoreFeatures(value: StoreFeatures): string | null {
  return typeof value?.complementsEnabled === 'boolean'
    ? null
    : 'Indica si Complementos debe mostrarse en la tienda.'
}
