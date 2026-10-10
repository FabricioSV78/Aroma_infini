import { expect, test } from '@playwright/test'
import { brandPathForLegacyQuery, classifyRoute } from '../worker/route-policy'

test('Las rutas públicas y privadas se distinguen de URLs inexistentes', () => {
  expect(classifyRoute('/')).toBe('public')
  expect(classifyRoute('/tienda')).toBe('public')
  expect(classifyRoute('/marcas/forme')).toBe('public')
  expect(classifyRoute('/producto/petale-nu')).toBe('public')
  expect(classifyRoute('/checkout')).toBe('app')
  expect(classifyRoute('/admin/productos/nuevo')).toBe('app')
  expect(classifyRoute('/marcas/inexistente')).toBe('candidate')
  expect(classifyRoute('/producto/inexistente')).toBe('candidate')
  expect(classifyRoute('/ruta-inexistente')).toBe('missing')
})

test('Solo la antigua selección simple por marca redirige a la URL limpia', () => {
  expect(brandPathForLegacyQuery('?marca=forme')).toBe('/marcas/forme')
  expect(brandPathForLegacyQuery('?marca=forme&genero=mujer')).toBeNull()
  expect(brandPathForLegacyQuery('?marca=forme&marca=atelier-01')).toBeNull()
  expect(brandPathForLegacyQuery('?marca=desconocida')).toBeNull()
})
