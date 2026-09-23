import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-md border border-line-strong bg-surface text-sm text-fg placeholder:text-fg-3 ' +
  'transition-[border-color,box-shadow] duration-150 ease-standard ' +
  'hover:border-fg-3 focus:border-accent focus:shadow-[var(--ring)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-crit aria-invalid:focus:shadow-none'

export const Input = forwardRef(function Input({ className, icon: Icon, ...props }, ref) {
  if (!Icon) return <input ref={ref} className={cn(control, 'h-8 px-2.5', className)} {...props} />
  return (
    <div className="relative">
      <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
      <input ref={ref} className={cn(control, 'h-8 pr-2.5 pl-8', className)} {...props} />
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 px-2.5 py-2 leading-5', className)} {...props} />
})

/* Label + control + hint/error, wired for screen readers. Pass a render function to get the ids. */
export function Field({ label, hint, error, className, children }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      {label && <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && <p id={hintId} className="text-xs text-fg-3">{hint}</p>}
      {error && <p id={errId} className="text-xs text-crit-text" role="alert">{error}</p>}
    </div>
  )
}

export function Kbd({ className, ...props }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line border-b-2 bg-surface px-1 font-mono text-2xs text-fg-2',
        className,
      )}
      {...props}
    />
  )
}
