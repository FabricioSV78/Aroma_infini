import {
  PUBLIC_INITIAL_REVEALS,
  type PublicInitialRevealKey,
} from '../domain/public-initial-motion'

const ownedAnimations = new Set([
  'store-section-enter',
  'store-fade-enter',
  'store-item-enter',
  'product-gallery-settle',
])
interface Motion {
  name: string
  time: number
  rate: number
  paused: boolean
  finished: boolean
}
interface NodeMotion {
  signature: string
  animations: Motion[]
}
interface RevealMotion extends NodeMotion {
  key: PublicInitialRevealKey
  children: NodeMotion[]
}
interface InitialMotion {
  path: string
  capturedAt: number
  reveals: RevealMotion[]
  photo?: NodeMotion
}

// One handoff in this browser document, never persistence or authorization.
// Keep numbers/strings only; do not retain detached server DOM or animations.
let pending: InitialMotion | undefined
const photoSelector =
  '.product-gallery-track .product-gallery-frame:first-child img'
const path = () => location.pathname + location.search
function signature(element: Element) {
  const image = element instanceof HTMLImageElement ? element : undefined
  return JSON.stringify([
    element.tagName,
    [...element.classList].sort(),
    element.querySelector('a[href]')?.getAttribute('href') ?? '',
    element.querySelector('h1,h2,h3')?.textContent?.trim() ?? '',
    image?.src ?? '',
  ])
}
function capture(element: Element): NodeMotion {
  return {
    signature: signature(element),
    animations: element.getAnimations().flatMap((animation) => {
      const name = (animation as CSSAnimation).animationName
      if (
        !ownedAnimations.has(name) ||
        typeof animation.currentTime !== 'number'
      )
        return []
      return [
        {
          name,
          time: animation.currentTime,
          rate: animation.playbackRate,
          paused: animation.playState === 'paused',
          finished: animation.playState === 'finished',
        },
      ]
    }),
  }
}

export function capturePublicInitialMotion(root: HTMLElement) {
  pending = undefined
  if (root.dataset.publicInitialPath !== path()) return
  const reveals = (
    Object.keys(PUBLIC_INITIAL_REVEALS) as PublicInitialRevealKey[]
  ).flatMap((key): RevealMotion[] => {
    const { selector, mode } = PUBLIC_INITIAL_REVEALS[key]
    const source = root.querySelector(`[data-public-reveal="${key}"]`)
    if (!source?.matches(selector) || !source.hasAttribute('data-revealed'))
      return []
    return [
      {
        key,
        ...capture(source),
        children: mode === 'stagger' ? [...source.children].map(capture) : [],
      },
    ]
  })
  const photo = root.querySelector(photoSelector)
  pending = {
    path: path(),
    capturedAt: performance.now(),
    reveals,
    ...(photo ? { photo: capture(photo) } : {}),
  }
}

function resume(element: Element, state: NodeMotion, elapsed: number) {
  for (const animation of element.getAnimations()) {
    const previous = state.animations.find(
      (item) => item.name === (animation as CSSAnimation).animationName,
    )
    if (!previous) continue
    animation.playbackRate = previous.rate
    if (previous.finished) animation.finish()
    else {
      animation.currentTime =
        previous.time + (previous.paused ? 0 : elapsed * previous.rate)
      if (previous.paused) animation.pause()
    }
  }
}

/** Called in the existing layout effect, after stagger registration and before
 * paint. Continue only matching initial surfaces; new content and later SPA
 * routes keep their normal observers and approved entrance animations. */
export function restorePublicInitialMotion(container: HTMLElement) {
  const state = pending
  pending = undefined
  if (!state || state.path !== path()) return
  const elapsed = performance.now() - state.capturedAt
  for (const reveal of state.reveals) {
    const element = container.querySelector<HTMLElement>(
      PUBLIC_INITIAL_REVEALS[reveal.key].selector,
    )
    if (!element || signature(element) !== reveal.signature) continue
    element.setAttribute('data-revealed', '')
    resume(element, reveal, elapsed)
    for (const previous of reveal.children) {
      const child = [...element.children].find(
        (candidate) => signature(candidate) === previous.signature,
      )
      if (child) resume(child, previous, elapsed)
    }
  }
  const photo = container.querySelector(photoSelector)
  if (photo && state.photo && signature(photo) === state.photo.signature)
    resume(photo, state.photo, elapsed)
}
