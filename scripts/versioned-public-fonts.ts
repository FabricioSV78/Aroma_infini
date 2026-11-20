import type { Plugin } from 'vite'

/** Let Vite fingerprint the existing font bytes, just like imported assets.
 * Development and legacy public URLs stay intact; no font is copied in source,
 * recompressed, renamed by hand or given immutable caching at a mutable URL. */
export function versionedPublicFonts(): Plugin {
  return {
    name: 'versioned-public-fonts',
    apply: 'build',
    enforce: 'pre',
    transform(source, id) {
      if (!id.split('?')[0].endsWith('.css')) return
      return source.replace(
        /\burl\((['"]?)\/fonts\/([A-Za-z0-9_-]+\.woff2)\1\)/g,
        (_match, quote: string, name: string) => `url(${quote}/public/fonts/${name}${quote})`,
      )
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          /(href=["'])\/fonts\/([A-Za-z0-9_-]+\.woff2)(["'])/g,
          '$1/public/fonts/$2$3',
        )
      },
    },
  }
}
