/*
  Legacy page primitives, now rendered by the design system (./ds) so pages that still import
  from here get the new look. New code imports from '@/components/ds' directly.
*/
import {
  PageHeader as DsPageHeader, SkeletonRows, EmptyState as DsEmptyState, ErrorState as DsErrorState,
  QueryState as DsQueryState, Sheet, SheetContent, SeverityBadge, StatTile,
} from './ds'

export function PageHeader({ title, subtitle, actions }) {
  return <DsPageHeader title={title} description={subtitle} actions={actions} />
}

export function Skeleton({ rows = 5 }) {
  return <SkeletonRows rows={rows} />
}

export function EmptyState({ icon, title, body, action }) {
  return <DsEmptyState icon={icon} title={title} body={body} action={action} compact />
}

export function ErrorState({ error, onRetry }) {
  return <DsErrorState error={error} onRetry={onRetry} compact />
}

export const QueryState = DsQueryState

export function Drawer({ open, onClose, title, children, width = 520 }) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent title={title} width={width}>
        <div className="p-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function SevBadge({ severity }) {
  return <SeverityBadge severity={severity} />
}

export function Metric({ label, value, hint, tone }) {
  return <StatTile label={label} value={value} hint={hint} tone={tone || 'neutral'} />
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
