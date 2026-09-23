/*
  Approvals — where fixes actually happen.
  An engineer requests a fix (with the dry-run frozen at that moment); a different approver reads the
  exact before/after and approves, which is the only path that changes AWS.
*/
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import Undo2 from 'lucide-react/dist/esm/icons/undo-2'
import XCircle from 'lucide-react/dist/esm/icons/x-circle'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader, QueryState, EmptyState, SevBadge } from '../components/ui'
import { useRemediationRequests, useConfig } from '../hooks/queries'
import { approveRemediation, rejectRemediation, cancelRemediation, apiError } from '../api/nimbus'
import { useAuth, useCan } from '../auth/authStore'
import { DryRunDiff } from '../components/RemediationModal'
import { emitEvent } from '../store/eventStore'

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

function RequestCard({ r, onDone }) {
  const me = useAuth(s => s.user)
  const approve = useCan('remediation:approve')
  const info = useAuth(s => s.info)
  const cfg = useConfig()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const mine = me?.id === r.requested_by_id
  const twoPerson = info?.two_person_rule !== false
  const writesOff = cfg.data && cfg.data.remediation_enabled === false
  const blocked = !approve.allowed ? approve.reason
    : mine && twoPerson ? 'You requested this, so someone else has to approve it (four-eyes rule).'
    : writesOff ? 'Writes are switched off on the server (REMEDIATION_ENABLED=false).'
    : null

  const act = async (kind) => {
    setBusy(kind); setError(null)
    try {
      if (kind === 'approve') {
        await approveRemediation(r.id, note)
        emitEvent({ type: 'remediation.applied', severity: 'INFO', title: `${r.rule_id} fixed`, detail: r.resource_name || r.resource_id, link: '/approvals' })
      } else if (kind === 'reject') {
        await rejectRemediation(r.id, note)
      } else {
        await cancelRemediation(r.id)
      }
      onDone()
    } catch (err) {
      setError(apiError(err))
      onDone()   // a failed apply is still recorded — refresh to show it
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="appr-card" aria-labelledby={`req-${r.id}`}>
      <div className="appr-top">
        <div style={{ minWidth: 0 }}>
          <h3 className="appr-title" id={`req-${r.id}`}>{r.title || r.dry_run?.action || r.rule_id}</h3>
          <div className="appr-meta">
            <span className="font-mono">{r.rule_id}</span> on <code>{r.resource_name || r.resource_id}</code>
            {r.region && r.region !== 'global' ? ` in ${r.region}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {r.severity && <SevBadge severity={r.severity} />}
          <span className={`appr-status appr-status-${r.status}`}>{r.status.toLowerCase()}</span>
        </div>
      </div>

      <dl className="appr-who">
        <div><dt>Requested by</dt><dd>{r.requested_by} · {when(r.created_at)}</dd></div>
        {r.decided_by && <div><dt>{r.status === 'CANCELLED' ? 'Withdrawn by' : r.status === 'REJECTED' ? 'Rejected by' : 'Approved by'}</dt>
          <dd>{r.decided_by} · {when(r.decided_at)}</dd></div>}
        {r.dry_run?.estimated_downtime && <div><dt>Expected downtime</dt><dd>{r.dry_run.estimated_downtime}</dd></div>}
      </dl>

      {r.justification && <blockquote className="appr-quote">{r.justification}</blockquote>}
      <DryRunDiff diff={r.dry_run} />
      {r.decision_note && <p className="appr-meta"><strong>Note:</strong> {r.decision_note}</p>}
      {r.result_message && r.status !== 'PENDING' && <p className="appr-meta"><strong>Result:</strong> {r.result_message}</p>}
      {error && <div className="ui-scan-error" role="alert"><XCircle size={15} /><span>{error}</span></div>}

      {r.status === 'PENDING' && (
        <div className="appr-actions">
          {approve.allowed && !(mine && twoPerson) && (
            <textarea className="ui-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
                      aria-label="Decision note" placeholder="Note for the audit trail (required to reject)" />
          )}
          <button className="btn btn-primary btn-sm" disabled={!!blocked || !!busy} onClick={() => act('approve')}
                  title={blocked || 'Apply this change to AWS now and verify it'}>
            <CheckCircle2 size={13} /> {busy === 'approve' ? 'Applying…' : 'Approve and apply'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!approve.allowed || (mine && twoPerson) || !note.trim() || !!busy}
                  onClick={() => act('reject')} title={note.trim() ? 'Reject' : 'Write a note first'}>
            <XCircle size={13} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          {(mine || me?.role === 'admin') && (
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('cancel')}>
              <Undo2 size={13} /> Withdraw
            </button>
          )}
          {blocked && <span className="appr-blocked">{blocked}</span>}
        </div>
      )}
    </article>
  )
}

const TABS = [['PENDING', 'Waiting'], ['', 'History']]

export default function Approvals() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? '' : 'PENDING'
  const pending = useRemediationRequests('PENDING')
  const all = useRemediationRequests()
  const query = tab ? pending : all
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['remediation'] }); qc.invalidateQueries({ queryKey: ['findings'] }) }
  const approve = useCan('remediation:approve')

  return (
    <div className="animate-fade-in">
      <PageHeader icon={ShieldCheck} tag="Four-eyes remediation" title="Approvals"
                  subtitle={approve.allowed
                    ? 'Fixes requested by engineers. Approving one applies it to AWS and checks that it worked.'
                    : 'Fixes waiting for an approver. You can follow them here; approving needs the approver role.'} />
      <div className="ui-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={label} role="tab" aria-selected={tab === key}
                  onClick={() => setParams(key ? {} : { tab: 'history' })}>
            {label}{key === 'PENDING' && pending.data ? <span className="ui-tab-count">{pending.data.length}</span> : null}
          </button>
        ))}
      </div>
      <QueryState query={query} rows={4}
        isEmpty={(d) => !d || (tab ? d : d.filter(r => r.status !== 'PENDING')).length === 0}
        empty={
        <EmptyState icon={ShieldCheck} title={tab ? 'Nothing waiting for approval' : 'No requests yet'}
                    body="Open a finding and choose Request approval to send a fix here."
                    action={<Link className="btn btn-ghost btn-sm" to="/findings">Go to findings</Link>} />
      }>
        {(rows) => (
          <div className="appr-list">
            {(tab ? rows : rows.filter(r => r.status !== 'PENDING')).map(r => <RequestCard key={r.id} r={r} onDone={refresh} />)}
          </div>
        )}
      </QueryState>
    </div>
  )
}
