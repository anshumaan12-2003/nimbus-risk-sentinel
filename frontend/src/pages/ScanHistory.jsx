import { useMemo, useState } from 'react'
import History from 'lucide-react/dist/esm/icons/history'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Download from 'lucide-react/dist/esm/icons/download'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import Loader2 from 'lucide-react/dist/esm/icons/loader-2'
import XCircle from 'lucide-react/dist/esm/icons/x-circle'
import Clock from 'lucide-react/dist/esm/icons/clock'
import { formatDistanceToNow } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useScans, useActiveScan, useScanWarnings, useScanProgress } from '../hooks/queries'
import ScanProgressGrid from '../components/ScanProgressGrid'
import { useSentinelStore } from '../store/sentinelStore'
import { PageHeader, QueryState, EmptyState, Drawer, Metric, downloadFile } from '../components/ui'

// API timestamps are naive UTC; make the browser parse them as UTC
const utc = (s) => (s ? new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : null)
const rel = (s) => { const d = utc(s); return d ? formatDistanceToNow(d, { addSuffix: true }) : '—' }
const durationSec = (s) => (s.started_at && s.completed_at ? (utc(s.completed_at) - utc(s.started_at)) / 1000 : null)
const fmtDur = (sec) => (sec == null ? '—' : sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`)
const n = (v) => Number(v || 0)

const STATUS = {
  COMPLETED: { cls: 'badge-low', Icon: CheckCircle2 },
  FAILED: { cls: 'badge-critical', Icon: XCircle },
  RUNNING: { cls: 'badge-medium', Icon: Loader2 },
  PENDING: { cls: 'badge-medium', Icon: Clock },
}

export default function ScanHistory() {
  const { dataSource, openScanModal } = useSentinelStore()
  const q = useScans(50)
  const active = useActiveScan()
  const [openId, setOpenId] = useState(null)

  const scans = q.data || []
  const completed = scans.filter(s => s.status === 'COMPLETED')
  const stats = useMemo(() => {
    const durs = completed.map(durationSec).filter(x => x != null)
    const finished = scans.filter(s => s.status === 'COMPLETED' || s.status === 'FAILED')
    const [latest, prev] = completed
    return {
      success: finished.length ? Math.round(100 * completed.length / finished.length) : null,
      meanDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
      latest: latest ? n(latest.risk_score) : null,
      delta: latest && prev ? n(latest.risk_score) - n(prev.risk_score) : null,
    }
  }, [scans])

  // oldest -> newest for the trend chart
  const trend = useMemo(() => [...completed].reverse().map(s => ({
    t: utc(s.completed_at)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    risk: n(s.risk_score), findings: n(s.total_findings), critical: n(s.critical_count),
  })), [scans])

  if (dataSource === 'demo') {
    return <div className="animate-fade-in"><PageHeader icon={History} tag="Audit trail" title="Scan History" />
      <EmptyState title="Scan history needs live mode" body="Switch to live data in Settings." /></div>
  }

  const openScan = scans.find(s => s.id === openId)

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={History} tag="Audit trail" title="Scan History"
        subtitle="Every scan, its outcome, how long it took and what it could not see."
        actions={<button className="btn btn-primary" onClick={openScanModal} disabled={!!active.data}>
          <Zap size={14} /> {active.data ? 'Scan in progress…' : 'Run new scan'}
        </button>}
      />

      {active.data && (
        <div className="card ui-inline-alert" role="status">
          <Loader2 size={15} className="spin" />
          <span>Scan <span className="font-mono">{active.data.id.slice(0, 8)}</span> is {active.data.status.toLowerCase()} (started {rel(active.data.started_at)}). This page updates automatically when it finishes.</span>
        </div>
      )}

      <QueryState query={q} rows={6}
        empty={<EmptyState icon={History} title="No scans yet" body="Run your first scan to establish a security baseline."
          action={<button className="btn btn-primary" onClick={openScanModal}><Zap size={14} /> Run first scan</button>} />}>
        {() => (
          <>
            <div className="grid-4 ui-gap">
              <Metric label="Scans recorded" value={scans.length} hint={`${completed.length} completed`} />
              <Metric label="Success rate" value={stats.success == null ? '—' : `${stats.success}%`}
                      tone={stats.success == null ? null : stats.success < 90 ? 'high' : 'low'} hint="Completed vs failed" />
              <Metric label="Mean duration" value={fmtDur(stats.meanDur)} hint="Completed scans" />
              <Metric label="Latest risk score" value={stats.latest == null ? '—' : `${stats.latest}/100`}
                      tone={stats.latest >= 70 ? 'critical' : stats.latest >= 40 ? 'high' : 'low'}
                      hint={stats.delta == null ? 'First baseline' : stats.delta === 0 ? 'No change vs previous' :
                        `${stats.delta > 0 ? '▲ worse by' : '▼ better by'} ${Math.abs(stats.delta)} vs previous`} />
            </div>

            {trend.length > 1 && (
              <div className="card ui-gap">
                <div className="card-kicker">Risk and findings over time</div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-xs)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--text-4)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-4)' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border-sm)', borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="risk" name="Risk score" stroke="var(--sev-critical)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="findings" name="Findings" stroke="var(--brand)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="critical" name="Critical" stroke="var(--sev-high)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr><th>Scan</th><th>Status</th><th>Started</th><th>Duration</th><th>Trigger</th><th>Regions</th><th>Risk</th><th>Findings</th><th /></tr>
                  </thead>
                  <tbody>
                    {scans.map(s => {
                      const st = STATUS[s.status] || STATUS.PENDING
                      return (
                        <tr key={s.id} className="ui-row-link" tabIndex={0} onClick={() => setOpenId(s.id)}
                            onKeyDown={e => e.key === 'Enter' && setOpenId(s.id)}>
                          <td className="font-mono text-cyan">{s.id.slice(0, 8)}</td>
                          <td>
                            <span className={`badge-pill ${st.cls}`}><st.Icon size={11} className={s.status === 'RUNNING' ? 'spin' : ''} /> {s.status}</span>
                            {s.status === 'COMPLETED' && s.error_message && <span className="ui-warn-dot" title={s.error_message}><AlertTriangle size={12} /></span>}
                          </td>
                          <td title={utc(s.started_at)?.toLocaleString()}>{rel(s.started_at)}</td>
                          <td className="font-mono">{fmtDur(durationSec(s))}</td>
                          <td>{s.triggered_by}</td>
                          <td className="font-mono ui-subtle">{s.region || '—'}</td>
                          <td className="font-mono" style={{ fontWeight: 700 }}>{s.status === 'COMPLETED' ? s.risk_score : '—'}</td>
                          <td>
                            {s.status === 'COMPLETED' ? (
                              <div className="ui-chip-row">
                                <span className="badge-pill badge-critical">{n(s.critical_count)} C</span>
                                <span className="badge-pill badge-high">{n(s.high_count)} H</span>
                                <span className="badge-pill badge-medium">{n(s.medium_count)} M</span>
                                <span className="badge-pill badge-low">{n(s.low_count)} L</span>
                              </div>
                            ) : <span className="ui-subtle ui-truncate" title={s.error_message}>{s.error_message || '—'}</span>}
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" aria-label="Download scan JSON"
                                    onClick={e => { e.stopPropagation(); downloadFile(`scan-${s.id}.json`, JSON.stringify(s, null, 2), 'application/json') }}>
                              <Download size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </QueryState>

      <Drawer open={!!openScan} onClose={() => setOpenId(null)} title={openScan ? `Scan ${openScan.id.slice(0, 8)}` : ''}>
        {openScan && <ScanDetail scan={openScan} />}
      </Drawer>
    </div>
  )
}

function ScanDetail({ scan }) {
  const w = useScanWarnings(scan.status === 'COMPLETED' ? scan.id : null)
  const counts = Object.entries(w.data?.asset_counts || {})
  const warnings = w.data?.warnings || []
  const prog = useScanProgress(scan.id)
  return (
    <div className="ui-detail">
      <dl className="ui-kv">
        <div><dt>Status</dt><dd>{scan.status}</dd></div>
        <div><dt>Account</dt><dd className="font-mono">{scan.account_id || '—'}</dd></div>
        <div><dt>Regions</dt><dd className="font-mono">{scan.region || '—'}</dd></div>
        <div><dt>Started</dt><dd>{utc(scan.started_at)?.toLocaleString()}</dd></div>
        <div><dt>Duration</dt><dd>{fmtDur(durationSec(scan))}</dd></div>
        <div><dt>Triggered by</dt><dd>{scan.triggered_by}</dd></div>
      </dl>

      {scan.status === 'FAILED' && (
        <section><div className="ui-detail-label">Failure reason</div><pre className="ui-code">{scan.error_message}</pre></section>
      )}

      {prog.data && (
        <section>
          <div className="ui-detail-label">Coverage by service and region</div>
          <ScanProgressGrid progress={prog.data} compact />
        </section>
      )}

      {counts.length > 0 && (
        <section>
          <div className="ui-detail-label">Assets inventoried</div>
          <div className="ui-chip-row">{counts.map(([k, v]) => <span key={k} className="badge-pill ui-badge-muted">{k.replace('_', ' ')}: {v}</span>)}</div>
        </section>
      )}

      {scan.status === 'COMPLETED' && (
        <section>
          <div className="ui-detail-label">Blind spots ({warnings.length})</div>
          {w.isLoading ? <p className="ui-subtle">Loading…</p> : warnings.length ? (
            <>
              <p className="ui-subtle">These API calls failed, so anything behind them is missing from this scan. Usually a missing read permission — attach SecurityAudit + ViewOnlyAccess.</p>
              <table className="data-table">
                <thead><tr><th>Service</th><th>Region</th><th>Call</th><th>Error</th></tr></thead>
                <tbody>{warnings.map((x, i) => (
                  <tr key={i}><td>{x.service}</td><td className="font-mono">{x.region}</td><td className="font-mono">{x.call}</td><td className="font-mono">{x.error}</td></tr>
                ))}</tbody>
              </table>
            </>
          ) : <p className="ui-subtle">None — every API call succeeded.</p>}
        </section>
      )}
    </div>
  )
}
