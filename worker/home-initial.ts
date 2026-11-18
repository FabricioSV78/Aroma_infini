import inventory from '../public/media-default-inventory.json' with { type: 'json' }
import { parseHomeDocumentValue } from '../src/domain/home-document'
import {
  homeBootstrapJson,
  HOME_BOOTSTRAP_ID,
} from '../src/domain/home-bootstrap'
import { orderedHeroContent } from '../src/domain/hero-content'
import {
  HERO_MOBILE_WIDTHS,
  HERO_DESKTOP_WIDTHS,
  heroVisualSources,
  heroVisualQueries,
} from '../src/domain/hero-visuals'
import { managedImageCandidates } from '../src/domain/managed-image-candidates'
import { readPublicCatalog } from './public-catalog-http'

const originals = new Set(
  inventory.filter((i) => i.kind === 'image').map((i) => i.path),
)
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
type InitialHome = ReturnType<typeof parseHomeDocumentValue> & { raw: unknown }
/** Fresh anonymous editorial projection, bounded independently of the media cache. */
export async function readInitialHome(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>,
  transport: typeof fetch,
): Promise<InitialHome | undefined> {
  try {
    const raw = await readPublicCatalog(
      env,
      'home_document',
      {},
      transport,
      1024 * 1024,
      1000,
    )
    const parsed = parseHomeDocumentValue(raw, null, { publicDocument: true })
    // An anonymous projection must already omit future campaigns. Never
    // serialize an administrative payload even when its shape is valid.
    if (parsed.document.content.hero.some((slide) => !slide.published))
      return undefined
    return { ...parsed, raw }
  } catch {
    return undefined
  }
}
export function initialHomeMarkup(
  home: InitialHome | undefined,
  project: string,
  aliases: ReadonlyMap<string, string>,
): string {
  if (!home) return ''
  const json = homeBootstrapJson(project, home.raw)
  if (!json) return ''
  let hints = ''
  const first = orderedHeroContent(home.document.content.hero, true)[0]
  if (first) {
    try {
      const visual = heroVisualSources(first)
      const queries = heroVisualQueries(first)
      const sources = (
        image: string | null,
        orientation: 'mobile' | 'desktop',
      ) => {
        const widths =
          orientation === 'mobile' ? HERO_MOBILE_WIDTHS : HERO_DESKTOP_WIDTHS
        if (image) {
          const asset = home.assets.find((a) => a.src === image)
          if (!asset || 'mimeType' in asset) throw Error('unverified-poster')
          return {
            href: asset.src,
            srcset: managedImageCandidates(asset, widths)
              .map((v) => `${v.src} ${v.width}w`)
              .join(', '),
          }
        }
        const local = (width: number) => {
          const path = `/images/${visual.fallbackImage}-${orientation}-${width}.webp`
          if (!originals.has(path)) throw Error('unverified-fallback')
          return aliases.get(path) ?? path
        }
        return {
          href: local(orientation === 'mobile' ? 1024 : 1536),
          srcset: widths.map((w) => `${local(w)} ${w}w`).join(', '),
        }
      }
      // Videos preload only their selected poster; playback retains existing
      // visibility, reduced-motion, Save-Data and consent behavior.
      const mobile = sources(visual.mobile, 'mobile'),
        desktop = sources(visual.desktop, 'desktop')
      hints = (
        [
          [queries.mobile, mobile],
          [queries.desktop, desktop],
        ] as const
      )
        .map(
          ([media, image]) =>
            `<link rel="preload" as="image" href="${escape(image.href)}" imagesrcset="${escape(image.srcset)}" imagesizes="100vw" media="${escape(media)}" fetchpriority="high" data-home-hero-hint>`,
        )
        .join('')
    } catch {
      /* Retain the complete valid Home even when an optional hint cannot match. */
    }
  }
  return (
    hints +
    `<script type="application/json" id="${HOME_BOOTSTRAP_ID}">${json}</script>`
  )
}
