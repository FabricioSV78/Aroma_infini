import { heroSlides } from '../content/home'
import type { Product } from '../types/catalog'
import type { HomeHeroContent, HomeHeroDestination } from '../types/home'

export const HERO_MAX_CAMPAIGNS = 10
export const heroInternalPages = [
  { value: '/nosotros', label: 'Nosotros' },
  { value: '/contacto', label: 'Contacto' },
  { value: '/envios', label: 'Envíos y entregas' },
  { value: '/seguir-pedido', label: 'Seguir pedido' },
  { value: '/marcas', label: 'Marcas' },
] as const

export function orderedHeroContent(
  slides: readonly HomeHeroContent[],
  publishedOnly = false,
): HomeHeroContent[] {
  return slides
    .filter((slide) => !publishedOnly || slide.published)
    .sort((a, b) => a.order - b.order)
}

export function getHeroFallback(fallbackIndex: number | null) {
  return heroSlides[fallbackIndex ?? 0] ?? heroSlides[0]
}

export function isHeroDestination(
  value: unknown,
): value is HomeHeroDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort().join(',')
  if (record.type === 'shop') return keys === 'type'
  if (record.type === 'product')
    return (
      keys === 'productId,type' &&
      typeof record.productId === 'string' &&
      /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(record.productId)
    )
  if (record.type === 'category')
    return (
      keys === 'category,type' &&
      ['hombre', 'mujer', 'unisex', 'complementos'].includes(
        String(record.category),
      )
    )
  return (
    record.type === 'page' &&
    keys === 'page,type' &&
    heroInternalPages.some((page) => page.value === record.page)
  )
}

export function resolveHeroDestination(
  destination: HomeHeroDestination,
  {
    products,
    complementsEnabled,
  }: { products: readonly Product[]; complementsEnabled: boolean },
): { href: string | null; warning: string | null } {
  if (!isHeroDestination(destination))
    return { href: null, warning: 'Selecciona un destino interno válido.' }
  if (destination.type === 'shop') return { href: '/tienda', warning: null }
  if (destination.type === 'page')
    return { href: destination.page, warning: null }
  if (destination.type === 'category') {
    if (destination.category === 'complementos')
      return complementsEnabled
        ? { href: '/tienda?tipo=complemento', warning: null }
        : {
            href: null,
            warning:
              'Complementos está oculto. El botón no se mostrará hasta que actives la categoría o cambies el destino.',
          }
    return { href: `/tienda?genero=${destination.category}`, warning: null }
  }
  const product = products.find((item) => item.id === destination.productId)
  if (!product || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug))
    return {
      href: null,
      warning:
        'El producto no está publicado o ya no está disponible. Cambia el destino; mientras tanto el botón se ocultará en la tienda.',
    }
  return { href: `/producto/${product.slug}`, warning: null }
}
