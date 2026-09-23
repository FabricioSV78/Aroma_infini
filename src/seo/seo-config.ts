import {
  getStoreBrands,
  getStoreProductBySlug,
} from '../services/admin-service'

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
): SeoPageConfig {
  const path = normalizePath(pathname)
  const hasQuery = Boolean(search)

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

  if (path === '/catalogo') {
    const params = new URLSearchParams(search)
    const selectedBrands = params.getAll('marca')
    const brand =
      selectedBrands.length === 1 &&
      [...params.keys()].every((key) => key === 'marca')
        ? getStoreBrands().find((item) => item.slug === selectedBrands[0])
        : undefined
    if (brand)
      return {
        title: `${brand.name}: perfumes | Aroma Infini`,
        description: `Descubre los perfumes de ${brand.name} seleccionados por Aroma Infini.`,
        canonicalPath: `/catalogo?marca=${encodeURIComponent(brand.slug)}`,
        indexable: true,
        follow: true,
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Marcas', path: '/marcas' },
          {
            name: brand.name,
            path: `/catalogo?marca=${encodeURIComponent(brand.slug)}`,
          },
        ],
      }
    return {
      title: 'Perfumes de autor | Aroma Infini',
      description:
        'Explora la selección de perfumes de Aroma Infini por marca, familia y presentación.',
      canonicalPath: '/catalogo',
      indexable: !hasQuery,
      follow: true,
      imagePath: '/images/featured-duo-v3-1536.webp',
      imageAlt: 'Selección de perfumes de Aroma Infini',
      breadcrumbs: [
        { name: 'Inicio', path: '/' },
        { name: 'Perfumes', path: '/catalogo' },
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
    const brands = getStoreBrands()
    const slug = path.slice('/marcas/'.length)
    const brand = brands.find((item) => item.slug === slug)
    if (brand)
      return {
        title: `${brand.name}: perfumes | Aroma Infini`,
        description: `Descubre los perfumes de ${brand.name} seleccionados por Aroma Infini.`,
        canonicalPath: `/marcas/${brand.slug}`,
        indexable: !hasQuery,
        follow: true,
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Marcas', path: '/marcas' },
          { name: brand.name, path: `/marcas/${brand.slug}` },
        ],
      }
  }

  if (path.startsWith('/producto/')) {
    const slug = path.slice('/producto/'.length)
    const record = getStoreProductBySlug(slug)
    const product = record?.product
    const brands = getStoreBrands()
    const brand = product
      ? brands.find((item) => item.id === product.brandId)
      : undefined
    const detail = record?.detail
    if (product && detail)
      return {
        title: `${product.name}${brand ? ` de ${brand.name}` : ''} | Aroma Infini`,
        description: detail.shortDescription,
        canonicalPath: `/producto/${product.slug}`,
        indexable: true,
        follow: true,
        type: 'product',
        imagePath: `/images/${product.image}-960.webp`,
        imageAlt: `${product.name}${brand ? ` de ${brand.name}` : ''}`,
        breadcrumbs: [
          { name: 'Inicio', path: '/' },
          { name: 'Perfumes', path: '/catalogo' },
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
      'Checkout de demostración | Aroma Infini',
      'Proceso de compra de demostración de Aroma Infini.',
    )
  if (path === '/checkout/confirmacion')
    return privatePage(
      'Confirmación de demostración | Aroma Infini',
      'Confirmación local de una compra de demostración.',
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
      'Conoce la propuesta editorial y el criterio de selección de Aroma Infini.',
    ],
    '/contacto': [
      'Contacto | Aroma Infini',
      'Consulta el estado de los canales de atención de Aroma Infini.',
    ],
    '/envios': [
      'Envíos y entregas | Aroma Infini',
      'Consulta la información disponible sobre entregas de Aroma Infini en Perú.',
    ],
    '/devoluciones': [
      'Cambios y devoluciones | Aroma Infini',
      'Consulta el estado de la política de cambios y devoluciones de Aroma Infini.',
    ],
    '/preguntas-frecuentes': [
      'Preguntas frecuentes | Aroma Infini',
      'Encuentra respuestas breves sobre la propuesta de Aroma Infini.',
    ],
    '/privacidad': [
      'Privacidad | Aroma Infini',
      'Consulta el estado de la política de privacidad de Aroma Infini.',
    ],
    '/terminos': [
      'Términos y condiciones | Aroma Infini',
      'Consulta el estado de los términos y condiciones de Aroma Infini.',
    ],
    '/libro-de-reclamaciones': [
      'Libro de reclamaciones | Aroma Infini',
      'Consulta el estado de implementación del Libro de reclamaciones de Aroma Infini.',
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
      'Panel de demostración | Aroma Infini',
      'Panel administrativo frontend de demostración de Aroma Infini.',
    )

  if (path === '/cuenta/pagos')
    return privatePage(
      'Pagos | Aroma Infini',
      'Consulta la información privada de pagos de tu cuenta.',
    )

  return privatePage(
    'Página no disponible | Aroma Infini',
    'Esta página todavía no está disponible en Aroma Infini.',
  )
}
