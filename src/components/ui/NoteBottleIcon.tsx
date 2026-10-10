import type { SVGProps } from 'react'

type NoteStage = 'top' | 'heart' | 'base'

const markerY: Record<NoteStage, number> = {
  top: 9.4,
  heart: 13.6,
  base: 17.8,
}

interface NoteBottleIconProps extends SVGProps<SVGSVGElement> {
  stage: NoteStage
}

export function NoteBottleIcon({ stage, ...props }: NoteBottleIconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M10 2h4v3h-4V2Zm-1 3h6v3H9V5ZM7 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
      <rect
        x="8"
        y={markerY[stage]}
        width="8"
        height="2.8"
        rx="0.3"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}
