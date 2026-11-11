/*
  Remediation: one place to take a finding from "found" to "fixed".
  The board is read from the server, not stored in the browser, so it looks the same on every device:
    Open → In progress (someone owns it) → Awaiting approval (a fix request is pending) → Fixed.
  Cards move by hand only between Open and In progress; a request or an approval moves them further.
  Approvals and their history are tabs on the same page.
*/
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Clock, Search, Send, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { parseUtc } from '@/lib/time'
import {
  Page, PageHeader, Card, Button, Input, SeverityBadge, StatTile, EmptyState,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ds'
import ApprovalsPanel from '@/components/remediation/ApprovalsPanel'
import { MOCK_FINDINGS } from '../data/mockData'
import { emitEvent } from '../store/eventStore'
import { useSentinelStore } from '../store/sentinelStore'
import { updateFindingStatus, apiError } from '../api/nimbus'
import { useFindings, useRemediationRequests, useUsers } from '../hooks/queries'
import { useAuth, useCan } from '../auth/authStore'

const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }
export const COLUMNS = [
  { id: 'open',     label: 'Open',              hint: 'Found, nobody on it yet' },
  { id: 'progress', label: 'In progress',       hint: 'Someone owns the fix', wip: 5 },
  { id: 'approval', label: 'Awaiting approval', hint: 'Fix requested, needs a second person' },
  { id: 'fixed',    label: 'Fixed',             hint: 'Applied, or marked resolved' },
]
const SLA_HOURS = { CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 720 }
const UNASSIGNED = 'Unassigned'
const colIndex = id => COLUMNS.findIndex(c => c.id === id)
const keyOf = (rule, resource) => `${rule}|${resource}`

/* Only Open ⇄ In progress is a hand move; the rest follow requests and approvals. */
export function canMove(from, to) {
  return (from === 'open' && to === 'progress') || (from === 'progress' && to === 'open')
}

/* Where each card sits, worked out from findings + fix requests (the server's truth). */
export function buildBoard(findings, requests) {
  const pending = new Set(), applied = new Map()
  for (const r of requests || []) {
    const k = keyOf(r.rule_id, r.resource_id)
    if (r.status === 'PENDING') pending.add(k)
    if (r.status === 'APPLIED' && !applied.has(k)) applied.set(k, r)   // newest first from the API
  }
  const cards = []
  const seen = new Set()
  for (const f of findings || []) {
    if (f.status === 'ACCEPTED') continue                                 // accepted risk: not work to do
    const k = keyOf(f.rule_id, f.resource_id)
    seen.add(k)
    const col = f.status === 'RESOLVED' ? 'fixed'
      : pending.has(k) ? 'approval'
      : f.status === 'IN_PROGRESS' ? 'progress' : 'open'
    cards.push({ ...f, col, owner: f.assigned_to || UNASSIGNED, closedAt: f.resolved_at })
  }
  // A fix applied before the latest scan: the finding is gone from that scan, so show the request itself
  for (const [k, r] of applied) {
    if (seen.has(k)) continue
    cards.push({ id: `req-${r.id}`, request: true, rule_id: r.rule_id, title: r.title || r.rule_id, severity: r.severity || 'LOW',
                 resource_id: r.resource_id, resource_name: r.resource_name, detected_at: r.created_at,
                 col: 'fixed', owner: r.requested_by, closedAt: r.decided_at })
  }
  return cards
}

function sla(f, now) {
  const hours = SLA_HOURS[f.severity] ?? 168
  const start = (parseUtc(f.detected_at || f.created_at) || new Date()).getTime()
  const due = start + hours * 3600e3
  const closed = f.closedAt ? (parseUtc(f.closedAt)?.getTime() ?? now) : null
  const end = closed || now
  const left = due - end
  const used = Math.min(1, Math.max(0, (end - start) / (due - start)))
  const fmt = ms => { const m = Math.round(Math.abs(ms) / 60000); return m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` }
  if (closed) return { text: `Closed ${left >= 0 ? 'within' : 'past'} SLA`, tone: left >= 0 ? 'ok' : 'breach', used }
  if (left < 0) return { text: `Overdue ${fmt(left)}`, tone: 'breach', used: 1 }
  return { text: `${fmt(left)} left`, tone: used > 0.75 ? 'warn' : 'ok', used }
}

// Demo mode has no server: spread the sample findings over the board so it looks used
const DEMO_COLS = ['open', 'progress', 'open', 'approval', 'open', 'fixed', 'progress', 'open']
const DEMO_TEAMS = ['secops-lead', 'platform-team', 'data-eng', 'cloud-infra']

function Board() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const me = useAuth(s => s.user)
  const triage = useCan('finding:triage')
  const findingsQ = useFindings({ limit: 500 })
  const requestsQ = useRemediationRequests()
  const users = useUsers()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [demoMoves, setDemoMoves] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [sev, setSev] = useState('ALL')
  const [owner, setOwner] = useState('ALL')
  const [q, setQ] = useState('')
  const [now] = useState(() => Date.now())
  const cardRefs = useRef({})

  const cards = useMemo(() => {
    if (demo) return MOCK_FINDINGS.map((f, i) => ({ ...f, col: demoMoves[f.id] || DEMO_COLS[i % DEMO_COLS.length], owner: DEMO_TEAMS[i % DEMO_TEAMS.length] }))
    return buildBoard(findingsQ.data, requestsQ.data)
  }, [demo, demoMoves, findingsQ.data, requestsQ.data])

  const owners = demo ? DEMO_TEAMS : [UNASSIGNED, ...(users.data || []).filter(u => u.is_active).map(u => u.email)]
  const visible = cards.filter(f =>
    (sev === 'ALL' || f.severity === sev) &&
    (owner === 'ALL' || f.owner === owner) &&
    (!q || `${f.title} ${f.rule_id} ${f.resource_name}`.toLowerCase().includes(q.toLowerCase())))

  async function move(card, to, { focus = false } = {}) {
    if (card.col === to) return
    if (card.col === 'progress' && to === 'approval') {
      navigate(`/findings/${card.id}?tab=fix`)                          // requesting a fix happens on the finding
      return
    }
    if (!canMove(card.col, to)) {
      setAnnounce(to === 'fixed' ? `${card.rule_id} moves to Fixed when its fix is approved, or when it is marked resolved.`
        : to === 'approval' ? `Start ${card.rule_id} first, then request a fix from the finding.`
        : `${card.rule_id} can't go back while a fix request is waiting or done.`)
      return
    }
    if (!triage.allowed) { setAnnounce(`Can't move cards: ${triage.reason}`); return }
    const label = COLUMNS[colIndex(to)].label
    if (demo) {
      setDemoMoves(m => ({ ...m, [card.id]: to }))
    } else {
      setBusyId(card.id)
      try {
        // Starting work takes ownership if nobody has it yet
        const assignee = to === 'progress' && card.owner === UNASSIGNED ? me?.email : undefined
        await updateFindingStatus(card.id, to === 'progress' ? 'IN_PROGRESS' : 'OPEN', assignee)
        await qc.invalidateQueries({ queryKey: ['findings'] })
      } catch (err) {
        toast.error(`Couldn't move ${card.rule_id}`, { description: apiError(err) })
        return
      } finally {
        setBusyId(null)
      }
    }
    setAnnounce(`${card.rule_id} moved to ${label}.`)
    emitEvent({ type: 'workflow.moved', severity: card.severity, title: `${card.rule_id} → ${label}`, detail: card.title, link: '/workflow' })
    if (focus) requestAnimationFrame(() => cardRefs.current[card.id]?.focus())
  }

  const onKey = (e, card) => {
    if (e.key === 'Enter' && !card.request) { navigate(`/findings/${card.id}`); return }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = colIndex(card.col) + (e.key === 'ArrowRight' ? 1 : -1)
    if (i >= 0 && i < COLUMNS.length) move(card, COLUMNS[i].id, { focus: true })
  }

  const counts = Object.fromEntries(COLUMNS.map(c => [c.id, cards.filter(f => f.col === c.id).length]))
  const notFixed = cards.length - counts.fixed
  const overdue = cards.filter(f => f.col !== 'fixed' && sla(f, now).tone === 'breach').length
  const loading = !demo && (findingsQ.isLoading || requestsQ.isLoading)

  const TONE = { ok: 'text-fg-3', warn: 'text-med-text', breach: 'text-crit-text' }
  const BAR = { ok: 'bg-fg-3', warn: 'bg-med', breach: 'bg-crit' }
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Still to fix" value={loading ? '—' : notFixed} hint="open, in progress or awaiting approval" />
        <StatTile label="Past SLA" value={loading ? '—' : overdue} tone={overdue ? 'critical' : 'low'} hint="overdue for their severity" />
        <StatTile label="Awaiting approval" value={loading ? '—' : counts.approval} tone={counts.approval ? 'medium' : undefined} hint="need a second person" />
        <StatTile label="Fixed" value={loading ? '—' : counts.fixed} tone="low" hint="applied or resolved" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64"><Input icon={Search} value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by rule, title or resource" aria-label="Filter cards" /></div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity filter">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(v => (
            <button key={v} type="button" onClick={() => setSev(v)} aria-pressed={sev === v}
                    className={cn('h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                      sev === v ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg')}>
              {v === 'ALL' ? 'All' : v[0] + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-fg-2">
          <Users className="size-4 text-fg-3" />
          <select value={owner} onChange={e => setOwner(e.target.value)} aria-label="Owner filter"
                  className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none">
            <option value="ALL">All owners</option>
            {owners.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <div className="sr-only" aria-live="assertive">{announce}</div>
      {announce && !announce.includes('moved to') && <p role="status" className="rounded-md border border-med-line bg-med-soft px-3 py-2 text-sm text-med-text">{announce}</p>}

      <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((c) => {
          const colCards = visible.filter(f => f.col === c.id)
          const overWip = c.wip && counts[c.id] > c.wip
          const drag = cards.find(f => f.id === dragId)
          const dropOk = drag && (canMove(drag.col, c.id) || (drag.col === 'progress' && c.id === 'approval'))
          return (
            <section key={c.id}
              className={cn('flex max-h-[calc(100dvh-220px)] min-h-[420px] flex-col rounded-lg border bg-surface-2 transition-colors',
                overCol === c.id ? (dropOk ? 'border-accent bg-accent-soft/40' : 'border-crit-line bg-crit-soft/40') : 'border-line')}
              onDragOver={e => { if (dragId) { e.preventDefault(); setOverCol(c.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null) }}
              onDrop={e => { e.preventDefault(); if (drag) move(drag, c.id); setDragId(null); setOverCol(null) }}
              aria-label={`${c.label} column, ${counts[c.id] || 0} cards`}>
              <header className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{c.label}</span>
                  <span className={cn('num rounded-xs px-1.5 text-2xs font-medium', overWip ? 'bg-crit-soft text-crit-text' : 'bg-muted-2 text-fg-2')}
                        title={c.wip ? `Work-in-progress limit ${c.wip}` : undefined}>
                    {counts[c.id] || 0}{c.wip ? ` / ${c.wip}` : ''}
                  </span>
                </div>
                <p className={cn('mt-0.5 text-xs', overWip ? 'text-crit-text' : 'text-fg-3')}>{overWip ? 'Over the limit — finish before starting more' : c.hint}</p>
              </header>
              {/* auto-rows-max: cards are overflow-hidden, so auto rows would shrink them to fit instead of scrolling */}
              <div className="grid flex-1 auto-rows-max content-start gap-2 overflow-y-auto px-2 pb-2">
                {loading && <div className="h-28 animate-pulse rounded-md bg-muted" />}
                {!loading && colCards.length === 0 && (
                  <div className="grid h-20 place-items-center rounded-md border border-dashed border-line text-xs text-fg-3">{dragId ? 'Drop here' : 'Nothing here'}</div>
                )}
                {colCards.map(f => {
                  const s = sla(f, now)
                  const handMove = c.id === 'open' || c.id === 'progress'
                  return (
                    <article key={f.id}
                      ref={el => { cardRefs.current[f.id] = el }}
                      draggable={handMove} tabIndex={0}
                      onDragStart={e => { setDragId(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id) }}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onKeyDown={e => onKey(e, f)}
                      aria-label={`${f.rule_id}: ${f.title}. ${f.severity}. ${s.text}. Owner ${f.owner}.${handMove ? ' Use left and right arrows to move.' : ''} Enter opens the finding.`}
                      className={cn('group relative grid gap-2 overflow-hidden rounded-md border border-line bg-surface p-3 pl-3.5 shadow-raised transition-[transform,box-shadow,opacity] duration-150',
                        'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent',
                        handMove && 'cursor-grab active:cursor-grabbing',
                        (dragId === f.id || busyId === f.id) && 'opacity-50')}>
                      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', SEV_STRIPE[f.severity])} />
                      <div className="flex items-center justify-between gap-2">
                        <SeverityBadge severity={f.severity} size="sm" />
                        <span className="font-mono text-2xs text-fg-3">{f.rule_id}</span>
                      </div>
                      {f.request
                        ? <p className="text-sm leading-5 font-medium text-fg">{f.title}</p>
                        : <Link to={`/findings/${f.id}`} tabIndex={-1} className="text-sm leading-5 font-medium text-fg hover:underline">{f.title}</Link>}
                      <p className="truncate text-xs text-fg-3" title={f.resource_id}>{f.resource_name || f.resource_id}</p>
                      <div className={cn('flex items-center gap-2 text-xs', TONE[s.tone])}>
                        <Clock className="size-3.5" /> {s.text}
                        <span className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-muted-2"><span className={cn('block h-full', BAR[s.tone])} style={{ width: `${Math.round(s.used * 100)}%` }} /></span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                        <span className="truncate text-xs text-fg-2">{f.owner}</span>
                        {c.id === 'open' && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busyId === f.id} onClick={() => move(f, 'progress')}>Start <ChevronRight /></Button>
                        )}
                        {c.id === 'progress' && (
                          <span className="flex gap-0.5">
                            <Button variant="ghost" size="icon-sm" aria-label="Move back to Open" disabled={busyId === f.id} onClick={() => move(f, 'open')}><ChevronLeft /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => move(f, 'approval')}><Send /> Request fix</Button>
                          </span>
                        )}
                        {c.id === 'approval' && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild><Link to="/workflow?tab=approvals"><ShieldCheck /> Review</Link></Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      {!loading && visible.length === 0 && cards.length > 0 && <Card><EmptyState compact mood="thinking" title="No cards match" body="Clear a filter to see the rest of the board." /></Card>}
      {!loading && cards.length === 0 && <Card><EmptyState mood="happy" title="Nothing to track" body="Findings from the latest scan appear here as cards." /></Card>}
    </div>
  )
}

const TABS = ['board', 'approvals', 'history']

export default function Workflow() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'board'
  const pending = useRemediationRequests('PENDING')
  return (
    <Page wide>
      <PageHeader
        title="Remediation"
        description="Every finding from found to fixed. Start one to take ownership, request a fix from the finding, and a second person approves it before AWS changes."
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'board' ? {} : { tab: v })}>
        <TabsList className="mb-5">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="approvals" count={pending.data?.length}>Approvals</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="focus:outline-none"><Board /></TabsContent>
        <TabsContent value="approvals" className="focus:outline-none"><ApprovalsPanel view="waiting" /></TabsContent>
        <TabsContent value="history" className="focus:outline-none"><ApprovalsPanel view="history" /></TabsContent>
      </Tabs>
    </Page>
  )
}
