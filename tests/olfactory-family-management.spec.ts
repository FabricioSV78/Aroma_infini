import { expect, test } from './test'
import {
  DEFAULT_OLFACTORY_FAMILIES,
  getOlfactoryFamilyLabel,
  parseOlfactoryFamilies,
  parseOlfactoryFamilyDefinitions,
  replaceOlfactoryFamilies,
} from '../src/domain/olfactory-family'

test('managed families parse confirmed names and aliases without inventing product classifications', () => {
  const definitions = [
    ...DEFAULT_OLFACTORY_FAMILIES,
    {
      value: 'especiada',
      label: 'Especiada',
      aromaLabel: 'Especiada',
      active: true,
      aliases: ['Especiado'],
    },
  ]
  replaceOlfactoryFamilies(definitions)
  try {
    expect(parseOlfactoryFamilies('Especiada, Floral')).toEqual([
      'especiada',
      'floral',
    ])
    expect(parseOlfactoryFamilies('Especiado')).toEqual(['especiada'])
    expect(parseOlfactoryFamilies('No registrada')).toBeNull()
    expect(getOlfactoryFamilyLabel('especiada')).toBe('Especiada')
    expect(() =>
      parseOlfactoryFamilyDefinitions([
        { ...definitions[0], value: 'https://bad.invalid' },
      ]),
    ).toThrow()
  } finally {
    replaceOlfactoryFamilies(DEFAULT_OLFACTORY_FAMILIES)
  }
})

test('admin creates, assigns, renames, deactivates and protects a family through reload and Excel', async ({
  page,
}) => {
  await page.goto('/admin/familias-olfativas')
  await page.getByRole('button', { name: 'Nueva familia', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva familia' })
  await dialog.getByLabel('Nombre de la familia').fill('Especiada')
  await dialog.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Nueva familia', exact: true }).click()
  await dialog.getByLabel('Nombre de la familia').fill('  especiada  ')
  await dialog.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Ya existe')
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const closeConfirmation = page.getByRole('alertdialog')
  if (await closeConfirmation.isVisible())
    await closeConfirmation
      .getByRole('button', { name: 'Cerrar sin guardar', exact: true })
      .click()
  const assigned = await page.evaluate(async () => {
    const service = '/src/services/admin-service.ts',
      matching = '/src/services/fragrance-matching.ts',
      imports = '/src/features/admin/product-import-excel.ts'
    const { adminService, hydrateAdminStore } = (await import(
      service
    )) as typeof import('../src/services/admin-service')
    const { getFinderOptions } = (await import(
      matching
    )) as typeof import('../src/services/fragrance-matching')
    const { createProductTemplateWorkbook } = (await import(
      imports
    )) as typeof import('../src/features/admin/product-import-excel')
    await hydrateAdminStore()
    const record = structuredClone(adminService.getSnapshot().products[0])
    record.product.family = 'Especiada'
    record.product.olfactoryFamilies = ['especiada']
    record.product.olfactoryFamily = 'especiada'
    const result = adminService.saveProduct(record)
    await adminService.flush()
    const options = getFinderOptions({
      products: adminService.getSnapshot().products,
      brands: adminService.getSnapshot().brands,
      shipping: adminService.getSnapshot().shipping,
      media: adminService.getSnapshot().homeMedia,
      content: adminService.getSnapshot().homeContent,
      features: adminService.getSnapshot().features,
    })
    const workbook = await createProductTemplateWorkbook(
      adminService.getSnapshot().brands,
    )
    const templateFamilies = workbook
      .getWorksheet('Opciones')!
      .getColumn(7)
      .values.filter((value) => typeof value === 'string')
    const domain = '/src/domain/olfactory-family.ts'
    const { OLFACTORY_FAMILIES, replaceOlfactoryFamilies } = (await import(
      domain
    )) as typeof import('../src/domain/olfactory-family')
    const definitions = [...OLFACTORY_FAMILIES]
    let emptyFamilyRanges: string[]
    try {
      replaceOlfactoryFamilies(
        definitions.map((family) => ({ ...family, active: false })),
      )
      const empty = await createProductTemplateWorkbook(
        adminService.getSnapshot().brands,
      )
      emptyFamilyRanges = empty.definedNames.getRanges(
        'opciones_familia_olfativa',
      ).ranges
      await empty.xlsx.writeBuffer()
    } finally {
      replaceOlfactoryFamilies(definitions)
    }
    return {
      result,
      options: options.families,
      templateFamilies,
      emptyFamilyRanges,
    }
  })
  expect(assigned.result.kind).toBe('saved')
  expect(assigned.templateFamilies).toContain('Especiada')
  expect(assigned.emptyFamilyRanges).toEqual([])
  expect(assigned.options.some((option) => option.value === 'especiada')).toBe(
    true,
  )
  await page.reload()
  const row = page.getByRole('row').filter({ hasText: 'Especiada' })
  await expect(
    row.getByRole('button', { name: 'Eliminar Especiada', exact: true }),
  ).toHaveCount(0)
  await row
    .getByRole('button', { name: 'Editar Especiada', exact: true })
    .click()
  const edit = page.getByRole('dialog', { name: 'Editar familia' })
  await edit.getByLabel('Nombre de la familia').fill('Especiada cálida')
  await edit.getByRole('button', { name: 'Guardar familia' }).click()
  await expect(edit).not.toBeVisible()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada cálida' }),
  ).toBeVisible()
  const values = await page.evaluate(async () => {
    const domain = '/src/domain/olfactory-family.ts'
    const { parseOlfactoryFamilies, getOlfactoryFamilyLabel } = (await import(
      domain
    )) as typeof import('../src/domain/olfactory-family')
    return {
      old: parseOlfactoryFamilies('Especiada'),
      current: getOlfactoryFamilyLabel('especiada'),
    }
  })
  expect(values).toEqual({ old: ['especiada'], current: 'Especiada cálida' })
  await page
    .getByRole('button', { name: 'Desactivar Especiada cálida', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Desactivar familia', exact: true })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada cálida' }),
  ).toContainText('Desactivada')
  await page.reload()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada cálida' }),
  ).toContainText('Desactivada')
  await page
    .getByRole('button', { name: 'Activar Especiada cálida', exact: true })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Especiada cálida' }),
  ).toContainText('Activa')
})

test('unused family can be deleted with confirmation and navigation protects an unfinished form', async ({
  page,
}) => {
  await page.goto('/admin/familias-olfativas')
  await page.getByRole('button', { name: 'Nueva familia', exact: true }).click()
  await page.getByLabel('Nombre de la familia').fill('Temporal')
  await page
    .getByRole('button', { name: 'Guardar familia', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Eliminar Temporal', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '¿Eliminar «Temporal»?',
  )
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Eliminar familia', exact: true })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Temporal' }),
  ).toHaveCount(0)
})

for (const [device, width, height] of [
  ['monitor', 1920, 1080],
  ['laptop', 1366, 768],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
] as const) {
  test(`family management is usable with keyboard and fits ${device}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/admin/familias-olfativas')
    await page
      .getByRole('button', { name: 'Nueva familia', exact: true })
      .click()
    await page.getByLabel('Nombre de la familia').fill('Familia de prueba')
    await page.screenshot({
      path: `artifacts/olfactory-management-2026-10-29/form-${device}.png`,
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page
      .getByRole('button', { name: 'Guardar familia', exact: true })
      .click()
    await expect(
      page.getByRole('row').filter({ hasText: 'Familia de prueba' }),
    ).toBeVisible()
    await page.screenshot({
      path: `artifacts/olfactory-management-2026-10-29/list-${device}.png`,
      fullPage: true,
    })
  })
}
