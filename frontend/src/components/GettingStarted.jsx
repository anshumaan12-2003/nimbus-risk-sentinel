import { Link } from 'react-router-dom'
import Check from 'lucide-react/dist/esm/icons/check'
import { usePreflight, useScans, useConfig } from '../hooks/queries'
import { useSentinelStore } from '../store/sentinelStore'
import { useCan } from '../auth/authStore'

/*
  First-run checklist. Each step is derived from real backend state, so it ticks itself off
  as the user progresses and disappears once the account has a completed scan with full visibility.
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
    { done: connected, title: 'Connect AWS', body: <>Set <code>AWS_PROFILE</code> (SSO) or a role in <code>backend/.env</code>.</>, to: '/settings' },
    { done: permissions, title: 'Grant read access', body: 'Attach SecurityAudit + ViewOnlyAccess so no service is a blind spot.', to: '/settings' },
    { done: scanned, title: 'Run the first scan', body: 'Builds findings, inventory, attack paths and compliance scores.', action: openScanModal },
    { done: ai, title: 'Optional: AI Copilot', body: <>Add <code>AI_API_KEY</code> for plain-English explanations.</>, to: '/settings' },
  ]
  return (
    <div className="card ui-onboard" aria-label="Getting started">
      <div className="card-kicker">Getting started · {steps.filter(s => s.done).length} of {steps.length} done</div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="ui-step-dot">{s.done ? <Check size={12} /> : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <span className="ui-subtle">{s.body}</span>
              {!s.done && (s.action
                ? <div><button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={s.action} disabled={!connected || !run.allowed} title={run.reason || undefined}>Start scan</button></div>
                : <div><Link to={s.to} className="ui-subtle" style={{ color: 'var(--brand)' }}>Open settings →</Link></div>)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
