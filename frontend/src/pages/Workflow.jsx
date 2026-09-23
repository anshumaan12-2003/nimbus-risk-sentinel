import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import Clock from 'lucide-react/dist/esm/icons/clock'
import KanbanSquare from 'lucide-react/dist/esm/icons/kanban-square'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw'
import Search from 'lucide-react/dist/esm/icons/search'
import Users from 'lucide-react/dist/esm/icons/users'
import { MOCK_FINDINGS } from '../data/mockData'
import { emitEvent } from '../store/eventStore'
import EmptyState from '../components/EmptyState'
import { useSentinelStore } from '../store/sentinelStore'
import { listFindings } from '../api/nimbus'
import { useUsers } from '../hooks/queries'
import { useCan } from '../auth/authStore'

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
  const start = new Date(f.created_at || Date.now()).getTime()
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
    if (closing) window.dispatchEvent(new CustomEvent('nimbus:celebrate'))
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

  return (
    <div className="workflow-page">
      <div className="page-hero">
        <div className="page-eyebrow"><KanbanSquare size={11} /> Remediation workflow</div>
        <h1 className="page-title">Remediation Board</h1>
        <p className="page-subtitle">
          Drag cards between stages, or focus one and use <kbd>←</kbd> <kbd>→</kbd>. Forward moves go one stage at a time — fixes can't skip their dry-run.
        </p>
      </div>

      <div className="wf-stats">
        <div className="wf-stat"><span className="wf-stat-num">{findings.length - (counts.verified || 0)}</span><span className="wf-stat-label">In progress</span></div>
        <div className={`wf-stat ${overdue ? 'is-bad' : ''}`}><span className="wf-stat-num">{overdue}</span><span className="wf-stat-label">Past SLA</span></div>
        <div className="wf-stat"><span className="wf-stat-num">{closed.length}</span><span className="wf-stat-label">Verified</span></div>
        <div className="wf-stat"><span className="wf-stat-num">{findings.length ? Math.round((closed.length / findings.length) * 100) : 0}%</span><span className="wf-stat-label">Closure rate</span></div>
      </div>

      <div className="wf-toolbar">
        <div className="filter-search-box" style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={13} color="var(--text-4)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by rule, title or resource…" aria-label="Filter cards" />
        </div>
        <div className="wf-chips" role="group" aria-label="Severity filter">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
            <button key={s} className={`filter-chip ${sev === s ? 'active' : ''}`} onClick={() => setSev(s)}>{s === 'ALL' ? 'All' : s}</button>
          ))}
        </div>
        <label className="wf-owner">
          <Users size={13} />
          <select className="input" value={owner} onChange={e => setOwner(e.target.value)} aria-label="Owner filter">
            <option value="ALL">All owners</option>
            {owners.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" onClick={reset}><RotateCcw size={13} /> Reset</button>
      </div>

      <div className="sr-only" aria-live="assertive">{announce}</div>
      {announce.startsWith("Can't") && <div className="wf-rule-hint" role="status">{announce}</div>}

      <div className="wf-board">
        {COLUMNS.map((c, ci) => {
          const cards = visible.filter(f => board[f.id]?.col === c.id)
          const overWip = c.wip && counts[c.id] > c.wip
          const dropOk = dragId && board[dragId] && canMove(board[dragId].col, c.id)
          return (
            <section key={c.id}
              className={`wf-col col-${c.id} ${overCol === c.id ? (dropOk ? 'drop-ok' : 'drop-no') : ''}`}
              onDragOver={e => { if (dragId) { e.preventDefault(); setOverCol(c.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null) }}
              onDrop={e => { e.preventDefault(); if (dragId) move(dragId, c.id); setDragId(null); setOverCol(null) }}
              aria-label={`${c.label} column, ${counts[c.id] || 0} cards`}>
              <header className="wf-col-head">
                <span className="wf-col-dot" />
                <span className="wf-col-title">{c.label}</span>
                <span className={`wf-col-count ${overWip ? 'over' : ''}`} title={c.wip ? `WIP limit ${c.wip}` : undefined}>
                  {counts[c.id] || 0}{c.wip ? `/${c.wip}` : ''}
                </span>
              </header>
              <div className="wf-col-hint">{overWip ? 'Over WIP limit — finish before starting more' : c.hint}</div>
              <div className="wf-cards">
                {cards.length === 0 && <div className="wf-empty">{dragId ? 'Drop here' : 'Nothing here'}</div>}
                {cards.map(f => {
                  const st = board[f.id]
                  const s = sla(f, st, now)
                  return (
                    <article key={f.id}
                      ref={el => { cardRefs.current[f.id] = el }}
                      className={`wf-card sev-${f.severity.toLowerCase()} ${dragId === f.id ? 'dragging' : ''} ${rejected === f.id ? 'rejected' : ''}`}
                      draggable tabIndex={0}
                      onDragStart={e => { setDragId(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id) }}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onKeyDown={e => onKey(e, f.id)}
                      aria-label={`${f.rule_id}: ${f.title}. ${f.severity}. ${s.text}. Owner ${st.owner}. Use left and right arrows to move.`}>
                      <div className="wf-card-top">
                        <span className={`badge badge-${f.severity.toLowerCase()}`}>{f.severity}</span>
                        <span className="wf-rule">{f.rule_id}</span>
                      </div>
                      <div className="wf-card-title">{f.title}</div>
                      <div className="wf-card-res" title={f.resource_id}>{f.resource_name || f.resource_id}</div>
                      <div className={`wf-sla tone-${s.tone}`}>
                        <Clock size={11} /> {s.text}
                        <span className="wf-sla-bar"><span style={{ width: `${Math.round(s.used * 100)}%` }} /></span>
                      </div>
                      <div className="wf-card-foot">
                        <span className="wf-owner-chip">{st.owner}</span>
                        <span className="wf-move">
                          <button aria-label="Move back" disabled={ci === 0} onClick={() => move(f.id, COLUMNS[ci - 1].id)}><ChevronLeft size={13} /></button>
                          <button aria-label="Move forward" disabled={ci === COLUMNS.length - 1} onClick={() => move(f.id, COLUMNS[ci + 1].id)}><ChevronRight size={13} /></button>
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
      {visible.length === 0 && <EmptyState mood="thinking" title="No cards match" description="Clear a filter to see the rest of the board." />}
    </div>
  )
}
