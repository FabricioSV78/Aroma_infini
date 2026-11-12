/** Build a complete snapshot without unbounded concurrent private reads.
 * The first page establishes the size; no partial snapshot is published here. */
export async function readAdminPageBatches<Page>(
  readPage: (offset: number) => Promise<Page>,
  totalOf: (page: Page) => unknown,
  invalid: () => never,
): Promise<{ pages: Page[]; total: number }> {
  const first = await readPage(0)
  const total = totalOf(first)
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > 10000
  )
    invalid()
  const pages = [first]
  for (let start = 100; start < total; start += 400) {
    const offsets = Array.from(
      { length: Math.min(4, Math.ceil((total - start) / 100)) },
      (_, index) => start + index * 100,
    )
    // Drain the bounded group before exposing failure or allowing a retry.
    // A rejected read must not leave three unobserved requests behind it.
    const results = await Promise.allSettled(
      offsets.map((offset) => Promise.resolve().then(() => readPage(offset))),
    )
    const rejected = results.find((result) => result.status === 'rejected')
    if (rejected) throw rejected.reason
    for (const result of results) {
      if (result.status !== 'fulfilled') invalid()
      if (totalOf(result.value) !== total) invalid()
      pages.push(result.value)
    }
  }
  return { pages, total }
}
