import { useLayoutEffect, type RefObject } from 'react'

const revealSelector = '[data-reveal], [data-scroll-reveal]'

function reveal(element: HTMLElement) {
  element.setAttribute('data-revealed', '')
}

function prepareStagger(element: HTMLElement) {
  if (element.dataset.scrollReveal !== 'stagger') return
  Array.from(element.children).forEach((child, index) => {
    if (!(child instanceof HTMLElement)) return
    child.style.setProperty('--scroll-reveal-order', String(Math.min(index, 5)))
  })
}

export function useStoreReveal(
  root: RefObject<HTMLDivElement | null>,
  routeKey: string,
) {
  useLayoutEffect(
    function observeStoreSections() {
      const container = root.current
      if (!container) return

      container.setAttribute('data-scroll-ready', '')

      const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
      const elements = new Set<HTMLElement>()
      let observer: IntersectionObserver | undefined

      function revealAll() {
        elements.forEach(reveal)
      }

      function createObserver() {
        observer?.disconnect()
        if (preference.matches) {
          revealAll()
          return
        }
        if (typeof window.IntersectionObserver === 'undefined') {
          revealAll()
          return
        }

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              reveal(entry.target as HTMLElement)
              observer?.unobserve(entry.target)
            }
          },
          { rootMargin: '0px', threshold: 0.06 },
        )

        elements.forEach((element) => {
          if (!element.hasAttribute('data-revealed')) observer?.observe(element)
        })
      }

      function register(node: ParentNode) {
        const candidates = [
          ...(node instanceof HTMLElement && node.matches(revealSelector)
            ? [node]
            : []),
          ...node.querySelectorAll<HTMLElement>(revealSelector),
        ]
        candidates.forEach((element) => {
          if (elements.has(element)) return
          elements.add(element)
          prepareStagger(element)
          if (preference.matches || !observer) reveal(element)
          else observer.observe(element)
        })
      }

      function handleMotionPreference() {
        if (preference.matches) {
          observer?.disconnect()
          revealAll()
        } else createObserver()
      }

      createObserver()
      register(container)

      const mutations = new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) register(node)
          })
        })
      })
      mutations.observe(container, { childList: true, subtree: true })
      preference.addEventListener('change', handleMotionPreference)

      return function disconnectStoreReveal() {
        observer?.disconnect()
        mutations.disconnect()
        preference.removeEventListener('change', handleMotionPreference)
      }
    },
    [root, routeKey],
  )
}
