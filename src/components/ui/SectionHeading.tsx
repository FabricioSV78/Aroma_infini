import type { ReactNode } from 'react'

interface SectionHeadingProps {
  id: string
  title: string
  eyebrow?: string
  action?: ReactNode
}
export function SectionHeading({
  id,
  title,
  eyebrow,
  action,
}: SectionHeadingProps) {
  return (
    <div className="section-heading" data-reveal="copy">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id}>{title}</h2>
      </div>
      {action}
    </div>
  )
}
