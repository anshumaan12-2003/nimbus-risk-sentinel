import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Play } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, StatTile, StatusBadge, EmptyState, QueryState, SkeletonRows,
  Sheet, SheetContent, DescriptionList, Tooltip, Badge, CodeBlock,
} from '@/components/ds'
import ScanProgressGrid from '@/components/ScanProgressGrid'
import { downloadFile } from '@/components/ui'
import { useScans, useActiveScan, useScanWarnings, useScanProgress } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { ago, dateTime, parseUtc, shortDate } from '@/lib/time'

const durationSec = (s) => (s.started_at && s.completed_at ? (parseUtc(s.completed_at) - parseUtc(s.started_at)) / 1000 : null)
const fmtDur = (sec) => (sec == null ? '—' : sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`)
const n = (v) => Number(v || 0)

function Counts({ s }) {
  const items = [['C', s.critical_count, 'text-crit-text'], ['H', s.high_count, 'text-high-text'], ['M', s.medium_count, 'text-med-text'], ['L', s.low_count, 'text-low-text']]
  return (
    <span className="num flex gap-2.5 text-xs">
      {items.map(([k, v, cls]) => <span key={k} className={n(v) ? cls : 'text-fg-3'} title={{ C: 'Critical', H: 'High', M: 'Medium', L: 'Low' }[k]}>{n(v)}<span className="ml-0.5 opacity-60">{k}</span></span>)}
    </span>
  )
}

function ScanDetail({ scan }) {
  const w = useScanWarnings(scan.status === 'COMPLETED' ? scan.id : null)
  const counts = Object.entries(w.data?.asset_counts || {})
  const warnings = w.data?.warnings || []
  const prog = useScanProgress(scan.id)
  return (
    <div className="grid gap-6 p-5">
      <DescriptionList items={[
        ['Status', <StatusBadge status={scan.status} size="sm" />],
        ['Account', <span className="font-mono text-xs">{scan.account_id || '—'}</span>],
        ['Regions', <span className="font-mono text-xs">{scan.region || '—'}</span>],
        ['Started', dateTime(scan.started_at)],
        ['Duration', fmtDur(durationSec(scan))],
        ['Triggered by', scan.triggered_by],
        scan.status === 'COMPLETED' ? ['Risk score', <span className="num font-semibold">{scan.risk_score}</span>] : null,
      ]} />
      {scan.status === 'FAILED' && (
        <section className="grid gap-2"><h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Why it failed</h3><CodeBlock code={scan.error_message || 'No reason recorded'} /></section>
      )}
      {prog.data && (
        <section className="grid gap-2"><h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Coverage by service and region</h3><ScanProgressGrid progress={prog.data} compact /></section>
      )}
      {counts.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Assets inventoried</h3>
          <div className="flex flex-wrap gap-1.5">{counts.map(([k, v]) => <Badge key={k} size="sm"><span className="text-fg-3">{k.replace('_', ' ')}</span> <span className="num">{v}</span></Badge>)}</div>
        </section>
      )}
      {scan.status === 'COMPLETED' && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Blind spots · {warnings.length}</h3>
          {w.isLoading ? <SkeletonRows rows={2} /> : warnings.length ? (
            <>
              <p className="text-sm text-fg-2">These AWS calls failed, so anything behind them is missing from this scan — usually a missing read permission.</p>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-fg-3"><tr><th className="px-3 py-2 font-medium">Service</th><th className="px-3 font-medium">Region</th><th className="px-3 font-medium">Call</th><th className="px-3 font-medium">Error</th></tr></thead>
                  <tbody>{warnings.map((x, i) => (
                    <tr key={i} className="border-t border-line"><td className="px-3 py-2">{x.service}</td><td className="px-3 font-mono text-xs">{x.region}</td><td className="px-3 font-mono text-xs">{x.call}</td><td className="px-3 font-mono text-xs text-crit-text">{x.error}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-low-text">None — every AWS call succeeded.</p>}
        </section>
      )}
    </div>
  )
}

export default function ScanHistory() {
  const { dataSource, openScanModal } = useSentinelStore()
  const q = useScans(50)
  const active = useActiveScan()
  const [openId, setOpenId] = useState(null)
  const [shownId, setShownId] = useState(null)
  const scans = q.data || []
  const completed = scans.filter(s => s.status === 'COMPLETED')

  const stats = useMemo(() => {
    const durs = completed.map(durationSec).filter(x => x != null)
    const finished = scans.filter(s => s.status === 'COMPLETED' || s.status === 'FAILED')
    const [latest, prev] = completed
    return {
      success: finished.length ? Math.round((100 * completed.length) / finished.length) : null,
      meanDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
      latest: latest ? n(latest.risk_score) : null,
      delta: latest && prev ? n(latest.risk_score) - n(prev.risk_score) : null,
    }
  }, [scans]) // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(() => [...completed].reverse().map(s => ({
    t: shortDate(s.completed_at), risk: n(s.risk_score), findings: n(s.total_findings), critical: n(s.critical_count),
  })), [scans]) // eslint-disable-line react-hooks/exhaustive-deps

  if (dataSource === 'demo') {
    return <Page><PageHeader title="Scan history" /><Card><EmptyState title="Scan history needs live data" body="Switch to your real AWS data (⌘K → Show my real AWS data)." /></Card></Page>
  }
  const shown = scans.find(s => s.id === (openId || shownId))

  return (
    <Page wide>
      <PageHeader
        title="Scan history"
        description="Every scan, its outcome, how long it took and what it couldn’t see."
        actions={<Button variant="primary" onClick={openScanModal}>{active.data ? <><Loader2 className="animate-spin" /> Watch running scan</> : <><Play /> Run scan</>}</Button>}
      />
      {active.data && (
        <div role="status" className="mb-4 flex items-center gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-text">
          <Loader2 className="size-4 animate-spin" />
          A scan started {ago(active.data.started_at)} is {active.data.status.toLowerCase()}. This page updates when it finishes.
        </div>
      )}
      <QueryState query={q} loading={<SkeletonRows rows={8} />}
        empty={<Card><EmptyState title="No scans yet" body="Run your first scan to set a security baseline." action={<Button variant="primary" onClick={openScanModal}><Play /> Run first scan</Button>} /></Card>}>
        {() => (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Scans recorded" value={scans.length} hint={`${completed.length} completed`} />
              <StatTile label="Success rate" value={stats.success == null ? '—' : `${stats.success}%`} tone={stats.success == null ? 'neutral' : stats.success < 90 ? 'high' : 'low'} hint="completed vs failed" />
              <StatTile label="Typical duration" value={fmtDur(stats.meanDur)} hint="mean of completed scans" />
              <StatTile label="Latest risk score" value={stats.latest ?? '—'} tone={stats.latest >= 70 ? 'critical' : stats.latest >= 40 ? 'high' : 'low'}
                        delta={stats.delta ?? undefined} hint={stats.delta == null ? 'first baseline' : 'vs previous scan'} />
            </div>

            {trend.length > 1 && (
              <Card>
                <CardHeader title="Risk and findings over time" />
                <CardBody>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--fg-3)' }} axisLine={false} tickLine={false} minTickGap={24} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--fg-3)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                        <ChartTooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, boxShadow: 'var(--elev-overlay)' }} labelStyle={{ color: 'var(--fg-3)' }} />
                        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--fg-2)' }} />
                        <Line type="monotone" dataKey="risk" name="Risk score" stroke="var(--accent)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="findings" name="Findings" stroke="var(--fg-3)" strokeWidth={1.75} dot={false} />
                        <Line type="monotone" dataKey="critical" name="Critical" stroke="var(--crit)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            )}

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="bg-surface-2">
                    <tr className="border-b border-line text-left text-xs text-fg-3">
                      <th className="h-9 pr-3 pl-5 font-medium">Started</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Duration</th>
                      <th className="px-3 font-medium">Triggered by</th><th className="px-3 font-medium">Regions</th><th className="px-3 text-right font-medium">Risk</th>
                      <th className="px-3 font-medium">Findings</th><th className="pr-5 pl-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map(s => (
                      <tr key={s.id} tabIndex={0} onClick={() => { setOpenId(s.id); setShownId(s.id) }}
                          onKeyDown={e => { if (e.key === 'Enter') { setOpenId(s.id); setShownId(s.id) } }}
                          className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                        <td className="h-12 pr-3 pl-5"><span className="text-fg" title={dateTime(s.started_at)}>{ago(s.started_at)}</span></td>
                        <td className="px-3">
                          <span className="flex items-center gap-1.5">
                            <StatusBadge status={s.status} size="sm" />
                            {s.status === 'COMPLETED' && s.error_message && <Tooltip content={s.error_message}><AlertTriangle className="size-3.5 text-med-text" /></Tooltip>}
                          </span>
                        </td>
                        <td className="num px-3 text-fg-2">{fmtDur(durationSec(s))}</td>
                        <td className="max-w-[180px] truncate px-3 text-fg-2">{s.triggered_by}</td>
                        <td className="px-3 font-mono text-xs text-fg-3">{s.region || '—'}</td>
                        <td className="num px-3 text-right font-semibold text-fg">{s.status === 'COMPLETED' ? s.risk_score : '—'}</td>
                        <td className="px-3">{s.status === 'COMPLETED' ? <Counts s={s} /> : <span className="block max-w-[220px] truncate text-xs text-fg-3" title={s.error_message}>{s.error_message || '—'}</span>}</td>
                        <td className="pr-5 pl-3 text-right">
                          <Tooltip content="Download scan JSON">
                            <Button variant="ghost" size="icon-sm" aria-label="Download scan JSON"
                                    onClick={e => { e.stopPropagation(); downloadFile(`scan-${s.id}.json`, JSON.stringify(s, null, 2), 'application/json') }}>
                              <Download />
                            </Button>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </QueryState>

      <Sheet open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null) }}>
        {shown && (
          <SheetContent width={600} title={`Scan ${shown.id.slice(0, 8)}`} description={`Started ${dateTime(shown.started_at)} by ${shown.triggered_by}`}>
            <ScanDetail scan={shown} />
          </SheetContent>
        )}
      </Sheet>
    </Page>
  )
}
