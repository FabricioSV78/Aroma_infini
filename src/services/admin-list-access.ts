/** An access revocation invalidates every visible private page, including
 * in-flight reads in another administrative service. Contains no cached data. */
let revision = 0
const listeners = new Set<() => void>()
export const adminListAccess = {
  getSnapshot: () => revision,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  invalidate() {
    revision++
    for (const listener of listeners) listener()
  },
}
