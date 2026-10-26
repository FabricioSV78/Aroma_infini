import { expect, test } from '@playwright/test'
import {
  brandSlug,
  countBrandRegistrationLines,
  normalizeBrandName,
  previewBrandRegistration,
} from '../src/domain/brand-registration'

test('La lista conserva la escritura original y distingue existentes y repeticiones', () => {
  const inactiveBrand = { id: 'dior', name: 'Dior', slug: 'dior', active: false }
  const preview = previewBrandRegistration(
    '  Jean   Paul Gaultier  \r\nÉtat Libre d’Orange\n DIOR \nlattafa\n LATTAFA \nJean Paul Gaultier\n\n',
    [inactiveBrand],
  )
  expect(preview).toMatchObject({
    total: 6,
    valid: 3,
    existing: 1,
    duplicate: 2,
    error: 0,
    limitExceeded: false,
  })
  expect(
    preview.rows.map(({ name, slug, status }) => ({ name, slug, status })),
  ).toEqual([
    { name: 'Jean Paul Gaultier', slug: 'jean-paul-gaultier', status: 'valid' },
    {
      name: 'État Libre d’Orange',
      slug: 'etat-libre-d-orange',
      status: 'valid',
    },
    { name: 'DIOR', slug: 'dior', status: 'existing' },
    { name: 'lattafa', slug: 'lattafa', status: 'valid' },
    { name: 'LATTAFA', slug: 'lattafa', status: 'duplicate' },
    {
      name: 'Jean Paul Gaultier',
      slug: 'jean-paul-gaultier',
      status: 'duplicate',
    },
  ])
  expect(preview.rows[4].message).toContain('línea 4')
  expect(preview.rows[5].message).toContain('línea 1')
})

test('Los acentos y espacios no crean marcas duplicadas y las colisiones de URL reciben sufijo', () => {
  const preview = previewBrandRegistration(
    '  MAtIERE    Premiere  \nA & B\nA B\nA  &   B',
    [
      { id: 'matiere', name: 'Matière Première', slug: 'matiere-premiere' },
      { id: 'occupied', name: 'Otra casa', slug: 'a-b' },
    ],
  )
  expect(preview.rows.map((row) => row.status)).toEqual([
    'existing',
    'valid',
    'valid',
    'duplicate',
  ])
  expect(preview.rows[1].slug).toBe('a-b-2')
  expect(preview.rows[2].slug).toBe('a-b-3')
  expect(brandSlug('  Jean Paul Gaultier  ')).toBe('jean-paul-gaultier')
  expect(brandSlug('État Libre d’Orange')).toBe('etat-libre-d-orange')
  expect(normalizeBrandName('  Maison\tÉTÉ  ')).toBe('Maison ÉTÉ')
})

test('Contador y vista previa reconocen los mismos separadores y mantienen el número de línea', () => {
  const text =
    '\r\n Dior \r\n \t\r\nLATTAFA\u2028Jean Paul\u2029Dior\rCarolina Herrera\n'
  const preview = previewBrandRegistration(text, [])
  expect(countBrandRegistrationLines(text)).toBe(5)
  expect(preview.total).toBe(5)
  expect(preview.rows.map((row) => row.line)).toEqual([2, 4, 5, 6, 7])
  expect(preview.rows[3].status).toBe('duplicate')
  expect(previewBrandRegistration(' \n\t\r\n', []).rows).toEqual([])
})

test('Los nombres inválidos se señalan y el límite nunca trunca una lista silenciosamente', () => {
  const invalid = previewBrandRegistration(
    ['---', '🧴', 'x'.repeat(161), 'Dior\u0000', '4711'].join('\n'),
    [],
  )
  expect(invalid.valid).toBe(1)
  expect(invalid.error).toBe(4)
  expect(invalid.rows[2].message).toContain('160')
  expect(invalid.rows[4]).toMatchObject({
    name: '4711',
    slug: '4711',
    status: 'valid',
  })
  const thousand = Array.from(
    { length: 1000 },
    (_, index) => `Casa ${index + 1}`,
  )
  expect(previewBrandRegistration(thousand.join('\n'), []).valid).toBe(1000)
  const tooMany = previewBrandRegistration(
    [...thousand, 'Una más'].join('\n'),
    [],
  )
  expect(tooMany).toMatchObject({
    total: 1001,
    valid: 0,
    error: 1001,
    limitExceeded: true,
  })
  expect(tooMany.rows).toEqual([])
})

test('El servicio registra solo las válidas en una revisión y conserva marcas y productos existentes', async ({
  page,
}) => {
  await page.goto('/admin/marcas')
  const result = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    const before = structuredClone(adminService.getSnapshot())
    const inactive = before.brands.find((brand) => !brand.active)
    const existingName = (inactive ?? before.brands[0]).name
    const saved = adminService.saveBrandsBatch(
      `Casa Élite\n  CASA   ELITE\nMaison O’Rare\n${existingName}\n---`,
      before.revision,
    )
    await adminService.flush()
    const after = structuredClone(adminService.getSnapshot())
    return { before, after, saved }
  })
  expect(result.saved.kind).toBe('saved')
  if (result.saved.kind !== 'saved') throw new Error(result.saved.message)
  expect(result.saved.created.map((brand) => brand.name)).toEqual([
    'Casa Élite',
    'Maison O’Rare',
  ])
  expect(result.saved.preview).toMatchObject({
    valid: 2,
    existing: 1,
    duplicate: 1,
    error: 1,
  })
  expect(result.after.revision).toBe(result.before.revision + 1)
  expect(result.after.brands).toHaveLength(result.before.brands.length + 2)
  expect(result.after.products).toEqual(result.before.products)
  for (const brand of result.before.brands)
    expect(
      result.after.brands.find((current) => current.id === brand.id),
    ).toEqual(brand)
  for (const brand of result.saved.created) {
    expect(brand.active).toBe(true)
    expect(brand.id).toMatch(/^brand-/)
  }
  await page.reload()
  const hydratedNames = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return adminService.getSnapshot().brands.map((brand) => brand.name)
  })
  expect(hydratedNames).toContain('Casa Élite')
  expect(hydratedNames).toContain('Maison O’Rare')
})

test('El servicio bloquea revisiones obsoletas, listas sin válidas y límites sin modificar el catálogo', async ({
  page,
}) => {
  await page.goto('/admin/marcas')
  const results = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    const before = structuredClone(adminService.getSnapshot())
    const stale = adminService.saveBrandsBatch(
      'Casa Pendiente',
      before.revision - 1,
    )
    const invalid = adminService.saveBrandsBatch(
      `${before.brands[0].name}\n---`,
      before.revision,
    )
    const oversized = adminService.saveBrandsBatch(
      Array.from({ length: 1001 }, (_, index) => `Casa ${index}`).join('\n'),
      before.revision,
    )
    return {
      stale,
      invalid,
      oversized,
      before,
      after: structuredClone(adminService.getSnapshot()),
    }
  })
  expect(results.stale).toMatchObject({ kind: 'validation' })
  if (results.stale.kind === 'validation')
    expect(results.stale.message).toContain('Vuelve a revisar')
  expect(results.invalid).toMatchObject({ kind: 'validation' })
  expect(results.oversized).toMatchObject({ kind: 'validation' })
  expect(results.after).toEqual(results.before)
})
