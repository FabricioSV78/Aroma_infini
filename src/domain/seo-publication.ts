import { DEVELOPMENT_SUPABASE_ORIGIN } from './runtime-policy.ts'

export const INDEXABLE_ROBOTS =
  'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
export const PRIVATE_ROBOTS = 'noindex,nofollow'

export interface SeoPublicationConfiguration {
  environment?: string
  allowIndexing?: string
  catalogIsReal?: string
  siteUrl?: string
  supabaseUrl?: string
}

/** Only the configured, independent commercial site can opt into publication. */
export function seoPublicationOrigin(
  configuration: SeoPublicationConfiguration,
  requestOrigin: string,
): string | null {
  try {
    if (
      configuration.environment !== 'production' ||
      configuration.allowIndexing !== 'true' ||
      configuration.catalogIsReal !== 'true'
    )
      return null
    const site = new URL(configuration.siteUrl ?? '')
    const database = new URL(configuration.supabaseUrl ?? '')
    if (
      site.protocol !== 'https:' ||
      site.href !== `${site.origin}/` ||
      site.username ||
      site.password ||
      site.port ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(site.hostname) ||
      /^(?:\d+\.)+\d+$/.test(site.hostname) ||
      /(^|[.-])(localhost|local|invalid|example|test|staging|dev)([.-]|$)/i.test(
        site.hostname,
      ) ||
      /\.(workers\.dev|r2\.dev|supabase\.co)$/.test(site.hostname) ||
      site.hostname.includes('dominio-confirmado') ||
      site.origin !== requestOrigin ||
      !/^https:\/\/[a-z]{20}\.supabase\.co\/$/.test(database.href) ||
      database.origin === DEVELOPMENT_SUPABASE_ORIGIN
    )
      return null
    return site.origin
  } catch {
    return null
  }
}

export function seoPageRobots(
  publicationEnabled: boolean,
  { status = 200, indexable = false, follow = false } = {},
) {
  if (!publicationEnabled || status !== 200) return PRIVATE_ROBOTS
  return indexable
    ? INDEXABLE_ROBOTS
    : `noindex,${follow ? 'follow' : 'nofollow'}`
}
