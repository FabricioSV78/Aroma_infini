import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import type { ImageStatus } from './useImageStatus'
import './media-loading.css'

interface ImagePlaceholderProps {
  state: ImageStatus
  label?: string
}

export function ImagePlaceholder({ state, label }: ImagePlaceholderProps) {
  if (state === 'ready') return null
  const accessibleError = state === 'error' && Boolean(label)
  return (
    <span
      className="media-placeholder"
      data-media-placeholder=""
      data-state={state}
      role={accessibleError ? 'img' : undefined}
      aria-label={accessibleError ? label : undefined}
      aria-hidden={accessibleError ? undefined : true}
    >
      {state === 'pending' ? (
        <Skeleton className="media-placeholder__skeleton" />
      ) : (
        <>
          <Icon name="scent" />
          {label ? <span>Imagen no disponible</span> : null}
        </>
      )}
    </span>
  )
}
