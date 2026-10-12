import { useEffect, useRef } from 'react'

const AUTOPLAY_PIXELS_PER_SECOND = 36

/** Autoplay and direct manipulation share the same native scroll position. */
export function useBrandRail(
  looping: boolean,
  paused: boolean,
  brandCount: number,
) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const group = viewport?.querySelector<HTMLElement>(
      '.brand-signatures-group',
    )
    if (!viewport || !group || !looping) return

    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let width = group.getBoundingClientRect().width
    let position = viewport.scrollLeft
    let written = position
    let hovered = false
    let focused = false
    let visible = false
    let resumeAt = 0
    let lastTime = 0
    let frame = 0
    let suppressClick = false
    let drag: {
      id: number
      x: number
      y: number
      previousX: number
      moved: boolean
    } | null = null

    function write(next: number) {
      if (!viewport || width <= 0) return
      position = ((next % width) + width) % width
      viewport.scrollLeft = position
      written = viewport.scrollLeft
    }

    function animate(time: number) {
      const elapsed = lastTime ? Math.min(time - lastTime, 48) : 0
      lastTime = time
      if (
        !motion.matches &&
        visible &&
        !document.hidden &&
        !paused &&
        !hovered &&
        !focused &&
        !drag &&
        time >= resumeAt
      ) {
        // A short acceleration after manual interaction avoids an abrupt restart.
        const ramp = resumeAt ? Math.min((time - resumeAt) / 650, 1) : 1
        write(position + (AUTOPLAY_PIXELS_PER_SECOND * elapsed * ramp) / 1000)
      }
      frame = requestAnimationFrame(animate)
    }

    function pointerDown(event: PointerEvent) {
      if (motion.matches || event.button !== 0 || !event.isPrimary) return
      suppressClick = false
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        previousX: event.clientX,
        moved: false,
      }
    }

    function pointerMove(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      if (!drag.moved) {
        const dx = Math.abs(event.clientX - drag.x)
        const dy = Math.abs(event.clientY - drag.y)
        if (dy > dx && dy > 6) {
          drag = null
          return
        }
        if (dx < 6) return
        drag.moved = true
        viewport!.setPointerCapture(event.pointerId)
        viewport!.dataset.dragging = 'true'
      }
      event.preventDefault()
      write(position + drag.previousX - event.clientX)
      drag.previousX = event.clientX
    }

    function pointerEnd(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      suppressClick = drag.moved
      resumeAt = performance.now() + 1400
      drag = null
      delete viewport!.dataset.dragging
      if (viewport!.hasPointerCapture(event.pointerId))
        viewport!.releasePointerCapture(event.pointerId)
    }

    function click(event: MouseEvent) {
      // Swiping a linked brand must not also open its destination.
      if (suppressClick && event.detail > 0) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick = false
      }
    }

    function wheel(event: WheelEvent) {
      if (motion.matches) return
      const delta = event.shiftKey ? event.deltaY : event.deltaX
      if (
        !delta ||
        (!event.shiftKey && Math.abs(event.deltaY) > Math.abs(delta))
      )
        return
      event.preventDefault()
      write(
        position +
          delta *
            (event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? viewport!.clientWidth
                : 1),
      )
      resumeAt = performance.now() + 1400
    }

    function focusIn(event: FocusEvent) {
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.matches(':focus-visible')
      )
        return
      focused = true
      event.target.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'instant',
      })
      position = viewport!.scrollLeft
      written = position
    }

    function focusOut(event: FocusEvent) {
      if (
        event.relatedTarget instanceof Node &&
        viewport!.contains(event.relatedTarget)
      )
        return
      focused = false
      position = viewport!.scrollLeft
      resumeAt = performance.now() + 1400
    }

    function pointerEnter(event: PointerEvent) {
      if (event.pointerType === 'mouse') hovered = true
    }
    function pointerLeave(event: PointerEvent) {
      if (event.pointerType === 'mouse') hovered = false
      if (drag && !drag.moved) drag = null
    }
    function scroll() {
      // Adopt browser/keyboard scrolling, but retain fractional autoplay progress.
      if (Math.abs(viewport!.scrollLeft - written) > 1) {
        position = viewport!.scrollLeft
        written = position
      }
    }
    function preventNativeDrag(event: DragEvent) {
      event.preventDefault()
    }
    function motionChange() {
      width = group!.getBoundingClientRect().width
      if (motion.matches) {
        drag = null
        delete viewport!.dataset.dragging
        viewport!.scrollLeft = position = written = 0
      }
    }

    const resize = new ResizeObserver(() => {
      const nextWidth = group.getBoundingClientRect().width
      const nextPosition = width > 0 ? (position / width) * nextWidth : 0
      width = nextWidth
      if (!motion.matches && nextWidth > 0 && !focused) write(nextPosition)
    })
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    resize.observe(group)
    intersection.observe(viewport)
    viewport.addEventListener('pointerdown', pointerDown)
    viewport.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    viewport.addEventListener('pointerenter', pointerEnter)
    viewport.addEventListener('pointerleave', pointerLeave)
    viewport.addEventListener('click', click, true)
    viewport.addEventListener('wheel', wheel, { passive: false })
    viewport.addEventListener('focusin', focusIn)
    viewport.addEventListener('focusout', focusOut)
    viewport.addEventListener('scroll', scroll, { passive: true })
    viewport.addEventListener('dragstart', preventNativeDrag)
    motion.addEventListener('change', motionChange)
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      intersection.disconnect()
      viewport.removeEventListener('pointerdown', pointerDown)
      viewport.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      viewport.removeEventListener('pointerenter', pointerEnter)
      viewport.removeEventListener('pointerleave', pointerLeave)
      viewport.removeEventListener('click', click, true)
      viewport.removeEventListener('wheel', wheel)
      viewport.removeEventListener('focusin', focusIn)
      viewport.removeEventListener('focusout', focusOut)
      viewport.removeEventListener('scroll', scroll)
      viewport.removeEventListener('dragstart', preventNativeDrag)
      motion.removeEventListener('change', motionChange)
    }
  }, [looping, paused, brandCount])

  return viewportRef
}
