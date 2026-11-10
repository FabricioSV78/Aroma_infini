/** A printed QR must never inherit the browser's local or preview origin. */
export function contactQrUrl(siteUrl?: string): string | null {
  try {
    const site = new URL(siteUrl?.trim() ?? '')
    const hostname = site.hostname
    if (
      site.protocol !== 'https:' ||
      site.href !== `${site.origin}/` ||
      site.username ||
      site.password ||
      site.port ||
      hostname.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(
        hostname,
      ) ||
      /(^|[.-])(localhost|local|internal|lan|home|onion|invalid|example|test|staging|preview|dev)([.-]|$)/i.test(
        hostname,
      ) ||
      /\.(workers\.dev|pages\.dev|r2\.dev|supabase\.co|vercel\.app|netlify\.app|github\.io|ngrok[^.]*\.[a-z]+|trycloudflare\.com)$/i.test(
        hostname,
      ) ||
      hostname.includes('dominio-confirmado')
    )
      return null
    return new URL('/contacto', site.origin).href
  } catch {
    return null
  }
}
