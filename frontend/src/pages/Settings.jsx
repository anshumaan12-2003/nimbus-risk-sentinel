import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import SettingsIcon from 'lucide-react/dist/esm/icons/settings'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import XCircle from 'lucide-react/dist/esm/icons/x-circle'
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert'
import Cloud from 'lucide-react/dist/esm/icons/cloud'
import Cpu from 'lucide-react/dist/esm/icons/cpu'
import Bot from 'lucide-react/dist/esm/icons/bot'
import Bell from 'lucide-react/dist/esm/icons/bell'
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal'
import Keyboard from 'lucide-react/dist/esm/icons/keyboard'
import { usePreflight, useConfig } from '../hooks/queries'
import { getPreflight, testSlackWebhook, apiError } from '../api/nimbus'
import { qk } from '../lib/queryClient'
import { useSentinelStore } from '../store/sentinelStore'
import { PageHeader, Skeleton, ErrorState } from '../components/ui'
import { SHORTCUTS } from '../hooks/useShortcuts'
import { AccountSection, TeamSection } from '../components/TeamSettings'
import { useCan } from '../auth/authStore'

function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="card ui-settings-section">
      <div className="ui-settings-head">
        <Icon size={16} />
        <div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
      </div>
      {children}
    </section>
  )
}

const Row = ({ k, v, mono }) => (
  <div className="ui-settings-row"><dt>{k}</dt><dd className={mono ? 'font-mono' : undefined}>{v ?? '—'}</dd></div>
)
const OnOff = ({ on, yes = 'Enabled', no = 'Disabled' }) =>
  <span className={`badge-pill ${on ? 'badge-low' : 'ui-badge-muted'}`}>{on ? yes : no}</span>

export default function Settings() {
  const { dataSource, setDataSource, theme, setTheme, triggerRefresh } = useSentinelStore()
  const qc = useQueryClient()
  const pre = usePreflight()
  const cfg = useConfig()
  const [rechecking, setRechecking] = useState(false)
  const [slackUrl, setSlackUrl] = useState('')
  const [slackMsg, setSlackMsg] = useState(null)
  const isAdmin = useCan('users:manage')

  const recheck = async () => {
    setRechecking(true)
    try { qc.setQueryData(qk.preflight, await getPreflight(true)) }
    catch (e) { qc.setQueryData(qk.preflight, { connected: false, error: apiError(e) }) }
    finally { setRechecking(false) }
  }
  const testSlack = async () => {
    setSlackMsg(null)
    try { const r = await testSlackWebhook(slackUrl || undefined); setSlackMsg({ ok: true, text: r.message || 'Test message sent.' }) }
    catch (e) { setSlackMsg({ ok: false, text: apiError(e) }) }
  }
  const switchMode = (m) => { setDataSource(m); qc.invalidateQueries(); triggerRefresh() }

  const c = cfg.data || {}
  const p = pre.data
  const failing = (p?.checks || []).filter(x => !x.ok)

  return (
    <div className="animate-fade-in">
      <PageHeader icon={SettingsIcon} tag="Configuration" title="Settings"
        subtitle="Connection health and runtime configuration. Server settings are read-only here on purpose: credentials and write permissions live in backend/.env, never in the browser." />

      <div className="ui-settings-grid">
        {dataSource !== 'demo' && <AccountSection Section={Section} />}
        {dataSource !== 'demo' && <TeamSection Section={Section} />}
        <Section icon={Cloud} title="AWS connection" desc="What Nimbus can see, checked against the real AWS APIs the scanners call.">
          {dataSource === 'demo' ? <p className="ui-subtle">Demo mode — not connected to AWS.</p>
            : pre.isLoading ? <Skeleton rows={3} />
            : pre.isError ? <ErrorState error={pre.error} onRetry={pre.refetch} />
            : (
              <>
                <dl className="ui-settings-list">
                  <Row k="Status" v={p.connected ? (p.ready ? <OnOff on yes="Connected · all checks pass" /> :
                    <span className="badge-pill badge-high">Connected · {failing.length} denied</span>) :
                    <span className="badge-pill badge-critical">Not connected</span>} />
                  {p.connected && <>
                    <Row k="Account" v={p.account_id} mono />
                    <Row k="Principal" v={p.principal_arn} mono />
                    <Row k="Auth mode" v={p.auth_mode} />
                  </>}
                  {!p.connected && <Row k="Error" v={p.error || p.hint} />}
                </dl>
                {p.checks?.length > 0 && (
                  <details className="ui-details" open={failing.length > 0}>
                    <summary>API permission checks ({p.checks.length - failing.length}/{p.checks.length} ok)</summary>
                    <table className="data-table">
                      <thead><tr><th /><th>Service</th><th>Call</th><th>Region</th><th>Result</th></tr></thead>
                      <tbody>{p.checks.map((x, i) => (
                        <tr key={i}>
                          <td>{x.ok ? <CheckCircle2 size={13} color="var(--sev-low)" /> : <XCircle size={13} color="var(--sev-critical)" />}</td>
                          <td>{x.service}</td><td className="font-mono">{x.call}</td><td className="font-mono">{x.region}</td>
                          <td className="font-mono">{x.ok ? 'ok' : x.error}</td>
                        </tr>))}
                      </tbody>
                    </table>
                    {p.hint && <p className="ui-subtle">{p.hint}</p>}
                  </details>
                )}
                <button className="btn btn-ghost btn-sm" onClick={recheck} disabled={rechecking}>
                  <RefreshCw size={12} className={rechecking ? 'spin' : ''} /> {rechecking ? 'Checking…' : 'Re-check (refresh credentials)'}
                </button>
              </>
            )}
        </Section>

        <Section icon={Cpu} title="Scanning" desc="Change in backend/.env and restart the API.">
          {cfg.isLoading ? <Skeleton rows={4} /> : cfg.isError ? <ErrorState error={cfg.error} onRetry={cfg.refetch} /> : (
            <dl className="ui-settings-list">
              <Row k="Regions" v={c.regions?.join(', ')} mono />
              <Row k="Home region" v={c.default_region} mono />
              <Row k="Executor" v={c.scan_executor === 'celery' ? 'Celery worker (scheduled)' : 'In-process background task'} />
              <Row k="Schedule" v={c.scan_executor === 'celery' ? `Every ${c.scan_interval_minutes} min` : 'Manual only (enable Celery for schedules)'} />
              <Row k="Live events" v={c.events_backend} />
              <Row k="Crown-jewel tags" v={c.crown_jewel_tag_keys?.join(', ')} mono />
              <Row k="Crown-jewel name hints" v={c.crown_jewel_name_hints?.join(', ')} mono />
            </dl>
          )}
        </Section>

        <Section icon={ShieldAlert} title="Remediation" desc="Writes to AWS are off unless explicitly enabled on the server.">
          {cfg.data && (
            <dl className="ui-settings-list">
              <Row k="Apply fixes" v={<OnOff on={c.remediation_enabled} yes="Enabled — writes allowed" no="Dry-run only" />} />
              <Row k="Write role" v={c.remediation_role_arn || 'Same identity as scanner (not recommended)'} mono={!!c.remediation_role_arn} />
            </dl>
          )}
        </Section>

        <Section icon={Bot} title="AI Copilot">
          {cfg.data && (
            <dl className="ui-settings-list">
              <Row k="Provider" v={c.ai_provider} />
              <Row k="Model" v={c.ai_model} mono />
              <Row k="API key" v={<OnOff on={c.ai_configured} yes="Configured" no="Missing — Copilot shows scanner text only" />} />
            </dl>
          )}
        </Section>

        <Section icon={Bell} title="Notifications" desc="Slack alerts fire only for new critical findings.">
          {cfg.data && <dl className="ui-settings-list"><Row k="Slack" v={<OnOff on={c.slack_enabled} />} /></dl>}
          <div className="ui-chip-row">
            <input className="ui-input" placeholder="Webhook URL (blank = server default)" value={slackUrl} onChange={e => setSlackUrl(e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={testSlack} disabled={!isAdmin.allowed} title={isAdmin.reason || undefined}>Send test</button>
          </div>
          {slackMsg && <p style={{ color: slackMsg.ok ? 'var(--sev-low-text)' : 'var(--sev-critical-text)', fontSize: 13 }}>{slackMsg.text}</p>}
        </Section>

        <Section icon={SlidersHorizontal} title="Preferences" desc="Stored in this browser.">
          <div className="ui-settings-row">
            <dt>Data source</dt>
            <dd className="ui-chip-row">
              <button className={`filter-chip ${dataSource === 'live' ? 'active' : ''}`} onClick={() => switchMode('live')}>Live AWS</button>
              <button className={`filter-chip ${dataSource === 'demo' ? 'active' : ''}`} onClick={() => switchMode('demo')}>Demo data</button>
            </dd>
          </div>
          <div className="ui-settings-row">
            <dt>Theme</dt>
            <dd className="ui-chip-row">
              {['light', 'dark'].map(t => <button key={t} className={`filter-chip ${theme === t ? 'active' : ''}`} onClick={() => setTheme(t)}>{t}</button>)}
            </dd>
          </div>
        </Section>

        <Section icon={Keyboard} title="Keyboard shortcuts">
          <dl className="ui-settings-list">
            {SHORTCUTS.map(s => <Row key={s.keys} k={<kbd className="ui-kbd">{s.keys}</kbd>} v={s.label} />)}
          </dl>
        </Section>
      </div>
    </div>
  )
}
