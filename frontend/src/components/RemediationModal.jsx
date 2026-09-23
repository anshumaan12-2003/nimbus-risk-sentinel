/*
  Preview a fix and ask for approval. Nothing in AWS changes here: an approver (a different person,
  unless the server disables the two-person rule) applies it from the Approvals page.
*/
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import Lock from 'lucide-react/dist/esm/icons/lock'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw'
import Send from 'lucide-react/dist/esm/icons/send'
import X from 'lucide-react/dist/esm/icons/x'
import { useQueryClient } from '@tanstack/react-query'
import SeverityBadge from './SeverityBadge'
import { dryRunRemediation, requestRemediation, apiError } from '../api/nimbus'
import { useCan } from '../auth/authStore'

export function StateList({ state, tone }) {
  const entries = Object.entries(state || {})
  if (!entries.length) return <p className="appr-meta">No details</p>
  return (
    <dl className="appr-kv">
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k.replace(/_/g, ' ')}</dt>
          <dd className={tone}>{Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : v && typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DryRunDiff({ diff }) {
  if (!diff) return null
  return (
    <div className="appr-diff">
      <section className="appr-before"><h4><AlertTriangle size={11} /> Now</h4><StateList state={diff.before_state} /></section>
      <section className="appr-after"><h4><CheckCircle2 size={11} /> After the fix</h4><StateList state={diff.after_state} /></section>
    </div>
  )
}

export default function RemediationModal({ finding, onClose, onRequested }) {
  const preview = useCan('remediation:preview')
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [dry, setDry] = useState(null)
  const [error, setError] = useState('')
  const [why, setWhy] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)

  useEffect(() => {
    if (!finding) return
    if (!preview.allowed) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError('')
    dryRunRemediation(finding.rule_id, finding.resource_id || finding.resource_name, finding.id)
      .then(res => { if (!cancelled) { setDry(res); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(`Preview failed: ${apiError(err)}`); setLoading(false) } })
    return () => { cancelled = true }
  }, [finding, preview.allowed])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!finding) return null
  const diff = dry?.dry_run
  const supported = dry?.supported !== false

  const send = async () => {
    setSending(true); setError('')
    try {
      const req = await requestRemediation(finding.id, why)
      setSent(req)
      qc.invalidateQueries({ queryKey: ['remediation'] })
      qc.invalidateQueries({ queryKey: ['findings'] })
      onRequested?.(finding.id, req)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}
           role="dialog" aria-modal="true" aria-label={`Fix ${finding.rule_id}`}>
        <div className="rm-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <SeverityBadge severity={finding.severity} />
            <span className="font-mono" style={{ fontWeight: 700, fontSize: 13 }}>{finding.rule_id}</span>
          </div>
          <button className="palette-close-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="rm-body">
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{finding.title}</h3>
            <div className="appr-meta">Resource: <code>{finding.resource_id || finding.resource_name}</code></div>
          </div>

          {!preview.allowed && <div className="rm-note"><Lock size={13} /> {preview.reason} Ask an engineer to request this fix.</div>}
          {loading && <div className="appr-meta">Reading the live resource from AWS to preview the change…</div>}
          {diff && <DryRunDiff diff={diff} />}
          {diff?.rollback_cmd && (
            <div>
              <div className="appr-meta" style={{ marginBottom: 6 }}><RotateCcw size={11} /> Rollback, stored with the audit record</div>
              <pre className="inspector-code-block" style={{ fontSize: 11, padding: '10px 14px' }}><code>{diff.rollback_cmd}</code></pre>
            </div>
          )}

          {dry && !supported && (
            <div className="rm-note"><strong>Manual fix.</strong> This change needs a person, a device or a data migration, so Nimbus will not automate it. Follow the guidance above.</div>
          )}
          {dry && supported && !sent && (
            <label className="ui-field">
              Why should this be fixed now? <span className="appr-meta" style={{ margin: 0 }}>The approver sees this with the preview.</span>
              <textarea className="ui-textarea" value={why} onChange={e => setWhy(e.target.value)} maxLength={2000}
                        placeholder="e.g. SSH open to the internet on a production worker" />
            </label>
          )}
          {dry && supported && !dry.apply_enabled && !sent && (
            <div className="rm-note"><Lock size={13} /> Writes are switched off on the server (<code>REMEDIATION_ENABLED=false</code>). You can still request the fix; it can be approved once writes are enabled.</div>
          )}
          {sent && (
            <div className="rm-note rm-ok">
              <CheckCircle2 size={14} /> Sent for approval. {dry?.two_person_rule !== false ? 'Someone with the approver role, other than you, ' : 'An approver '}
              applies it from <Link to="/approvals" onClick={onClose}>Approvals</Link>.
            </div>
          )}
          {error && <div className="ui-scan-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
        </div>

        <div className="rm-foot">
          <button className="btn btn-ghost" onClick={onClose}>{sent ? 'Close' : 'Cancel'}</button>
          {!sent && (
            <button className="btn btn-primary" onClick={send}
                    disabled={sending || loading || !dry || !supported || !!diff?.already_compliant}>
              <Send size={14} /> {sending ? 'Sending…' : 'Request approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
