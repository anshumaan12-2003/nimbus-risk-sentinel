import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The one primary action on a screen.
        primary: 'bg-accent text-accent-fg shadow-raised hover:bg-accent-hover',
        // Most actions.
        secondary: 'border border-line-strong bg-surface text-fg shadow-raised hover:bg-muted',
        // Toolbars, low emphasis.
        ghost: 'text-fg-2 hover:bg-muted hover:text-fg',
        // Destructive confirmation.
        danger: 'bg-crit text-white shadow-raised hover:brightness-95',
        // Inline text action.
        link: 'h-auto px-0 text-accent-text underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-8 px-3 text-sm [&_svg]:size-4',
        lg: 'h-10 px-4 text-base [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-4',
        'icon-sm': 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export const Button = forwardRef(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(asChild ? {} : { type: props.type || 'button' })}
      {...props}
    >
      {loading ? <><Loader2 className="animate-spin" />{children}</> : children}
    </Comp>
  )
})
