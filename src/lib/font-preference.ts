export const fontOptions = [
  {
    id: 'lato',
    name: 'Lato',
    note: 'Fuente de marca',
    description: 'La familia indicada en el manual de Aroma Infini.',
  },
  {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    note: 'Original',
    description: 'Precisa y equilibrada, con personalidad discreta.',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    note: 'Recomendada',
    description: 'Limpia y amable. Un equilibrio entre elegancia y lectura.',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    note: 'Geométrica',
    description: 'Formas abiertas y un carácter contemporáneo.',
  },
  {
    id: 'work-sans',
    name: 'Work Sans',
    note: 'Versátil',
    description: 'Natural y clara en títulos, precios y formularios.',
  },
  {
    id: 'source-sans-3',
    name: 'Source Sans 3',
    note: 'Humanista',
    description: 'Fluida y legible, especialmente en textos y paneles.',
  },
] as const

export type FontId = (typeof fontOptions)[number]['id']
const storageKey = 'aroma-infini:font-v2'

export function getFontPreference(): FontId {
  try {
    const saved = localStorage.getItem(storageKey)
    return fontOptions.find((font) => font.id === saved)?.id ?? 'lato'
  } catch {
    return 'lato'
  }
}

export function applyFontPreference(id: FontId, persist = true): boolean {
  const font = fontOptions.find((option) => option.id === id) ?? fontOptions[0]
  document.documentElement.style.setProperty(
    '--font-body',
    `"${font.name}", Arial, sans-serif`,
  )
  if (!persist) return true
  try {
    if (font.id === 'lato') localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, font.id)
    return true
  } catch {
    return false
  }
}
