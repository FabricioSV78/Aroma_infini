import type {
  FinderOption,
  FinderOptions,
  FinderStep,
} from '../types/fragrance-finder'
import type { IconName } from '../components/ui/Icon'
import type { HomeFinderContent } from '../types/home'

export const finderSteps: {
  id: FinderStep
  icon: IconName
}[] = [
  { id: 'family', icon: 'botanical' },
  { id: 'occasion', icon: 'dayNight' },
  { id: 'intensity', icon: 'scent' },
  { id: 'budget', icon: 'tag' },
]

type CatalogStep = Exclude<FinderStep, 'budget'>

export function visibleCatalogOptions(
  step: CatalogStep,
  options: FinderOptions,
  content: HomeFinderContent,
): FinderOption[] {
  const available =
    step === 'family'
      ? options.families
      : step === 'occasion'
        ? options.occasions
        : options.intensities
  const enabled = content.enabledOptions[step]
  if (enabled === null) return available
  const byValue = new Map(available.map((option) => [option.value, option]))
  return enabled.flatMap((value) => {
    const option = byValue.get(value)
    return option ? [option] : []
  })
}

export function optionsForStep(
  step: FinderStep,
  options: FinderOptions,
  content: HomeFinderContent,
): FinderOption[] {
  if (step === 'budget')
    return [
      ...content.budgets.map((amount) => ({
        value: String(amount * 100),
        label: `Hasta S/ ${amount}`,
      })),
      { value: '', label: content.budgetNoLimitLabel },
    ]
  const values = visibleCatalogOptions(step, options, content)
  return [
    ...values.map((option) => ({
      ...option,
      label: content.optionLabels[step][option.value] ?? option.label,
    })),
    { value: '', label: content.noPreferenceLabel },
  ]
}

export function familyVisualFor(value: string, content: HomeFinderContent) {
  const fallback = familyVisuals[value]
  const edited = content.familyVisuals[value]
  if (!fallback && !edited) return undefined
  return {
    image: edited?.image ?? fallback?.image,
    description: edited?.description ?? fallback?.description ?? '',
  }
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
