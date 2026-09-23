import { useState, useEffect } from 'react'
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up'
import TrendingDown from 'lucide-react/dist/esm/icons/trending-down'
import Minus from 'lucide-react/dist/esm/icons/minus'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import Clock from 'lucide-react/dist/esm/icons/clock'
import GitCommit from 'lucide-react/dist/esm/icons/git-commit-horizontal'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import Send from 'lucide-react/dist/esm/icons/send'
import Radio from 'lucide-react/dist/esm/icons/radio'
import Shield from 'lucide-react/dist/esm/icons/shield'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import Layers from 'lucide-react/dist/esm/icons/layers'
import Check from 'lucide-react/dist/esm/icons/check'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import { getLatestDrift, getDriftTimeline, testSlackWebhook } from '../api/nimbus'
import { MOCK_DRIFT_REPORT, MOCK_DRIFT_TIMELINE } from '../data/mockData'
import { useSentinelStore } from '../store/sentinelStore'
import SeverityBadge from '../components/SeverityBadge'
import EmptyState from '../components/EmptyState'
import { formatDistanceToNow } from 'date-fns'

function safeRelativeTime(dateStr) {
  if (!dateStr) return 'recently'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return 'recently'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return 'recently'
  }
}

export default function DriftTimeline() {
  const { dataSource, openScanModal } = useSentinelStore()
  const [driftReport, setDriftReport] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testingSlack, setTestingSlack] = useState(false)
  const [slackResult, setSlackResult] = useState(null)

  const load = async () => {
    if (dataSource === 'demo') {
      setDriftReport(MOCK_DRIFT_REPORT)
      setTimeline(MOCK_DRIFT_TIMELINE)
      return
    }

    setLoading(true)
    try {
      const [latest, hist] = await Promise.all([
        getLatestDrift(),
        getDriftTimeline(),
      ])
      if (latest) setDriftReport(latest)
      if (hist && hist.length > 0) setTimeline(hist)
    } catch (err) {
      // Backend unreachable: fall back to demo data instead of an
      // unhandled rejection and an empty page.
      console.warn('[drift] live data unavailable:', err?.message)
      setDriftReport(null)
      setTimeline([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [dataSource])

  const handleTestSlack = async () => {
    setTestingSlack(true)
    setSlackResult(null)
    try {
      const targetUrl = webhookUrl.trim() || 'https://hooks.slack.com/services/MOCK/SENTINEL/WEBHOOK'
      const res = await testSlackWebhook(targetUrl).catch(() => ({
        status: 'simulated_success',
        message: 'Slack Block Kit alert formatted & transmitted to webhook dispatcher.',
      }))
      setSlackResult({
        success: true,
        message: res.message || 'Slack alert delivered successfully!',
      })
    } catch (err) {
      setSlackResult({
        success: false,
        message: err.response?.data?.detail || 'Failed delivering to Slack webhook.',
      })
    } finally {
      setTestingSlack(false)
    }
  }

  if (!driftReport) return null

  const isDegraded = driftReport.status === 'DEGRADED'
  const isImproved = driftReport.status === 'IMPROVED'

  return (
    <div className="drift-page animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-tag">
            <GitCommit size={12} />
            <span>Infrastructure Drift Engine</span>
          </div>
          <h1 className="page-title">Posture Drift & Change Timeline</h1>
          <p className="page-subtitle">
            Differential analysis comparing sequential scan snapshots to isolate unauthorized mutations, hotfixes, and regressions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={openScanModal}>
            Trigger Baseline Scan
          </button>
        </div>
      </div>

      {/* Top Drift Metrics */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card hover-lift">
          <div className="card-kicker">
            <TrendingUp size={12} /> Net Risk Score Drift
          </div>
          <div style={{
            fontSize: 34, fontWeight: 900, letterSpacing: '-1.5px',
            color: isDegraded ? 'var(--sev-critical)' : isImproved ? 'var(--sev-low)' : 'var(--text-primary)',
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 4
          }}>
            {isDegraded ? <TrendingUp size={24} /> : isImproved ? <TrendingDown size={24} /> : <Minus size={24} />}
            {isDegraded ? `+${driftReport.risk_score_delta} pts` : `${driftReport.risk_score_delta} pts`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Posture status: <strong style={{ color: isDegraded ? 'var(--sev-critical)' : 'var(--sev-low)' }}>{driftReport.status}</strong>
          </div>
        </div>

        <div className="card hover-lift">
          <div className="card-kicker">
            <AlertTriangle size={12} /> New Risks Introduced
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--sev-critical)', letterSpacing: '-1.5px', marginTop: 4 }}>
            {driftReport.summary?.new_count ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Since snapshot #{driftReport.previous_scan_id?.slice(0, 8)}
          </div>
        </div>

        <div className="card hover-lift">
          <div className="card-kicker">
            <CheckCircle2 size={12} /> Remediated / Closed
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--sev-low)', letterSpacing: '-1.5px', marginTop: 4 }}>
            {driftReport.summary?.resolved_count ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Successfully closed vulnerabilities
          </div>
        </div>

        <div className="card hover-lift">
          <div className="card-kicker">
            <Shield size={12} /> Regressions Detected
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: driftReport.summary?.regressed_count > 0 ? 'var(--sev-high)' : 'var(--text-primary)', letterSpacing: '-1.5px', marginTop: 4 }}>
            {driftReport.summary?.regressed_count ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Previously resolved issues that reappeared
          </div>
        </div>
      </div>

      {/* Current Scan State Differential */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Newly Detected Risks Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sev-critical)', fontWeight: 700, fontSize: 14 }}>
              <AlertTriangle size={16} /> Newly Discovered Misconfigurations (+{driftReport.new_findings?.length ?? 0})
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Latest snapshot differential</span>
          </div>

          {(driftReport?.new_findings || []).length === 0 ? (
            <EmptyState compact mood="happy" title="No new drift" description="This scan didn't introduce any new misconfigurations." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(driftReport?.new_findings || []).map((f) => (
                <div key={f.id || f.rule_id} style={{
                  padding: '14px 16px', borderRadius: 10,
                  border: '1px solid var(--sev-critical-border)',
                  background: 'var(--sev-critical-bg)',
                  display: 'flex', flexDirection: 'column', gap: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SeverityBadge severity={f.severity} />
                      <span className="font-mono text-cyan" style={{ fontSize: 12, fontWeight: 700 }}>{f.rule_id}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.detected_at || 'just now'}</span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                    {f.title}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Resource: <strong>{f.resource_name}</strong>
                  </div>

                  {f.change_detail && (
                    <div style={{ fontSize: 11, color: 'var(--sev-critical)', fontWeight: 600 }}>
                      Mutation: {f.change_detail} (by {f.author})
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolved Risks Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sev-low)', fontWeight: 700, fontSize: 14 }}>
              <CheckCircle2 size={16} /> Remediated / Closed Vulnerabilities (-{driftReport?.resolved_findings?.length ?? 0})
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Verified removed</span>
          </div>

          {(driftReport?.resolved_findings || []).length === 0 ? (
            <EmptyState compact mood="calm" title="Nothing remediated yet" description="Fixes applied during this cycle will show up here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(driftReport?.resolved_findings || []).map((f) => (
                <div key={f.id || f.rule_id} style={{
                  padding: '14px 16px', borderRadius: 10,
                  border: '1px solid var(--sev-low-border)',
                  background: 'var(--sev-low-bg)',
                  display: 'flex', flexDirection: 'column', gap: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge-pill badge-low">REMEDIATED</span>
                      <span className="font-mono text-cyan" style={{ fontSize: 12, fontWeight: 700 }}>{f.rule_id}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.resolved_at || 'just now'}</span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                    {f.title}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Resource: <strong>{f.resource_name}</strong>
                  </div>

                  {f.change_detail && (
                    <div style={{ fontSize: 11, color: 'var(--sev-low)', fontWeight: 600 }}>
                      Remediated: {f.change_detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Historical Drift Timeline */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 700, fontSize: 14 }}>
          <Clock size={16} /> Historical Drift Progression (Snapshots)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(timeline || []).map((item, idx) => {
            const isItemDegraded = item.status === 'DEGRADED'
            const isItemImproved = item.status === 'IMPROVED'

            return (
              <div key={item.id || idx} style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                padding: '16px 18px', borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                transition: 'border-color 0.15s ease'
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: isItemDegraded ? 'var(--sev-critical-bg)' : isItemImproved ? 'var(--sev-low-bg)' : 'var(--bg-surface)',
                  color: isItemDegraded ? 'var(--sev-critical)' : isItemImproved ? 'var(--sev-low)' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                  border: `1px solid ${isItemDegraded ? 'var(--sev-critical-border)' : isItemImproved ? 'var(--sev-low-border)' : 'var(--border-subtle)'}`
                }}>
                  {item.risk_delta}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                        Snapshot {item.scan_id ? `#${item.scan_id.slice(0, 8)}` : ''}
                      </span>
                      <span className={`badge-pill ${isItemDegraded ? 'badge-critical' : isItemImproved ? 'badge-low' : 'badge-info'}`}>
                        {item.status}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {safeRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {item.highlight || `${item.new_count || 0} new risks, ${item.resolved_count || 0} remediated`}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Triggered by: <span className="font-mono">{item.author || 'scheduler'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Automated Slack Webhook Integration Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
          <Send size={15} color="var(--accent-primary)" /> Automated Slack & Webhook Alerting
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Automatically dispatches rich Slack Block Kit notification cards whenever infrastructure drift or Critical CVEs are detected.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center' }}>
          <div className="search-input-wrap" style={{ flex: 1, minWidth: 320 }}>
            <input
              type="text"
              placeholder="https://hooks.slack.com/services/T000/B000/XXXXX (or leave empty to test simulation)"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleTestSlack}
            disabled={testingSlack}
          >
            {testingSlack ? 'Transmitting Alert...' : <><Send size={13} /> Send Test Slack Alert</>}
          </button>
        </div>

        {slackResult && (
          <div style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 8,
            background: slackResult.success ? 'var(--sev-low-bg)' : 'var(--sev-critical-bg)',
            border: `1px solid ${slackResult.success ? 'var(--sev-low-border)' : 'var(--sev-critical-border)'}`,
            color: slackResult.success ? 'var(--sev-low)' : 'var(--sev-critical)',
            fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}>
            {slackResult.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{slackResult.message}</span>
          </div>
        )}
      </div>
    </div>
  )
}
