import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  label: string
  icon: IconName
}
export function IconButton({
  label,
  icon,
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`icon-button ${className}`}
      {...props}
    >
      <Icon name={icon} />
    </button>
  )
}
