export interface PaginationResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  from: number
  to: number
}

export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
  remoteTotal?: number,
): PaginationResult<T> {
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 1
  const totalItems = remoteTotal ?? items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize))
  const normalizedPage = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1
  const page = Math.min(normalizedPage, totalPages)
  const start = (page - 1) * safePageSize
  const end = Math.min(start + safePageSize, totalItems)

  return {
    items: remoteTotal === undefined ? items.slice(start, end) : [...items],
    page,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    from: totalItems ? start + 1 : 0,
    to: end,
  }
}
