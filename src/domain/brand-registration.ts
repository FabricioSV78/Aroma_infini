import type { Brand } from '../types/catalog'

export const MAX_BRAND_REGISTRATION_LINES = 1000
const MAX_BRAND_NAME_LENGTH = 160

export type BrandRegistrationStatus =
  'valid' | 'existing' | 'duplicate' | 'error'

export interface BrandRegistrationRow {
  line: number
  name: string
  slug: string
  status: BrandRegistrationStatus
  message: string
}

export interface BrandRegistrationPreview {
  rows: BrandRegistrationRow[]
  total: number
  valid: number
  existing: number
  duplicate: number
  error: number
  limitExceeded: boolean
}

/** Keep the merchant's spelling and capitalization; discard accidental spacing. */
export function normalizeBrandName(value: string) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

export function brandNameKey(value: string) {
  return normalizeBrandName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es-PE')
}

export function brandSlug(value: string) {
  return normalizeBrandName(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function brandRegistrationLines(text: string) {
  return text
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((value, index) => ({ value, line: index + 1 }))
    .filter(({ value }) => value.trim())
}

export function countBrandRegistrationLines(text: string) {
  return brandRegistrationLines(text).length
}

export function previewBrandRegistration(
  text: string,
  brands: readonly Brand[],
): BrandRegistrationPreview {
  const lines = brandRegistrationLines(text)
  const preview: BrandRegistrationPreview = {
    rows: [],
    total: lines.length,
    valid: 0,
    existing: 0,
    duplicate: 0,
    error: 0,
    limitExceeded: lines.length > MAX_BRAND_REGISTRATION_LINES,
  }
  if (preview.limitExceeded) {
    preview.error = lines.length
    return preview
  }

  const existingNames = new Map(
    brands.map((brand) => [brandNameKey(brand.name), brand]),
  )
  const usedSlugs = new Set(brands.map((brand) => brand.slug.toLowerCase()))
  const seenNames = new Map<string, number>()

  for (const { value, line } of lines) {
    const name = normalizeBrandName(value)
    const key = brandNameKey(name)
    const baseSlug = brandSlug(name)
    const row: BrandRegistrationRow = {
      line,
      name,
      slug: baseSlug,
      status: 'valid',
      message: 'Se registrará.',
    }
    const firstLine = seenNames.get(key)
    if (firstLine !== undefined) {
      row.status = 'duplicate'
      row.message = `Repetida en la línea ${firstLine}.`
    } else {
      seenNames.set(key, line)
      if (name.length > MAX_BRAND_NAME_LENGTH) {
        row.status = 'error'
        row.message = `Usa un nombre de hasta ${MAX_BRAND_NAME_LENGTH} caracteres.`
      } else if (
        !baseSlug ||
        [...value].some((character) => {
          const code = character.charCodeAt(0)
          return code === 127 || (code < 32 && code !== 9)
        })
      ) {
        row.status = 'error'
        row.message = 'Usa un nombre con letras o números válidos para su URL.'
      } else {
        const existing = existingNames.get(key)
        if (existing) {
          row.status = 'existing'
          row.slug = existing.slug
          row.message = 'Esta marca ya está registrada.'
        } else {
          let suffix = 2
          while (usedSlugs.has(row.slug)) row.slug = `${baseSlug}-${suffix++}`
          usedSlugs.add(row.slug)
        }
      }
    }
    preview.rows.push(row)
    preview[row.status] += 1
  }
  return preview
}
