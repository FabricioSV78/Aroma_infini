import type { Product, ProductDetail } from '../types/catalog'

interface ProductDetailContent extends Omit<ProductDetail, 'gallery'> {
  galleryLabels: [string, string, string, string]
}

const content: Record<string, ProductDetailContent> = {
  cedre: {
    type: 'Eau de Parfum',
    shortDescription:
      'Maderas claras y una frescura serena, pensadas para acompañar sin imponerse.',
    description:
      'Una composición de muestra que abre luminosa, encuentra textura en el cedro y termina sobre un fondo limpio. Su perfil propone una elegancia tranquila para distintos momentos del día.',
    notes: {
      top: ['Bergamota', 'Enebro', 'Hojas verdes'],
      heart: ['Cedro', 'Té blanco', 'Iris'],
      base: ['Vetiver', 'Almizcle', 'Ámbar claro'],
    },
    intensity: 'Moderada',
    intensityLevel: 2,
    occasion: 'Diario · oficina',
    season: 'Todo el año',
    galleryLabels: [
      'Vista frontal conceptual de Bois Clair',
      'Vista del atomizador de Bois Clair',
      'Detalle conceptual del frasco de Bois Clair',
      'Detalle conceptual de la presentación de Bois Clair',
    ],
    recommendationIds: ['sillage', 'ambre', 'petale'],
  },
  petale: {
    type: 'Eau de Parfum',
    shortDescription:
      'Pétalos transparentes, iris y almizcles suaves en una lectura contemporánea.',
    description:
      'Una interpretación floral de muestra que evita el exceso. La salida se siente nítida; el corazón aporta volumen y el fondo permanece cercano a la piel.',
    notes: {
      top: ['Bergamota', 'Pera', 'Pimienta rosa'],
      heart: ['Peonía', 'Iris', 'Jazmín'],
      base: ['Almizcle blanco', 'Sándalo', 'Ambreta'],
    },
    intensity: 'Suave',
    intensityLevel: 1,
    occasion: 'Diario · encuentros',
    season: 'Primavera · verano',
    galleryLabels: [
      'Vista frontal conceptual de Pétale Nu',
      'Vista alternativa de Pétale Nu',
      'Detalle conceptual del frasco de Pétale Nu',
      'Detalle conceptual de la presentación de Pétale Nu',
    ],
    recommendationIds: ['cedre', 'sillage', 'ambre'],
  },
  sillage: {
    type: 'Eau de Parfum',
    shortDescription:
      'Verde, aromático y preciso: una estela fresca con profundidad de bosque.',
    description:
      'Una construcción de muestra entre hojas húmedas, hierbas aromáticas y maderas secas. Conserva una presencia definida sin perder ligereza.',
    notes: {
      top: ['Lima', 'Hoja de violeta', 'Enebro'],
      heart: ['Té verde', 'Salvia', 'Hoja de higuera'],
      base: ['Vetiver', 'Cedro', 'Musgo'],
    },
    intensity: 'Moderada',
    intensityLevel: 2,
    occasion: 'Diario · exterior',
    season: 'Primavera · otoño',
    galleryLabels: [
      'Vista frontal conceptual de Vert Silence',
      'Vista alternativa de Vert Silence',
      'Detalle conceptual del frasco de Vert Silence',
      'Detalle conceptual de la presentación de Vert Silence',
    ],
    recommendationIds: ['cedre', 'petale', 'ambre'],
  },
  ambre: {
    type: 'Eau de Parfum',
    shortDescription:
      'Ámbar, resinas y especias suaves en una composición de ritmo pausado.',
    description:
      'Una lectura ambarada de muestra que evoluciona desde especias luminosas hacia resinas y maderas cálidas. Su carácter es envolvente y sereno.',
    notes: {
      top: ['Mandarina', 'Cardamomo', 'Pimienta rosa'],
      heart: ['Incienso', 'Ládano', 'Iris'],
      base: ['Ámbar', 'Haba tonka', 'Sándalo'],
    },
    intensity: 'Intensa',
    intensityLevel: 3,
    occasion: 'Noche · ocasiones',
    season: 'Otoño · invierno',
    galleryLabels: [
      'Vista frontal conceptual de Ambre Lent',
      'Vista alternativa de Ambre Lent',
      'Detalle conceptual del frasco de Ambre Lent',
      'Detalle conceptual de la presentación de Ambre Lent',
    ],
    recommendationIds: ['sillage', 'cedre', 'petale'],
  },
}

export function getProductDetail(product: Product): ProductDetail | undefined {
  const detail = content[product.id]
  if (!detail) return undefined
  const [front, alternate, bottleDetail, presentationDetail] =
    detail.galleryLabels
  return {
    ...detail,
    gallery: [
      { image: product.image, alt: front, framing: 'full' },
      {
        image: `${product.image}-alternate`,
        alt: alternate,
        framing: 'full',
      },
      { image: product.image, alt: bottleDetail, framing: 'detail-top' },
      {
        image: `${product.image}-alternate`,
        alt: presentationDetail,
        framing: 'detail-base',
      },
    ],
  }
}
