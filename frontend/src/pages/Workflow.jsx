import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Clock, RotateCcw, Search, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { parseUtc } from '@/lib/time'
import { Page, PageHeader, Card, Button, Input, SeverityBadge, StatTile, EmptyState } from '@/components/ds'
import { MOCK_FINDINGS } from '../data/mockData'
import { emitEvent } from '../store/eventStore'
import { useSentinelStore } from '../store/sentinelStore'
import { listFindings } from '../api/nimbus'
import { useUsers } from '../hooks/queries'
import { useCan } from '../auth/authStore'

const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }
export const COLUMNS = [
  { id: 'open',     label: 'Open',            hint: 'Triaged, not started' },
  { id: 'review',   label: 'In Review',       hint: 'Owner assessing fix', wip: 3 },
  { id: 'dryrun',   label: 'Dry-Run Passed',  hint: 'Change validated safely' },
  { id: 'applied',  label: 'Applied',         hint: 'Fix deployed' },
  { id: 'verified', label: 'Verified',        hint: 'Rescan confirms closed' },
]
const SLA_HOURS = { CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 720 }
const TEAMS = ['secops-lead', 'platform-team', 'data-eng', 'cloud-infra']   // demo mode only
const UNASSIGNED = 'Unassigned'
const STORE_KEY = 'nimbus:workflow:v1'
const colIndex = id => COLUMNS.findIndex(c => c.id === id)

export function canMove(from, to) {
  const a = colIndex(from), b = colIndex(to)
  if (a < 0 || b < 0 || a === b) return false
  return b < a || b === a + 1
}

function seed(sourceArray, demo) {
  // Live: every card starts in Open, owned by whoever the finding is assigned to.
  // Demo: spread cards across columns and sample teams so the board looks used.
  const cols = ['open', 'open', 'review', 'open', 'dryrun', 'open', 'review', 'applied']
  return Object.fromEntries(sourceArray.map((f, i) => [f.id, {
    col: demo ? cols[i % cols.length] : (f.status === 'IN_PROGRESS' ? 'review' : 'open'),
    owner: demo ? TEAMS[i % TEAMS.length] : (f.assigned_to || UNASSIGNED), movedAt: Date.now(), closedAt: null,
  }]))
}

function sla(f, state, now) {
  const hours = SLA_HOURS[f.severity] ?? 168
  const start = (parseUtc(f.detected_at || f.created_at) || new Date()).getTime()
  const due = start + hours * 3600e3
  const end = state.closedAt || now
  const left = due - end
  const used = Math.min(1, Math.max(0, (end - start) / (due - start)))
  const fmt = ms => { const m = Math.round(Math.abs(ms) / 60000); return m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` }
  if (state.closedAt) return { text: `Closed ${left >= 0 ? 'within' : 'past'} SLA`, tone: left >= 0 ? 'ok' : 'breach', used }
  if (left < 0) return { text: `Overdue ${fmt(left)}`, tone: 'breach', used: 1 }
  return { text: `${fmt(left)} left`, tone: used > 0.75 ? 'warn' : 'ok', used }
}

export default function Workflow() {
  const { dataSource } = useSentinelStore()
  const users = useUsers()
  const triage = useCan('finding:triage')
  const owners = dataSource === 'demo' ? TEAMS : [UNASSIGNED, ...(users.data || []).filter(u => u.is_active).map(u => u.email)]
  const [findings, setFindings] = useState([])
  
  const [board, setBoard] = useState({})
  const [now, setNow] = useState(Date.now())
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [rejected, setRejected] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [sev, setSev] = useState('ALL')
  const [owner, setOwner] = useState('ALL')
  const [q, setQ] = useState('')
  const cardRefs = useRef({})

  const loadFindings = useCallback(async () => {
    let raw = MOCK_FINDINGS
    if (dataSource !== 'demo') {
      try {
        raw = await listFindings()
      } catch (e) {
        console.warn('[workflow] backend unreachable:', e?.message)
        raw = []
      }
    }
    setFindings(raw || [])
  }, [dataSource])

  useEffect(() => { loadFindings() }, [loadFindings])

  // sync board with new findings
  useEffect(() => {
    if (!findings.length) return
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (s && findings.every(f => s[f.id])) {
        setBoard(s)
        return
      }
    } catch { /* ignore */ }
    setBoard(seed(findings, dataSource === 'demo'))
  }, [findings, dataSource])

  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(board)) } catch { /* ignore */ } }, [board])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const byId = useMemo(() => Object.fromEntries(findings.map(f => [f.id, f])), [findings])
  
  const visible = findings.filter(f =>
    board[f.id] &&
    (sev === 'ALL' || f.severity === sev) &&
    (owner === 'ALL' || board[f.id].owner === owner) &&
    (!q || `${f.title} ${f.rule_id} ${f.resource_name}`.toLowerCase().includes(q.toLowerCase())))

  function move(id, to, { focus = false } = {}) {
    if (!board[id]) return
    if (!triage.allowed) { setAnnounce(`Can't move cards: ${triage.reason}`); return }
    const from = board[id].col
    const f = byId[id]
    if (!canMove(from, to)) {
      setRejected(id); setTimeout(() => setRejected(null), 600)
      const msg = colIndex(to) > colIndex(from) + 1
        ? `Can't skip steps: ${f.rule_id} must pass ${COLUMNS[colIndex(from) + 1].label} first.`
        : ''
      if (msg) setAnnounce(msg)
      return
    }
    const closing = to === 'verified'
    setBoard(b => ({ ...b, [id]: { ...b[id], col: to, movedAt: Date.now(), closedAt: closing ? Date.now() : null } }))
    const label = COLUMNS[colIndex(to)].label
    setAnnounce(`${f.rule_id} moved to ${label}.`)
    emitEvent({
      type: closing ? 'finding.resolved' : 'workflow.moved',
      severity: closing ? 'INFO' : f.severity,
      title: closing ? `${f.rule_id} verified fixed` : `${f.rule_id} → ${label}`,
      detail: f.title, link: '/workflow',
    })
    if (focus) requestAnimationFrame(() => cardRefs.current[id]?.focus())
  }

  const onKey = (e, id) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (!board[id]) return
    const i = colIndex(board[id].col) + (e.key === 'ArrowRight' ? 1 : -1)
    if (i >= 0 && i < COLUMNS.length) move(id, COLUMNS[i].id, { focus: true })
  }

  const counts = Object.fromEntries(COLUMNS.map(c => [c.id, findings.filter(f => board[f.id]?.col === c.id).length]))
  const overdue = findings.filter(f => board[f.id] && board[f.id].col !== 'verified' && sla(f, board[f.id], now).tone === 'breach').length
  const closed = findings.filter(f => board[f.id]?.closedAt)
  const reset = () => { setBoard(seed(findings, dataSource === 'demo')); setAnnounce('Board reset.') }

  const TONE = { ok: 'text-fg-3', warn: 'text-med-text', breach: 'text-crit-text' }
  const BAR = { ok: 'bg-fg-3', warn: 'bg-med', breach: 'bg-crit' }
  return (
    <Page wide>
      <PageHeader
        title="Remediation"
        description="Track fixes from triage to verified. Drag cards, or focus one and use ← →. Cards move forward one stage at a time, so a fix can’t skip its dry run."
        meta={<span>Board positions are saved in this browser.</span>}
        actions={<Button variant="ghost" onClick={reset}><RotateCcw /> Reset board</Button>}
      />
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="In progress" value={findings.length - (counts.verified || 0)} hint="not yet verified" />
          <StatTile label="Past SLA" value={overdue} tone={overdue ? 'critical' : 'low'} hint="overdue for their severity" />
          <StatTile label="Verified" value={closed.length} tone="low" hint="confirmed fixed" />
          <StatTile label="Closure rate" value={`${findings.length ? Math.round((closed.length / findings.length) * 100) : 0}%`} hint="of all findings" />
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
        {announce.startsWith("Can't") && <p role="status" className="rounded-md border border-med-line bg-med-soft px-3 py-2 text-sm text-med-text">{announce}</p>}

        <div className="grid auto-cols-[minmax(200px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((c, ci) => {
            const cards = visible.filter(f => board[f.id]?.col === c.id)
            const overWip = c.wip && counts[c.id] > c.wip
            const dropOk = dragId && board[dragId] && canMove(board[dragId].col, c.id)
            return (
              <section key={c.id}
                className={cn('flex max-h-[calc(100dvh-220px)] min-h-[420px] flex-col rounded-lg border bg-surface-2 transition-colors',
                  overCol === c.id ? (dropOk ? 'border-accent bg-accent-soft/40' : 'border-crit-line bg-crit-soft/40') : 'border-line')}
                onDragOver={e => { if (dragId) { e.preventDefault(); setOverCol(c.id) } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null) }}
                onDrop={e => { e.preventDefault(); if (dragId) move(dragId, c.id); setDragId(null); setOverCol(null) }}
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
                <div className="grid flex-1 content-start gap-2 overflow-y-auto px-2 pb-2">
                  {cards.length === 0 && (
                    <div className="grid h-20 place-items-center rounded-md border border-dashed border-line text-xs text-fg-3">{dragId ? 'Drop here' : 'Nothing here'}</div>
                  )}
                  {cards.map(f => {
                    const st = board[f.id]
                    const s = sla(f, st, now)
                    return (
                      <article key={f.id}
                        ref={el => { cardRefs.current[f.id] = el }}
                        draggable tabIndex={0}
                        onDragStart={e => { setDragId(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id) }}
                        onDragEnd={() => { setDragId(null); setOverCol(null) }}
                        onKeyDown={e => onKey(e, f.id)}
                        aria-label={`${f.rule_id}: ${f.title}. ${f.severity}. ${s.text}. Owner ${st.owner}. Use left and right arrows to move.`}
                        className={cn('group relative grid cursor-grab gap-2 overflow-hidden rounded-md border border-line bg-surface p-3 pl-3.5 shadow-raised transition-[transform,box-shadow,opacity] duration-150',
                          'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing',
                          dragId === f.id && 'opacity-50', rejected === f.id && 'animate-[shake_0.3s_ease-in-out]')}>
                        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', SEV_STRIPE[f.severity])} />
                        <div className="flex items-center justify-between gap-2">
                          <SeverityBadge severity={f.severity} size="sm" />
                          <span className="font-mono text-2xs text-fg-3">{f.rule_id}</span>
                        </div>
                        <p className="text-sm leading-5 font-medium text-fg">{f.title}</p>
                        <p className="truncate text-xs text-fg-3" title={f.resource_id}>{f.resource_name || f.resource_id}</p>
                        <div className={cn('flex items-center gap-2 text-xs', TONE[s.tone])}>
                          <Clock className="size-3.5" /> {s.text}
                          <span className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-muted-2"><span className={cn('block h-full', BAR[s.tone])} style={{ width: `${Math.round(s.used * 100)}%` }} /></span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                          <span className="truncate text-xs text-fg-2">{st.owner}</span>
                          <span className="flex gap-0.5">
                            <Button variant="ghost" size="icon-sm" aria-label="Move back" disabled={ci === 0} onClick={() => move(f.id, COLUMNS[ci - 1].id)}><ChevronLeft /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Move forward" disabled={ci === COLUMNS.length - 1} onClick={() => move(f.id, COLUMNS[ci + 1].id)}><ChevronRight /></Button>
                          </span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        {visible.length === 0 && findings.length > 0 && <Card><EmptyState compact mood="thinking" title="No cards match" body="Clear a filter to see the rest of the board." /></Card>}
        {findings.length === 0 && <Card><EmptyState mood="happy" title="Nothing to track" body="Findings from the latest scan appear here as cards." /></Card>}
      </div>
    </Page>
  )
}
