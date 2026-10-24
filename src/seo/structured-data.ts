import { getVariantPrice } from '../services/product-discounts'
import type { SeoPageConfig } from './seo-config'

export const SITE_NAME = 'Aroma Infini'

export function absoluteUrl(origin: string, path: string) {
  return new URL(path, `${origin}/`).toString()
}

export function buildSeoStructuredData(
  config: SeoPageConfig,
  origin: string,
  publishCommercialData: boolean,
  now: number = Date.now(),
) {
  const graph: Record<string, unknown>[] = []
  const productImagePath = config.product?.imagePath
  if (config.canonicalPath === '/') {
    graph.push(
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: `${origin}/`,
        logo: absoluteUrl(origin, '/brand/logo-on-light.svg'),
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: `${origin}/`,
        inLanguage: 'es-PE',
        publisher: { '@id': `${origin}/#organization` },
      },
    )
  }
  if (config.breadcrumbs?.length)
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: config.breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absoluteUrl(origin, item.path),
      })),
    })
  if (
    publishCommercialData &&
    config.product &&
    productImagePath &&
    config.canonicalPath
  ) {
    const product = config.product
    const activeVariants = product.variants.filter(
      (variant) => variant.active !== false,
    )
    const availableVariants = activeVariants.filter(
      (variant) => variant.stock > 0,
    )
    const variants = availableVariants.length
      ? availableVariants
      : activeVariants
    const prices = variants.map((variant) => {
      const price = getVariantPrice(product.source, variant, now)
      return (
        (availableVariants.length ? price.finalCents : price.originalCents) /
        100
      )
    })
    const url = absoluteUrl(origin, config.canonicalPath)
    graph.push({
      '@type': 'Product',
      '@id': `${url}#product`,
      name: product.name,
      description: product.description,
      image: absoluteUrl(origin, productImagePath),
      ...(product.brand
        ? { brand: { '@type': 'Brand', name: product.brand } }
        : {}),
      ...(prices.length
        ? {
            offers: {
              '@type': 'AggregateOffer',
              url,
              priceCurrency: 'PEN',
              lowPrice: Math.min(...prices).toFixed(2),
              highPrice: Math.max(...prices).toFixed(2),
              offerCount: prices.length,
              availability: availableVariants.length
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            },
          }
        : {}),
    })
  }
  return graph.length
    ? { '@context': 'https://schema.org', '@graph': graph }
    : null
}
