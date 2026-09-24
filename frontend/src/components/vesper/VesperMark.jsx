import { useId } from 'react'
import { cn } from '@/lib/cn'

/*
  Vesper's mark: the evening star, a four-point star on the Dawn gradient (the one place Dawn is used).
  thinking: the star breathes and turns slowly while an answer is being written.
  plain: just the star in the current text colour, for inline use in buttons and menus.
*/
export default function VesperMark({ size = 20, thinking = false, plain = false, className }) {
  const id = useId().replace(/:/g, '')
  const star = 'M12 2.5c.55 4.3 2.55 6.4 7 7.2v.2c-4.45.8-6.45 2.9-7 7.2h-.2c-.55-4.3-2.55-6.4-7-7.2v-.2c4.45-.8 6.45-2.9 7-7.2z'
  if (plain) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
        <path d={star} fill="currentColor" transform="translate(0 1.2)" />
        <circle cx="19" cy="18.5" r="1.6" fill="currentColor" opacity=".7" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden
         className={cn('shrink-0', thinking && 'vesper-thinking', className)}>
      <defs>
        <linearGradient id={`dawn-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--dawn-1)" />
          <stop offset=".55" stopColor="var(--dawn-2)" />
          <stop offset="1" stopColor="var(--dawn-3)" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#dawn-${id})`} />
      <g className="vesper-star" style={{ transformOrigin: '12px 11.2px' }}>
        <path d={star} fill="#fff" transform="translate(0 -0.8) scale(.84) translate(2.3 2.2)" />
      </g>
      <circle cx="18.2" cy="17.6" r="1.25" fill="#fff" opacity=".85" />
    </svg>
  )
}
