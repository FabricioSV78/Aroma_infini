import { useRef, useState, type ChangeEvent } from 'react'
import '../../styles/home-categories.css'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { categories, heroDisplayOrder, heroSlides } from '../../content/home'
import { editorialFilm } from '../../content/editorial-film'
import { familyVisuals, finderSteps } from '../../content/fragrance-finder'
import type {
  HomeAnnouncementContent,
  HomeContent,
  HomeFilmContent,
  HomeFinderContent,
  HomeHeroContent,
} from '../../content/home-editor'
import {
  adminService,
  type HomeMedia,
  type HomeMediaKey,
} from '../../services/admin-service'
import { imageSource } from '../../services/image-source'
import { assetSource } from '../../services/asset-source'
import { heroImageSource } from '../../services/hero-image-source'
import { formatPEN } from '../../services/currency'
import { getFinderOptions } from '../../services/fragrance-matching'
import { localStorefrontRepository } from '../../services/storefront-repository'
import type { FinderResult, FinderStep } from '../../types/fragrance-finder'
import type { StoreFeatures } from '../../domain/store-features'
import { AdminNotice, AdminPageHeader } from './AdminShared'
import { homeImagePresets, prepareImageFile } from './prepareImageFile'
import { prepareVideoFile } from './prepareVideoFile'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { headingText } from '../../utils/heading-text'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { useAdminNotice } from './AdminNoticeProvider'

type HomeTab =
  'hero' | 'announcement' | 'categories' | 'brands' | 'film' | 'finder'
type FinderView = 'presentation' | 'questions' | 'results'
type CatalogFinderStep = Exclude<FinderStep, 'budget'>
const finderStepIds: FinderStep[] = [
  'family',
  'occasion',
  'intensity',
  'budget',
]
const finderResultKinds: FinderResult['kind'][] = [
  'matches',
  'partial',
  'budget',
  'empty',
  'unavailable',
  'preferences',
]
const finderResultNames: Record<FinderResult['kind'], string> = {
  matches: 'Coincidencias',
  partial: 'Coincidencias cercanas',
  budget: 'Solo presupuesto',
  empty: 'Sin coincidencias',
  unavailable: 'Sin stock',
  preferences: 'Sin preferencias',
}

function sameFields<T extends object>(left: T, right: T) {
  return (Object.keys(left) as Array<keyof T>).every(
    (key) => left[key] === right[key],
  )
}

function sameStringEntries(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => left[key] === right[key])
}

function sameFinderContent(left: HomeFinderContent, right: HomeFinderContent) {
  const textFields = [
    'eyebrow',
    'title',
    'description',
    'cta',
    'desktopImage',
    'mobileImage',
    'entryLabel',
    'entryQuestion',
    'modalTitle',
    'noPreferenceLabel',
    'budgetNoLimitLabel',
    'singleResultTitle',
  ] as const
  if (textFields.some((key) => left[key] !== right[key])) return false
  if (
    left.budgets.length !== right.budgets.length ||
    left.budgets.some((amount, index) => amount !== right.budgets[index])
  )
    return false
  if (
    finderStepIds.some(
      (step) => !sameFields(left.steps[step], right.steps[step]),
    )
  )
    return false
  if (
    (['family', 'occasion', 'intensity'] as CatalogFinderStep[]).some(
      (step) =>
        !sameStringEntries(left.optionLabels[step], right.optionLabels[step]) ||
        (left.enabledOptions[step] === null) !==
          (right.enabledOptions[step] === null) ||
        (left.enabledOptions[step] !== null &&
          right.enabledOptions[step] !== null &&
          (left.enabledOptions[step].length !==
            right.enabledOptions[step].length ||
            left.enabledOptions[step].some(
              (value, index) => value !== right.enabledOptions[step]?.[index],
            ))),
    )
  )
    return false
  const visualKeys = new Set([
    ...Object.keys(left.familyVisuals),
    ...Object.keys(right.familyVisuals),
  ])
  if (
    [...visualKeys].some((key) => {
      const previous = left.familyVisuals[key]
      const next = right.familyVisuals[key]
      return !previous || !next || !sameFields(previous, next)
    })
  )
    return false
  return finderResultKinds.every((kind) =>
    sameFields(left.resultCopy[kind], right.resultCopy[kind]),
  )
}

function sameHomeContent(left: HomeContent, right: HomeContent) {
  return (
    left.featuredBrandId === right.featuredBrandId &&
    left.hero.length === right.hero.length &&
    left.hero.every((slide, index) => sameFields(slide, right.hero[index])) &&
    sameFields(left.announcement, right.announcement) &&
    sameFields(left.film, right.film) &&
    sameFinderContent(left.finder, right.finder)
  )
}

export function AdminHomePage() {
  const state = useAdminStore()
  const notice = useAdminNotice()
  const [tab, setTab] = useState<HomeTab>('hero')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [media, setMedia] = useState<HomeMedia>(() => ({ ...state.homeMedia }))
  const [content, setContent] = useState<HomeContent>(() => state.homeContent)
  const [features, setFeatures] = useState<StoreFeatures>(() => ({
    ...state.features,
  }))
  const [selectedSlide, setSelectedSlide] = useState<number>(
    heroDisplayOrder[0],
  )
  const [heroPreview, setHeroPreview] = useState<'desktop' | 'mobile'>(
    'desktop',
  )
  const [finderView, setFinderView] = useState<FinderView>('presentation')
  const [finderPreview, setFinderPreview] = useState<'desktop' | 'mobile'>(
    'desktop',
  )
  const [selectedFinderStep, setSelectedFinderStep] =
    useState<FinderStep>('family')
  const [expandedFinderOption, setExpandedFinderOption] = useState<
    string | null
  >(null)
  const [selectedResultKind, setSelectedResultKind] =
    useState<FinderResult['kind']>('matches')
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const persistence = useAdminSave()
  const saving = persistence.saving
  const mediaPreparationRef = useRef(false)
  const [preparingMedia, setPreparingMedia] = useState(false)
  const [savedDraft, setSavedDraft] = useState(() => ({
    media,
    content,
    features,
  }))
  const dirty =
    !sameFields(media, savedDraft.media) ||
    !sameHomeContent(content, savedDraft.content) ||
    !sameFields(features, savedDraft.features)
  useUnsavedChanges(
    dirty || saving || persistence.persistenceFailed || preparingMedia,
  )
  const featuredBrand = state.brands.find(
    (brand) => brand.id === content.featuredBrandId,
  )
  const unavailableFeaturedBrand =
    content.featuredBrandId !== null && !featuredBrand?.active
  const visibleCategories = categories.filter(
    (category) => category.id !== 'complementos' || features.complementsEnabled,
  )
  const finderOptions = getFinderOptions(
    localStorefrontRepository.peekSnapshot(),
  )
  const finderStep = content.finder.steps[selectedFinderStep]
  const catalogFinderOptions =
    selectedFinderStep === 'family'
      ? finderOptions.families
      : selectedFinderStep === 'occasion'
        ? finderOptions.occasions
        : selectedFinderStep === 'intensity'
          ? finderOptions.intensities
          : []
  const configuredFinderValues =
    selectedFinderStep === 'budget'
      ? null
      : content.finder.enabledOptions[selectedFinderStep]
  const visibleFinderOptions = catalogFinderOptions.filter(
    (option) =>
      configuredFinderValues === null ||
      configuredFinderValues.includes(option.value),
  )
  const hiddenFinderOptions = catalogFinderOptions.filter(
    (option) =>
      configuredFinderValues !== null &&
      !configuredFinderValues.includes(option.value),
  )
  const visibleFamilyOptions = finderOptions.families.filter(
    (option) =>
      content.finder.enabledOptions.family === null ||
      content.finder.enabledOptions.family.includes(option.value),
  )
  const finderPreviewImage = assetSource(
    finderPreview === 'mobile'
      ? (content.finder.mobileImage ??
          content.finder.desktopImage ??
          '/images/olfactory-cedre.webp')
      : (content.finder.desktopImage ?? '/images/olfactory-cedre.webp'),
  )
  const currentSlide = content.hero[selectedSlide]
  const defaultSlide = heroSlides[selectedSlide]
  const displayOrder: readonly number[] = heroDisplayOrder
  const selectedSlideNumber = displayOrder.indexOf(selectedSlide) + 1
  const heroPreviewImage = assetSource(
    heroPreview === 'mobile'
      ? (currentSlide.mobileImage ??
          currentSlide.desktopImage ??
          heroImageSource(defaultSlide.image, 'mobile', 780))
      : (currentSlide.desktopImage ??
          heroImageSource(defaultSlide.image, 'desktop', 1536)),
  )

  function updateHero(index: number, patch: Partial<HomeHeroContent>) {
    setContent((current) => ({
      ...current,
      hero: current.hero.map((slide, slideIndex) => {
        if (slideIndex !== index) return slide
        const next = { ...slide, ...patch }
        if (
          patch.title !== undefined ||
          patch.desktopImage !== undefined ||
          patch.mobileImage !== undefined
        ) {
          const defaultAlt = heroSlides[index].alt
          const generatedAlt = 'Imagen de la campaña «'
          const title = next.title.replace(/\s+/g, ' ').trim()
          next.alt =
            next.desktopImage || next.mobileImage
              ? `${generatedAlt}${title || `Campaña ${index + 1}`}»`.slice(
                  0,
                  160,
                )
              : defaultAlt
        }
        return next
      }),
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateAnnouncement(patch: Partial<HomeAnnouncementContent>) {
    setContent((current) => ({
      ...current,
      announcement: { ...current.announcement, ...patch },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFilm(patch: Partial<HomeFilmContent>) {
    setContent((current) => ({
      ...current,
      film: { ...current.film, ...patch },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFinder(patch: Partial<HomeFinderContent>) {
    setContent((current) => ({
      ...current,
      finder: { ...current.finder, ...patch },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFinderStep(
    step: FinderStep,
    patch: Partial<HomeFinderContent['steps'][FinderStep]>,
  ) {
    setContent((current) => ({
      ...current,
      finder: {
        ...current.finder,
        steps: {
          ...current.finder.steps,
          [step]: { ...current.finder.steps[step], ...patch },
        },
      },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFinderOptionLabel(
    step: CatalogFinderStep,
    value: string,
    label: string,
  ) {
    setContent((current) => ({
      ...current,
      finder: {
        ...current.finder,
        optionLabels: {
          ...current.finder.optionLabels,
          [step]: { ...current.finder.optionLabels[step], [value]: label },
        },
      },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function setFinderOptionVisible(value: string, visible: boolean) {
    if (selectedFinderStep === 'budget') return
    const currentValues = content.finder.enabledOptions[selectedFinderStep]
    const selected =
      currentValues === null
        ? catalogFinderOptions.map((option) => option.value)
        : currentValues.filter((optionValue) =>
            catalogFinderOptions.some((option) => option.value === optionValue),
          )
    const next = catalogFinderOptions
      .map((option) => option.value)
      .filter((optionValue) =>
        optionValue === value ? visible : selected.includes(optionValue),
      )
    if (next.length === 0) return
    updateFinder({
      enabledOptions: {
        ...content.finder.enabledOptions,
        [selectedFinderStep]: next,
      },
    })
  }

  function addFinderBudget() {
    const lastAmount = content.finder.budgets.at(-1) ?? 0
    if (content.finder.budgets.length >= 6 || lastAmount >= 10_000) return
    updateFinder({
      budgets: [...content.finder.budgets, Math.min(lastAmount + 100, 10_000)],
    })
  }

  function removeFinderBudget(index: number) {
    if (content.finder.budgets.length <= 1) return
    updateFinder({
      budgets: content.finder.budgets.filter(
        (_, budgetIndex) => budgetIndex !== index,
      ),
    })
  }

  function updateFinderFamilyVisual(
    value: string,
    patch: Partial<HomeFinderContent['familyVisuals'][string]>,
  ) {
    setContent((current) => ({
      ...current,
      finder: {
        ...current.finder,
        familyVisuals: {
          ...current.finder.familyVisuals,
          [value]: {
            description:
              current.finder.familyVisuals[value]?.description ??
              familyVisuals[value]?.description ??
              '',
            image: current.finder.familyVisuals[value]?.image ?? null,
            ...patch,
          },
        },
      },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function updateFinderResult(
    kind: FinderResult['kind'],
    patch: Partial<HomeFinderContent['resultCopy'][FinderResult['kind']]>,
  ) {
    setContent((current) => ({
      ...current,
      finder: {
        ...current.finder,
        resultCopy: {
          ...current.finder.resultCopy,
          [kind]: { ...current.finder.resultCopy[kind], ...patch },
        },
      },
    }))
    setMessage('')
    setMessageIsError(false)
  }

  function beginMediaPreparation() {
    if (mediaPreparationRef.current || saving || persistence.persistenceFailed)
      return false
    mediaPreparationRef.current = true
    setPreparingMedia(true)
    setMessage('')
    setMessageIsError(false)
    return true
  }

  function endMediaPreparation() {
    mediaPreparationRef.current = false
    setPreparingMedia(false)
  }

  async function uploadHeroImage(
    index: number,
    kind: 'desktopImage' | 'mobileImage',
    file: File,
  ) {
    if (!beginMediaPreparation()) return
    try {
      const preset =
        kind === 'desktopImage'
          ? homeImagePresets.heroDesktop
          : homeImagePresets.heroMobile
      const image = await prepareImageFile(file, preset)
      updateHero(index, { [kind]: image })
      notice.toast('Imagen preparada. Guarda los cambios para publicarla.')
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      endMediaPreparation()
    }
  }

  function heroFileChanged(
    index: number,
    kind: 'desktopImage' | 'mobileImage',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadHeroImage(index, kind, file)
  }

  async function uploadFilm(file: File) {
    if (!beginMediaPreparation()) return
    try {
      const prepared = await prepareVideoFile(file)
      updateFilm(prepared)
      notice.toast('Video preparado. Guarda los cambios para publicarlo.')
    } catch (error) {
      notice.error(error, 'video')
    } finally {
      endMediaPreparation()
    }
  }

  async function uploadImage(key: HomeMediaKey, file: File) {
    if (!beginMediaPreparation()) return
    try {
      const image = await prepareImageFile(file, homeImagePresets[key])
      setMedia((current) => ({ ...current, [key]: image }))
      notice.toast('Imagen preparada. Guarda los cambios para publicarla.')
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      endMediaPreparation()
    }
  }

  function fileChanged(
    key: HomeMediaKey,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadImage(key, file)
  }

  async function uploadFinderImage(
    kind: 'desktopImage' | 'mobileImage',
    file: File,
  ) {
    if (!beginMediaPreparation()) return
    try {
      const preset =
        kind === 'desktopImage'
          ? homeImagePresets.finderDesktop
          : homeImagePresets.finderMobile
      const image = await prepareImageFile(file, preset)
      updateFinder({ [kind]: image })
      notice.toast('Imagen preparada. Guarda los cambios para publicarla.')
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      endMediaPreparation()
    }
  }

  async function uploadFinderOptionImage(value: string, file: File) {
    if (!beginMediaPreparation()) return
    try {
      const image = await prepareImageFile(file, homeImagePresets.finderOption)
      updateFinderFamilyVisual(value, { image })
      notice.toast('Imagen preparada. Guarda los cambios para publicarla.')
    } catch (error) {
      notice.error(error, 'image')
    } finally {
      endMediaPreparation()
    }
  }

  function finderFileChanged(
    kind: 'desktopImage' | 'mobileImage',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadFinderImage(kind, file)
  }

  function finderOptionFileChanged(
    value: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadFinderOptionImage(value, file)
  }

  function renderCategoryImageControl(category: (typeof categories)[number]) {
    const key = category.id as HomeMediaKey
    return (
      <div className="admin-home-image-control" key={category.id}>
        <div>
          <strong>{category.title}</strong>
          <small>
            {homeImagePresets[key].label}
            {key === 'complementos' && !media[key]
              ? ' · Fotografía conceptual provisional: reemplazar por el material del cliente.'
              : ''}
          </small>
        </div>
        <label className="admin-home-file-button">
          Cambiar imagen
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-label={`Subir imagen de ${category.title}`}
            onChange={(event) => fileChanged(key, event)}
          />
        </label>
        {media[key] ? (
          <button
            className="admin-home-reset"
            type="button"
            onClick={() => {
              setMedia((current) => ({ ...current, [key]: null }))
              setMessage('')
              setMessageIsError(false)
            }}
          >
            Usar original
          </button>
        ) : null}
      </div>
    )
  }

  async function saveHome() {
    if (mediaPreparationRef.current) return
    setMessage('')
    setMessageIsError(false)
    const result = await persistence.save(
      () => adminService.saveHome(media, content, features),
      () => {
        setSavedDraft({ media, content, features })
        notice.toast(
          'Cambios guardados y visibles en el Home de este navegador.',
        )
      },
    )
    if (result?.kind === 'validation') {
      setMessageIsError(true)
      setMessage(result.message)
    }
  }

  return (
    <div className="admin-page admin-home-editor">
      <AdminPageHeader
        eyebrow="Edición visual"
        title="Home"
        description="Actualiza textos e imágenes y revisa cómo se verán en la tienda."
      />
      <div
        className="admin-editor-content"
        inert={saving || persistence.persistenceFailed || preparingMedia}
        aria-busy={saving || preparingMedia}
      >
        <div className="admin-home-topbar">
          <div
            className="admin-home-tabs"
            role="group"
            aria-label="Apartados del Home"
          >
            <button
              type="button"
              aria-label="Carrusel principal"
              aria-pressed={tab === 'hero'}
              onClick={() => setTab('hero')}
            >
              Carrusel
            </button>
            <button
              type="button"
              aria-label="Franja superior"
              aria-pressed={tab === 'announcement'}
              onClick={() => setTab('announcement')}
            >
              Franja
            </button>
            <button
              type="button"
              aria-label={
                features.complementsEnabled
                  ? 'Para él, para ella, unisex y complementos'
                  : 'Para él, para ella y unisex'
              }
              aria-pressed={tab === 'categories'}
              onClick={() => setTab('categories')}
            >
              Categorías
            </button>
            <button
              type="button"
              aria-pressed={tab === 'brands'}
              onClick={() => setTab('brands')}
            >
              Marcas
            </button>
            <button
              type="button"
              aria-label="Video editorial"
              aria-pressed={tab === 'film'}
              onClick={() => setTab('film')}
            >
              Video
            </button>
            <button
              type="button"
              aria-label="Encuentra tu perfume ideal"
              aria-pressed={tab === 'finder'}
              onClick={() => setTab('finder')}
            >
              Recomendador
            </button>
          </div>
          <div className="admin-home-topbar-actions">
            {tab !== 'brands' && (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setPreviewOpen(true)}
              >
                Abrir vista previa
              </button>
            )}
            <Link
              className="text-link"
              to={
                tab === 'hero' || tab === 'announcement'
                  ? '/'
                  : tab === 'categories'
                    ? '/#descubrir'
                    : tab === 'brands'
                      ? '/marcas'
                      : tab === 'film'
                        ? '/#ritual'
                        : '/#encuentra-tu-perfume'
              }
            >
              Ver en tienda ↗
            </Link>
          </div>
        </div>

        {tab === 'brands' ? (
          <section
            className="admin-home-controls admin-home-brand-controls"
            aria-labelledby="admin-home-brands-title"
          >
            <h2 id="admin-home-brands-title">Marca destacada del menú</h2>
            <p>
              Elige la marca que se abrirá desde «Marcas → Marca destacada».
            </p>
            <label className="admin-home-field">
              Marca destacada
              <select
                value={content.featuredBrandId ?? ''}
                disabled={saving}
                aria-describedby={
                  unavailableFeaturedBrand
                    ? 'admin-featured-brand-unavailable'
                    : undefined
                }
                onChange={(event) => {
                  const featuredBrandId = event.target.value || null
                  setContent((current) => ({ ...current, featuredBrandId }))
                  setMessage('')
                  setMessageIsError(false)
                }}
              >
                <option value="">Sin marca destacada</option>
                {unavailableFeaturedBrand && (
                  <option value={content.featuredBrandId ?? ''} disabled>
                    {featuredBrand?.name ?? 'Marca no disponible'} · Inactiva
                  </option>
                )}
                {state.brands
                  .filter((brand) => brand.active)
                  .map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
              </select>
            </label>
            {unavailableFeaturedBrand && (
              <p id="admin-featured-brand-unavailable" role="status">
                El acceso está oculto porque esta marca no está activa. Elige
                otra marca o selecciona «Sin marca destacada».
              </p>
            )}
            <Link className="text-link" to="/admin/marcas">
              Gestionar marcas ↗
            </Link>
          </section>
        ) : tab === 'announcement' ? (
          <div className="admin-home-workspace admin-home-workspace--modal">
            <Dialog
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              id="admin-home-preview"
              title="Vista previa · Franja superior"
              className="admin-home-preview-dialog"
            >
              <section
                className="admin-home-stage admin-home-announcement-stage"
                aria-labelledby="admin-home-announcement-preview-title"
              >
                <div className="admin-home-stage-heading">
                  <span className="eyebrow">Vista previa</span>
                  <h2 id="admin-home-announcement-preview-title">
                    Franja superior del Home
                  </h2>
                </div>
                <div className="admin-home-announcement-preview">
                  <span>
                    {content.announcement.deliveryText || 'Mensaje de entrega'}
                  </span>
                  {state.shipping.freeThresholdCents > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {content.announcement.freeShippingLabel ||
                          'Gratis desde'}{' '}
                        {formatPEN(state.shipping.freeThresholdCents)}
                      </span>
                    </>
                  )}
                </div>
                <p className="admin-home-announcement-note">
                  Se muestra sobre el carrusel principal en la portada.
                </p>
              </section>
            </Dialog>
            <section
              className="admin-home-controls"
              aria-labelledby="admin-home-announcement-title"
            >
              <h2 id="admin-home-announcement-title">Editar franja superior</h2>
              <p>
                Escribe mensajes breves y revisa el resultado antes de guardar.
              </p>
              <label className="admin-home-field">
                Mensaje de entrega
                <input
                  value={content.announcement.deliveryText}
                  maxLength={70}
                  onChange={(event) =>
                    updateAnnouncement({ deliveryText: event.target.value })
                  }
                />
                <small>La cobertura actual es Lima y Callao.</small>
              </label>
              <label className="admin-home-field">
                Texto antes del importe de envío gratis
                <input
                  value={content.announcement.freeShippingLabel}
                  maxLength={40}
                  onChange={(event) =>
                    updateAnnouncement({
                      freeShippingLabel: event.target.value,
                    })
                  }
                />
                <small>
                  El importe se agrega automáticamente desde Tarifas de envío.
                </small>
              </label>
              <Link className="text-link" to="/admin/envios">
                Cambiar importe de envío gratis ↗
              </Link>
            </section>
          </div>
        ) : tab === 'hero' ? (
          <div className="admin-home-workspace admin-home-workspace--modal">
            <Dialog
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              id="admin-home-preview"
              title="Vista previa · Carrusel principal"
              className="admin-home-preview-dialog"
            >
              <section
                className="admin-home-stage"
                aria-label="Vista previa del carrusel principal"
              >
                <div className="admin-home-stage-toolbar">
                  <div>
                    <span className="eyebrow">Carrusel principal</span>
                    <h2>
                      Campaña {selectedSlideNumber} de {displayOrder.length}
                    </h2>
                  </div>
                  <div
                    className="admin-home-preview-switch"
                    role="group"
                    aria-label="Formato de vista previa"
                  >
                    <button
                      type="button"
                      aria-pressed={heroPreview === 'desktop'}
                      onClick={() => setHeroPreview('desktop')}
                    >
                      Escritorio
                    </button>
                    <button
                      type="button"
                      aria-pressed={heroPreview === 'mobile'}
                      onClick={() => setHeroPreview('mobile')}
                    >
                      Móvil
                    </button>
                  </div>
                </div>
                <div
                  className={`admin-home-hero-preview admin-home-hero-preview--${heroPreview}`}
                  data-tone={defaultSlide.tone}
                  data-layout={defaultSlide.layout}
                  data-default-image={!currentSlide.desktopImage}
                >
                  <img src={heroPreviewImage} alt="" />
                  <div className="admin-home-hero-preview-copy">
                    <div className="admin-home-hero-preview-heading">
                      <span>{currentSlide.eyebrow || 'Etiqueta'}</span>
                      <strong>
                        {currentSlide.title || 'Título de campaña'}
                      </strong>
                    </div>
                    <div className="admin-home-hero-preview-details">
                      <p>
                        {currentSlide.description || 'Descripción de campaña'}
                      </p>
                      <span className="admin-home-hero-preview-cta">
                        {currentSlide.cta || 'Botón'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="admin-home-preview-note">
                  {defaultSlide.layout === 'right' && heroPreview === 'desktop'
                    ? 'En escritorio el mensaje se ubica a la derecha. Al subir una imagen propia, deja espacio libre en ese lado.'
                    : 'La vista previa muestra el encuadre y texto.'}{' '}
                  El Home conserva las flechas y cambia cada 3,8 segundos.
                </p>
              </section>
            </Dialog>
            <section
              className="admin-home-controls"
              aria-labelledby="admin-home-hero-title"
            >
              <h2 id="admin-home-hero-title">Editar campaña</h2>
              <div
                className="admin-home-slide-picker"
                role="group"
                aria-label="Campañas del carrusel"
              >
                {displayOrder.map((slideIndex, displayIndex) => (
                  <button
                    type="button"
                    key={slideIndex}
                    aria-pressed={selectedSlide === slideIndex}
                    onClick={() => setSelectedSlide(slideIndex)}
                  >
                    <small>0{displayIndex + 1}</small>
                    <span>
                      {content.hero[slideIndex].title.split('\n')[0] ||
                        `Campaña ${displayIndex + 1}`}
                    </span>
                  </button>
                ))}
              </div>
              <label className="admin-home-field">
                Etiqueta superior
                <input
                  value={currentSlide.eyebrow}
                  maxLength={60}
                  onChange={(event) =>
                    updateHero(selectedSlide, { eyebrow: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Título <small>Una línea por renglón; máximo 3</small>
                <textarea
                  value={currentSlide.title}
                  maxLength={90}
                  rows={3}
                  onChange={(event) =>
                    updateHero(selectedSlide, { title: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Descripción
                <textarea
                  value={currentSlide.description}
                  maxLength={180}
                  rows={3}
                  onChange={(event) =>
                    updateHero(selectedSlide, {
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-home-field">
                Texto del botón
                <input
                  value={currentSlide.cta}
                  maxLength={45}
                  onChange={(event) =>
                    updateHero(selectedSlide, { cta: event.target.value })
                  }
                />
              </label>
              <div className="admin-home-image-control">
                <div>
                  <strong>Fotografía de escritorio</strong>
                  <small>{homeImagePresets.heroDesktop.label}</small>
                </div>
                <label className="admin-home-file-button">
                  Cambiar imagen
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-label={`Subir imagen de escritorio de campaña ${selectedSlideNumber}`}
                    onChange={(event) =>
                      heroFileChanged(selectedSlide, 'desktopImage', event)
                    }
                  />
                </label>
                {currentSlide.desktopImage && (
                  <button
                    className="admin-home-reset"
                    type="button"
                    onClick={() =>
                      updateHero(selectedSlide, { desktopImage: null })
                    }
                  >
                    Usar original
                  </button>
                )}
              </div>
              <div className="admin-home-image-control">
                <div>
                  <strong>Fotografía de móvil</strong>
                  <small>
                    {homeImagePresets.heroMobile.label}. Opcional; sin ella se
                    usa la imagen de escritorio.
                  </small>
                </div>
                <label className="admin-home-file-button">
                  Cambiar imagen
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-label={`Subir imagen móvil de campaña ${selectedSlideNumber}`}
                    onChange={(event) =>
                      heroFileChanged(selectedSlide, 'mobileImage', event)
                    }
                  />
                </label>
                {currentSlide.mobileImage && (
                  <button
                    className="admin-home-reset"
                    type="button"
                    onClick={() =>
                      updateHero(selectedSlide, { mobileImage: null })
                    }
                  >
                    Usar imagen de escritorio
                  </button>
                )}
              </div>
            </section>
          </div>
        ) : tab === 'categories' ? (
          <div className="admin-home-workspace admin-home-workspace--modal">
            <Dialog
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              id="admin-home-preview"
              title="Vista previa · Categorías"
              className="admin-home-preview-dialog"
            >
              <section
                className="admin-home-stage"
                aria-label={`Vista previa de ${features.complementsEnabled ? 'las cuatro' : 'las tres'} categorías`}
              >
                <div className="admin-home-stage-heading">
                  <span className="eyebrow">
                    {features.complementsEnabled ? 'Cuatro' : 'Tres'} formas de
                    explorar
                  </span>
                  <h2>Elige por dónde empezar</h2>
                </div>
                <div
                  className={`admin-home-category-preview${features.complementsEnabled ? ' admin-home-category-preview--four' : ''}`}
                >
                  {visibleCategories.map((category) => {
                    const key = category.id as HomeMediaKey
                    return (
                      <div
                        className={`admin-home-category admin-home-category--${category.layout}`}
                        key={category.id}
                      >
                        <div className="admin-home-category-image">
                          <img
                            src={imageSource(media[key] ?? category.image, 960)}
                            style={{
                              objectPosition: media[key]
                                ? 'center'
                                : features.complementsEnabled
                                  ? category.imagePosition
                                  : undefined,
                            }}
                            alt=""
                          />
                        </div>
                        <div className="admin-home-category-copy">
                          <strong>{category.title}</strong>
                          <span>{category.description}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </Dialog>
            <section
              className="admin-home-controls"
              aria-labelledby="admin-home-categories-title"
            >
              <h2 id="admin-home-categories-title">Imágenes de categorías</h2>
              <p>
                Las imágenes comparten formato vertical. Revisa su encuadre en
                la vista previa antes de guardar.
              </p>
              <div className="admin-home-feature-control">
                <label className="admin-home-feature-toggle">
                  <input
                    type="checkbox"
                    checked={features.complementsEnabled}
                    disabled={saving}
                    aria-describedby="admin-complements-help"
                    onChange={(event) => {
                      setFeatures((current) => ({
                        ...current,
                        complementsEnabled: event.target.checked,
                      }))
                      setMessage('')
                      setMessageIsError(false)
                    }}
                  />
                  <span>Mostrar Complementos en la tienda</span>
                </label>
                <span className="admin-home-feature-state">
                  {features.complementsEnabled
                    ? 'Visible al guardar'
                    : 'Oculto al guardar'}
                </span>
                <p id="admin-complements-help">
                  Activa la categoría en el Home, el menú y el catálogo. Al
                  ocultarla se conservan sus productos e imágenes.
                </p>
              </div>
              {visibleCategories.map(renderCategoryImageControl)}
              {!features.complementsEnabled && (
                <details className="admin-home-hidden-category">
                  <summary>Configurar Complementos</summary>
                  <p>
                    Prepara su imagen sin mostrar la categoría en la tienda.
                  </p>
                  {categories
                    .filter((category) => category.id === 'complementos')
                    .map(renderCategoryImageControl)}
                  <Link className="text-link" to="/admin/productos">
                    Gestionar productos ↗
                  </Link>
                  <Link
                    className="text-link"
                    to="/admin/productos/nuevo?tipo=complemento"
                  >
                    Preparar un complemento ↗
                  </Link>
                </details>
              )}
            </section>
          </div>
        ) : tab === 'film' ? (
          <div className="admin-home-workspace admin-home-workspace--modal">
            <Dialog
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              id="admin-home-preview"
              title="Vista previa · Video editorial"
              className="admin-home-preview-dialog"
            >
              <section
                className="admin-home-stage"
                aria-label="Vista previa de la sección audiovisual"
              >
                <div className="admin-home-film-preview">
                  <div className="admin-home-film-preview-copy">
                    <span className="eyebrow">
                      {content.film.eyebrow || 'Etiqueta'}
                    </span>
                    <h2>
                      {headingText(content.film.title || 'Título del video')}
                    </h2>
                    <p>{content.film.description || 'Texto del video'}</p>
                    <span className="admin-home-preview-link">
                      {content.film.cta || 'Botón'} ↗
                    </span>
                  </div>
                  <video
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    src={assetSource(content.film.video ?? editorialFilm.src)}
                    poster={assetSource(
                      content.film.poster ?? editorialFilm.poster,
                    )}
                    aria-label="Vista previa del video editorial"
                  />
                </div>
              </section>
            </Dialog>
            <section
              className="admin-home-controls"
              aria-labelledby="admin-home-film-title"
            >
              <h2 id="admin-home-film-title">Video editorial</h2>
              <p>Revisa aquí el video y el texto antes de guardar.</p>
              <label className="admin-home-field">
                Etiqueta superior
                <input
                  value={content.film.eyebrow}
                  maxLength={60}
                  onChange={(event) =>
                    updateFilm({ eyebrow: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Título <small>Una línea por renglón; máximo 2</small>
                <textarea
                  value={content.film.title}
                  maxLength={90}
                  rows={2}
                  onChange={(event) =>
                    updateFilm({ title: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Descripción
                <textarea
                  value={content.film.description}
                  maxLength={300}
                  rows={4}
                  onChange={(event) =>
                    updateFilm({ description: event.target.value })
                  }
                />
              </label>
              <label className="admin-home-field">
                Texto del botón
                <input
                  value={content.film.cta}
                  maxLength={45}
                  onChange={(event) => updateFilm({ cta: event.target.value })}
                />
              </label>
              <div className="admin-home-image-control">
                <div>
                  <strong>Archivo de video</strong>
                  <small>
                    MP4 · 2 a 60 segundos · lado menor de 480 px · hasta 10 MB
                  </small>
                </div>
                <label className="admin-home-file-button">
                  Cambiar video
                  <input
                    type="file"
                    accept="video/mp4"
                    aria-label="Subir video editorial"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void uploadFilm(file)
                    }}
                  />
                </label>
                {content.film.video && (
                  <button
                    className="admin-home-reset"
                    type="button"
                    onClick={() => updateFilm({ video: null, poster: null })}
                  >
                    Usar video original
                  </button>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="admin-home-finder-editor">
            <div
              className="admin-home-finder-tabs"
              role="group"
              aria-label="Partes de Encuentra tu perfume ideal"
            >
              {(
                [
                  ['presentation', 'Presentación'],
                  ['questions', 'Preguntas y opciones'],
                  ['results', 'Resultados'],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={finderView === view}
                  onClick={() => setFinderView(view)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="admin-home-workspace admin-home-workspace--modal">
              <Dialog
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                id="admin-home-preview"
                title="Vista previa · Recomendador"
                className="admin-home-preview-dialog"
              >
                <section
                  className="admin-home-stage"
                  aria-label="Vista previa de Encuentra tu perfume ideal"
                >
                  <div className="admin-home-stage-toolbar">
                    <div>
                      <span className="eyebrow">
                        Encuentra tu perfume ideal
                      </span>
                      <h2>
                        {finderView === 'presentation'
                          ? 'Presentación en el Home'
                          : finderView === 'questions'
                            ? `Paso ${finderStepIds.indexOf(selectedFinderStep) + 1} de 4`
                            : finderResultNames[selectedResultKind]}
                      </h2>
                    </div>
                    {finderView === 'presentation' && (
                      <div
                        className="admin-home-preview-switch"
                        role="group"
                        aria-label="Formato de vista previa del recomendador"
                      >
                        <button
                          type="button"
                          aria-pressed={finderPreview === 'desktop'}
                          onClick={() => setFinderPreview('desktop')}
                        >
                          Escritorio
                        </button>
                        <button
                          type="button"
                          aria-pressed={finderPreview === 'mobile'}
                          onClick={() => setFinderPreview('mobile')}
                        >
                          Móvil
                        </button>
                      </div>
                    )}
                  </div>
                  {finderView === 'presentation' ? (
                    <>
                      <div
                        className={`admin-home-finder-scene admin-home-finder-scene--${finderPreview}`}
                      >
                        <img src={finderPreviewImage} alt="" />
                        <div className="admin-home-finder-scene-copy">
                          <span>
                            {content.finder.eyebrow || 'Etiqueta superior'}
                          </span>
                          <strong>{content.finder.title || 'Título'}</strong>
                          <p>{content.finder.description || 'Descripción'}</p>
                          <span className="admin-home-finder-scene-action">
                            {content.finder.cta || 'Texto del botón'} →
                          </span>
                        </div>
                      </div>
                      <div className="admin-home-finder-entry-preview">
                        <div>
                          <small>
                            {content.finder.entryLabel || 'Primera elección'}
                          </small>
                          <strong>
                            {content.finder.entryQuestion || 'Pregunta inicial'}
                          </strong>
                        </div>
                        <div className="admin-home-finder-entry-choices">
                          {visibleFamilyOptions.slice(0, 4).map((option) => (
                            <span key={option.value}>
                              {content.finder.optionLabels.family[
                                option.value
                              ] || option.label}
                            </span>
                          ))}
                          {visibleFamilyOptions.length === 0 && (
                            <span>
                              {finderOptions.families.length === 0
                                ? 'Las opciones aparecen al publicar productos.'
                                : 'Añade aromas desde Preguntas y opciones.'}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="admin-home-preview-note">
                        La vista previa muestra el encuadre y los textos. Las
                        opciones visibles provienen del catálogo publicado.
                      </p>
                    </>
                  ) : finderView === 'questions' ? (
                    <div className="admin-home-finder-dialog-preview">
                      <div className="admin-home-finder-dialog-topline">
                        <span>
                          {content.finder.modalTitle || 'Título del modal'}
                        </span>
                        <span>
                          {finderStepIds.indexOf(selectedFinderStep) + 1}/4
                        </span>
                      </div>
                      <span className="admin-home-finder-dialog-step">
                        {finderStep.label || 'Nombre del paso'}
                      </span>
                      <h3>{finderStep.question || 'Pregunta'}</h3>
                      <p>{finderStep.description || 'Texto de apoyo'}</p>
                      <div className="admin-home-finder-dialog-options">
                        {selectedFinderStep === 'budget' ? (
                          <>
                            {content.finder.budgets.map((amount, index) => (
                              <span key={index}>Hasta S/ {amount || '—'}</span>
                            ))}
                            <span>
                              {content.finder.budgetNoLimitLabel ||
                                'Sin límite de presupuesto'}
                            </span>
                          </>
                        ) : (
                          <>
                            {visibleFinderOptions.map((option) => {
                              const visual =
                                selectedFinderStep === 'family'
                                  ? content.finder.familyVisuals[option.value]
                                  : undefined
                              const defaultVisual = familyVisuals[option.value]
                              const image =
                                visual?.image ?? defaultVisual?.image
                              return (
                                <span key={option.value}>
                                  {image && selectedFinderStep === 'family' && (
                                    <img src={assetSource(image)} alt="" />
                                  )}
                                  <span>
                                    {content.finder.optionLabels[
                                      selectedFinderStep as CatalogFinderStep
                                    ][option.value] || option.label}
                                    {selectedFinderStep === 'family' &&
                                      (visual?.description ??
                                        defaultVisual?.description) && (
                                        <small>
                                          {visual?.description ??
                                            defaultVisual?.description}
                                        </small>
                                      )}
                                  </span>
                                </span>
                              )
                            })}
                            <span>
                              {content.finder.noPreferenceLabel ||
                                'Sin preferencia'}
                            </span>
                          </>
                        )}
                      </div>
                      {selectedFinderStep !== 'budget' &&
                        visibleFinderOptions.length === 0 && (
                          <p className="admin-home-preview-note">
                            {catalogFinderOptions.length === 0
                              ? 'No hay opciones publicadas para este paso. Completa las fichas de producto para que aparezcan aquí.'
                              : 'No hay opciones visibles. Añade al menos una desde el editor.'}
                          </p>
                        )}
                    </div>
                  ) : (
                    <div className="admin-home-finder-result-preview">
                      <span className="eyebrow">Tu selección</span>
                      <h3>
                        {selectedResultKind === 'matches'
                          ? content.finder.singleResultTitle ||
                            'Título individual'
                          : content.finder.resultCopy[selectedResultKind]
                              .title || 'Título del resultado'}
                      </h3>
                      {selectedResultKind !== 'matches' && (
                        <p>
                          {content.finder.resultCopy[selectedResultKind]
                            .description || 'Descripción del resultado'}
                        </p>
                      )}
                      {selectedResultKind === 'matches' && (
                        <p>
                          Vista previa para un perfume. Si coinciden varios, el
                          título será «
                          {content.finder.resultCopy.matches.title ||
                            'Título del resultado'}
                          ».
                        </p>
                      )}
                      <div className="admin-home-finder-result-note">
                        Las fotos, precios, disponibilidad y razones de
                        coincidencia se toman de los productos reales del
                        catálogo.
                      </div>
                    </div>
                  )}
                </section>
              </Dialog>
              <section
                className="admin-home-controls"
                aria-labelledby="admin-home-finder-title"
              >
                <h2 id="admin-home-finder-title">
                  {finderView === 'presentation'
                    ? 'Editar presentación'
                    : finderView === 'questions'
                      ? 'Editar preguntas y opciones'
                      : 'Editar mensajes de resultados'}
                </h2>
                {finderView === 'presentation' ? (
                  <>
                    <label className="admin-home-field">
                      Etiqueta superior
                      <input
                        value={content.finder.eyebrow}
                        maxLength={60}
                        onChange={(event) =>
                          updateFinder({ eyebrow: event.target.value })
                        }
                      />
                    </label>
                    <label className="admin-home-field">
                      Título <small>Una línea por renglón; máximo 2</small>
                      <textarea
                        value={content.finder.title}
                        maxLength={90}
                        rows={2}
                        onChange={(event) =>
                          updateFinder({ title: event.target.value })
                        }
                      />
                    </label>
                    <label className="admin-home-field">
                      Descripción
                      <textarea
                        value={content.finder.description}
                        maxLength={180}
                        rows={3}
                        onChange={(event) =>
                          updateFinder({ description: event.target.value })
                        }
                      />
                    </label>
                    <label className="admin-home-field">
                      Texto del botón
                      <input
                        value={content.finder.cta}
                        maxLength={45}
                        onChange={(event) =>
                          updateFinder({ cta: event.target.value })
                        }
                      />
                    </label>
                    <div className="admin-home-finder-field-group">
                      <h3>Primera elección en el Home</h3>
                      <label className="admin-home-field">
                        Etiqueta de la pregunta
                        <input
                          value={content.finder.entryLabel}
                          maxLength={60}
                          onChange={(event) =>
                            updateFinder({ entryLabel: event.target.value })
                          }
                        />
                      </label>
                      <label className="admin-home-field">
                        Pregunta inicial
                        <input
                          value={content.finder.entryQuestion}
                          maxLength={100}
                          onChange={(event) =>
                            updateFinder({ entryQuestion: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="admin-home-field">
                      Título del modal
                      <input
                        value={content.finder.modalTitle}
                        maxLength={90}
                        onChange={(event) =>
                          updateFinder({ modalTitle: event.target.value })
                        }
                      />
                    </label>
                    <div className="admin-home-image-control">
                      <div>
                        <strong>Imagen de escritorio</strong>
                        <small>{homeImagePresets.finderDesktop.label}</small>
                      </div>
                      <label className="admin-home-file-button">
                        Cambiar imagen
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          aria-label="Subir imagen de escritorio del recomendador"
                          onChange={(event) =>
                            finderFileChanged('desktopImage', event)
                          }
                        />
                      </label>
                      {content.finder.desktopImage && (
                        <button
                          className="admin-home-reset"
                          type="button"
                          onClick={() => updateFinder({ desktopImage: null })}
                        >
                          Usar original
                        </button>
                      )}
                    </div>
                    <div className="admin-home-image-control">
                      <div>
                        <strong>Imagen de móvil</strong>
                        <small>
                          {homeImagePresets.finderMobile.label}. Opcional; sin
                          ella se usa la imagen de escritorio.
                        </small>
                      </div>
                      <label className="admin-home-file-button">
                        Cambiar imagen
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          aria-label="Subir imagen móvil del recomendador"
                          onChange={(event) =>
                            finderFileChanged('mobileImage', event)
                          }
                        />
                      </label>
                      {content.finder.mobileImage && (
                        <button
                          className="admin-home-reset"
                          type="button"
                          onClick={() => updateFinder({ mobileImage: null })}
                        >
                          Usar imagen de escritorio
                        </button>
                      )}
                    </div>
                  </>
                ) : finderView === 'questions' ? (
                  <>
                    <label className="admin-home-field">
                      Paso del cuestionario
                      <select
                        value={selectedFinderStep}
                        onChange={(event) => {
                          setSelectedFinderStep(
                            event.target.value as FinderStep,
                          )
                          setExpandedFinderOption(null)
                        }}
                      >
                        {finderSteps.map((step, index) => (
                          <option key={step.id} value={step.id}>
                            {index + 1}. {content.finder.steps[step.id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-home-field">
                      Nombre del paso
                      <input
                        value={finderStep.label}
                        maxLength={40}
                        onChange={(event) =>
                          updateFinderStep(selectedFinderStep, {
                            label: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="admin-home-field">
                      Pregunta
                      <input
                        value={finderStep.question}
                        maxLength={100}
                        onChange={(event) =>
                          updateFinderStep(selectedFinderStep, {
                            question: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="admin-home-field">
                      Texto de apoyo
                      <textarea
                        value={finderStep.description}
                        maxLength={220}
                        rows={3}
                        onChange={(event) =>
                          updateFinderStep(selectedFinderStep, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="admin-home-finder-field-group">
                      <h3>Opciones de respuesta</h3>
                      <p>
                        Opciones de productos publicados. Elige una para
                        editarla; ocultarla no modifica el catálogo.
                      </p>
                      {selectedFinderStep === 'budget' ? (
                        <>
                          {content.finder.budgets.map((amount, index) => (
                            <div
                              className="admin-home-finder-budget-row"
                              key={index}
                            >
                              <label className="admin-home-field">
                                Límite {index + 1} (S/)
                                <input
                                  type="number"
                                  min="1"
                                  max="10000"
                                  step="1"
                                  value={amount || ''}
                                  onChange={(event) => {
                                    const budgets = [...content.finder.budgets]
                                    budgets[index] = Number(event.target.value)
                                    updateFinder({ budgets })
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="admin-home-finder-option-action"
                                disabled={content.finder.budgets.length <= 1}
                                aria-label={`Quitar límite de S/ ${amount}`}
                                onClick={() => removeFinderBudget(index)}
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="admin-home-finder-add-option"
                            disabled={
                              content.finder.budgets.length >= 6 ||
                              (content.finder.budgets.at(-1) ?? 0) >= 10_000
                            }
                            onClick={addFinderBudget}
                          >
                            + Añadir importe
                          </button>
                          <p className="admin-home-finder-help">
                            De uno a seis importes enteros en soles, de menor a
                            mayor. La opción sin límite aparece siempre.
                          </p>
                          <label className="admin-home-field">
                            Opción sin límite
                            <input
                              value={content.finder.budgetNoLimitLabel}
                              maxLength={60}
                              onChange={(event) =>
                                updateFinder({
                                  budgetNoLimitLabel: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          {catalogFinderOptions.length === 0 && (
                            <p className="admin-home-finder-help" role="status">
                              Aún no hay opciones para este paso. Completa la
                              información de los productos en el catálogo.
                            </p>
                          )}
                          {catalogFinderOptions.length > 0 && (
                            <p
                              className="admin-home-finder-count"
                              role="status"
                            >
                              {visibleFinderOptions.length} de{' '}
                              {catalogFinderOptions.length} opciones visibles en
                              el cuestionario
                            </p>
                          )}
                          {visibleFinderOptions.length === 1 && (
                            <p className="admin-home-finder-help">
                              Mantén al menos una opción visible en este paso.
                            </p>
                          )}
                          {visibleFinderOptions.map((option, index) => {
                            const configuredVisual =
                              content.finder.familyVisuals[option.value]
                            const defaultVisual = familyVisuals[option.value]
                            const optionImage =
                              configuredVisual?.image ?? defaultVisual?.image
                            const isExpanded =
                              expandedFinderOption === option.value ||
                              (expandedFinderOption === null && index === 0)
                            const fieldsId = `admin-finder-option-${selectedFinderStep}-${option.value}`
                            return (
                              <div
                                className="admin-home-finder-option-editor"
                                key={option.value}
                              >
                                <div className="admin-home-finder-option-head">
                                  {selectedFinderStep === 'family' && (
                                    <span className="admin-home-finder-option-thumbnail">
                                      {optionImage ? (
                                        <img
                                          src={assetSource(optionImage)}
                                          alt={`Imagen actual de ${option.label}`}
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span aria-hidden="true">
                                          Sin imagen
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  <div className="admin-home-finder-option-identity">
                                    <strong>{option.label}</strong>
                                    {selectedFinderStep === 'family' && (
                                      <small>
                                        {configuredVisual?.description ??
                                          defaultVisual?.description ??
                                          'Sin descripción'}
                                      </small>
                                    )}
                                  </div>
                                  <div className="admin-home-finder-option-head-actions">
                                    <button
                                      type="button"
                                      className="admin-home-finder-option-action"
                                      aria-expanded={isExpanded}
                                      aria-controls={fieldsId}
                                      aria-label={`${isExpanded ? 'Cerrar' : 'Editar'} opción ${option.label}`}
                                      onClick={() =>
                                        setExpandedFinderOption(
                                          isExpanded ? '' : option.value,
                                        )
                                      }
                                    >
                                      {isExpanded ? 'Cerrar' : 'Editar'}
                                    </button>
                                    <button
                                      type="button"
                                      className="admin-home-finder-hide-option"
                                      disabled={
                                        visibleFinderOptions.length <= 1
                                      }
                                      aria-label={`Ocultar ${option.label} del cuestionario`}
                                      onClick={() =>
                                        setFinderOptionVisible(
                                          option.value,
                                          false,
                                        )
                                      }
                                    >
                                      Ocultar
                                    </button>
                                  </div>
                                </div>
                                <div
                                  id={fieldsId}
                                  className="admin-home-finder-option-fields"
                                  hidden={!isExpanded}
                                >
                                  <label className="admin-home-field">
                                    Nombre que verá el cliente
                                    <input
                                      value={
                                        content.finder.optionLabels[
                                          selectedFinderStep as CatalogFinderStep
                                        ][option.value] ?? option.label
                                      }
                                      maxLength={60}
                                      onChange={(event) =>
                                        updateFinderOptionLabel(
                                          selectedFinderStep as CatalogFinderStep,
                                          option.value,
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </label>
                                  {selectedFinderStep === 'family' && (
                                    <>
                                      <label className="admin-home-field">
                                        Descripción breve bajo el nombre
                                        <input
                                          value={
                                            configuredVisual?.description ??
                                            defaultVisual?.description ??
                                            ''
                                          }
                                          maxLength={90}
                                          onChange={(event) =>
                                            updateFinderFamilyVisual(
                                              option.value,
                                              {
                                                description: event.target.value,
                                              },
                                            )
                                          }
                                        />
                                      </label>
                                      <div className="admin-home-finder-option-media">
                                        <div className="admin-home-finder-option-media-copy">
                                          <strong>Imagen de la opción</strong>
                                          <small>
                                            {
                                              homeImagePresets.finderOption
                                                .label
                                            }
                                          </small>
                                        </div>
                                        <div className="admin-home-finder-option-media-actions">
                                          <label className="admin-home-file-button">
                                            Cambiar imagen
                                            <input
                                              type="file"
                                              accept="image/jpeg,image/png,image/webp,image/avif"
                                              aria-label={`Subir imagen de opción ${option.label}`}
                                              onChange={(event) =>
                                                finderOptionFileChanged(
                                                  option.value,
                                                  event,
                                                )
                                              }
                                            />
                                          </label>
                                          {configuredVisual?.image && (
                                            <button
                                              className="admin-home-reset"
                                              type="button"
                                              onClick={() =>
                                                updateFinderFamilyVisual(
                                                  option.value,
                                                  {
                                                    image: null,
                                                  },
                                                )
                                              }
                                            >
                                              Usar original
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {hiddenFinderOptions.length > 0 && (
                            <div className="admin-home-finder-available">
                              <h4>Opciones ocultas</h4>
                              <p>
                                Siguen en el catálogo. Puedes volver a
                                mostrarlas sin perder sus textos e imágenes.
                              </p>
                              <div className="admin-home-finder-available-list">
                                {hiddenFinderOptions.map((option) => (
                                  <div key={option.value}>
                                    <span>{option.label}</span>
                                    <button
                                      type="button"
                                      className="admin-home-finder-add-option"
                                      aria-label={`Mostrar ${option.label} en el cuestionario`}
                                      onClick={() =>
                                        setFinderOptionVisible(
                                          option.value,
                                          true,
                                        )
                                      }
                                    >
                                      Mostrar
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="admin-home-finder-no-preference">
                            <div>
                              <h4>Respuesta sin preferencia</h4>
                              <p>
                                Aparece siempre para quien prefiera continuar
                                sin elegir una opción.
                              </p>
                            </div>
                            <label className="admin-home-field">
                              Texto que verá el cliente
                              <input
                                value={content.finder.noPreferenceLabel}
                                maxLength={50}
                                onChange={(event) =>
                                  updateFinder({
                                    noPreferenceLabel: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="admin-home-field">
                      Tipo de resultado
                      <select
                        value={selectedResultKind}
                        onChange={(event) =>
                          setSelectedResultKind(
                            event.target.value as FinderResult['kind'],
                          )
                        }
                      >
                        {finderResultKinds.map((kind) => (
                          <option value={kind} key={kind}>
                            {finderResultNames[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-home-field">
                      Título del resultado
                      <input
                        value={
                          content.finder.resultCopy[selectedResultKind].title
                        }
                        maxLength={100}
                        onChange={(event) =>
                          updateFinderResult(selectedResultKind, {
                            title: event.target.value,
                          })
                        }
                      />
                    </label>
                    {selectedResultKind === 'matches' ? (
                      <label className="admin-home-field">
                        Título si hay un solo perfume
                        <input
                          value={content.finder.singleResultTitle}
                          maxLength={100}
                          onChange={(event) =>
                            updateFinder({
                              singleResultTitle: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : (
                      <label className="admin-home-field">
                        Descripción del resultado
                        <textarea
                          value={
                            content.finder.resultCopy[selectedResultKind]
                              .description
                          }
                          maxLength={300}
                          rows={3}
                          onChange={(event) =>
                            updateFinderResult(selectedResultKind, {
                              description: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <p className="admin-home-finder-help">
                      La fotografía, el precio y la disponibilidad vienen de la
                      ficha del producto. La coincidencia se calcula con las
                      respuestas.{' '}
                      <Link className="text-link" to="/admin/productos">
                        Editar productos
                      </Link>
                    </p>
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
      <div className={`admin-home-savebar${dirty ? ' is-dirty' : ''}`}>
        <div className="admin-home-save-status">
          <span className={dirty ? 'is-unsaved' : 'is-saved'}>
            {dirty ? 'Cambios sin guardar' : 'Todo guardado'}
          </span>
          {messageIsError ? (
            <p className="admin-form-notice" role="alert">
              {message}
            </p>
          ) : (
            <AdminNotice>{message}</AdminNotice>
          )}
          <AdminSaveFeedback {...persistence} />
          {preparingMedia ? (
            <InlineStatus busy>Preparando archivo…</InlineStatus>
          ) : null}
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={
            saving || preparingMedia || persistence.persistenceFailed || !dirty
          }
          aria-busy={saving}
          onClick={() => void saveHome()}
        >
          {saving ? 'Guardando…' : 'Guardar cambios del Home'}
        </button>
      </div>
    </div>
  )
}
