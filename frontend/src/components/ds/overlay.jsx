import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './button'

/* ─── Dialog: centred, for decisions that block the flow ───────────────────── */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

function Overlay() {
  return <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-scrim" />
}

export function DialogContent({ title, description, className, children, footer, hideClose = false }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'anim-dialog fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
          'grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border border-line bg-surface shadow-popover focus:outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description
              ? <DialogPrimitive.Description className="mt-1 text-sm text-fg-2">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          {!hideClose && (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button>
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* ─── Sheet: slides from the right; detail views that keep the list in context ── */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger

export function SheetContent({ title, description, width = 560, className, children, footer, headerExtra }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        style={{ width: `min(${width}px, 100vw)` }}
        className={cn(
          'anim-sheet fixed inset-y-0 right-0 z-50 grid grid-rows-[auto_1fr_auto] border-l border-line bg-surface shadow-popover focus:outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-md font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description
              ? <DialogPrimitive.Description className="mt-0.5 text-sm text-fg-2">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            {headerExtra}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* ─── Menu ─────────────────────────────────────────────────────────────────── */
export const Menu = DropdownPrimitive.Root
export const MenuTrigger = DropdownPrimitive.Trigger

export function MenuContent({ className, align = 'end', children, ...props }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('anim-pop z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-popover', className)}
        {...props}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function MenuItem({ className, icon: Icon, shortcut, danger = false, children, ...props }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm text-fg outline-none select-none',
        'data-[highlighted]:bg-muted data-[disabled]:opacity-50',
        danger && 'text-crit-text',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-4 text-fg-3" aria-hidden />}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="font-mono text-2xs text-fg-3">{shortcut}</span>}
    </DropdownPrimitive.Item>
  )
}

export function MenuLabel({ className, ...props }) {
  return <DropdownPrimitive.Label className={cn('px-2 pt-1.5 pb-1 text-xs text-fg-3', className)} {...props} />
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />
}

/* ─── Tooltip ──────────────────────────────────────────────────────────────── */
export const TooltipProvider = ({ children }) => (
  <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200}>{children}</TooltipPrimitive.Provider>
)

export function Tooltip({ content, side = 'top', children }) {
  if (!content) return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="anim-pop z-50 max-w-64 rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-overlay"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* ─── Popover: non-modal panel anchored to a trigger (notifications, filters) ─── */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({ className, align = 'end', children, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('anim-pop z-50 rounded-lg border border-line bg-surface shadow-popover focus:outline-none', className)}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}
