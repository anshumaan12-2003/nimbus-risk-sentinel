import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiError } from '@/api/nimbus'
import Mascot from '@/components/Mascot'
import { Button } from './button'

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
      {Icon
        ? <div className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-fg-3"><Icon className="size-5" /></div>
        : <Mascot mood={mood} size={compact ? 64 : 88} />}
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
      <Mascot mood={offline ? 'thinking' : 'alarmed'} size={compact ? 64 : 80} label={offline ? 'Connection lost' : 'Something went wrong'} />
      <div className="grid max-w-md gap-1">
        <p className="text-md font-semibold text-fg">{title || (offline ? 'Nimbus lost the connection' : 'This didn’t load')}</p>
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
