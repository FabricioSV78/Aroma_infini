/** Open the shared store with a brand selected in its filters. */
export function brandStorePath(slug: string) {
  return `/tienda?marca=${encodeURIComponent(slug)}`
}
