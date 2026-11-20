import { expect, test } from './test'
import {
  nextVisibleOfferBoundary,
  registerVisibleOfferBoundaries,
  subscribeVisibleOfferBoundaries,
} from '../src/domain/visible-offer-boundaries'
import type { ProductDiscount } from '../src/types/catalog'

const now = Date.parse('2026-11-19T00:00:00Z')
const offer = (start: number, end: number, active = true): ProductDiscount => ({
  active,
  type: 'percent',
  value: 10,
  startsAt: new Date(start).toISOString(),
  endsAt: new Date(end).toISOString(),
})

test('solo conserva fechas futuras públicas y avanza de inicio a fin', () => {
  const remove = registerVisibleOfferBoundaries(
    [
      offer(now + 1000, now + 2000),
      offer(now - 2000, now - 1000),
      offer(now + 100, now + 500, false),
      null,
    ],
    now,
  )
  try {
    expect(nextVisibleOfferBoundary(now)).toBe(now + 1000)
    expect(nextVisibleOfferBoundary(now + 1001)).toBe(now + 2000)
    expect(nextVisibleOfferBoundary(now + 2001)).toBeUndefined()
  } finally {
    remove()
  }
  expect(nextVisibleOfferBoundary(now)).toBeUndefined()
})

test('varios resultados visibles notifican al planificador y se retiran al desmontarse', () => {
  let notifications = 0
  const stop = subscribeVisibleOfferBoundaries(() => notifications++)
  const first = registerVisibleOfferBoundaries(
    [offer(now - 1, now + 3000)],
    now,
  )
  const second = registerVisibleOfferBoundaries(
    [offer(now - 1, now + 1000)],
    now,
  )
  try {
    expect(nextVisibleOfferBoundary(now)).toBe(now + 1000)
    second()
    expect(nextVisibleOfferBoundary(now)).toBe(now + 3000)
    first()
    expect(nextVisibleOfferBoundary(now)).toBeUndefined()
    first()
    second()
    expect(notifications).toBe(4)
  } finally {
    first()
    second()
    stop()
  }
})

test('fechas inválidas, campos abiertos y ofertas desactivadas no añaden temporizadores', () => {
  let notifications = 0
  const stop = subscribeVisibleOfferBoundaries(() => notifications++)
  const remove = registerVisibleOfferBoundaries(
    [{ ...offer(now, now + 1000), startsAt: '', endsAt: 'invalid' }, undefined],
    now,
  )
  try {
    expect(nextVisibleOfferBoundary(now)).toBeUndefined()
    expect(notifications).toBe(0)
  } finally {
    remove()
    stop()
  }
})
