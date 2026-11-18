import { createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { LoadingImage } from '../src/components/media/LoadingImage'

/** Exercise the actual component with a delayed/rejected browser decode while
 * preserving normal image downloads and Vite's single React instance. */
export function mountLoadingImageFixture(mode: 'hold-first' | 'reject') {
  const host = document.createElement('div')
  host.className = 'category-image'
  host.style.width = '180px'
  host.style.height = '225px'
  host.dataset.testid = 'image-lifecycle-fixture'
  const change = document.createElement('button')
  change.textContent = 'Cambiar fotografía de prueba'
  const release = document.createElement('button')
  release.textContent = 'Liberar decodificación de prueba'
  document.body.append(host, change, release)
  const root = createRoot(host)
  let releaseDecode = () => {}
  const decodeGate = new Promise<void>((resolve) => {
    releaseDecode = resolve
  })
  release.onclick = releaseDecode

  function render(source: string) {
    root.render(
      createElement(LoadingImage, {
        src: source,
        width: 480,
        height: 600,
        alt: 'Fotografía de prueba',
        onLoad: () => {
          host.dataset.loads = String(Number(host.dataset.loads ?? 0) + 1)
        },
        ref: (image) => {
          if (!image) return
          image.decode = async () => {
            await HTMLImageElement.prototype.decode.call(image)
            if (mode === 'reject') throw new DOMException('Decode rejected')
            if (image.currentSrc.includes('/cedre-')) await decodeGate
          }
        },
      }),
    )
  }
  change.onclick = () => render('/images/petale-480.webp')
  render('/images/cedre-480.webp')
}

/** Multiple image components can share an existing frame. The controls update
 * or unmount real components; the tests never write their error attributes. */
export function mountImageErrorOwnershipFixture(shared = false) {
  const host = document.createElement('div')
  host.className = 'category-image'
  host.style.width = '180px'
  host.style.height = '225px'
  host.dataset.testid = 'image-error-frame-fixture'
  document.body.append(host)
  const root = createRoot(host)
  let firstSource = '/images/qa-missing-first.webp'
  let showSecond = shared

  function render() {
    root.render(
      createElement(
        Fragment,
        null,
        createElement(LoadingImage, {
          key: 'first',
          src: firstSource,
          alt: 'Primera fotografía de prueba',
          width: 480,
          height: 600,
          id: 'first-error-owner',
        }),
        showSecond
          ? createElement(LoadingImage, {
              key: 'second',
              src: '/images/qa-missing-second.webp',
              alt: 'Segunda fotografía de prueba',
              width: 480,
              height: 600,
              id: 'second-error-owner',
            })
          : null,
      ),
    )
  }
  for (const [label, action] of [
    ['Restaurar primera fotografía', () => {
      firstSource = '/images/petale-480.webp'
      render()
    }],
    ['Fallar primera fotografía', () => {
      firstSource = '/images/qa-missing-first.webp'
      render()
    }],
    ['Retirar segunda fotografía', () => {
      showSecond = false
      render()
    }],
    ['Desmontar fotografías', () => root.unmount()],
  ] as const) {
    const button = document.createElement('button')
    button.textContent = label
    button.onclick = action
    document.body.append(button)
  }
  render()
}
