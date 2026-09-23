import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Tooltip } from './overlay'

/* Copy with a visible confirmation that doesn't move the layout. */
export function CopyButton({ value, label = 'Copy', className }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 1400)
    } catch { /* clipboard blocked: the text is still selectable */ }
  }
  return (
    <Tooltip content={done ? 'Copied' : label}>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={cn('grid size-6 shrink-0 place-items-center rounded-sm text-fg-3 transition-colors hover:bg-muted hover:text-fg', className)}
      >
        {done ? <Check className="size-3.5 text-low-text" /> : <Copy className="size-3.5" />}
      </button>
    </Tooltip>
  )
}

/* An AWS identifier (ARN, instance id…) — mono, truncated in the middle's favour, copyable. */
export function ResourceId({ value, consoleUrl, className }) {
  if (!value) return <span className="text-fg-3">—</span>
  return (
    <span className={cn('inline-flex max-w-full min-w-0 items-center gap-0.5', className)}>
      <span className="truncate font-mono text-xs text-fg-2" title={value}>{value}</span>
      <CopyButton value={value} label="Copy ID" />
      {consoleUrl && (
        <Tooltip content="Open in AWS Console">
          <a href={consoleUrl} target="_blank" rel="noreferrer" aria-label="Open in AWS Console"
             className="grid size-6 place-items-center rounded-sm text-fg-3 hover:bg-muted hover:text-fg">
            <ExternalLink className="size-3.5" />
          </a>
        </Tooltip>
      )}
    </span>
  )
}

/* CLI / Terraform / JSON snippet with a copy button. */
export function CodeBlock({ code, language, className }) {
  return (
    <div className={cn('group relative overflow-hidden rounded-md border border-line bg-surface-2', className)}>
      {language && (
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <span className="font-mono text-2xs tracking-wide text-fg-3 uppercase">{language}</span>
          <CopyButton value={code} label="Copy code" />
        </div>
      )}
      {!language && <CopyButton value={code} label="Copy code" className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />}
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-fg"><code>{code}</code></pre>
    </div>
  )
}

/* Key/value rows for detail panels. */
export function DescriptionList({ items, className }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-6 gap-y-2.5 text-sm', className)}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-3">{k}</dt>
          <dd className="min-w-0 text-fg">{v ?? <span className="text-fg-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/* Big-number tile. Severity is a small square marker, not a fill: the number carries the meaning. */
const MARK = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low', accent: 'bg-accent', neutral: 'bg-fg-3' }

export function StatTile({ label, value, tone = 'neutral', delta, deltaGood = 'down', hint, onClick, className }) {
  const Comp = onClick ? 'button' : 'div'
  const d = typeof delta === 'number' ? delta : null
  const good = d == null || d === 0 ? null : (deltaGood === 'down' ? d < 0 : d > 0)
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'grid gap-1 rounded-lg border border-line bg-surface p-4 text-left shadow-raised',
        onClick && 'cursor-pointer transition-colors duration-150 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-sm text-fg-2">
        <span aria-hidden className={cn('size-2 rounded-[2px]', MARK[tone] || MARK.neutral)} />
        {label}
      </span>
      <span className="num text-2xl font-semibold text-fg">{value}</span>
      <span className="num flex items-center gap-1.5 text-xs text-fg-3">
        {d != null && (
          <span className={cn('font-medium', good === true && 'text-low-text', good === false && 'text-crit-text')}>
            {d > 0 ? `+${d}` : d === 0 ? '±0' : d}
          </span>
        )}
        {hint}
      </span>
    </Comp>
  )
}
