import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router'
import { resolveSeoPage, type SeoPageConfig } from './seo-config'

const SITE_NAME = 'Aroma Infini'
const DEFAULT_DESCRIPTION =
  'Aroma Infini. Explora perfumes, familias olfativas y propuestas para encontrar tu próxima fragancia.'
const PRODUCTION_ROBOTS =
  'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'

function siteOrigin() {
  const configured = import.meta.env.VITE_SITE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // La compilación seguirá protegida con noindex si la variable es inválida.
    }
  }
  return window.location.origin
}

function absoluteUrl(origin: string, path: string) {
  return new URL(path, `${origin}/`).toString()
}

function setNamedMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  )
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.append(element)
  }
  element.content = content
}

function setSocialMeta(
  attribute: 'property' | 'name',
  key: string,
  content: string,
) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  )
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    element.dataset.seoManaged = 'true'
    document.head.append(element)
  }
  element.content = content
}

function addManagedLink(rel: string, href: string, hreflang?: string) {
  const element = document.createElement('link')
  element.rel = rel
  element.href = href
  if (hreflang) element.hreflang = hreflang
  element.dataset.seoManaged = 'true'
  document.head.append(element)
}

function structuredData(config: SeoPageConfig, origin: string) {
  const graph: Record<string, unknown>[] = []
  if (config.canonicalPath === '/') {
    graph.push(
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: `${origin}/`,
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
  return graph.length
    ? { '@context': 'https://schema.org', '@graph': graph }
    : null
}

export function SeoManager() {
  const { pathname, search } = useLocation()
  const config = useMemo(
    () => resolveSeoPage(pathname, search),
    [pathname, search],
  )

  useEffect(() => {
    document
      .querySelectorAll('[data-seo-managed="true"]')
      .forEach((element) => element.remove())

    const origin = siteOrigin()
    const indexingEnabled = import.meta.env.VITE_ALLOW_INDEXING === 'true'
    const robots = indexingEnabled
      ? config.indexable
        ? PRODUCTION_ROBOTS
        : `noindex,${config.follow ? 'follow' : 'nofollow'}`
      : 'noindex,nofollow'
    const canonical = config.canonicalPath
      ? absoluteUrl(origin, config.canonicalPath)
      : null
    const image = config.imagePath
      ? absoluteUrl(origin, config.imagePath)
      : null

    document.title = config.title
    setNamedMeta('description', config.description)
    setNamedMeta('robots', robots)
    setSocialMeta('property', 'og:locale', 'es_PE')
    setSocialMeta('property', 'og:site_name', SITE_NAME)
    setSocialMeta('property', 'og:title', config.title)
    setSocialMeta('property', 'og:description', config.description)
    setSocialMeta('property', 'og:type', config.type ?? 'website')
    setSocialMeta(
      'name',
      'twitter:card',
      image ? 'summary_large_image' : 'summary',
    )
    setSocialMeta('name', 'twitter:title', config.title)
    setSocialMeta('name', 'twitter:description', config.description)
    if (canonical) {
      addManagedLink('canonical', canonical)
      addManagedLink('alternate', canonical, 'es-PE')
      addManagedLink('alternate', canonical, 'x-default')
      setSocialMeta('property', 'og:url', canonical)
    }
    if (image) {
      setSocialMeta('property', 'og:image', image)
      setSocialMeta('property', 'og:image:alt', config.imageAlt ?? SITE_NAME)
      setSocialMeta('name', 'twitter:image', image)
      setSocialMeta('name', 'twitter:image:alt', config.imageAlt ?? SITE_NAME)
    }
    const schema = structuredData(config, origin)
    if (schema) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seoManaged = 'true'
      script.text = JSON.stringify(schema).replaceAll('<', '\\u003c')
      document.head.append(script)
    }

    return () => {
      document
        .querySelectorAll('[data-seo-managed="true"]')
        .forEach((element) => element.remove())
      setNamedMeta('description', DEFAULT_DESCRIPTION)
      setNamedMeta('robots', 'noindex,nofollow')
    }
  }, [config])

  return null
}
