import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import GitCommit from 'lucide-react/dist/esm/icons/git-commit-horizontal'
import Radar from 'lucide-react/dist/esm/icons/radar'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import X from 'lucide-react/dist/esm/icons/x'
import Zap from 'lucide-react/dist/esm/icons/zap'
import { useEventStore } from '../store/eventStore'
import { MOCK_FINDINGS } from '../data/mockData'
import { useSentinelStore } from '../store/sentinelStore'
import { useAuth } from '../auth/authStore'
import { wsUrl } from '../api/nimbus'
import { queryClient, qk } from '../lib/queryClient'
const CONNECT_TIMEOUT = 3000
const RETRY_LIVE_EVERY = 30000

/* Simulated feed — plausible events built from the demo findings.
   Only runs when the real socket is unavailable, and every event is
   tagged source:'simulated' so the UI can say so. */
const pick = a => a[Math.floor(Math.random() * a.length)]
const TEMPLATES = [
  () => { const f = pick(MOCK_FINDINGS); return { type: 'finding.new', severity: f.severity, title: `New finding: ${f.title}`, detail: `${f.rule_id} · ${f.resource_name || f.resource_id}`, link: '/findings' } },
  () => { const f = pick(MOCK_FINDINGS); return { type: 'finding.resolved', severity: 'INFO', title: `${f.rule_id} verified fixed`, detail: f.resource_name || f.resource_id, link: '/workflow' } },
  () => ({ type: 'drift.detected', severity: pick(['HIGH', 'MEDIUM']), title: 'Configuration drift detected', detail: pick(['sg-0a8bf7913c4de01f2 ingress widened', 'Bucket policy changed on prod-app-assets-cdn', 'IAM policy DataOpsPipeline gained s3:*']), link: '/drift' }),
  () => ({ type: 'scan.completed', severity: 'INFO', title: 'Fleet scan completed', detail: `${120 + Math.floor(Math.random() * 40)} assets · ${3 + Math.floor(Math.random() * 6)} regions`, link: '/scans' }),
  () => ({ type: 'remediation.applied', severity: 'INFO', title: 'Auto-remediation applied', detail: pick(['S3 public access block enabled', 'IMDSv2 enforced on api-worker-03', 'SSH ingress restricted to VPN CIDR']), link: '/workflow' }),
]

export const EVENT_META = {
  'finding.new':          { icon: AlertTriangle, tone: 'critical' },
  'finding.resolved':     { icon: CheckCircle2,  tone: 'low' },
  'drift.detected':       { icon: GitCommit,     tone: 'high' },
  'scan.started':         { icon: Radar,         tone: 'brand' },
  'scan.completed':       { icon: Radar,         tone: 'brand' },
  'scan.failed':          { icon: AlertTriangle, tone: 'high' },
  'remediation.applied':  { icon: ShieldCheck,   tone: 'low' },
  'remediation.requested': { icon: ShieldCheck,  tone: 'medium' },
  'remediation.rejected': { icon: X,             tone: 'high' },
  'workflow.moved':       { icon: Zap,           tone: 'brand' },
  'simulation.contained': { icon: ShieldCheck,   tone: 'low' },
}
export const toneFor = e => (e.type === 'finding.new' || e.type === 'drift.detected' || e.type === 'scan.failed')
  ? (e.severity || 'HIGH').toLowerCase()
  : (EVENT_META[e.type]?.tone || 'brand')

/* Connection manager: real WebSocket first, simulated fallback,
   periodic retry to upgrade back to live. Mounted once in App. */
/* scan.progress arrives several times a second while scanning: it updates the progress cache,
   never the notification feed. */
function applyProgress(e) {
  const p = e.progress
  if (!p || !e.scan_id) return
  queryClient.setQueryData(qk.scanProgress(e.scan_id), p)
  queryClient.setQueryData(qk.activeScan, (old) => (old && old.id === e.scan_id ? { ...old, progress: p } : old))
}

export function LiveStreamConnector() {
  const { push, setMode } = useEventStore.getState()
  // Reconnect whenever the session changes (sign-in, refresh after expiry, sign-out)
  const signedIn = useAuth(s => s.status === 'signed-in')
  useEffect(() => {
    if (!signedIn) return
    let ws, simTimer, retryTimer, connectTimer, disposed = false

    // First event arrives quickly so a fresh load doesn't feel dead;
    // after that, a calmer 9–17s cadence.
    let simStarted = false
    const scheduleSim = () => {
      clearTimeout(simTimer)
      const delay = simStarted ? 9000 + Math.random() * 8000 : 2000 + Math.random() * 2000
      simStarted = true
      simTimer = setTimeout(() => {
        const { paused } = useEventStore.getState()
        if (!paused && !document.hidden) push({ ...pick(TEMPLATES)(), source: 'simulated' })
        scheduleSim()
      }, delay)
    }
    const fallBack = () => {
      if (disposed) return
      // Only invent events in demo mode. In live mode a dead socket shows as
      // "offline" and we keep retrying — never fake activity.
      if (useSentinelStore.getState().dataSource === 'demo') { setMode('simulated'); scheduleSim() }
      else setMode('offline')
      clearTimeout(retryTimer); retryTimer = setTimeout(connect, RETRY_LIVE_EVERY)
    }
    function connect() {
      if (disposed) return
      const token = useAuth.getState().token
      if (!token && useSentinelStore.getState().dataSource !== 'demo') return fallBack()
      try { ws = new WebSocket(wsUrl(token)) } catch { return fallBack() }
      connectTimer = setTimeout(() => { try { ws.close() } catch { /* noop */ } }, CONNECT_TIMEOUT)
      ws.onopen = () => { clearTimeout(connectTimer); clearTimeout(simTimer); setMode('live') }
      ws.onmessage = msg => {
        if (useEventStore.getState().paused) return
        let e
        try { e = JSON.parse(msg.data) } catch { return }
        if (e.type === 'scan.progress') return applyProgress(e)
        push({ ...e, source: 'live' })
      }
      ws.onclose = (ev) => {
        clearTimeout(connectTimer)
        // 4401 = token expired/revoked: refresh it and reconnect straight away
        if (ev.code === 4401 && !disposed) {
          return useAuth.getState().refresh().then(t => (t ? connect() : fallBack()))
        }
        fallBack()
      }
      ws.onerror = () => { /* onclose follows */ }
    }
    connect()
    return () => { disposed = true; clearTimeout(simTimer); clearTimeout(retryTimer); clearTimeout(connectTimer); try { ws?.close() } catch { /* noop */ } }
  }, [push, setMode, signedIn])
  return null
}

/* Toasts — bottom-left (Copilot owns bottom-right). Skips your own
   actions (you already saw them happen) and pauses dismissal on hover. */
export function LiveToasts() {
  const events = useEventStore(s => s.events)
  const [shown, setShown] = useState([])
  const seen = useRef(new Set())
  const timers = useRef({})
  const navigate = useNavigate()

  const dismiss = id => { clearTimeout(timers.current[id]); setShown(s => s.filter(t => t.id !== id)) }
  const arm = id => { clearTimeout(timers.current[id]); timers.current[id] = setTimeout(() => dismiss(id), 6500) }

  useEffect(() => {
    const fresh = events.filter(e => !seen.current.has(e.id))
    fresh.forEach(e => seen.current.add(e.id))
    const toastable = fresh.filter(e => e.source !== 'you')
    if (!toastable.length) return
    setShown(s => [...toastable.reverse(), ...s].slice(0, 3))
    toastable.forEach(e => arm(e.id))
  }, [events])

  return (
    <div className="live-toasts" aria-live="polite" aria-label="Live security events">
      {shown.map(e => {
        const Icon = EVENT_META[e.type]?.icon || Zap
        return (
          <div key={e.id} className={`live-toast tone-${toneFor(e)}`}
               onMouseEnter={() => clearTimeout(timers.current[e.id])} onMouseLeave={() => arm(e.id)}>
            <button className="live-toast-body" onClick={() => { if (e.link) navigate(e.link); dismiss(e.id) }}>
              <span className="live-toast-icon"><Icon size={14} /></span>
              <span className="live-toast-text">
                <span className="live-toast-title">{e.title}</span>
                {e.detail && <span className="live-toast-detail">{e.detail}</span>}
              </span>
            </button>
            {e.source === 'simulated' && <span className="live-toast-tag">SIM</span>}
            <button className="live-toast-close" onClick={() => dismiss(e.id)} aria-label="Dismiss"><X size={12} /></button>
          </div>
        )
      })}
    </div>
  )
}

/* Header status pill: tells the truth about where events come from. */
export function LiveStatusPill() {
  const { mode, paused, togglePause } = useEventStore()
  const label = paused ? 'Paused' : mode === 'live' ? 'Live' : mode === 'simulated' ? 'Simulated feed' : 'Connecting…'
  const title = mode === 'simulated'
    ? `No event socket — showing simulated events. Click to ${paused ? 'resume' : 'pause'}.`
    : `Click to ${paused ? 'resume' : 'pause'} the event stream`
  return (
    <button className={`live-status-pill mode-${paused ? 'paused' : mode}`} onClick={togglePause} title={title} aria-pressed={paused}>
      <span className="live-status-dot" />
      {label}
    </button>
  )
}
