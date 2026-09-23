/*
  Approvals — where fixes actually happen.
  An engineer requests a fix (with the dry-run frozen at that moment); a different approver reads the
  exact before/after and approves, which is the only path that changes AWS.
*/
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, ShieldCheck, Undo2, XCircle } from 'lucide-react'
import {
  Page, PageHeader, Card, Button, SeverityBadge, StatusBadge, Tabs, TabsList, TabsTrigger, Textarea,
  EmptyState, QueryState, SkeletonRows, Tooltip, ResourceId,
} from '@/components/ds'
import { useRemediationRequests, useConfig } from '@/hooks/queries'
import { approveRemediation, rejectRemediation, cancelRemediation, apiError } from '@/api/nimbus'
import { useAuth, useCan } from '@/auth/authStore'
import { emitEvent } from '@/store/eventStore'
import { ago, dateTime } from '@/lib/time'

function StateBox({ label, value, tone }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-2">
      <p className={`border-b border-line px-3 py-1.5 text-xs font-medium ${tone}`}>{label}</p>
      <pre className="max-h-56 overflow-auto p-3 font-mono text-xs leading-5 text-fg">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  )
}

function Person({ label, who, when }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="text-sm text-fg"><span className="font-medium">{who}</span> <span className="text-fg-3" title={dateTime(when)}>· {ago(when)}</span></dd>
    </div>
  )
}

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
  const pending = r.status === 'PENDING'
  const d = r.dry_run || {}

  const act = async (kind) => {
    setBusy(kind); setError(null)
    try {
      if (kind === 'approve') {
        await approveRemediation(r.id, note)
        emitEvent({ type: 'remediation.applied', severity: 'INFO', title: `${r.rule_id} fixed`, detail: r.resource_name || r.resource_id, link: '/approvals' })
        toast.success('Fix applied and verified', { description: r.title || r.rule_id })
      } else if (kind === 'reject') {
        await rejectRemediation(r.id, note)
        toast('Request rejected')
      } else {
        await cancelRemediation(r.id)
        toast('Request withdrawn')
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
    <Card as="article" aria-labelledby={`req-${r.id}`} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 id={`req-${r.id}`} className="text-md font-semibold text-fg">{r.title || d.action || r.rule_id}</h3>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-fg-2">
            <span className="font-mono text-xs text-fg-3">{r.rule_id}</span>
            <span aria-hidden className="text-fg-3">·</span>
            <ResourceId value={r.resource_name || r.resource_id} />
            {r.region && r.region !== 'global' && <><span aria-hidden className="text-fg-3">·</span><span>{r.region}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.severity && <SeverityBadge severity={r.severity} size="sm" />}
          <StatusBadge status={r.status} size="sm" />
        </div>
      </div>

      <div className="grid gap-4 border-t border-line px-5 py-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Person label="Requested by" who={r.requested_by} when={r.created_at} />
          {r.decided_by && <Person label={r.status === 'CANCELLED' ? 'Withdrawn by' : r.status === 'REJECTED' ? 'Rejected by' : 'Approved by'} who={r.decided_by} when={r.decided_at} />}
          {d.estimated_downtime && <div className="grid gap-0.5"><dt className="text-xs text-fg-3">Expected downtime</dt><dd className="text-sm text-fg">{d.estimated_downtime}</dd></div>}
        </dl>

        {r.justification && (
          <blockquote className="border-l-2 border-accent-line pl-3 text-sm text-fg-2 italic">“{r.justification}”</blockquote>
        )}

        {(d.before_state || d.after_state) && (
          <div className="grid gap-2">
            {d.action && <p className="text-sm font-medium text-fg">{d.action}</p>}
            <div className="grid items-start gap-2 md:grid-cols-[1fr_auto_1fr]">
              <StateBox label="Now" value={d.before_state} tone="text-crit-text" />
              <ArrowRight className="mx-auto size-4 rotate-90 text-fg-3 md:mt-10 md:rotate-0" aria-hidden />
              <StateBox label="After approval" value={d.after_state} tone="text-low-text" />
            </div>
          </div>
        )}

        {r.decision_note && <p className="text-sm text-fg-2"><span className="font-medium text-fg">Note: </span>{r.decision_note}</p>}
        {r.result_message && !pending && <p className="text-sm text-fg-2"><span className="font-medium text-fg">Result: </span>{r.result_message}</p>}
        {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-crit-line bg-crit-soft px-3 py-2 text-sm text-crit-text"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      </div>

      {pending && (
        <div className="grid gap-3 border-t border-line bg-surface-2 px-5 py-4">
          {approve.allowed && !(mine && twoPerson) && (
            <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} aria-label="Decision note"
                      placeholder="Note for the audit trail (required to reject)" className="min-h-16 bg-surface" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={blocked || 'Apply this change to AWS now, then verify it'}>
              <span>
                <Button variant="primary" disabled={!!blocked || !!busy} loading={busy === 'approve'} onClick={() => act('approve')}>
                  {busy !== 'approve' && <CheckCircle2 />} {busy === 'approve' ? 'Applying' : 'Approve and apply'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip content={note.trim() ? null : 'Write a note first'}>
              <span>
                <Button disabled={!approve.allowed || (mine && twoPerson) || !note.trim() || !!busy} loading={busy === 'reject'} onClick={() => act('reject')}>
                  {busy !== 'reject' && <XCircle />} Reject
                </Button>
              </span>
            </Tooltip>
            {(mine || me?.role === 'admin') && (
              <Button variant="ghost" disabled={!!busy} loading={busy === 'cancel'} onClick={() => act('cancel')}>
                {busy !== 'cancel' && <Undo2 />} Withdraw
              </Button>
            )}
            {blocked && <span className="text-xs text-fg-3">{blocked}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Approvals() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'waiting'
  const pending = useRemediationRequests('PENDING')
  const all = useRemediationRequests()
  const query = tab === 'waiting' ? pending : all
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['remediation'] }); qc.invalidateQueries({ queryKey: ['findings'] }) }
  const approve = useCan('remediation:approve')
  const visible = (d) => (tab === 'waiting' ? d : d.filter(r => r.status !== 'PENDING'))

  return (
    <Page>
      <PageHeader
        title="Approvals"
        description={approve.allowed
          ? 'Fixes requested by engineers. Approving one applies it to AWS and checks that it worked.'
          : 'Fixes waiting for an approver. You can follow them here; approving needs the approver role.'}
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'history' ? { tab: 'history' } : {})} className="mb-5">
        <TabsList>
          <TabsTrigger value="waiting" count={pending.data?.length}>Waiting</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <QueryState
        query={query}
        loading={<SkeletonRows rows={6} />}
        isEmpty={(d) => !d || visible(d).length === 0}
        empty={
          <Card>
            <EmptyState mood="happy" title={tab === 'waiting' ? 'Nothing waiting for approval' : 'No decisions yet'}
                        body="Open a finding and choose Send for approval on its Fix tab to start one."
                        action={<Button asChild><Link to="/findings"><ShieldCheck /> Go to findings</Link></Button>} />
          </Card>
        }
      >
        {(rows) => <div className="grid gap-4">{visible(rows).map(r => <RequestCard key={r.id} r={r} onDone={refresh} />)}</div>}
      </QueryState>
    </Page>
  )
}
