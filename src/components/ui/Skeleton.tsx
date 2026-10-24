import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  width?: CSSProperties['width']
  height?: CSSProperties['height']
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <span
      className={`ui-skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
