import { expect, test } from '@playwright/test'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
  validateHomeContent,
} from '../src/content/home-editor'

test('Las campañas conservan su texto al cambiar el orden visual', () => {
  const saved = createDefaultHomeContent()
  saved.hero[1].alt =
    'Frasco verde sobre un bloque de vidrio entre reflejos de luz'
  const normalized = normalizeHomeContent(saved)
  expect(normalized.hero[1].alt).toBe(
    'Frasco verde sobre vidrio ante piedra cálida y hojas de olivo',
  )

  saved.hero[1].alt = 'Fotografía personalizada de mi campaña verde'
  expect(normalizeHomeContent(saved).hero[1].alt).toBe(saved.hero[1].alt)
})

test('Los errores del editor usan el número visible de la campaña', () => {
  const content = createDefaultHomeContent()
  content.hero[3].eyebrow = ''
  expect(validateHomeContent(content)).toContain('Etiqueta de campaña 3')
})

test('La franja conserva un texto local al recuperar datos antiguos y valida su contenido', () => {
  const content = createDefaultHomeContent()
  const previous = normalizeHomeContent({
    hero: content.hero,
    film: content.film,
    finder: content.finder,
  })
  expect(previous.announcement).toEqual({
    deliveryText: 'Envíos en Lima y Callao',
    freeShippingLabel: 'Gratis desde',
  })
  expect(validateHomeContent(previous)).toBeNull()
  previous.announcement.deliveryText = ' '
  expect(validateHomeContent(previous)).toContain('Mensaje de entrega')
})
