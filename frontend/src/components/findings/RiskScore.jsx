import { ArrowDown, ArrowUp } from 'lucide-react'
import { Tooltip } from '@/components/ds'
import { cn } from '@/lib/cn'
import { riskContext } from '@/lib/risk'

/* The risk number with its reason: an arrow when the resource's sensitivity moved it away from the severity's base
   score, so "High · 97" ranking above "Critical · 85" explains itself. */
/* focusable: only where it isn't already inside a link or button (nested interactive elements are invalid). */
export function RiskScore({ finding, focusable = false, className }) {
  const r = riskContext(finding)
  return (
    <Tooltip content={r.text}>
      <span tabIndex={focusable ? 0 : undefined} aria-label={focusable ? r.text : undefined}
            className={cn('num inline-flex items-center justify-end gap-0.5 rounded-xs text-sm font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent', className)}>
        {r.dir === 'up' && <ArrowUp aria-hidden className="size-3 text-crit-text" />}
        {r.dir === 'down' && <ArrowDown aria-hidden className="size-3 text-low-text" />}
        {r.score}
      </span>
    </Tooltip>
  )
}
