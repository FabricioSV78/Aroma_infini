/* global document */
/** Initial HTML is shared by all viewport sizes. Keep its existing images and
 * copy, but let the responsive client alone create desktop-only players. */
export function imageOnlySnapshot() {
  const snapshot = document.documentElement.cloneNode(true)
  snapshot
    .querySelectorAll('video, link[rel="preload"][as="video"]')
    .forEach((node) => node.remove())
  return '<!DOCTYPE html>\n' + snapshot.outerHTML
}
