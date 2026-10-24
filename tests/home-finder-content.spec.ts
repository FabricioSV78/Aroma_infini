import { expect, test } from '@playwright/test'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
  validateHomeContent,
} from '../src/content/home-editor'

test('El contenido guardado antes del recomendador recibe sus valores por defecto', () => {
  const oldContent = createDefaultHomeContent()
  const restored = normalizeHomeContent({
    hero: oldContent.hero,
    film: oldContent.film,
  })

  expect(restored.finder.title).toBe('Encuentra tu\nperfume ideal')
  expect(restored.finder.steps.family.question).toBe('¿Qué aroma te atrae más?')
  expect(restored.finder.entryLabel).toBe('Tu primera elección')
  expect(restored.finder.budgets).toEqual([400, 500, 650])
  expect(restored.finder.enabledOptions).toEqual({
    family: null,
    occasion: null,
    intensity: null,
  })
  expect(validateHomeContent(restored)).toBeNull()
})

test('Las configuraciones previas del cuestionario conservan todas las opciones del catálogo', () => {
  const content = createDefaultHomeContent()
  const restored = normalizeHomeContent({
    ...content,
    finder: { ...content.finder, enabledOptions: undefined },
  })

  expect(restored.finder.enabledOptions).toEqual({
    family: null,
    occasion: null,
    intensity: null,
  })
  expect(validateHomeContent(restored)).toBeNull()
})

test('La selección editorial se guarda por clave de catálogo y se normaliza sin duplicados', () => {
  const content = createDefaultHomeContent()
  content.finder.enabledOptions.family = [
    'amaderado',
    'amaderado',
    'floral',
    ' Floral ',
  ]
  content.finder.enabledOptions.occasion = ['diario']
  content.finder.enabledOptions.intensity = []
  content.finder.optionLabels.family.floral = 'Flores'

  const restored = normalizeHomeContent(content)
  expect(restored.finder.enabledOptions).toEqual({
    family: ['amaderado', 'floral'],
    occasion: ['diario'],
    intensity: null,
  })
  expect(restored.finder.optionLabels.family.floral).toBe('Flores')
  expect(validateHomeContent(restored)).toBeNull()
})

test('No permite dejar una pregunta sin opciones ni repetir valores estables', () => {
  const content = createDefaultHomeContent()
  content.finder.enabledOptions.family = []
  expect(validateHomeContent(content)).toContain('al menos una opción')

  content.finder.enabledOptions.family = ['amaderado', 'amaderado']
  expect(validateHomeContent(content)).toContain('duplicadas')

  content.finder.enabledOptions.family = ['amaderado', ' Floral ']
  expect(validateHomeContent(content)).toContain('clave inválida')
})

test('El administrador puede usar de uno a seis importes ordenados y distintos', () => {
  const content = createDefaultHomeContent()
  content.finder.budgets = [450]
  expect(validateHomeContent(content)).toBeNull()

  content.finder.budgets = [200, 300, 400, 500, 600, 700]
  expect(validateHomeContent(content)).toBeNull()

  content.finder.budgets = [400, 400]
  expect(validateHomeContent(content)).toContain('sin duplicados')

  content.finder.budgets = [200, 300, 400, 500, 600, 700, 800]
  expect(validateHomeContent(content)).toContain('entre uno y seis')
})

test('La migración conserva las opciones por valor estable y las imágenes válidas', () => {
  const content = createDefaultHomeContent()
  content.finder.optionLabels.family.amaderado = 'Maderas cálidas'
  content.finder.optionLabels.family.cuero = 'Cuero'
  content.finder.familyVisuals.cuero = {
    description: 'Una dirección de cuero',
    image: 'data:image/webp;base64,AA==',
  }
  content.finder.entryQuestion = 'Elige tu primera dirección aromática'

  const restored = normalizeHomeContent(content)
  expect(restored.finder.optionLabels.family).toEqual({
    amaderado: 'Maderas cálidas',
    cuero: 'Cuero',
  })
  expect(restored.finder.familyVisuals.cuero.image).toBe(
    'data:image/webp;base64,AA==',
  )
  expect(restored.finder.entryQuestion).toBe(
    'Elige tu primera dirección aromática',
  )
  expect(validateHomeContent(restored)).toBeNull()
})

test('Los montos deben aumentar y las imágenes del recomendador deben ser WebP', () => {
  const content = createDefaultHomeContent()
  content.finder.budgets = [400, 400, 650]
  expect(validateHomeContent(content)).toContain('presupuestos')

  content.finder.budgets = [400, 500, 650]
  content.finder.desktopImage = 'data:image/png;base64,AA=='
  expect(validateHomeContent(content)).toContain('WebP')

  content.finder.desktopImage = null
  content.finder.budgetNoLimitLabel = ''
  expect(validateHomeContent(content)).toContain('sin límite de presupuesto')

  content.finder.budgetNoLimitLabel = 'Sin límite de presupuesto'
  content.finder.entryLabel = '1/4 · Tu primera elección'
  expect(validateHomeContent(content)).toContain('no debe incluir el progreso')
})
