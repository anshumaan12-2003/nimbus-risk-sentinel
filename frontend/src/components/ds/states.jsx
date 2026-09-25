import { AlertTriangle, CheckCircle2, Inbox, RefreshCw, SearchX, WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiError } from '@/api/nimbus'
import { Button } from './button'

/* An icon in a soft rounded square, toned by meaning. Used by empty, error and waiting states. */
const TILE_TONE = {
  neutral: 'border-line bg-surface-2 text-fg-3',
  success: 'border-low-line bg-low-soft text-low-text',
  danger: 'border-crit-line bg-crit-soft text-crit-text',
  accent: 'border-accent-line bg-accent-soft text-accent-text',
}
export function IconTile({ icon: Icon, tone = 'neutral', size = 'md', className, iconClassName }) {
  return (
    <div aria-hidden className={cn('grid place-items-center rounded-xl border', size === 'lg' ? 'size-14' : 'size-11', TILE_TONE[tone], className)}>
      <Icon className={cn(size === 'lg' ? 'size-6' : 'size-5', iconClassName)} />
    </div>
  )
}

// What an empty state is saying, as an icon: all clear, nothing yet, nothing matches, or a problem.
const MOOD = {
  happy: { icon: CheckCircle2, tone: 'success' },
  calm: { icon: Inbox, tone: 'neutral' },
  thinking: { icon: SearchX, tone: 'neutral' },
  alarmed: { icon: AlertTriangle, tone: 'danger' },
}

/* Loading placeholder that keeps the shape of what's coming, so nothing jumps when data lands. */
export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_0%,var(--muted-2)_50%,var(--muted)_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  )
}

export function SkeletonRows({ rows = 5, className }) {
  return (
    <div className={cn('grid gap-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${92 - (i % 3) * 14}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, body, action, mood = 'calm', icon: Icon, compact = false, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-8' : 'gap-3 py-14', className)}>
      {Icon ? <IconTile icon={Icon} /> : <IconTile {...(MOOD[mood] || MOOD.calm)} size={compact ? 'md' : 'lg'} />}
      <div className="grid max-w-sm gap-1">
        <p className="text-md font-semibold text-fg">{title}</p>
        {body && <p className="text-sm text-fg-2">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, title, onRetry, compact = false, className }) {
  const offline = error && !error.response
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 text-center', compact ? 'py-8' : 'py-14', className)}>
      <IconTile icon={offline ? WifiOff : AlertTriangle} tone={offline ? 'neutral' : 'danger'} size={compact ? 'md' : 'lg'} />
      <div className="grid max-w-md gap-1">
        <p className="text-md font-semibold text-fg">{title || (offline ? 'Breachpath lost the connection' : 'This didn’t load')}</p>
        <p className="text-sm text-fg-2">{offline ? 'The server may be waking up or restarting. Try again in a few seconds.' : apiError(error)}</p>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry}><RefreshCw /> Try again</Button>}
    </div>
  )
}

/* Renders the right state for a TanStack query; children get the data. */
export function QueryState({ query, empty, isEmpty = (d) => !d || (Array.isArray(d) && d.length === 0), rows, loading, children }) {
  if (query.isLoading) return loading || <SkeletonRows rows={rows} />
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} compact />
  if (isEmpty(query.data)) return empty || <EmptyState title="Nothing here yet" compact />
  return children(query.data)
}
