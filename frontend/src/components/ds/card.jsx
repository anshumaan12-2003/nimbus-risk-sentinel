import { cn } from '@/lib/cn'

/* A card separates one object from the page. Not everything is a card: lists and sections
   inside a card use dividers, not nested cards. */
export function Card({ className, as: Comp = 'section', interactive = false, ...props }) {
  return (
    <Comp
      className={cn(
        'min-w-0 rounded-lg border border-line bg-surface shadow-raised',
        interactive && 'cursor-pointer transition-colors duration-150 hover:border-line-strong',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, title, description, actions, icon: Icon, children }) {
  return (
    <header className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        {title && (
          <h2 className="flex items-center gap-2 text-md font-semibold text-fg">
            {Icon && <Icon className="size-4 text-fg-3" aria-hidden />}
            {title}
          </h2>
        )}
        {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, ...props }) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }) {
  return <footer className={cn('flex items-center gap-2 border-t border-line px-5 py-3', className)} {...props} />
}
