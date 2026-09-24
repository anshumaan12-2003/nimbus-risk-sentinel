import { cn } from '@/lib/cn'

/* Every page starts the same way: title, one line of context, actions on the right. */
export function PageHeader({ title, description, actions, meta, className }) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-fg-2">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* Page body width + gutters, consistent across pages. */
export function Page({ className, wide = false, ...props }) {
  return <div className={cn('stagger mx-auto w-full px-4 py-6 sm:px-6 lg:px-8', wide ? 'max-w-[1600px]' : 'max-w-[1280px]', className)} {...props} />
}

export function Section({ title, description, actions, className, children }) {
  return (
    <section className={cn('grid gap-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div>
            {title && <h2 className="text-md font-semibold text-fg">{title}</h2>}
            {description && <p className="text-sm text-fg-2">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
