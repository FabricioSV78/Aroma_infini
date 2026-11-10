import { useEffect, useEffectEvent, useState, type RefObject } from 'react'

export const HERO_SLIDE_INTERVAL_MS = 3800

interface HeroRotationOptions {
  element: RefObject<HTMLElement | null>
  ready: boolean
  active: number
  intervalMs?: number
  onAdvance: () => void
}

export function useHeroRotation({
  element,
  ready,
  active,
  intervalMs = HERO_SLIDE_INTERVAL_MS,
  onAdvance,
}: HeroRotationOptions) {
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [inView, setInView] = useState(false)
  const [saveData, setSaveData] = useState(() =>
    Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    ),
  )
  const advance = useEffectEvent(onAdvance)
  const playing =
    ready && !paused && !hovered && !reducedMotion && pageVisible && inView

  useEffect(
    function observeRotationEnvironment() {
      const preference = matchMedia('(prefers-reduced-motion: reduce)')
      const connection = (
        navigator as Navigator & {
          connection?: EventTarget & { saveData?: boolean }
        }
      ).connection
      function updateMotion() {
        setReducedMotion(preference.matches)
      }
      function updateVisibility() {
        setPageVisible(!document.hidden)
      }
      function updateConnection() {
        setSaveData(Boolean(connection?.saveData))
      }
      const observer = new IntersectionObserver(
        ([entry]) => setInView(entry.intersectionRatio >= 0.35),
        { threshold: [0, 0.35] },
      )
      if (element.current) observer.observe(element.current)
      preference.addEventListener('change', updateMotion)
      document.addEventListener('visibilitychange', updateVisibility)
      connection?.addEventListener('change', updateConnection)
      return function stopObservingRotation() {
        observer.disconnect()
        preference.removeEventListener('change', updateMotion)
        document.removeEventListener('visibilitychange', updateVisibility)
        connection?.removeEventListener('change', updateConnection)
      }
    },
    [element],
  )

  useEffect(
    function scheduleRotation() {
      if (!playing) return
      const timer = window.setInterval(() => advance(), intervalMs)
      return function cancelRotation() {
        window.clearInterval(timer)
      }
    },
    [playing, active, intervalMs],
  )

  return {
    paused,
    setPaused,
    setHovered,
    reducedMotion,
    playing,
    saveData,
    environmentActive: pageVisible && inView,
  }
}
