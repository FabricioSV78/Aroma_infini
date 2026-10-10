import type { Brand, Product, ProductDetail } from '../types/catalog'

export interface SeoBreadcrumb {
  name: string
  path: string
}

export interface SeoPageConfig {
  title: string
  description: string
  canonicalPath: string | null
  indexable: boolean
  follow: boolean
  imagePath?: string
  imageAlt?: string
  type?: 'website' | 'product'
  breadcrumbs?: SeoBreadcrumb[]
  product?: {
    id: string
    name: string
    brand: string | null
    description: string
    imagePath?: string
    variants: {
      id: string
      priceCents: number
      stock: number
      active?: boolean
    }[]
  }
}

/** Read-only data supplied by the active route loader, shared with its UI. */
export interface SeoRouteData {
  kind?: 'ready' | 'missing' | 'error'
  brand?: Brand
  brands?: Brand[]
  product?: Product
  items?: Product[]
  detail?: ProductDetail
}

function shareableProductImage(image: string): string | undefined {
  if (/^https:\/\//i.test(image)) return image
  if (/^\/images\/[a-z0-9-]+\.webp$/i.test(image)) return image
  if (/^[a-z0-9-]+$/i.test(image)) return `/images/${image}-960.webp`
  return undefined
}

const homeDescription =
  'Descubre Aroma Infini, una propuesta peruana de perfumería de autor con una selección cuidada y una experiencia de compra clara.'

const privatePage = (title: string, description: string): SeoPageConfig => ({
  title,
  description,
  canonicalPath: null,
  indexable: false,
  follow: false,
})

function normalizePath(pathname: string) {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '') || '/'
}

export function resolveSeoPage(
  pathname: string,
  search: string,
  routeData?: SeoRouteData,
): SeoPageConfig {
  const path = normalizePath(pathname)
  const hasQuery = Boolean(search)
  if (path === '/fuente')
    return privatePage(
      'Tipografía | Aroma Infini',
      'Compara las fuentes de Aroma Infini.',
    )

  if (path === '/')
    return {
      title: 'Aroma Infini | Perfumería de autor en Perú',
      description: homeDescription,
      canonicalPath: '/',
      indexable: true,
      follow: true,
      imagePath: '/images/hero-v2-lumiere-desktop-1536.webp',
      imageAlt: 'Universo editorial de Aroma Infini',
    }

  if (path === '/tienda') {
    const params = new URLSearchParams(search)
    const selectedBrands = params.getAll('marca')
    const brand =
      selectedBrands.length === 1 &&
      [...params.keys()].every((key) => key === 'marca')
        ? routeData?.brands?.find((item) => item.slug === selectedBrands[0])
        : undefined
    if (brand)
      return {
        title: `${brand.name}: perfumes | Aroma Infini`,
        description: `Conoce los perfumes de ${brand.name} y sus presentaciones en Aroma Infini.`,
        canonicalPath: `/marcas/${brand.slug}`,
        indexable: false,
        follow: true,
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Marcas', path: '/marcas' },
          { name: brand.name, path: `/marcas/${brand.slug}` },
        ],
      }
    return {
      title: 'Perfumes de autor | Aroma Infini',
      description:
        'Explora la selección de perfumes de Aroma Infini por marca, familia y presentación.',
      canonicalPath: '/tienda',
      indexable: !hasQuery,
      follow: true,
      imagePath: '/images/featured-duo-v3-1536.webp',
      imageAlt: 'Selección de perfumes de Aroma Infini',
      breadcrumbs: [
        { name: 'Inicio', path: '/' },
        { name: 'Perfumes', path: '/tienda' },
      ],
    }
  }

  if (path === '/marcas')
    return {
      title: 'Marcas de perfumería de autor | Aroma Infini',
      description:
        'Conoce las firmas que forman la selección de Aroma Infini y descubre sus perfumes.',
      canonicalPath: '/marcas',
      indexable: true,
      follow: true,
      imagePath: '/images/discovery-bois-1536.webp',
      imageAlt: 'Selección de marcas de Aroma Infini',
      breadcrumbs: [
        { name: 'Inicio', path: '/' },
        { name: 'Marcas', path: '/marcas' },
      ],
    }

  if (path.startsWith('/marcas/')) {
    const slug = path.slice('/marcas/'.length)
    const brand = routeData?.brand?.slug === slug ? routeData.brand : undefined
    if (brand)
      return {
        title: `${brand.name}: perfumes | Aroma Infini`,
        description: `Conoce los perfumes de ${brand.name} y sus presentaciones en Aroma Infini.`,
        canonicalPath: `/marcas/${brand.slug}`,
        indexable: !hasQuery,
        follow: true,
        imagePath: routeData?.items?.[0]
          ? shareableProductImage(routeData.items[0].image)
          : undefined,
        imageAlt: `Perfume de ${brand.name} en Aroma Infini`,
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Marcas', path: '/marcas' },
          { name: brand.name, path: `/marcas/${brand.slug}` },
        ],
      }
  }

  if (path.startsWith('/producto/')) {
    const slug = path.slice('/producto/'.length)
    const product =
      routeData?.product?.slug === slug ? routeData.product : undefined
    const brand = routeData?.brand
    const detail = routeData?.detail
    const imagePath = product ? shareableProductImage(product.image) : undefined
    if (product && detail)
      return {
        title: `${product.name}${brand ? ` de ${brand.name}` : ''} | Aroma Infini`,
        description: detail.shortDescription,
        canonicalPath: `/producto/${product.slug}`,
        indexable: !hasQuery,
        follow: true,
        type: 'product',
        imagePath,
        imageAlt: `${product.name}${brand ? ` de ${brand.name}` : ''}`,
        product: {
          id: product.id,
          name: product.name,
          brand: brand?.name ?? null,
          description: detail.shortDescription,
          imagePath,
          variants: product.variants,
        },
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Perfumes', path: '/tienda' },
          { name: product.name, path: `/producto/${product.slug}` },
        ],
      }
  }

  if (path === '/buscar')
    return {
      ...privatePage(
        'Buscar perfumes | Aroma Infini',
        'Busca perfumes y marcas dentro de la selección de Aroma Infini.',
      ),
      follow: true,
    }
  if (path === '/favoritos')
    return privatePage(
      'Tus favoritos | Aroma Infini',
      'Revisa los perfumes que guardaste para descubrirlos más adelante.',
    )
  if (path === '/carrito')
    return privatePage(
      'Tu carrito | Aroma Infini',
      'Revisa los perfumes y presentaciones de tu selección.',
    )
  if (path === '/checkout')
    return privatePage(
      'Tu selección | Aroma Infini',
      'Revisa tu selección de perfumes y los datos de entrega.',
    )
  if (path === '/checkout/confirmacion')
    return privatePage(
      'Confirmación | Aroma Infini',
      'Consulta el resumen de tu selección de perfumes.',
    )
  if (path === '/seguir-pedido')
    return privatePage(
      'Seguir pedido | Aroma Infini',
      'Consulta el estado de un pedido mediante su código privado.',
    )
  if (path === '/cuenta')
    return privatePage(
      'Mi cuenta | Aroma Infini',
      'Consulta el resumen privado de tu cuenta de Aroma Infini.',
    )
  if (path === '/cuenta/datos')
    return privatePage(
      'Mis datos | Aroma Infini',
      'Administra los datos privados de tu cuenta.',
    )
  if (path === '/cuenta/direcciones')
    return privatePage(
      'Mis direcciones | Aroma Infini',
      'Administra las direcciones privadas de tu cuenta.',
    )
  if (path === '/cuenta/favoritos')
    return privatePage(
      'Mis favoritos | Aroma Infini',
      'Revisa los perfumes guardados dentro de tu cuenta.',
    )
  if (path === '/cuenta/pedidos')
    return privatePage(
      'Mis pedidos | Aroma Infini',
      'Consulta el historial privado de pedidos de tu cuenta.',
    )
  if (path.startsWith('/cuenta/pedidos/'))
    return privatePage(
      'Detalle del pedido | Aroma Infini',
      'Consulta el estado y detalle privado de tu pedido.',
    )
  const institutionalPages: Record<string, [string, string]> = {
    '/nosotros': [
      'Nosotros | Aroma Infini',
      'Descubre la propuesta de Aroma Infini para explorar, comparar y elegir perfumes a tu ritmo.',
    ],
    '/contacto': [
      'Contacto | Aroma Infini',
      'Encuentra orientación sobre perfumes, pedidos y entregas en Aroma Infini.',
    ],
    '/envios': [
      'Envíos y entregas | Aroma Infini',
      'Consulta la información disponible sobre entregas de Aroma Infini en Perú.',
    ],
    '/devoluciones': [
      'Cambios y devoluciones | Aroma Infini',
      'Encuentra orientación para consultas sobre cambios y devoluciones.',
    ],
    '/privacidad': [
      'Privacidad | Aroma Infini',
      'Contacta con Aroma Infini si tienes consultas sobre privacidad.',
    ],
    '/terminos': [
      'Términos y condiciones | Aroma Infini',
      'Contacta con Aroma Infini para consultas sobre productos, pedidos y el uso del sitio.',
    ],
    '/libro-de-reclamaciones': [
      'Libro de reclamaciones | Aroma Infini',
      'Encuentra el canal de contacto de Aroma Infini para comunicar una incidencia.',
    ],
  }
  const institutional = institutionalPages[path]
  if (institutional)
    return {
      ...privatePage(institutional[0], institutional[1]),
      follow: true,
    }

  if (path === '/admin' || path.startsWith('/admin/'))
    return privatePage(
      'Administración | Aroma Infini',
      'Gestiona la tienda, los pedidos y la configuración de Aroma Infini.',
    )

  if (path === '/cuenta/pagos')
    return privatePage(
      'Pagos | Aroma Infini',
      'Consulta la información privada de pagos de tu cuenta.',
    )

  return privatePage(
    'Página no encontrada | Aroma Infini',
    'Vuelve al inicio o explora la selección de Aroma Infini.',
  )
}
