/* Shared page primitives so every page handles loading / empty / error the same way. */
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Inbox from 'lucide-react/dist/esm/icons/inbox'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import X from 'lucide-react/dist/esm/icons/x'
import { useEffect } from 'react'
import { apiError } from '../api/nimbus'

export function PageHeader({ icon: Icon, tag, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {tag && <div className="page-tag">{Icon && <Icon size={12} />}<span>{tag}</span></div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
    </div>
  )
}

export function Skeleton({ rows = 5, height = 18 }) {
  return (
    <div className="ui-skeleton-stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: 6, width: `${92 - (i % 3) * 12}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="ui-empty">
      <Icon size={22} />
      <div className="ui-empty-title">{title}</div>
      {body && <p className="ui-empty-body">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="ui-empty ui-error" role="alert">
      <AlertTriangle size={22} />
      <div className="ui-empty-title">Could not load data</div>
      <p className="ui-empty-body">{apiError(error)}</p>
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}><RefreshCw size={12} /> Retry</button>}
    </div>
  )
}

/* Renders the right state for a TanStack query; children get the data. */
export function QueryState({ query, empty, isEmpty = (d) => !d || (Array.isArray(d) && d.length === 0), rows, children }) {
  if (query.isLoading) return <Skeleton rows={rows} />
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />
  if (isEmpty(query.data)) return empty || <EmptyState title="Nothing here yet" />
  return children(query.data)
}

export function Drawer({ open, onClose, title, children, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="ui-drawer-overlay" onClick={onClose}>
      <aside className="ui-drawer" style={{ width: `min(${width}px, 100vw)` }} onClick={e => e.stopPropagation()}
             role="dialog" aria-modal="true" aria-label={title}>
        <div className="ui-drawer-head">
          <h2>{title}</h2>
          <button className="header-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export function SevBadge({ severity }) {
  if (!severity) return <span className="badge-pill ui-badge-muted">None</span>
  return <span className={`badge-pill badge-${severity.toLowerCase()}`}>{severity}</span>
}

export function Metric({ label, value, hint, tone }) {
  return (
    <div className="card ui-metric">
      <div className="card-kicker">{label}</div>
      <div className="ui-metric-value" style={tone ? { color: `var(--sev-${tone})` } : undefined}>{value}</div>
      {hint && <div className="ui-metric-hint">{hint}</div>}
    </div>
  )
}

export function downloadFile(name, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function toCsv(rows, cols) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))].join('\n')
}
