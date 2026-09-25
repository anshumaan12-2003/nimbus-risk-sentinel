/*
  Activity log: what Breachpath has been doing (live events) and every change it made to AWS
  (the remediation audit trail, with who requested and who approved each one).
*/
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Sheet, SheetContent, Tabs, TabsList, TabsTrigger, TabsContent, Button, Badge, EmptyState, SkeletonRows, ErrorState, CodeBlock,
  TimeAgo
} from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import { useEventStore, timeAgo } from '@/store/eventStore'
import { useAuditTrail } from '@/hooks/queries'
import { EVENT_META, toneFor } from '@/components/LiveStream'

const TONE_DOT = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low', brand: 'bg-accent', info: 'bg-accent' }

function LiveEvents() {
  const { events, mode, paused, togglePause } = useEventStore()
  const list = events.filter(e => e.source !== 'you').slice(0, 50)
  return (
    <div className="grid">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5 text-xs text-fg-2">
        <span className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', paused ? 'bg-fg-3' : mode === 'live' ? 'bg-low' : 'bg-med')} />
          {paused ? 'Paused' : mode === 'live' ? 'Connected — updates arrive as they happen' : mode === 'simulated' ? 'Live connection unavailable — showing sample events' : 'Connecting…'}
        </span>
        <Button variant="ghost" size="sm" onClick={togglePause}>{paused ? <><Play /> Resume</> : <><Pause /> Pause</>}</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState compact icon={Bell} title="Nothing yet" body="Scans, new findings and fixes appear here as they happen." />
      ) : (
        <ul className="divide-y divide-line">
          {list.map(e => {
            const Icon = EVENT_META[e.type]?.icon || Bell
            const body = (
              <>
                <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-fg-2">
                  <Icon className="size-3.5" />
                  <span className={cn('absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-surface', TONE_DOT[toneFor(e)] || 'bg-fg-3')} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg">{e.title}</span>
                  {e.detail && <span className="block truncate text-xs text-fg-3">{e.detail}</span>}
                </span>
                <span className="num shrink-0 text-2xs text-fg-3">{timeAgo(e.ts)}{e.source === 'simulated' ? ' · sample' : ''}</span>
              </>
            )
            return (
              <li key={e.id}>
                {e.link
                  ? <Link to={e.link} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">{body}</Link>
                  : <div className="flex items-start gap-3 px-5 py-3">{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AwsChanges() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const q = useAuditTrail()
  const [open, setOpen] = useState(null)
  if (demo) return <EmptyState compact title="Needs live data" body="The audit trail records real changes Breachpath made to your AWS account." />
  if (q.isLoading) return <div className="p-5"><SkeletonRows rows={5} /></div>
  if (q.isError) return <ErrorState compact error={q.error} onRetry={q.refetch} />
  if (!q.data?.length) return <EmptyState compact mood="calm" title="No changes to AWS yet" body="When an approver applies a fix, it’s recorded here with both names." />
  return (
    <ul className="divide-y divide-line">
      {q.data.map(r => {
        const ok = r.status === 'VERIFIED_RESOLVED' || r.status === 'SUCCESS'
        return (
          <li key={r.id} className="grid gap-1.5 px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-fg">{r.action_executed}</p>
              <Badge size="sm" tone={ok ? 'low' : 'critical'}>{ok ? 'Verified' : r.status.replace(/_/g, ' ').toLowerCase()}</Badge>
            </div>
            <p className="truncate font-mono text-xs text-fg-3" title={r.resource_id}>{r.rule_id} · {r.resource_id}</p>
            <p className="text-xs text-fg-2">
              Approved by <span className="text-fg">{r.executed_by}</span>
              {r.requested_by && <> · requested by <span className="text-fg">{r.requested_by}</span></>}
              <span className="text-fg-3"> · <TimeAgo value={r.timestamp} /></span>
            </p>
            {r.result_message && <p className="text-xs text-fg-2">{r.result_message}</p>}
            {r.rollback_command && (
              <button type="button" className="w-fit text-xs font-medium text-accent-text hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? 'Hide rollback' : 'Show rollback'}
              </button>
            )}
            {open === r.id && <CodeBlock code={typeof r.rollback_command === 'string' ? r.rollback_command : JSON.stringify(r.rollback_command, null, 2)} />}
          </li>
        )
      })}
    </ul>
  )
}

export default function AuditFeedDrawer() {
  const { auditDrawerOpen, closeAuditDrawer } = useSentinelStore()
  return (
    <Sheet open={auditDrawerOpen} onOpenChange={(o) => { if (!o) closeAuditDrawer() }}>
      <SheetContent width={520} title="Activity log" description="What Breachpath is doing, and every change it has made to AWS.">
        <Tabs defaultValue="live">
          <TabsList className="sticky top-0 z-10 bg-surface px-5">
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="aws">Changes to AWS</TabsTrigger>
          </TabsList>
          <TabsContent value="live"><LiveEvents /></TabsContent>
          <TabsContent value="aws"><AwsChanges /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
