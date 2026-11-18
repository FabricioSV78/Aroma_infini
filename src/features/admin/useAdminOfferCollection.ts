import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { readAdminOfferList } from '../../services/catalog-admin-service'
import { isRemoteCatalog } from '../../services/catalog-source'
import type { AdminOfferList } from '../../types/admin-catalog-reads'
import { useAdminListData } from './useAdminListData'
import { useAdminNotice } from './AdminNoticeProvider'

/** Keep the existing continuous offer list, fetching canonical records only
 * when its next group approaches the viewport. Completed groups belong to this
 * mounted view, never to another route, owner or authorization revision. */
export function useAdminOfferCollection() {
  const initial = useAdminListData<AdminOfferList>()
  const revalidator = useRevalidator()
  const notice = useAdminNotice()
  const sentinel = useRef<HTMLDivElement>(null)
  const pending = useRef(false)
  const stalled = useRef(false)
  const generation = useRef(0)
  const [additional, setAdditional] = useState<{
    initial: AdminOfferList | null
    pages: AdminOfferList[]
  }>({ initial, pages: [] })
  const pages = useMemo(() => additional.initial === initial ? additional.pages : [], [additional, initial])
  const loaded = (initial?.products.length ?? 0) +
    pages.reduce((count, page) => count + page.products.length, 0)
  const canLoadMore = Boolean(isRemoteCatalog && initial && loaded < initial.total)

  useEffect(() => {
    const current = ++generation.current
    pending.current = false
    stalled.current = false
    return () => { generation.current = current + 1 }
  }, [initial])

  const loadMore = useCallback(async () => {
    if (!canLoadMore || !initial || pending.current || stalled.current) return
    pending.current = true
    const started = generation.current
    try {
      const next = await readAdminOfferList(pages.length + 2, 12)
      if (started !== generation.current ||
          next.ownerId !== initial.ownerId ||
          next.accessRevision !== initial.accessRevision) return
      const existing = new Set([...initial.products, ...pages.flatMap(page => page.products)]
        .map(record => record.product.id))
      if (next.revision !== initial.revision || next.total !== initial.total || next.products.length === 0 ||
          next.products.some(record => existing.has(record.product.id))) {
        // An intervening write can move an offset. Restart the protected first
        // page rather than omit or duplicate offers in a merged list.
        stalled.current = true
        void revalidator.revalidate()
        return
      }
      setAdditional(current => ({
        initial,
        pages: [...(current.initial === initial ? current.pages : []), next],
      }))
    } catch (error) {
      if (started === generation.current) {
        stalled.current = true
        notice.error(error)
      }
    } finally {
      if (started === generation.current) pending.current = false
    }
  }, [canLoadMore, initial, pages, revalidator, notice])

  useEffect(() => {
    function resumeVisibleList() {
      if (stalled.current && document.visibilityState === 'visible') {
        stalled.current = false
        void revalidator.revalidate()
      }
    }
    window.addEventListener('focus', resumeVisibleList)
    document.addEventListener('visibilitychange', resumeVisibleList)
    return () => {
      window.removeEventListener('focus', resumeVisibleList)
      document.removeEventListener('visibilitychange', resumeVisibleList)
    }
  }, [revalidator])

  useEffect(() => {
    const target = sentinel.current
    if (!target || !canLoadMore || revalidator.state !== 'idle') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '160px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [canLoadMore, loadMore, revalidator.state])

  return {
    initial,
    products: initial ? [...initial.products, ...pages.flatMap(page => page.products)] : [],
    brands: initial ? [...initial.brands, ...pages.flatMap(page => page.brands)] : [],
    total: initial?.total ?? 0,
    availableCount: initial?.availableCount ?? 0,
    sentinel,
    canLoadMore,
  }
}
