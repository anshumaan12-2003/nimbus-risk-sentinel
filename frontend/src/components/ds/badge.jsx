import { cva } from 'class-variance-authority'
import { cn } from '@/lib/cn'

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-muted text-fg-2',
        accent: 'border-accent-line bg-accent-soft text-accent-text',
        critical: 'border-crit-line bg-crit-soft text-crit-text',
        high: 'border-high-line bg-high-soft text-high-text',
        medium: 'border-med-line bg-med-soft text-med-text',
        low: 'border-low-line bg-low-soft text-low-text',
        info: 'border-info-line bg-info-soft text-info-text',
      },
      size: { sm: 'h-5 px-1.5 text-2xs', md: 'h-6 px-2 text-xs' },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export function Badge({ className, tone, size, dot = false, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-[2px] bg-current" />}
      {children}
    </span>
  )
}

const SEVERITY = {
  CRITICAL: { tone: 'critical', label: 'Critical' },
  HIGH: { tone: 'high', label: 'High' },
  MEDIUM: { tone: 'medium', label: 'Medium' },
  LOW: { tone: 'low', label: 'Low' },
  INFO: { tone: 'info', label: 'Info' },
}

/* Severity is encoded twice — colour and a square marker — so it reads without colour vision. */
export function SeverityBadge({ severity, size, className }) {
  const s = SEVERITY[String(severity || '').toUpperCase()]
  if (!s) return <Badge size={size} className={className}>None</Badge>
  return <Badge tone={s.tone} size={size} dot className={className}>{s.label}</Badge>
}

export const severityTone = (severity) => SEVERITY[String(severity || '').toUpperCase()]?.tone || 'neutral'

const STATUS = {
  OPEN: { tone: 'neutral', label: 'Open' },
  IN_PROGRESS: { tone: 'accent', label: 'In progress' },
  RESOLVED: { tone: 'low', label: 'Resolved' },
  ACCEPTED: { tone: 'neutral', label: 'Accepted risk' },
  SUPPRESSED: { tone: 'neutral', label: 'Suppressed' },
  PENDING: { tone: 'medium', label: 'Pending' },
  APPLIED: { tone: 'low', label: 'Applied' },
  REJECTED: { tone: 'critical', label: 'Rejected' },
  FAILED: { tone: 'critical', label: 'Failed' },
  CANCELLED: { tone: 'neutral', label: 'Withdrawn' },
  COMPLETED: { tone: 'low', label: 'Completed' },
  RUNNING: { tone: 'accent', label: 'Running' },
}

export function StatusBadge({ status, size, className }) {
  const key = String(status || '').toUpperCase()
  const s = STATUS[key] || { tone: 'neutral', label: status || '—' }
  return <Badge tone={s.tone} size={size} className={className}>{s.label}</Badge>
}
