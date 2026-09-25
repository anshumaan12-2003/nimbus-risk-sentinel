import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ArrowUpRight, ChevronRight, CloudLightning, CloudSun, FileText, Play, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { shortDate } from '@/lib/time'
import {
  Page, Card, CardHeader, CardBody, Button, SeverityBadge, StatTile, EmptyState, Skeleton, ErrorState,
  TimeAgo,
  AnimatedNumber
} from '@/components/ds'
import GettingStarted from '@/components/GettingStarted'
import { changeSentence, forecastFor } from '@/lib/forecast'
import VesperMark from '@/components/vesper/VesperMark'
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

/* The weather for this account, worked out only from real scan data: a critical finding means a storm,
   high-severity only means scattered risk, otherwise clear. The sky tint behind it follows the same call. */
const WEATHER = {
  storm: { label: 'Storm warning', icon: CloudLightning, chip: 'border-crit-line bg-crit-soft text-crit-text' },
  haze: { label: 'Scattered risk', icon: CloudSun, chip: 'border-med-line bg-med-soft text-med-text' },
  clear: { label: 'Clear skies', icon: Sun, chip: 'border-low-line bg-low-soft text-low-text' },
}
function ForecastHero({ d, greeting, every, actions }) {
  const askVesper = useSentinelStore(s => s.askVesper)
  const score = num(d.latest?.risk_score ?? d.stats?.risk_score)
  const prev = d.previous ? num(d.previous.risk_score) : null
  const delta = prev == null ? null : score - prev
  const g = grade(score)
  const bars = SEVERITIES.map(s => ({ ...s, count: num(d.stats?.[s.key]) }))
  const totalOpen = bars.reduce((a, s) => a + s.count, 0)
  const open = useMemo(() => d.findings.filter(f => f.status !== 'RESOLVED').sort((a, b) => num(b.risk_score) - num(a.risk_score)), [d.findings])
  const fixes = open.slice(0, 3)
  const spark = d.history.map(s => ({ score: num(s.risk_score) }))
  const f = forecastFor(d.stats, open, d.blast)
  const W = WEATHER[f.wx]

  return (
    <Card className="relative isolate overflow-hidden">
      {/* Posture sky: a low-opacity wash, strongest in the top-right corner, away from the text */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-700"
           style={{ background: `radial-gradient(110% 120% at 100% 0%, color-mix(in oklab, var(--sky-${f.wx}) var(--sky-wash), transparent), transparent 62%)` }} />
      <div className="grid gap-8 p-5 md:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <p className="num flex flex-wrap items-center gap-x-2 text-sm text-fg-3">
              <span>{greeting}</span>
              <span aria-hidden>·</span><span>Security posture</span>
              {d.account ? <><span aria-hidden>·</span><span className="font-mono text-xs">AWS {d.account.id}</span></> : d.demo ? <><span aria-hidden>·</span><span>Sample account</span></> : null}
              {d.latest && <><span aria-hidden>·</span><span>Scanned <TimeAgo value={d.latest.completed_at || d.latest.started_at} /></span></>}
              {every && <><span aria-hidden>·</span><span>Rescans every {every} min</span></>}
          </p>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', W.chip)}>
                <W.icon className="size-3.5" aria-hidden /> {W.label}
              </span>
              {actions}
            </div>
            <h2 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.035em] break-words text-fg md:text-[42px]">{f.headline}</h2>
            <p className="max-w-[56ch] text-md text-fg-2">{f.why}</p>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-1">
            <div>
              <div className="flex items-end gap-2">
                <AnimatedNumber value={score} className="num font-display text-[56px] leading-none font-bold tracking-[-0.045em] text-fg" />
                <span className="pb-1.5 text-sm text-fg-3">/ 100 risk</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                <span className={cn('font-medium', g.tone)}>{g.label}</span>
                {delta != null && (
                  <span className={cn('num', delta < 0 ? 'text-low-text' : delta > 0 ? 'text-crit-text' : 'text-fg-3')}>
                    {delta > 0 ? `+${delta}` : delta === 0 ? 'No change' : delta} since last scan
                  </span>
                )}
              </p>
            </div>
            {spark.length > 1 && (
              <div className="mb-1 h-12 w-full max-w-[220px]" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  {/* Decorative: Recharts 3 makes charts keyboard-focusable by default, which is wrong inside aria-hidden */}
                  <AreaChart data={spark} margin={{ top: 4, right: 2, bottom: 2, left: 2 }} accessibilityLayer={false}>
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
          <div className="grid gap-2.5">
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted-2" role="img"
                 aria-label={`${totalOpen} open findings: ${bars.map(s => `${s.count} ${s.label.toLowerCase()}`).join(', ')}`}>
              {totalOpen > 0 && bars.filter(s => s.count).map(s => (
                <span key={s.key} className={cn('h-full transition-[width] duration-700 ease-standard first:rounded-l-full last:rounded-r-full', s.bar)} style={{ width: `${(s.count / totalOpen) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <p className="text-sm font-medium text-fg">{fixes.length ? "Today's three fixes" : 'Nothing to fix'}</p>
          {fixes.length === 0 && (
            <p className="rounded-lg border border-low-line bg-low-soft px-3 py-2.5 text-sm text-low-text">Every check Nimbus runs is passing. Enjoy the quiet.</p>
          )}
          {fixes.map((x, i) => (
            <Link key={x.id} to={`/findings/${x.id}`}
                  className="group grid grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-line bg-surface/85 px-3 py-2.5 backdrop-blur-sm transition-colors hover:border-line-strong">
              <span className={cn('h-full min-h-8 rounded-full', SEV_STRIPE[x.severity] || 'bg-fg-3')} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg">{x.title}</span>
                <span className="block truncate font-mono text-xs text-fg-3">{x.rule_id} · {x.resource_name || x.resource_id}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="num text-xs text-fg-3" title="Risk score">{num(x.risk_score)}</span>
                <ChevronRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="sr-only">Fix {i + 1} of {fixes.length}</span>
            </Link>
          ))}
          {fixes[0] && (
            <div className="mt-1 flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 [background:linear-gradient(var(--surface),var(--surface))_padding-box,linear-gradient(115deg,var(--dawn-1),var(--dawn-2)_55%,var(--dawn-3))_border-box]">
              <VesperMark size={30} />
              <p className="min-w-0 flex-1 text-sm text-fg-2">Want me to walk you through <span className="font-mono text-xs text-fg">{fixes[0].rule_id}</span>? It usually takes a couple of minutes.</p>
              <Button size="sm" onClick={() => askVesper(`Walk me through fixing ${fixes[0].rule_id} safely, step by step.`)}>Ask Vesper</Button>
            </div>
          )}
        </div>
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

/* After the hero's three fixes: the rest of the open findings, by risk. */
function FixFirst({ d }) {
  const rows = d.findings.filter(f => f.status !== 'RESOLVED').sort((a, b) => num(b.risk_score) - num(a.risk_score)).slice(3, 10)
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Next up" description="After today's three: open findings ranked by risk, exposure and what they can reach."
                  actions={<Button variant="ghost" size="sm" asChild><Link to="/findings">View all <ChevronRight /></Link></Button>} />
      {d.findingsLoading ? (
        <CardBody className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</CardBody>
      ) : rows.length === 0 ? (
        <EmptyState compact mood="happy" title="Nothing else open" body={d.latest ? 'Today\'s fixes are everything the latest scan found.' : 'Run a scan to see what needs attention.'} />
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

const changeTone = (s) => num(s.resolved_count) && !num(s.new_count) && !num(s.regressed_count) ? 'text-low-text' : 'text-fg-2'

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
                <dd><AnimatedNumber value={num(v)} className={cn('num text-lg font-semibold', num(v) ? tone : 'text-fg')} /></dd>
              </div>
            ))}
          </dl>
        )}
        {s && <p className={cn('mt-3 text-sm', changeTone(s))}>{changeSentence(s)}</p>}
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
          <ForecastHero d={d} greeting={`${greeting}${first ? `, ${first}` : ''}`} every={every} actions={
            <div className="flex gap-2">
              <Button size="sm" onClick={openExecutiveDossier}><FileText /> Executive report</Button>
            </div>
          } />
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
