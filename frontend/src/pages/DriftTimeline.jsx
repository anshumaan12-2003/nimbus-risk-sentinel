import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Minus, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, CardHeader, Button, SeverityBadge, StatTile, EmptyState, ErrorState, SkeletonRows,
  Tabs, TabsList, TabsTrigger, TabsContent,
  TimeAgo
} from '@/components/ds'
import { api } from '@/api/nimbus'
import { useLatestDrift } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { MOCK_DRIFT_REPORT, MOCK_DRIFT_TIMELINE } from '@/data/mockData'
import { SERVICE_NAMES } from '@/lib/aws'

// Severity may arrive as "HIGH" or (older rows) "Severity.HIGH".
const sev = (s) => String(s || '').split('.').pop().toUpperCase()

function FindingList({ items, empty }) {
  if (!items?.length) return <p className="px-5 py-8 text-center text-sm text-fg-2">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {items.map((f, i) => (
        <li key={`${f.rule_id}-${f.resource_name}-${i}`} className="flex items-center gap-3 px-5 py-3">
          <SeverityBadge severity={sev(f.severity)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{f.title}</p>
            <p className="truncate text-xs text-fg-3"><span className="font-mono">{f.rule_id}</span>{f.resource_name && ` · ${f.resource_name}`} · {SERVICE_NAMES[f.service] || f.service}</p>
          </div>
          {f.risk_score != null && <span className="num text-sm font-semibold text-fg">{f.risk_score}</span>}
        </li>
      ))}
    </ul>
  )
}

function Delta({ value }) {
  const v = Number(value) || 0
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn('num inline-flex items-center gap-0.5 font-medium', v > 0 ? 'text-crit-text' : v < 0 ? 'text-low-text' : 'text-fg-3')}>
      <Icon className="size-3.5" />{v > 0 ? `+${v}` : v}
    </span>
  )
}

export default function DriftTimeline() {
  const { dataSource, openScanModal } = useSentinelStore()
  const demo = dataSource === 'demo'
  const latestQ = useLatestDrift()
  const timelineQ = useQuery({ queryKey: ['drift', 'timeline'], queryFn: () => api.get('/drift/timeline', { params: { limit: 20 } }).then(r => r.data), enabled: !demo })
  const report = demo ? MOCK_DRIFT_REPORT : latestQ.data
  const timeline = demo ? MOCK_DRIFT_TIMELINE : (timelineQ.data || [])
  const [tab, setTab] = useState('new')

  const header = (
    <PageHeader
      title="Changes"
      description="What changed between scans: findings that appeared, ones that were fixed, and ones that came back after being resolved."
      actions={<Button variant="primary" onClick={openScanModal}><Play /> Scan now</Button>}
    />
  )
  if (!demo && latestQ.isLoading) return <Page>{header}<SkeletonRows rows={8} /></Page>
  if (!demo && latestQ.isError) return <Page>{header}<Card><ErrorState error={latestQ.error} onRetry={latestQ.refetch} /></Card></Page>
  if (!report || report.previous_scan_id === 'baseline' || !report.summary) {
    return (
      <Page>{header}
        <Card><EmptyState title="Needs two scans to compare"
          body={report?.message || 'The first scan sets a baseline. Changes appear here from the second scan onwards.'}
          action={<Button variant="primary" onClick={openScanModal}><Play /> Run a scan</Button>} /></Card>
      </Page>
    )
  }

  const s = report.summary
  const lists = { new: report.new_findings, resolved: report.resolved_findings, regressed: report.regressed_findings }

  return (
    <Page>
      {header}
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Risk score change" value={<Delta value={report.risk_score_delta} />} tone={report.risk_score_delta > 0 ? 'critical' : report.risk_score_delta < 0 ? 'low' : 'neutral'}
                    hint={`${report.previous_risk_score} → ${report.current_risk_score}`} />
          <StatTile label="New" value={s.new_count} tone={s.new_count ? 'critical' : 'neutral'} hint="appeared since last scan" onClick={() => setTab('new')} />
          <StatTile label="Fixed" value={s.resolved_count} tone={s.resolved_count ? 'low' : 'neutral'} hint="no longer detected" onClick={() => setTab('resolved')} />
          <StatTile label="Came back" value={s.regressed_count} tone={s.regressed_count ? 'high' : 'neutral'} hint="resolved before, open again" onClick={() => setTab('regressed')} />
        </div>

        <Card className="overflow-hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="px-5 pt-3">
              <TabsTrigger value="new" count={s.new_count}>New</TabsTrigger>
              <TabsTrigger value="resolved" count={s.resolved_count}>Fixed</TabsTrigger>
              <TabsTrigger value="regressed" count={s.regressed_count}>Came back</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="focus:outline-none">
              <FindingList items={lists[tab]}
                           empty={tab === 'new' ? 'Nothing new since the last scan.' : tab === 'resolved' ? 'Nothing was fixed between these scans.' : 'Nothing came back — fixes are holding.'} />
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Timeline" description="Each completed scan compared with the one before it." />
          {!demo && timelineQ.isLoading ? <div className="p-5"><SkeletonRows rows={4} /></div> : timeline.length === 0 ? (
            <p className="border-t border-line px-5 py-8 text-center text-sm text-fg-2">The timeline starts after the second scan.</p>
          ) : (
            <ol className="relative border-t border-line">
              {timeline.map((t, i) => {
                const ts = t.summary || {}
                return (
                  <li key={t.scan_id || i} className="relative flex gap-4 px-5 py-4">
                    <div className="relative flex flex-col items-center" aria-hidden>
                      <span className={cn('mt-1 size-2.5 rounded-full ring-4 ring-surface',
                        t.risk_score_delta > 0 ? 'bg-crit' : t.risk_score_delta < 0 ? 'bg-low' : 'bg-fg-3')} />
                      {i < timeline.length - 1 && <span className="absolute top-4 -bottom-4 w-px bg-line" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-fg">Scan <TimeAgo value={t.timestamp} /></p>
                        <p className="num text-sm text-fg-2">Risk {t.previous_risk_score} → <span className="font-semibold text-fg">{t.current_risk_score}</span> <Delta value={t.risk_score_delta} /></p>
                      </div>
                      <p className="num mt-1 text-xs text-fg-3">
                        <span className={ts.new_count ? 'text-crit-text' : ''}>{ts.new_count || 0} new</span> ·{' '}
                        <span className={ts.resolved_count ? 'text-low-text' : ''}>{ts.resolved_count || 0} fixed</span> ·{' '}
                        <span className={ts.regressed_count ? 'text-high-text' : ''}>{ts.regressed_count || 0} came back</span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
      </div>
    </Page>
  )
}
