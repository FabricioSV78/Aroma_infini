import { useCallback, useEffect, type ComponentPropsWithRef } from 'react'
import { useImageStatus } from './useImageStatus'
import './media-loading.css'

const errorFrameSelector = [
  '.about-hero-media',
  '.about-story-media',
  '.wordmark',
  '.category-image',
  '.olfactory-profile-visual',
  '.finder-result-photo',
  '.cart-line-image',
  '.account-order-product-image',
  '.editorial-film-media',
  '.finder-option--photo',
  '.finder-entry-option',
  '.search-suggestions li a',
  '.checkout-summary-lines li',
  '.brands-directory > a',
  '.auth-editorial',
  '.finder-scene',
].join(',')
const frameErrors = new WeakMap<HTMLElement, Set<HTMLImageElement>>()
const inlineErrorImage =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"%3E%3Crect width="160" height="160" fill="%23f4f4f1"/%3E%3Cg fill="none" stroke="%23646b69" stroke-width="2" opacity=".55"%3E%3Crect x="51" y="59" width="58" height="44" rx="4"/%3E%3Cpath d="m61 59 5-10h28l5 10"/%3E%3Ccircle cx="80" cy="81" r="12"/%3E%3Cpath d="m48 111 64-64"/%3E%3C/g%3E%3C/svg%3E'

/** A normal img with request/decode status. It deliberately adds no wrapper so
 * responsive pictures, grid columns and existing image selectors stay intact. */
export function LoadingImage({
  src,
  srcSet,
  alt = '',
  className,
  fallback = 'frame',
  ref: suppliedRef,
  ...props
}: ComponentPropsWithRef<'img'> & { fallback?: 'frame' | 'inline' }) {
  const { ref, state, errorAspectRatio } = useImageStatus(src ?? '', srcSet)
  const attach = useCallback(
    (image: HTMLImageElement | null) => {
      ref.current = image
      if (typeof suppliedRef === 'function') return suppliedRef(image)
      if (suppliedRef) suppliedRef.current = image
    },
    [ref, suppliedRef],
  )
  useEffect(
    function markLocalImageError() {
      if (state !== 'error' || fallback === 'inline') return
      const image = ref.current
      const frame = image?.closest<HTMLElement>(errorFrameSelector)
      if (!image || !frame) return
      const errors = frameErrors.get(frame) ?? new Set<HTMLImageElement>()
      errors.add(image)
      frameErrors.set(frame, errors)
      frame.setAttribute('data-media-error', '')
      return () => {
        errors.delete(image)
        // Another failed image can still own this same existing frame.
        if (errors.size) return
        frameErrors.delete(frame)
        frame.removeAttribute('data-media-error')
      }
    },
    [state, src, srcSet, ref, fallback],
  )
  return (
    <img
      {...props}
      ref={attach}
      src={state === 'error' && fallback === 'inline' ? inlineErrorImage : src}
      srcSet={state === 'error' && fallback === 'inline' ? undefined : srcSet}
      className={`media-managed-image${className ? ` ${className}` : ''}`}
      data-media-state={state}
      data-media-fallback={state === 'error' && fallback === 'inline' ? '' : undefined}
      style={state === 'error' && fallback === 'inline' && errorAspectRatio
        ? { ...props.style, aspectRatio: errorAspectRatio } : props.style}
      aria-busy={state === 'pending' ? true : props['aria-busy']}
      alt={state === 'error' && alt ? `Imagen no disponible: ${alt}` : alt}
    />
  )
}
