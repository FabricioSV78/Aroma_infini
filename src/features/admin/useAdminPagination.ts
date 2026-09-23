import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { paginate } from './admin-pagination-utils'

export function useAdminPagination<T>(items: readonly T[], pageSize: number) {
  const [searchParams, setSearchParams] = useSearchParams()
  const pageParameter = searchParams.get('page')
  const requestedPage = Number(pageParameter ?? 1)
  const result = paginate(items, requestedPage, pageSize)

  useEffect(() => {
    if (pageParameter === null) return
    const normalizedParameter = result.page === 1 ? null : String(result.page)
    if (pageParameter === normalizedParameter) return

    const next = new URLSearchParams(searchParams)
    if (normalizedParameter) next.set('page', normalizedParameter)
    else next.delete('page')
    setSearchParams(next, { replace: true })
  }, [pageParameter, result.page, searchParams, setSearchParams])

  function setPage(nextPage: number) {
    const page = Math.min(Math.max(1, Math.floor(nextPage)), result.totalPages)
    const next = new URLSearchParams(searchParams)
    if (page === 1) next.delete('page')
    else next.set('page', String(page))
    setSearchParams(next)
  }

  return { ...result, setPage }
}
