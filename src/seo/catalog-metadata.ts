/** Public copy shared by the browser and the Worker's initial HTML response. */
export interface CatalogPageMetadata {
  title: string
  description: string
  canonicalPath: string | null
  type: 'website' | 'product'
  imagePath?: string
  imageAlt?: string
}

export function shareableProductImage(image: string): string | undefined {
  if (
    /^\/media\/public\/dynamic\/[a-f0-9-]{36}\/[a-f0-9]{64}\/\d+\.webp$/i.test(
      image,
    )
  )
    return image
  if (/^https:\/\//i.test(image)) return image
  if (/^\/images\/[a-z0-9-]+\.webp$/i.test(image)) return image
  if (/^[a-z0-9-]+$/i.test(image)) return `/images/${image}-960.webp`
  return undefined
}

export function productPageMetadata(input: {
  name: string
  brandName?: string | null
  slug: string
  description: string
  imagePath?: string
}): CatalogPageMetadata {
  const identity = `${input.name}${input.brandName ? ` de ${input.brandName}` : ''}`
  return {
    title: `${identity} | Aroma Infini`,
    description: input.description,
    canonicalPath: `/producto/${input.slug}`,
    type: 'product',
    imagePath: input.imagePath,
    imageAlt: identity,
  }
}

export function brandPageMetadata(input: {
  name: string
  slug: string
  imagePath?: string
}): CatalogPageMetadata {
  return {
    title: `${input.name}: perfumes | Aroma Infini`,
    description: `Conoce los perfumes de ${input.name} y sus presentaciones en Aroma Infini.`,
    canonicalPath: `/marcas/${input.slug}`,
    type: 'website',
    imagePath: input.imagePath,
    imageAlt: `Perfume de ${input.name} en Aroma Infini`,
  }
}
