import { useEffect, useEffectEvent, useState, type RefObject } from 'react'

interface HeroRotationOptions {
  element: RefObject<HTMLElement | null>
  ready: boolean
  active: number
  onAdvance: () => void
}

export function useHeroRotation({
  element,
  ready,
  active,
  onAdvance,
}: HeroRotationOptions) {
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [inView, setInView] = useState(false)
  const advance = useEffectEvent(onAdvance)
  const playing =
    ready && !paused && !hovered && !reducedMotion && pageVisible && inView

  useEffect(
    function observeRotationEnvironment() {
      const preference = matchMedia('(prefers-reduced-motion: reduce)')
      function updateMotion() {
        setReducedMotion(preference.matches)
      }
      function updateVisibility() {
        setPageVisible(!document.hidden)
      }
      const observer = new IntersectionObserver(
        ([entry]) => setInView(entry.intersectionRatio >= 0.35),
        { threshold: [0, 0.35] },
      )
      if (element.current) observer.observe(element.current)
      preference.addEventListener('change', updateMotion)
      document.addEventListener('visibilitychange', updateVisibility)
      return function stopObservingRotation() {
        observer.disconnect()
        preference.removeEventListener('change', updateMotion)
        document.removeEventListener('visibilitychange', updateVisibility)
      }
    },
    [element],
  )

  useEffect(
    function scheduleRotation() {
      if (!playing) return
      const timer = window.setInterval(() => advance(), 3000)
      return function cancelRotation() {
        window.clearInterval(timer)
      }
    },
    [playing, active],
  )

  return { paused, setPaused, setHovered, reducedMotion, playing }
}
