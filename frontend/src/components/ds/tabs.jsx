import { createContext, useContext } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/cn'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

const Variant = createContext('underline')

/* Underline tabs for page sections; `segmented` for compact view switches. */
export function TabsList({ className, segmented = false, ...props }) {
  return (
    <Variant.Provider value={segmented ? 'segmented' : 'underline'}>
      <TabsPrimitive.List
        className={cn(
          segmented
            ? 'inline-flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5'
            : 'flex items-center gap-5 overflow-x-auto border-b border-line',
          className,
        )}
        {...props}
      />
    </Variant.Provider>
  )
}

export function TabsTrigger({ className, count, children, ...props }) {
  const variant = useContext(Variant)
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors duration-150 outline-none hover:text-fg',
        'focus-visible:outline-2 focus-visible:outline-accent',
        variant === 'underline'
          ? '-mb-px h-9 border-b-2 border-transparent data-[state=active]:border-fg data-[state=active]:text-fg'
          : 'h-7 rounded-[6px] px-2.5 data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-raised',
        className,
      )}
      {...props}
    >
      {children}
      {count != null && <span className="num rounded-xs bg-muted-2 px-1 text-2xs text-fg-2">{count}</span>}
    </TabsPrimitive.Trigger>
  )
}

export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong transition-colors duration-150',
        'data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-raised transition-transform duration-150 ease-standard data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
