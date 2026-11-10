import { expect, test } from './test'
import { parseCatalogQuery } from '../src/domain/catalog-query'

const brands = [{ id: 'brand-one', slug: 'brand-one', name: 'Brand One' }]

test('La consulta usa el vocabulario recibido sin depender del repositorio', () => {
  const params = new URLSearchParams(
    'marca=brand-one&marca=brand-one&marca=missing&genero=mujer&genero=unisex&genero=invalid&familia=floral&familia=floral&min=500&max=100&orden=precio-desc&pagina=2&q=%20iris%20',
  )
  expect(
    parseCatalogQuery(params, brands, { complementsEnabled: false }),
  ).toEqual({
    productTypes: [],
    brands: ['brand-one'],
    genders: ['mujer', 'unisex'],
    families: ['floral'],
    min: '100',
    max: '500',
    order: 'precio-desc',
    page: 2,
    search: 'iris',
  })
  expect(
    parseCatalogQuery(params, [], { complementsEnabled: false }).brands,
  ).toEqual([])
})

test('Complementos conserva las mismas reglas de filtros compatibles', () => {
  const params = new URLSearchParams(
    'tipo=complemento&genero=mujer&familia=floral&marca=brand-one&min=25',
  )
  const enabled = parseCatalogQuery(params, brands, {
    complementsEnabled: true,
  })
  expect(enabled.productTypes).toEqual(['complemento'])
  expect(enabled.genders).toEqual([])
  expect(enabled.families).toEqual([])
  expect(enabled.brands).toEqual(['brand-one'])
  expect(enabled.min).toBe('25')
  const disabled = parseCatalogQuery(params, brands, {
    complementsEnabled: false,
  })
  expect(disabled.productTypes).toEqual([])
  expect(disabled.genders).toEqual(['mujer'])
  expect(disabled.families).toEqual(['floral'])
})

test('La consulta limita entradas inválidas y conserva el orden habitual', () => {
  const params = new URLSearchParams({
    min: '-1',
    max: '1000001',
    pagina: '-100',
    orden: 'novedades',
    q: 'a'.repeat(150),
  })
  const query = parseCatalogQuery(params, brands, { complementsEnabled: true })
  expect(query.min).toBe('')
  expect(query.max).toBe('')
  expect(query.page).toBe(1)
  expect(query.order).toBe('mas-vendidos')
  expect(query.search).toHaveLength(100)
})
