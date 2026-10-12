import { expect, test } from '@playwright/test'
import { adminService } from '../src/services/admin-service'
import { homeService } from '../src/services/home-service'

test.afterEach(() => adminService.reset())

test('Los perfiles de las firmas reflejan cambios y solo usan productos publicados', async () => {
  const record = adminService.getSnapshot().products[0]
  const brandId = record.product.brandId
  expect(
    adminService.saveProduct({
      ...record,
      product: { ...record.product, family: 'Perfil editado · matiz editado' },
    }).kind,
  ).toBe('saved')
  const edited = (await homeService.getHome()).brandProfiles[brandId]
  expect(edited).toContain('Perfil editado')
  expect(edited).toContain('matiz editado')

  expect(adminService.setProductActive(record.product.id, false).kind).toBe(
    'saved',
  )
  const unpublished = (await homeService.getHome()).brandProfiles[brandId]
  expect(unpublished).not.toContain('Perfil editado')
  expect(unpublished).not.toContain('matiz editado')

  for (const remaining of adminService.getSnapshot().products) {
    if (remaining.product.brandId === brandId)
      adminService.setProductActive(remaining.product.id, false)
  }
  expect((await homeService.getHome()).brandProfiles[brandId]).toEqual([])
})
