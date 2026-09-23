import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import Zap from 'lucide-react/dist/esm/icons/zap'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import Shield from 'lucide-react/dist/esm/icons/shield'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up'
import Clock from 'lucide-react/dist/esm/icons/clock'
import Activity from 'lucide-react/dist/esm/icons/activity'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import Compass from 'lucide-react/dist/esm/icons/compass'
import Layers from 'lucide-react/dist/esm/icons/layers'
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right'
import Database from 'lucide-react/dist/esm/icons/database'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import Server from 'lucide-react/dist/esm/icons/server'
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle'
import FileCheck from 'lucide-react/dist/esm/icons/file-check'
import { getFindingStats, getLatestScan, listFindings, getTopologyGraph } from '../api/nimbus'
import RiskScoreGauge from '../components/RiskScoreGauge'
import StatsCard from '../components/StatsCard'
import SeverityBadge from '../components/SeverityBadge'
import AttackPathGraph from '../components/AttackPathGraph'
import Mascot from '../components/Mascot'
import ActivityFeed from '../components/ActivityFeed'
import { useEventStore } from '../store/eventStore'
import { MOCK_STATS, MOCK_LATEST_SCAN, MOCK_FINDINGS, MOCK_ATTACK_GRAPH } from '../data/mockData'
import { useUser } from '../auth/authStore'
import GettingStarted from '../components/GettingStarted'
import { EMPTY_STATS, EMPTY_GRAPH } from '../data/empty'
import ComplianceMatrix from '../components/ComplianceMatrix'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useSentinelStore } from '../store/sentinelStore'
import { useCountUp } from '../hooks/useCountUp'

/* ── Tooltip ─────────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
        {payload[0].value}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-4)', marginLeft: 4 }}>findings</span>
      </div>
    </div>
  )
}

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
        {payload[0].value}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-4)', marginLeft: 4 }}>risk pts</span>
      </div>
    </div>
  )
}

/* ── Service icon helper ─────────────────────────────────────────── */
function ServiceIcon({ service, size = 13 }) {
  const s = (service || '').toLowerCase()
  if (s === 's3')  return <HardDrive size={size} />
  if (s === 'iam') return <KeyRound size={size} />
  if (s === 'ec2') return <Server size={size} />
  if (s === 'rds') return <Database size={size} />
  return <Layers size={size} />
}

const SERVICE_META = {
  s3:  { name: 'Amazon S3',  color: '#7c71ff', bg: 'rgba(124,113,255,0.1)' },
  iam: { name: 'AWS IAM',    color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  ec2: { name: 'Amazon EC2', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  rds: { name: 'Amazon RDS', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
}

/* ── Trend data ──────────────────────────────────────────────────── */
const TREND_DATA = [
  { day: 'Mon', score: 72 }, { day: 'Tue', score: 68 },
  { day: 'Wed', score: 75 }, { day: 'Thu', score: 70 },
  { day: 'Fri', score: 65 }, { day: 'Sat', score: 60 },
  { day: 'Sun', score: 58 },
]

/* ═════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const user = useUser()
  const {
    currentEnv, openScanModal, refreshDataTrigger, dataSource
  } = useSentinelStore()

  const [stats, setStats]         = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0, risk_score: 0 })
  const [latestScan, setLatestScan] = useState(null)
  const [recentFindings, setRecent] = useState([])
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [offline, setOffline]     = useState(false)
  // Nimbo reacts to fresh stream events for a few seconds, then goes
  // back to reflecting overall posture.
  const latestEvent = useEventStore(s => s.events[0])
  const [reaction, setReaction] = useState(null)
  useEffect(() => {
    if (!latestEvent || Date.now() - latestEvent.ts > 3000) return
    const good = ['finding.resolved', 'remediation.applied', 'simulation.contained'].includes(latestEvent.type)
    const bad = latestEvent.type === 'finding.new' && ['CRITICAL', 'HIGH'].includes(latestEvent.severity)
    if (!good && !bad) return
    setReaction({ mood: good ? 'happy' : 'alarmed', line: <>{good ? 'Nice — ' : 'Heads up: '}<strong>{latestEvent.title}</strong></> })
    const t = setTimeout(() => setReaction(null), 7000)
    return () => clearTimeout(t)
  }, [latestEvent])
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (dataSource === 'demo') {
      setOffline(false)
      setStats(MOCK_STATS)
      setLatestScan(MOCK_LATEST_SCAN)
      setRecent(MOCK_FINDINGS.slice(0, 6))
      setGraphData(MOCK_ATTACK_GRAPH)
      return
    }

    setLoading(true)
    try {
      const FAIL = Symbol('fail')
      const [s, sc, f, g] = await Promise.all([
        getFindingStats().catch(() => FAIL),
        getLatestScan().catch(() => FAIL),
        listFindings({ limit: 6 }).catch(() => FAIL),
        getTopologyGraph().catch(() => FAIL),
      ])
      const isOffline = s === FAIL
      setOffline(isOffline)
      // Live mode never substitutes demo data — empty + "offline" banner instead
      setStats(s === FAIL ? EMPTY_STATS : s)
      setLatestScan(sc === FAIL ? null : sc)
      setRecent(f === FAIL ? [] : f)
      setGraphData(g === FAIL || !g?.nodes ? EMPTY_GRAPH : g)
    } catch (e) {
      console.warn('Dashboard data fallback:', e)
    } finally {
      setLoading(false)
    }
  }, [refreshDataTrigger, dataSource])

  useEffect(() => { load() }, [load])

  /* Animated counters */
  const animatedScore   = useCountUp(latestScan?.risk_score || stats?.risk_score || 84, 1400)
  const animatedCrit    = useCountUp(stats?.critical ?? 4,  900)
  const animatedHigh    = useCountUp(stats?.high     ?? 8,  900)
  const animatedMedium  = useCountUp(stats?.medium   ?? 9,  900)
  const animatedLow     = useCountUp(stats?.low      ?? 3,  900)
  const animatedTotal   = useCountUp(stats?.total    ?? 24, 1100)

  // One derived posture drives the mascot, its message and the grade
  // badge, so they can never contradict each other.
  const critCount = stats?.critical ?? 0
  const openCount = stats?.open ?? stats?.total ?? 0
  const scoreNow  = latestScan?.risk_score || stats?.risk_score || 84
  const grade = scoreNow >= 85 ? { label: 'Critical Risk', letter: 'F', tone: 'critical' }
    : scoreNow >= 70 ? { label: 'High Risk',     letter: 'D', tone: 'high' }
    : scoreNow >= 50 ? { label: 'Elevated Risk', letter: 'C', tone: 'medium' }
    : scoreNow >= 30 ? { label: 'Moderate Risk', letter: 'B', tone: 'medium' }
    :                  { label: 'Low Risk',      letter: 'A', tone: 'low' }
  const mascotMood = loading ? 'thinking'
    : (critCount > 0 || scoreNow >= 70) ? 'alarmed'
    : (openCount > 0 || scoreNow >= 30) ? 'calm'
    : 'happy'
  const mascotLine = loading ? <>Crunching the latest scan…</>
    : critCount > 0 ? <><strong>{critCount} critical</strong> {critCount === 1 ? 'issue needs' : 'issues need'} your eyes first.</>
    : scoreNow >= 70 ? <>Risk is <strong>{grade.label.toLowerCase()}</strong>. The attack path below is the best place to start.</>
    : openCount > 0 ? <>No criticals. <strong>{openCount}</strong> smaller {openCount === 1 ? 'thing is' : 'things are'} worth a look.</>
    : <>All clear. Nothing open right now — nice work.</>
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const severityBars = [
    { name: 'Critical', count: stats?.critical ?? 0, color: '#dc2626' },
    { name: 'High',     count: stats?.high     ?? 0, color: '#ea580c' },
    { name: 'Medium',   count: stats?.medium   ?? 0, color: '#d97706' },
    { name: 'Low',      count: stats?.low      ?? 0, color: '#16a34a' },
  ]

  const lastScanTime = latestScan?.completed_at
    ? formatDistanceToNow(new Date(latestScan.completed_at), { addSuffix: true })
    : 'never'

  return (
    <div className="dashboard-container">

      {/* ══════════════════════════════════════════════════════════
          HERO — Full-width cinematic header
      ══════════════════════════════════════════════════════════ */}
      <GettingStarted />
      <div className="dashboard-hero anim-fade-up">
        <div className="hero-bg-mesh" />
        <div className="hero-content">
          {/* Left copy */}
          <div className="hero-left">
            {offline && (
              <div className="offline-banner" role="status">
                <span className="offline-dot" />
                Backend unreachable — live data unavailable. Start the API on :8000.
                <button className="offline-retry" onClick={load}>Retry</button>
              </div>
            )}
            <div className="hero-greeting">
              <span className="wave" aria-hidden="true">👋</span>
              <span>{greeting}, <strong>{(user?.name || '').split(' ')[0] || 'there'}</strong></span>
            </div>
            <div className="hero-eyebrow">
              <Shield size={10} />
              Autonomous Risk Posture Management
            </div>
            <h1 className="hero-title text-fluid-gradient">Security Command Center</h1>
            <p className="hero-subtitle">
              Continuous posture evaluation ·
              Account <code>{latestScan?.account_id || (dataSource === 'demo' ? 'demo' : 'not scanned yet')}</code> ·
              Regions <code>{latestScan?.region || '—'}</code>
            </p>

            <div className="hero-meta-bar">
              <div className="hero-meta-item">
                <span className="hero-meta-label">Environment</span>
                <span className="hero-meta-value">{currentEnv?.name || 'AWS Production'}</span>
              </div>
              <div className="hero-meta-divider" />
              <div className="hero-meta-item">
                <span className="hero-meta-label">Last Scan</span>
                <span className="hero-meta-value">{lastScanTime}</span>
              </div>
              <div className="hero-meta-divider" />
              <div className="hero-meta-item">
                <span className="hero-meta-label">Assets Scanned</span>
                <span className="hero-meta-value">142</span>
              </div>
              <div className="hero-meta-divider" />
              <div className="hero-meta-item">
                <span className="hero-meta-label">Active Findings</span>
                <span className="hero-meta-value" style={{ color: 'var(--sev-critical)' }}>{animatedTotal}</span>
              </div>
            </div>

            <div className="hero-actions">
              <button className="btn btn-primary" onClick={openScanModal}>
                <Zap size={13} />
                Run Fleet Scan
              </button>
              <button className="btn btn-secondary" onClick={load} disabled={loading}>
                <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
                Refresh
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/compliance')}>
                <FileCheck size={13} />
                View Compliance
              </button>
            </div>
          </div>

          {/* Right — Giant risk score */}
          <div className="hero-right">
            <div className="mascot-say">
              <Mascot mood={reaction?.mood || mascotMood} size={92} />
              <div className="speech-bubble" aria-live="polite" key={reaction ? "r" : "p"}>{reaction?.line || mascotLine}</div>
            </div>
            <div className="risk-score-display">
              <div className="risk-score-label">Risk Score</div>
              <div className="risk-score-number">{animatedScore}</div>
              <div className="risk-score-sublabel">out of 100</div>
            </div>
            <div className={`risk-grade-badge tone-${grade.tone}`}>
              <AlertCircle size={12} />
              {grade.label} · Grade {grade.letter}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Row 1
      ══════════════════════════════════════════════════════════ */}
      <div className="bento-grid" style={{ marginBottom: 20 }}>
        <div className="bento-col-3 reveal-on-scroll" onClick={() => navigate('/findings?severity=CRITICAL')}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Critical"
            value={animatedCrit}
            icon={AlertTriangle}
            variant="critical"
            subtitle="Immediate action required"
            trend="up"
            trendValue="+2"
          />
          </div>
        </div>
        <div className="bento-col-3 reveal-on-scroll" style={{ animationDelay: '0.1s' }} onClick={() => navigate('/findings?severity=HIGH')}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="High"
            value={animatedHigh}
            icon={AlertCircle}
            variant="high"
            subtitle="Fix within 24 hours"
            trend="up"
            trendValue="+1"
          />
          </div>
        </div>
        <div className="bento-col-3 reveal-on-scroll" style={{ animationDelay: '0.2s' }} onClick={() => navigate('/findings?severity=MEDIUM')}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Medium"
            value={animatedMedium}
            icon={Layers}
            variant="medium"
            subtitle="Fix within 7 days"
            trend="neutral"
          />
          </div>
        </div>
        <div className="bento-col-3 reveal-on-scroll" style={{ animationDelay: '0.3s' }} onClick={() => navigate('/findings?severity=LOW')}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Low"
            value={animatedLow}
            icon={CheckCircle2}
            variant="low"
            subtitle="Best practice guidance"
            trend="down"
            trendValue="-1"
          />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Row 2
      ══════════════════════════════════════════════════════════ */}
      <div className="bento-grid" style={{ marginBottom: 28 }}>
        <div className="bento-col-4 reveal-on-scroll">
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Total Findings"
            value={animatedTotal}
            icon={Activity}
            variant="brand"
            subtitle="Across 4 AWS services"
          />
          </div>
        </div>
        <div className="bento-col-4 reveal-on-scroll" style={{ animationDelay: '0.1s' }}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Open Issues"
            value={stats?.open ?? 20}
            icon={AlertTriangle}
            variant="high"
            subtitle="Unresolved vulnerabilities"
            trend="up"
            trendValue="+3"
          />
          </div>
        </div>
        <div className="bento-col-4 reveal-on-scroll" style={{ animationDelay: '0.2s' }}>
          <div className="card-spotlight" style={{ height: '100%' }}>
          <StatsCard
            title="Resolved"
            value={stats?.resolved ?? 4}
            icon={CheckCircle2}
            variant="low"
            subtitle="Auto-remediated via Sentinel"
            trend="up"
            trendValue="+2"
          />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Attack Path + Gauge
      ══════════════════════════════════════════════════════════ */}
      <div className="bento-grid" style={{ marginBottom: 28 }}>
        {/* Attack Path */}
        <div className="bento-col-8 card card-container glass-tactile card-spotlight reveal-on-scroll">
          <div className="card-header">
            <div>
              <div className="card-kicker">
                <Compass size={10} />
                Threat Intelligence
              </div>
              <div className="card-title-text">
                Attack Path Graph
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/topology')}
            >
              Full view <ChevronRight size={11} />
            </button>
          </div>
          {graphData && <AttackPathGraph graphData={graphData} allFindings={recentFindings} />}
        </div>

        {/* Risk Gauge */}
        <div className="bento-col-4 card card-container glass-tactile card-spotlight posture-gauge-card reveal-on-scroll" style={{ animationDelay: '0.1s' }}>
          <div className="card-kicker" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Shield size={10} />
              Posture Score
            </span>
            <span className="live-badge">
              <span className="live-badge-dot" />
              Live
            </span>
          </div>
          <RiskScoreGauge score={animatedScore} />
          <div className="posture-meta-box">
            <div className="posture-meta-item">
              <span className="meta-label">Zero-Trust SLA</span>
              <span className="meta-val text-cyan">99.99%</span>
            </div>
            <div className="posture-meta-item">
              <span className="meta-label">Assets</span>
              <span className="meta-val">142</span>
            </div>
            <div className="posture-meta-item">
              <span className="meta-label">Blast Radius</span>
              <span className="meta-val text-critical">94/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Charts
      ══════════════════════════════════════════════════════════ */}
      {/* Live activity stream */}
      <div className="bento-grid" style={{ marginBottom: 28 }}>
        <div className="bento-col-12 card">
          <ActivityFeed limit={6} />
        </div>
      </div>

      <div className="bento-grid" style={{ marginBottom: 28 }}>
        {/* Severity bar chart */}
        <div className="bento-col-6 card card-container glass-tactile card-spotlight reveal-on-scroll">
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-kicker">
                <AlertTriangle size={10} />
                Distribution
              </div>
              <div className="card-title-text">Findings by Severity</div>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>Click to filter</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={severityBars} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barCategoryGap="32%">
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-4)', fontSize: 11, fontWeight: 600, fontFamily: 'Plus Jakarta Sans' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-4)', fontSize: 11, fontFamily: 'Plus Jakarta Sans' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-2)', radius: 6 }} />
              <Bar
                dataKey="count"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                onClick={(e) => navigate(`/findings?severity=${e.name.toUpperCase()}`)}
                style={{ cursor: 'pointer' }}
              >
                {severityBars.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 7-day risk trend */}
        <div className="bento-col-6 card card-container glass-tactile card-spotlight reveal-on-scroll" style={{ animationDelay: '0.1s' }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-kicker">
                <TrendingUp size={10} />
                7-Day Telemetry
              </div>
              <div className="card-title-text">Risk Score Trend</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 500 }}>Posture Drift</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={TREND_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--brand)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: 'var(--text-4)', fontSize: 11, fontWeight: 600, fontFamily: 'Plus Jakarta Sans' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[40, 100]}
                tick={{ fill: 'var(--text-4)', fontSize: 11, fontFamily: 'Plus Jakarta Sans' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TrendTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--brand)"
                strokeWidth={2.5}
                fill="url(#riskGrad)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--brand)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Compliance Matrix
      ══════════════════════════════════════════════════════════ */}
      <div className="bento-grid" style={{ marginBottom: 28 }}>
        <div className="bento-col-12 card card-container glass-tactile card-spotlight reveal-on-scroll">
        <div className="card-header">
          <div>
            <div className="card-kicker">
              <Shield size={10} />
              Continuous Compliance
            </div>
            <div className="card-title-text">
              CIS AWS 1.4 · SOC 2 · PCI-DSS · HIPAA
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/compliance')}
          >
            Full breakdown <ChevronRight size={11} />
          </button>
        </div>
        <ComplianceMatrix compact={true} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BENTO BOX LAYOUT: Recent findings + Service breakdown
      ══════════════════════════════════════════════════════════ */}
      <div className="bento-grid" style={{ marginBottom: 28 }}>
        {/* Recent findings list */}
        <div className="bento-col-8 card card-container glass-tactile card-spotlight reveal-on-scroll">
          <div className="card-header">
            <div>
              <div className="card-kicker">
                <Clock size={10} />
                Active
              </div>
              <div className="card-title-text">High-Priority Findings</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/findings')}
            >
              View all <ChevronRight size={11} />
            </button>
          </div>

          <div>
            {recentFindings.map((f, idx) => {
              const svc = (f.service || '').toLowerCase()
              const meta = SERVICE_META[svc] || { name: f.service, color: 'var(--brand)', bg: 'var(--brand-subtle)' }
              return (
                <div
                  key={f.id || idx}
                  className="finding-row"
                  onClick={() => navigate(`/findings?service=${f.service}`)}
                >
                  <div
                    style={{
                      width: 32, height: 32,
                      borderRadius: 6,
                      background: meta.bg,
                      color: meta.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      border: `1px solid ${meta.color}22`,
                    }}
                  >
                    <ServiceIcon service={svc} size={13} />
                  </div>
                  <div className="flex-min-0" style={{ flex: 1, minWidth: 0 }}>
                    <div className="finding-title-primary line-clamp-1">{f.title}</div>
                    <div className="finding-title-secondary line-clamp-1">
                      <span style={{ color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.service}</span>
                      {' · '}{f.rule_id}
                      {' · '}Risk: <strong style={{ color: 'var(--text-1)' }}>{f.risk_score}</strong>
                    </div>
                  </div>
                  <SeverityBadge severity={f.severity} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Service breakdown */}
        <div className="bento-col-4 card card-container glass-tactile card-spotlight reveal-on-scroll" style={{ animationDelay: '0.1s' }}>
          <div className="card-header">
            <div>
              <div className="card-kicker">
                <Activity size={10} />
                Coverage
              </div>
              <div className="card-title-text">By AWS Service</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { svc: 's3',  count: 6,  pct: 25 },
              { svc: 'iam', count: 8,  pct: 33 },
              { svc: 'ec2', count: 5,  pct: 21 },
              { svc: 'rds', count: 5,  pct: 21 },
            ].map(({ svc, count, pct }) => {
              const meta = SERVICE_META[svc]
              return (
                <div
                  key={svc}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/findings?service=${svc}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      <span style={{ color: meta.color, display: 'flex' }}>
                        <ServiceIcon service={svc} size={13} />
                      </span>
                      {meta.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>
                      {count} issues
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${pct * 3}%`, background: meta.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border-xs)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Telemetry</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: 'var(--sev-low)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sev-low)', display: 'inline-block' }} />
                Connected
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Drift</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: 'var(--text-2)' }}>Zero Drift</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
