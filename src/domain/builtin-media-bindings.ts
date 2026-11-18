import inventory from '../content/media-default-inventory.json' with { type: 'json' }
import { categories, heroSlides } from '../content/home.ts'
import { fourCategoryImages } from '../content/category-images.ts'
import { editorialFilm } from '../content/editorial-film.ts'
import { familyVisuals } from '../content/fragrance-finder.ts'
import { getLocalImageVariants } from '../content/image-variants.ts'
import { siteMediaDefaults } from '../content/site-media-defaults.ts'

export interface BuiltinMediaInventoryEntry {
  readonly path: string
  readonly section?: string
}

export interface BuiltinMediaUse {
  readonly kind: 'home' | 'site'
  readonly key: string
  readonly metadata: Readonly<Record<string, string | number>>
}

export interface BuiltinMediaBinding {
  readonly path: string
  readonly classification:
    | 'managed-default'
    | 'catalog-reference'
    | 'legacy-unused'
    | 'unknown'
  readonly uses: readonly BuiltinMediaUse[]
}

/**
 * Physical files and their semantic fallback owners, not permanent references.
 *
 * SQL evaluates these descriptors against the saved Home/site documents. An
 * absent binding never proves that a file is unused: catalog images, historical
 * order references and unrecognised consumers require separate reference checks.
 * Keep draft/disabled owners and both category layouts until their own override
 * is saved; toggling publication or Complementos must not resurrect a dead file.
 * This module is deliberately free of React, browser APIs and service imports so
 * the migration seed and the audited inventory are generated from the same data.
 */
export function buildBuiltinMediaBindings(
  entries: readonly BuiltinMediaInventoryEntry[] = inventory,
): BuiltinMediaBinding[] {
  const paths = new Set(entries.map(({ path }) => path))
  if (paths.size !== entries.length) {
    throw new Error('The built-in media inventory contains duplicate paths.')
  }
  const uses = new Map<string, BuiltinMediaUse[]>()

  function add(path: string, use: BuiltinMediaUse) {
    if (!paths.has(path)) {
      throw new Error(`A built-in fallback is missing from the inventory: ${path}`)
    }
    const current = uses.get(path) ?? []
    if (!current.some(({ kind, key }) => kind === use.kind && key === use.key)) {
      current.push(use)
      uses.set(path, current)
    }
  }

  function numberedImages(base: string, use: BuiltinMediaUse) {
    const prefix = `/images/${base}-`
    const candidates = entries.filter(
      ({ path }) =>
        path.startsWith(prefix) && /^\d+\.webp$/.test(path.slice(prefix.length)),
    )
    if (!candidates.length) {
      throw new Error(`A built-in image group is missing from the inventory: ${base}`)
    }
    for (const { path } of candidates) add(path, use)
  }

  // Hero ownership follows fallbackIndex, never the campaign's mutable id/order.
  // desktop: mediaType=video ? poster : desktopImage.
  // mobile: video ? mobileImage ?? mobilePoster ?? poster
  //              : mobileImage ?? desktopImage.
  // Each orientation falls back only when that effective value is null.
  heroSlides.forEach((slide, fallbackIndex) => {
    for (const orientation of ['desktop', 'mobile'] as const) {
      numberedImages(`${slide.image}-${orientation}`, {
        kind: 'home',
        key: `hero.default.${fallbackIndex}.${orientation}`,
        metadata: { owner: 'hero', fallbackIndex, orientation },
      })
    }
  })

  // The admin also previews the uncropped category image. Both layouts share
  // one editable category association and retire together after it is replaced.
  for (const category of categories) {
    numberedImages(category.image, {
      kind: 'home',
      key: `category.${category.id}`,
      metadata: { owner: 'category', category: category.id, layout: 3 },
    })
    const framed =
      fourCategoryImages[category.id as keyof typeof fourCategoryImages]
    numberedImages(framed.image, {
      kind: 'home',
      key: `category.${category.id}`,
      metadata: { owner: 'category', category: category.id, layout: 4 },
    })
  }

  // With no mobile override, the scene uses its effective desktop image.
  // The default cedre photograph has a second independent family owner below.
  add('/images/olfactory-cedre.webp', {
    kind: 'home',
    key: 'finder.desktop',
    metadata: { owner: 'finder', field: 'desktopImage' },
  })
  for (const [value, visual] of Object.entries(familyVisuals)) {
    const use: BuiltinMediaUse = {
      kind: 'home',
      key: `finder.family.${value}`,
      metadata: { owner: 'finder-family', value },
    }
    add(visual.image, use)
    for (const variant of getLocalImageVariants(visual.image) ?? []) {
      add(variant.src, use)
    }
  }

  // filmVisualSources is asymmetric: a custom video with no mobile image uses
  // the *wide* original poster, while the original video uses the mobile poster.
  // No published component loads editorialFilm.mobileSrc (mobile has no video).
  add(editorialFilm.src, {
    kind: 'home',
    key: 'film.video',
    metadata: { owner: 'film', role: 'video' },
  })
  add(editorialFilm.poster, {
    kind: 'home',
    key: 'film.desktopPoster',
    metadata: { owner: 'film', role: 'desktopPoster' },
  })
  add(editorialFilm.poster, {
    kind: 'home',
    key: 'film.mobilePosterFallback',
    metadata: { owner: 'film', role: 'mobilePosterFallback' },
  })
  add(editorialFilm.mobilePoster, {
    kind: 'home',
    key: 'film.mobilePoster',
    metadata: { owner: 'film', role: 'mobilePoster' },
  })

  for (const [slot, media] of Object.entries(siteMediaDefaults)) {
    const use: BuiltinMediaUse = {
      kind: 'site',
      key: slot,
      metadata: { owner: 'site', slot },
    }
    add(media.src, use)
    if ('srcSet' in media) {
      for (const candidate of media.srcSet.split(',')) {
        add(candidate.trim().split(/\s+/)[0], use)
      }
    }
  }

  return entries.map(({ path, section }) => {
    const owners = uses.get(path) ?? []
    let classification: BuiltinMediaBinding['classification'] = 'unknown'
    if (owners.length) classification = 'managed-default'
    else if (
      section === 'Productos' ||
      path === '/images/olfactory-figue.webp' ||
      path === '/images/olfactory-iris.webp'
    ) classification = 'catalog-reference'
    else if (path === editorialFilm.mobileSrc) classification = 'legacy-unused'
    return {
      path,
      classification,
      uses: owners.sort((a, b) => compare(a.kind, b.kind) || compare(a.key, b.key)),
    }
  }).sort((a, b) => compare(a.path, b.path))
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}
