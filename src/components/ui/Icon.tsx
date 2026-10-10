import type { SVGProps } from 'react'

const paths = {
  botanical:
    'M12 21V10M12 15C5 15 3 11 3 6c6 0 9 3 9 9Zm0-4c0-6 3-9 9-9 0 6-3 9-9 9Z',
  dayNight:
    'M14 3a8 8 0 1 1-1 16 7 7 0 0 0 1-16ZM7 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM7 4v1M2 6l1 1M1 11h1M2 16l1-1M7 17v1',
  scent:
    'M6 21c-3-3-3-6 0-9s3-6 0-9M12 21c-3-3-3-6 0-9s3-6 0-9M18 21c-3-3-3-6 0-9s3-6 0-9',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8V4Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'm6 6 12 12M18 6 6 18',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  bag: 'M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
  chevron: 'm8 4 8 8-8 8',
  truck:
    'M1 4h13v13H1V4Zm13 5h4l4 5v3h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2',
  chat: 'M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L2 22l2-6a9 9 0 1 1 17-4.5ZM7 10h10M7 14h6',
  instagram:
    'M7 2.5h10a4.5 4.5 0 0 1 4.5 4.5v10a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 17V7A4.5 4.5 0 0 1 7 2.5Zm5 5.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.3-1.2h.01',
  facebook:
    'M14.5 21v-8h3l.5-4h-3.5V7c0-1 .4-1.5 1.6-1.5H18V2.2a22 22 0 0 0-2.6-.2C12.4 2 11 3.8 11 6.6V9H8v4h3v8',
  tiktok:
    'M15 3v11.3a4.3 4.3 0 1 1-4.3-4.3M15 3c.7 2.4 2.3 3.8 5 4v3c-2.2-.1-3.9-.8-5-2',
  dashboard: 'M4 4h6v6H4V4Zm10 0h6v4h-6V4ZM4 14h6v6H4v-6Zm10-2h6v8h-6v-8Z',
  orders: 'M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4',
  package: 'm3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10',
  tag: 'M20 13 13 20 4 11V4h7l9 9ZM8 8h.01',
  percent: 'M19 5 5 19M7 5h.01M17 19h.01',
  home: 'm3 11.5 9-7.5 9 7.5V21h-6v-6H9v6H3v-9.5Z',
  alert: 'M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01',
  check: 'm5 12 4 4L19 6',
  store: 'M4 10v11h16V10M3 4h18l-1 6H4L3 4Zm6 17v-6h6v6',
} as const

export type IconName = keyof typeof paths
interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}
export function Icon({ name, ...props }: IconProps) {
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
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  )
}
