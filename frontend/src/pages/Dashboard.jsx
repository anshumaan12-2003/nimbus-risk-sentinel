import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ArrowUpRight, ChevronRight, FileText, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { shortDate } from '@/lib/time'
import {
  Page, Card, CardHeader, CardBody, Button, SeverityBadge, StatTile, EmptyState, Skeleton, ErrorState,
  TimeAgo
} from '@/components/ds'
import GettingStarted from '@/components/GettingStarted'
import { useSentinelStore } from '@/store/sentinelStore'
import { useCan, useUser } from '@/auth/authStore'
import {
  useBlastRadius, useCompliance, useConfig, useFindingStats, useFindings, useLatestDrift, usePreflight, useScans, useScanWarnings,
} from '@/hooks/queries'
import {
  MOCK_STATS, MOCK_LATEST_SCAN, MOCK_FINDINGS, MOCK_COMPLIANCE_BENCHMARKS, MOCK_DRIFT_REPORT,
} from '@/data/mockData'

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const num = (v) => Number(v) || 0
const SEVERITIES = [
  { key: 'critical', label: 'Critical', tone: 'critical', bar: 'bg-crit', scanKey: 'critical_count' },
  { key: 'high', label: 'High', tone: 'high', bar: 'bg-high', scanKey: 'high_count' },
  { key: 'medium', label: 'Medium', tone: 'medium', bar: 'bg-med', scanKey: 'medium_count' },
  { key: 'low', label: 'Low', tone: 'low', bar: 'bg-low', scanKey: 'low_count' },
]
const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }
const SERVICE_NAMES = { s3: 'Amazon S3', iam: 'AWS IAM', ec2: 'Amazon EC2', rds: 'Amazon RDS', lambda: 'AWS Lambda' }

// Risk score is 0–100 where higher is worse.
function grade(score) {
  if (score >= 85) return { label: 'Critical risk', tone: 'text-crit-text' }
  if (score >= 70) return { label: 'High risk', tone: 'text-high-text' }
  if (score >= 50) return { label: 'Elevated risk', tone: 'text-med-text' }
  if (score >= 30) return { label: 'Moderate risk', tone: 'text-fg-2' }
  return { label: 'Low risk', tone: 'text-low-text' }
}

const FRAMEWORK_SHORT = [[/^cis/, 'CIS AWS'], [/^soc2/, 'SOC 2'], [/^pci/, 'PCI DSS'], [/^hipaa/, 'HIPAA']]
const frameworkName = (f) => FRAMEWORK_SHORT.find(([re]) => re.test(f.id || ''))?.[1] || f.name

/* All data the page needs — live from the API, or the built-in sample in demo mode. */
function useOverview() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const stats = useFindingStats()
  const scans = useScans(30)
  const findings = useFindings({ limit: 50 })
  const compliance = useCompliance()
  const drift = useLatestDrift()
  const blast = useBlastRadius()
  const pre = usePreflight()
  const completed = useMemo(() => (scans.data || []).filter(s => s.status === 'COMPLETED'), [scans.data])
  const latest = completed[0] || null
  const warnings = useScanWarnings(latest?.id)

  if (demo) {
    const bySvc = {}
    MOCK_FINDINGS.forEach(f => { bySvc[f.service] = (bySvc[f.service] || 0) + 1 })
    return {
      loading: false, error: null, demo,
      stats: { ...MOCK_STATS, by_service: bySvc }, latest: MOCK_LATEST_SCAN, previous: null, history: [],
      findings: MOCK_FINDINGS, compliance: MOCK_COMPLIANCE_BENCHMARKS, drift: MOCK_DRIFT_REPORT, blast: null,
      assets: null, gaps: 0, account: { id: MOCK_LATEST_SCAN.account_id, regions: ['us-east-1'] },
    }
  }
  const counts = warnings.data?.asset_counts
  return {
    loading: stats.isLoading || scans.isLoading,
    error: stats.error || scans.error,
    refetch: () => { stats.refetch(); scans.refetch() },
    demo,
    stats: stats.data,
    latest,
    previous: completed[1] || null,
    history: [...completed].reverse().slice(-20),
    findings: findings.data || [],
    findingsLoading: findings.isLoading,
    compliance: compliance.data || [],
    complianceLoading: compliance.isLoading,
    drift: drift.data,
    blast: latest ? blast.data : null,
    assets: counts ? Object.values(counts).reduce((a, n) => a + num(n), 0) : null,
    gaps: warnings.data?.warnings?.length || 0,
    account: pre.data?.connected ? { id: pre.data.account_id, regions: pre.data.regions } : null,
  }
}

/* ─── sections ─────────────────────────────────────────────────────────────── */

function PostureSummary({ d }) {
  const navigate = useNavigate()
  const score = num(d.latest?.risk_score ?? d.stats?.risk_score)
  const prev = d.previous ? num(d.previous.risk_score) : null
  const delta = prev == null ? null : score - prev
  const g = grade(score)
  const open = SEVERITIES.map(s => ({ ...s, count: num(d.stats?.[s.key]) }))
  const totalOpen = open.reduce((a, s) => a + s.count, 0)
  const top = d.findings.find(f => f.status !== 'RESOLVED')
  const spark = d.history.map(s => ({ score: num(s.risk_score) }))

  return (
    <Card className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:p-6">
      <div className="grid content-start gap-3">
        <p className="text-sm text-fg-2">Risk score</p>
        <div className="flex items-end gap-3">
          <span className="num text-[56px] leading-none font-semibold tracking-[-0.04em] text-fg">{score}</span>
          <span className="pb-1.5 text-sm text-fg-3">/ 100</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={cn('font-medium', g.tone)}>{g.label}</span>
          {delta != null && (
            <span className={cn('num', delta < 0 ? 'text-low-text' : delta > 0 ? 'text-crit-text' : 'text-fg-3')}>
              {delta > 0 ? `+${delta}` : delta === 0 ? 'No change' : delta} since last scan
            </span>
          )}
        </div>
        {spark.length > 1 && (
          <div className="h-12 w-full max-w-[260px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={[0, 100]} />
                <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={1.75} fill="url(#spark)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid content-start gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-fg-2">Open findings</p>
          <p className="num text-sm text-fg"><span className="font-semibold">{totalOpen}</span> <span className="text-fg-3">across {Object.keys(d.stats?.by_service || {}).length || '—'} services</span></p>
        </div>
        {/* composition bar: severity share of open findings */}
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted-2" role="img"
             aria-label={open.map(s => `${s.count} ${s.label.toLowerCase()}`).join(', ')}>
          {totalOpen > 0 && open.filter(s => s.count).map(s => (
            <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.bar)} style={{ width: `${(s.count / totalOpen) * 100}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {open.map(s => (
            <button key={s.key} type="button" onClick={() => navigate(`/findings?severity=${s.key.toUpperCase()}`)}
                    className="flex items-center justify-between gap-2 rounded-md py-0.5 text-left text-sm hover:text-fg">
              <span className="flex items-center gap-2 text-fg-2"><span className={cn('size-2 rounded-[2px]', s.bar)} />{s.label}</span>
              <span className="num font-medium text-fg">{s.count}</span>
            </button>
          ))}
        </div>
        {top ? (
          <Link to={`/findings/${top.id}`}
                className="group mt-1 flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong">
            <span className={cn('h-8 w-1 shrink-0 rounded-full', SEV_STRIPE[top.severity] || 'bg-fg-3')} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-fg-3">Fix this first</span>
              <span className="block truncate text-sm font-medium text-fg">{top.title}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : totalOpen === 0 && d.latest ? (
          <p className="mt-1 rounded-md border border-low-line bg-low-soft px-3 py-2.5 text-sm text-low-text">Nothing open. Every check Nimbus runs is passing.</p>
        ) : null}
      </div>
    </Card>
  )
}

function SeverityTiles({ d }) {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SEVERITIES.map(s => {
        const cur = num(d.stats?.[s.key])
        const delta = d.previous && d.latest ? num(d.latest[s.scanKey]) - num(d.previous[s.scanKey]) : undefined
        return (
          <StatTile key={s.key} label={s.label} value={cur} tone={s.tone} delta={delta}
                    hint={delta !== undefined ? 'since last scan' : 'open'}
                    onClick={() => navigate(`/findings?severity=${s.key.toUpperCase()}`)} />
        )
      })}
    </div>
  )
}

function FixFirst({ d }) {
  const rows = d.findings.filter(f => f.status !== 'RESOLVED').slice(0, 7)
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Fix first" description="Open findings ranked by risk — exposure, severity and what they can reach."
                  actions={<Button variant="ghost" size="sm" asChild><Link to="/findings">View all <ChevronRight /></Link></Button>} />
      {d.findingsLoading ? (
        <CardBody className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</CardBody>
      ) : rows.length === 0 ? (
        <EmptyState compact mood="happy" title="Nothing to fix" body={d.latest ? 'No open findings in the latest scan.' : 'Run a scan to see what needs attention.'} />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map(f => (
            <li key={f.id}>
              <Link to={`/findings/${f.id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                <span className={cn('h-8 w-1 shrink-0 rounded-full', SEV_STRIPE[f.severity] || 'bg-fg-3')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{f.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-3">
                    <span className="font-mono">{f.rule_id}</span>
                    <span aria-hidden>·</span>
                    <span className="uppercase">{f.service}</span>
                    {f.resource_name && <><span aria-hidden>·</span><span className="truncate">{f.resource_name}</span></>}
                  </span>
                </span>
                <SeverityBadge severity={f.severity} size="sm" className="hidden sm:inline-flex" />
                <span className="num w-8 text-right text-sm font-semibold text-fg" title="Risk score">{num(f.risk_score)}</span>
                <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Meter({ value, className }) {
  const v = Math.max(0, Math.min(100, num(value)))
  const color = v >= 70 ? 'bg-crit' : v >= 40 ? 'bg-high' : 'bg-low'
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-muted-2', className)}>
      <span className={cn('block h-full rounded-full', color)} style={{ width: `${v}%` }} />
    </span>
  )
}

function Exposure({ d }) {
  const b = d.blast
  return (
    <Card>
      <CardHeader title="Exposure from the internet"
                  actions={<Button variant="ghost" size="icon-sm" asChild aria-label="Open attack paths"><Link to="/topology"><ArrowUpRight /></Link></Button>} />
      <CardBody className="grid gap-4">
        {!b ? (
          <p className="text-sm text-fg-2">Appears after the first scan builds the attack graph.</p>
        ) : (
          <>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-fg-2">Blast radius</span>
                <span className="num text-sm"><span className="text-lg font-semibold text-fg">{num(b.blast_radius_score)}</span><span className="text-fg-3"> / 100</span></span>
              </div>
              <Meter value={b.blast_radius_score} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-surface-2 p-3">
                <dt className="text-xs text-fg-3">Crown jewels reachable</dt>
                <dd className={cn('num mt-0.5 text-lg font-semibold', num(b.crown_jewels_at_risk) ? 'text-crit-text' : 'text-fg')}>{num(b.crown_jewels_at_risk)}</dd>
              </div>
              <div className="rounded-md bg-surface-2 p-3">
                <dt className="text-xs text-fg-3">Assets reachable</dt>
                <dd className="num mt-0.5 text-lg font-semibold text-fg">{num(b.reachable_nodes_count)}</dd>
              </div>
            </dl>
          </>
        )}
      </CardBody>
    </Card>
  )
}

function SinceLastScan({ d }) {
  const s = d.drift?.summary
  const items = [
    ['New', s?.new_count, 'text-crit-text'],
    ['Fixed', s?.resolved_count, 'text-low-text'],
    ['Came back', s?.regressed_count, 'text-high-text'],
  ]
  return (
    <Card>
      <CardHeader title="Since the last scan"
                  actions={<Button variant="ghost" size="icon-sm" asChild aria-label="Open changes"><Link to="/drift"><ArrowUpRight /></Link></Button>} />
      <CardBody>
        {!s ? <p className="text-sm text-fg-2">Needs two completed scans to compare.</p> : (
          <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line">
            {items.map(([label, v, tone]) => (
              <div key={label} className="grid gap-0.5 px-3 py-2.5">
                <dt className="text-xs text-fg-3">{label}</dt>
                <dd className={cn('num text-lg font-semibold', num(v) ? tone : 'text-fg')}>{num(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  )
}

function Coverage({ d }) {
  return (
    <Card>
      <CardHeader title="Coverage"
                  actions={<Button variant="ghost" size="icon-sm" asChild aria-label="Open assets"><Link to="/assets"><ArrowUpRight /></Link></Button>} />
      <CardBody className="grid gap-2.5 text-sm">
        <div className="flex items-center justify-between"><span className="text-fg-2">Assets inventoried</span><span className="num font-medium text-fg">{d.assets ?? '—'}</span></div>
        <div className="flex items-center justify-between"><span className="text-fg-2">Regions</span><span className="truncate pl-4 font-mono text-xs text-fg">{d.account?.regions?.join(', ') || '—'}</span></div>
        <div className="flex items-center justify-between">
          <span className="text-fg-2">Permission gaps</span>
          {d.gaps
            ? <Link to="/settings" className="num font-medium text-med-text hover:underline">{d.gaps} blocked</Link>
            : <span className="font-medium text-low-text">None</span>}
        </div>
      </CardBody>
    </Card>
  )
}

function CompliancePanel({ d }) {
  return (
    <Card>
      <CardHeader title="Compliance" description="Share of automated controls passing in the latest scan."
                  actions={<Button variant="ghost" size="sm" asChild><Link to="/compliance">Details <ChevronRight /></Link></Button>} />
      <CardBody>
        {d.complianceLoading ? <div className="grid gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          : d.compliance.length === 0 ? <p className="text-sm text-fg-2">Scores appear after the first scan.</p>
          : (
            <ul className="grid gap-4">
              {d.compliance.map(f => {
                const score = num(f.score)
                return (
                  <li key={f.id} className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-fg">{frameworkName(f)}</span>
                      <span className="num text-fg-2"><span className="font-semibold text-fg">{score}%</span> · {num(f.passingRules)} of {num(f.passingRules) + num(f.failingRules)} passing</span>
                    </div>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted-2">
                      <span className={cn('block h-full rounded-full', score >= 85 ? 'bg-low' : score >= 60 ? 'bg-med' : 'bg-crit')} style={{ width: `${score}%` }} />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
      </CardBody>
    </Card>
  )
}

function ScoreTrend({ d }) {
  const data = d.history.map(s => ({ date: shortDate(s.completed_at || s.started_at), score: num(s.risk_score) }))
  return (
    <Card>
      <CardHeader title="Risk score over time" description={data.length > 1 ? `Last ${data.length} scans` : undefined} />
      <CardBody>
        {data.length < 2 ? (
          <p className="grid h-[200px] place-items-center text-center text-sm text-fg-2">{d.demo ? 'Built from real scans — switch to live data.' : 'Appears after two completed scans.'}</p>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
                <XAxis dataKey="date" tick={{ fill: 'var(--fg-3)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--fg-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <ChartTooltip
                  cursor={{ stroke: 'var(--line-strong)' }}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: 'var(--elev-overlay)', fontSize: 12 }}
                  labelStyle={{ color: 'var(--fg-3)' }} itemStyle={{ color: 'var(--fg)' }}
                  formatter={(v) => [v, 'Risk score']}
                />
                <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} fill="url(#trend)"
                      dot={false} activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ByService({ d }) {
  const entries = Object.entries(d.stats?.by_service || {}).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <Card>
      <CardHeader title="Open findings by service" />
      <CardBody>
        {entries.length === 0 ? <p className="grid h-[200px] place-items-center text-sm text-fg-2">No open findings.</p> : (
          <ul className="grid gap-3.5">
            {entries.map(([svc, n]) => (
              <li key={svc}>
                <Link to={`/findings?service=${svc}`} className="group grid gap-1.5">
                  <span className="flex items-baseline justify-between text-sm">
                    <span className="text-fg group-hover:underline">{SERVICE_NAMES[svc] || svc.toUpperCase()}</span>
                    <span className="num font-medium text-fg">{n}</span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted-2">
                    <span className="block h-full rounded-full bg-fg-2 transition-[width] duration-500" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/* ─── page ─────────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const user = useUser()
  const d = useOverview()
  const cfg = useConfig()
  const run = useCan('scan:run')
  const { openScanModal, openExecutiveDossier } = useSentinelStore()
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = (user?.name || '').split(' ')[0]
  const every = cfg.data?.scheduled_scans ? cfg.data.scan_interval_minutes : null

  return (
    <Page>
      <GettingStarted />
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
        <div className="min-w-0">
          <p className="text-sm text-fg-3">{greeting}{first ? `, ${first}` : ''}</p>
          <h2 className="mt-0.5 text-xl font-semibold text-fg">Security posture</h2>
          <p className="num mt-1 flex flex-wrap items-center gap-x-2 text-sm text-fg-2">
            {d.account ? <span className="font-mono text-xs">AWS {d.account.id}</span> : d.demo ? <span>Sample account</span> : null}
            {d.latest && <><span aria-hidden className="text-fg-3">·</span><span>Scanned <TimeAgo value={d.latest.completed_at || d.latest.started_at} /></span></>}
            {every && <><span aria-hidden className="text-fg-3">·</span><span>Rescans every {every} min</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openExecutiveDossier}><FileText /> Executive report</Button>
          <Button variant="primary" onClick={openScanModal} disabled={!run.allowed} title={run.reason || undefined} className="md:hidden"><Play /> Scan</Button>
        </div>
      </header>

      {d.error && !d.stats ? (
        <Card><ErrorState error={d.error} onRetry={d.refetch} /></Card>
      ) : d.loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-[220px] rounded-lg" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}</div>
          <Skeleton className="h-[320px] rounded-lg" />
        </div>
      ) : !d.latest && !d.demo ? (
        <Card>
          <EmptyState mood="calm" title="No scans yet"
                      body="Run the first scan to see findings, attack paths and compliance for this account. It usually takes under a minute."
                      action={<Button variant="primary" onClick={openScanModal} disabled={!run.allowed}><Play /> Run first scan</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4">
          <PostureSummary d={d} />
          <SeverityTiles d={d} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <FixFirst d={d} />
            <div className="grid gap-4">
              <Exposure d={d} />
              <SinceLastScan d={d} />
              <Coverage d={d} />
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ScoreTrend d={d} />
            <ByService d={d} />
          </div>
          <CompliancePanel d={d} />
        </div>
      )}
    </Page>
  )
}
