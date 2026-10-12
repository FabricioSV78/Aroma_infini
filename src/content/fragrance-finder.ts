import type {
  FinderOption,
  FinderOptions,
  FinderStep,
} from '../types/fragrance-finder'
import type { IconName } from '../components/ui/Icon'

export const finderSteps: {
  id: FinderStep
  label: string
  question: string
  description: string
  icon: IconName
}[] = [
  {
    id: 'family',
    label: 'Aroma',
    question: '¿Qué aroma te atrae más?',
    description:
      'Elige una dirección para empezar. No necesitas conocer las notas.',
    icon: 'botanical',
  },
  {
    id: 'occasion',
    label: 'Momento',
    question: '¿Cuándo te gustaría llevarlo?',
    description: 'Piensa en el momento para el que estás buscando un perfume.',
    icon: 'dayNight',
  },
  {
    id: 'intensity',
    label: 'Presencia',
    question: '¿Qué intensidad prefieres?',
    description:
      'Usamos la intensidad indicada en cada ficha; no equivale a horas de duración.',
    icon: 'scent',
  },
  {
    id: 'budget',
    label: 'Presupuesto',
    question: '¿Cuánto te gustaría invertir?',
    description:
      'Buscaremos una presentación disponible dentro de ese importe.',
    icon: 'tag',
  },
]

export const finderBudgets: FinderOption[] = [
  { value: '40000', label: 'Hasta S/ 400' },
  { value: '50000', label: 'Hasta S/ 500' },
  { value: '65000', label: 'Hasta S/ 650' },
  { value: '', label: 'Sin límite de presupuesto' },
]

export function optionsForStep(
  step: FinderStep,
  options: FinderOptions,
): FinderOption[] {
  if (step === 'budget') return finderBudgets
  const values =
    step === 'family'
      ? options.families
      : step === 'occasion'
        ? options.occasions
        : options.intensities
  return [...values, { value: '', label: 'Sin preferencia' }]
}

// Mood photography illustrates the choice, never product ingredients or scoring.
export const familyVisuals: Record<
  string,
  { image: string; description: string }
> = {
  amaderado: {
    image: '/images/olfactory-cedre.webp',
    description: 'La dirección de las maderas',
  },
  floral: {
    image: '/images/olfactory-petale.webp',
    description: 'La dirección de las flores',
  },
  verde: {
    image: '/images/olfactory-sillage.webp',
    description: 'Una dirección vegetal',
  },
  citrico: {
    image: '/images/olfactory-neroli.webp',
    description: 'La dirección de los cítricos',
  },
  ambar: {
    image: '/images/olfactory-ambre.webp',
    description: 'La dirección ambarada',
  },
}

export const resultCopy = {
  matches: {
    title: 'Perfumes que encajan contigo',
    description:
      'Coinciden con las preferencias que elegiste. Estas presentaciones tienen stock disponible.',
  },
  partial: {
    title: 'Cerca de lo que buscas',
    description:
      'No hay una coincidencia completa. Explora estas opciones cercanas a lo que elegiste.',
  },
  budget: {
    title: 'Dentro de tu presupuesto',
    description:
      'Elegiste solo un presupuesto. Estas son las presentaciones disponibles de menor precio; puedes afinar tu búsqueda indicando un aroma.',
  },
  empty: {
    title: 'Todavía no encontramos esa combinación',
    description:
      'No hay perfumes disponibles para esas preferencias y ese presupuesto. Puedes cambiar tus respuestas o explorar la tienda.',
  },
  unavailable: {
    title: 'No hay perfumes disponibles ahora',
    description:
      'El catálogo no tiene presentaciones con stock para recomendar. Puedes volver a intentarlo más adelante.',
  },
  preferences: {
    title: 'Danos una pista para empezar',
    description:
      'Elige al menos un aroma, un momento, una intensidad o un presupuesto. Así podremos orientarte con una razón concreta.',
  },
} as const
