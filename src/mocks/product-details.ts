import type { Product, ProductDetail } from '../types/catalog'

interface ProductDetailContent extends Omit<ProductDetail, 'gallery'> {
  galleryLabels: [string, string, string, string]
}

const content: Record<string, ProductDetailContent> = {
  neroli: {
    type: 'Eau de Parfum',
    shortDescription:
      'Néroli y cítricos sobre un fondo suave de maderas claras.',
    description:
      'Una apertura de bergamota y mandarina da paso a flores de naranjo. El cedro y el almizcle prolongan una sensación ligera y luminosa.',
    notes: {
      top: ['Bergamota', 'Mandarina'],
      heart: ['Néroli', 'Flor de naranjo'],
      base: ['Cedro', 'Almizcle'],
    },
    intensity: 'Suave',
    intensityLevel: 1,
    occasion: 'Diario · exterior',
    season: 'Primavera · verano',
    galleryLabels: [
      'Vista frontal de Néroli Matin',
      'Vista alternativa de Néroli Matin',
      'Detalle del frasco de Néroli Matin',
      'Detalle de la presentación de Néroli Matin',
    ],
    recommendationIds: ['cedre', 'figue', 'petale', 'ambre'],
  },
  iris: {
    type: 'Eau de Parfum',
    shortDescription:
      'Iris y violeta con una textura empolvada y un fondo de sándalo.',
    description:
      'La frescura de la pera acompaña un corazón de iris y violeta. El fondo de sándalo y almizcle envuelve la composición con una presencia suave.',
    notes: {
      top: ['Pera', 'Bergamota'],
      heart: ['Iris', 'Violeta'],
      base: ['Sándalo', 'Almizcle blanco'],
    },
    intensity: 'Moderada',
    intensityLevel: 2,
    occasion: 'Diario · encuentros',
    season: 'Todo el año',
    galleryLabels: [
      'Vista frontal de Iris Velours',
      'Vista alternativa de Iris Velours',
      'Detalle del frasco de Iris Velours',
      'Detalle de la presentación de Iris Velours',
    ],
    recommendationIds: ['petale', 'santal', 'cedre', 'sillage'],
  },
  figue: {
    type: 'Eau de Parfum',
    shortDescription:
      'Hojas de higuera, té verde y maderas suaves en equilibrio.',
    description:
      'Una salida verde y fresca se abre hacia un corazón de higo y té. Las maderas aportan una textura cremosa que conserva la ligereza de la composición.',
    notes: {
      top: ['Hoja de higuera', 'Lima'],
      heart: ['Higo', 'Té verde'],
      base: ['Sándalo', 'Cedro'],
    },
    intensity: 'Moderada',
    intensityLevel: 2,
    occasion: 'Diario · exterior',
    season: 'Primavera · otoño',
    galleryLabels: [
      'Vista frontal de Figue Douce',
      'Vista alternativa de Figue Douce',
      'Detalle del frasco de Figue Douce',
      'Detalle de la presentación de Figue Douce',
    ],
    recommendationIds: ['sillage', 'neroli', 'iris', 'ambre'],
  },
  santal: {
    type: 'Eau de Parfum',
    shortDescription:
      'Sándalo, cardamomo y ámbar para una estela cálida y pausada.',
    description:
      'El cardamomo abre una composición de maderas cremosas e incienso. El ámbar y la haba tonka aportan profundidad al fondo, con un carácter cálido y envolvente.',
    notes: {
      top: ['Cardamomo', 'Pimienta rosa'],
      heart: ['Sándalo', 'Incienso'],
      base: ['Ámbar', 'Haba tonka'],
    },
    intensity: 'Intensa',
    intensityLevel: 3,
    occasion: 'Noche · ocasiones',
    season: 'Otoño · invierno',
    galleryLabels: [
      'Vista frontal de Santal Nuit',
      'Vista alternativa de Santal Nuit',
      'Detalle del frasco de Santal Nuit',
      'Detalle de la presentación de Santal Nuit',
    ],
    recommendationIds: ['ambre', 'iris', 'cedre', 'sillage'],
  },
  cedre: {
    type: 'Eau de Parfum',
    shortDescription:
      'Maderas claras y una frescura serena, pensadas para acompañar sin imponerse.',
    description:
      'Una composición que abre luminosa, encuentra textura en el cedro y termina sobre un fondo limpio. Su perfil propone una elegancia tranquila para distintos momentos del día.',
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
      'Vista frontal de Bois Clair',
      'Vista del atomizador de Bois Clair',
      'Detalle del frasco de Bois Clair',
      'Detalle de la presentación de Bois Clair',
    ],
    recommendationIds: ['sillage', 'ambre', 'petale', 'neroli'],
  },
  petale: {
    type: 'Eau de Parfum',
    shortDescription:
      'Pétalos transparentes, iris y almizcles suaves en una lectura contemporánea.',
    description:
      'Una interpretación floral que evita el exceso. La salida se siente nítida; el corazón aporta volumen y el fondo permanece cercano a la piel.',
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
      'Vista frontal de Pétale Nu',
      'Vista alternativa de Pétale Nu',
      'Detalle del frasco de Pétale Nu',
      'Detalle de la presentación de Pétale Nu',
    ],
    recommendationIds: ['cedre', 'sillage', 'ambre', 'iris'],
  },
  sillage: {
    type: 'Eau de Parfum',
    shortDescription:
      'Verde, aromático y preciso: una estela fresca con profundidad de bosque.',
    description:
      'Una construcción entre hojas húmedas, hierbas aromáticas y maderas secas. Conserva una presencia definida sin perder ligereza.',
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
      'Vista frontal de Vert Silence',
      'Vista alternativa de Vert Silence',
      'Detalle del frasco de Vert Silence',
      'Detalle de la presentación de Vert Silence',
    ],
    recommendationIds: ['cedre', 'petale', 'ambre', 'figue'],
  },
  ambre: {
    type: 'Eau de Parfum',
    shortDescription:
      'Ámbar, resinas y especias suaves en una composición de ritmo pausado.',
    description:
      'Una lectura ambarada que evoluciona desde especias luminosas hacia resinas y maderas cálidas. Su carácter es envolvente y sereno.',
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
      'Vista frontal de Ambre Lent',
      'Vista alternativa de Ambre Lent',
      'Detalle del frasco de Ambre Lent',
      'Detalle de la presentación de Ambre Lent',
    ],
    recommendationIds: ['sillage', 'cedre', 'petale', 'santal'],
  },
}

export function getProductDetail(product: Product): ProductDetail | undefined {
  const detail = content[product.id]
  if (!detail) return undefined
  const [front, alternate] = detail.galleryLabels
  return {
    ...detail,
    gallery: [
      { image: product.image, alt: front, framing: 'full' },
      { image: `${product.image}-alternate`, alt: alternate, framing: 'full' },
      {
        image: `${product.image}-detail`,
        alt: `Detalle de la tapa y el frasco de ${product.name}`,
        framing: 'full',
      },
      {
        image: `${product.image}-back`,
        alt: `Vista posterior en ángulo de ${product.name}`,
        framing: 'full',
      },
    ],
  }
}
