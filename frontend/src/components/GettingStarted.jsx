import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, Card } from '@/components/ds'
import { usePreflight, useScans, useConfig } from '../hooks/queries'
import { useSentinelStore } from '../store/sentinelStore'
import { useCan } from '../auth/authStore'

/*
  First-run checklist. Each step is derived from real backend state, so it ticks itself off
  and disappears once the account has a completed scan with full visibility.
*/
export default function GettingStarted() {
  const { dataSource, openScanModal } = useSentinelStore()
  const pre = usePreflight()
  const scans = useScans(5)
  const cfg = useConfig()
  const run = useCan('scan:run')
  if (dataSource === 'demo' || pre.isLoading || scans.isLoading) return null

  const connected = !!pre.data?.connected
  const permissions = !!pre.data?.ready
  const scanned = (scans.data || []).some(s => s.status === 'COMPLETED')
  const ai = !!cfg.data?.ai_configured
  if (connected && permissions && scanned) return null

  const steps = [
    { done: connected, title: 'Connect AWS', body: 'Add a read-only IAM user, SSO profile or role to backend/.env.', to: '/settings' },
    { done: permissions, title: 'Grant read access', body: 'Attach SecurityAudit and ViewOnlyAccess so nothing is a blind spot.', to: '/settings' },
    { done: scanned, title: 'Run the first scan', body: 'Builds findings, inventory, attack paths and compliance scores.', action: openScanModal },
    { done: ai, title: 'Turn on Vesper', body: 'Optional: add AI_API_KEY so Vesper answers in plain English (it works from scan facts without it).', to: '/settings', optional: true },
  ]
  const next = steps.find(s => !s.done && !s.optional)
  const done = steps.filter(s => s.done).length

  return (
    <Card className="mb-6 overflow-hidden" aria-label="Getting started">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <p className="text-sm font-semibold text-fg">Finish setting up Nimbus</p>
        <div className="flex items-center gap-3">
          <span className="num text-xs text-fg-3">{done} of {steps.length}</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted-2">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
        </div>
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {steps.map((s, i) => {
          const isNext = s === next
          return (
            <li key={s.title} className={cn('grid content-start gap-1.5 p-4', isNext && 'bg-accent-soft/50')}>
              <span className={cn('grid size-6 place-items-center rounded-full border text-xs font-semibold',
                s.done ? 'border-low bg-low text-white' : isNext ? 'border-accent text-accent-text' : 'border-line-strong text-fg-3')}>
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <p className={cn('text-sm font-medium', s.done ? 'text-fg-3 line-through decoration-line-strong' : 'text-fg')}>{s.title}</p>
              <p className="text-xs text-fg-2">{s.body}</p>
              {!s.done && (s.action
                ? <Button size="sm" variant={isNext ? 'primary' : 'secondary'} className="mt-1 w-fit" onClick={s.action}
                          disabled={!connected || !run.allowed} title={run.reason || undefined}>Start scan</Button>
                : <Link to={s.to} className="mt-1 inline-flex w-fit items-center gap-0.5 text-xs font-medium text-accent-text hover:underline">
                    Open settings <ChevronRight className="size-3.5" />
                  </Link>)}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
