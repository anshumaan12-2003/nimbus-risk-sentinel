import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Crosshair from 'lucide-react/dist/esm/icons/crosshair'
import Database from 'lucide-react/dist/esm/icons/database'
import Globe from 'lucide-react/dist/esm/icons/globe'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import Lock from 'lucide-react/dist/esm/icons/lock'
import Network from 'lucide-react/dist/esm/icons/network'
import Play from 'lucide-react/dist/esm/icons/play'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw'
import Scissors from 'lucide-react/dist/esm/icons/scissors'
import Server from 'lucide-react/dist/esm/icons/server'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import Wand2 from 'lucide-react/dist/esm/icons/wand-2'
import Zap from 'lucide-react/dist/esm/icons/zap'
import { ENV_NODES, ENV_EDGES, LAYERS, bfs, pathTo, crownsReached, greedyFixPlan } from '../data/cloudEnvironment'
import { MOCK_FINDINGS } from '../data/mockData'
import { emitEvent } from '../store/eventStore'
import Mascot from '../components/Mascot'
import { useSentinelStore } from '../store/sentinelStore'
import { listFindings, getAttackEnvironment } from '../api/nimbus'
import { EMPTY_ENV } from '../data/empty'

const ICONS = { globe: Globe, bucket: HardDrive, network: Network, server: Server, zap: Zap, key: KeyRound, lock: Lock, database: Database }
const W = 1100, H = 540, NW = 176, NH = 52
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s
const STEP_MS = 650
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Column layout: x by layer, y spread evenly within the layer
function layout(nodes) {
  const byLayer = LAYERS.map((_, l) => nodes.filter(n => n.layer === l))
  const pos = {}
  byLayer.forEach((list, l) => list.forEach((n, i) => {
    pos[n.id] = { x: 100 + l * ((W - 200) / (LAYERS.length - 1)), y: (H / (list.length + 1)) * (i + 1) }
  }))
  return pos
}
function edgeGeom(a, b) {
  if (b.x > a.x) {
    const sx = a.x + NW / 2, tx = b.x - NW / 2, dx = Math.max(40, (tx - sx) * 0.45)
    const p = [[sx, a.y], [sx + dx, a.y], [tx - dx, b.y], [tx, b.y]]
    return { d: `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`, mid: bezierMid(p) }
  }
  // backward edge (e.g. role → EKS): loop underneath
  const p = [[a.x, a.y + NH / 2], [a.x, a.y + 120], [b.x, b.y + 120], [b.x, b.y + NH / 2]]
  return { d: `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`, mid: bezierMid(p) }
}
function bezierMid(p) {
  const c = [0.125, 0.375, 0.375, 0.125]
  return [c.reduce((s, k, i) => s + k * p[i][0], 0), c.reduce((s, k, i) => s + k * p[i][1], 0)]
}

export default function AttackSimulator() {
  const { dataSource } = useSentinelStore()
  const [findings, setFindings] = useState([])

  // Graph: demo = static sample; live = built server-side from the latest scan's real inventory
  const [env, setEnv] = useState({ nodes: ENV_NODES, edges: ENV_EDGES })
  const [envError, setEnvError] = useState(null)

  const loadFindings = useCallback(async () => {
    if (dataSource === 'demo') {
      setFindings(MOCK_FINDINGS); setEnv({ nodes: ENV_NODES, edges: ENV_EDGES }); setEnvError(null)
      return
    }
    try {
      const [raw, live] = await Promise.all([listFindings(), getAttackEnvironment()])
      setFindings(raw || [])
      setEnv(live?.nodes ? live : EMPTY_ENV)
      setEnvError(live?.message || null)
    } catch (e) {
      setFindings([]); setEnv(EMPTY_ENV); setEnvError('Backend unreachable — start the API and run a scan.')
    }
  }, [dataSource])

  useEffect(() => { loadFindings() }, [loadFindings])
  const envNodes = env.nodes
  const envEdges = env.edges

  const [entry, setEntry] = useState('internet')
  const [severed, setSevered] = useState(() => new Set())
  const [reveal, setReveal] = useState(Infinity)     // highest hop currently shown
  const [running, setRunning] = useState(false)
  const [focusEdge, setFocusEdge] = useState(null)
  const [focusCrown, setFocusCrown] = useState(null)
  const timer = useRef(null)
  const wasExposed = useRef(true)

  const pos = useMemo(() => layout(envNodes), [envNodes])
  const nodeById = useMemo(() => Object.fromEntries(envNodes.map(n => [n.id, n])), [envNodes])
  const edgeById = useMemo(() => Object.fromEntries(envEdges.map(e => [e.id, e])), [envEdges])
  const findingById = useMemo(() => Object.fromEntries(findings.map(f => [f.id, f])), [findings])

  const result = useMemo(() => bfs(entry, severed, envEdges), [entry, severed, envEdges])
  const baseline = useMemo(() => bfs(entry, new Set(), envEdges), [entry, envEdges])
  const crowns = useMemo(() => crownsReached(entry, severed, envNodes, envEdges), [entry, severed, envNodes, envEdges])
  const plan = useMemo(() => greedyFixPlan(entry, severed, envNodes, envEdges), [entry, severed, envNodes, envEdges])
  const totalCrowns = envNodes.filter(n => n.crown).length
  const reachable = Object.keys(result.hop).length - 1
  const baseReach = Object.keys(baseline.hop).length - 1
  const maxDepth = result.levels.length - 1
  const shownHop = id => id in result.hop && result.hop[id] <= reveal
  const treeEdges = new Set(Object.values(result.via))
  const pathEdges = new Set(focusCrown && focusCrown in result.hop ? pathTo(focusCrown, result.via, envEdges) : [])

  const run = () => {
    clearInterval(timer.current)
    if (reduceMotion()) { setReveal(Infinity); return }
    setRunning(true); setReveal(0)
    let h = 0
    timer.current = setInterval(() => {
      h += 1; setReveal(h)
      if (h >= maxDepth) { clearInterval(timer.current); setRunning(false); setTimeout(() => setReveal(Infinity), STEP_MS) }
    }, STEP_MS)
  }
  useEffect(() => { run(); return () => clearInterval(timer.current) }, [])   // play once on open

  // Announce containment exactly once when the last crown jewel is cut off
  useEffect(() => {
    const exposed = crowns.length > 0
    if (wasExposed.current && !exposed) {
      window.dispatchEvent(new CustomEvent('nimbus:celebrate'))
      emitEvent({ type: 'simulation.contained', severity: 'INFO', title: 'Simulation: all crown jewels contained', detail: `${severed.size} fix${severed.size === 1 ? '' : 'es'} from ${nodeById[entry].short}`, link: '/simulator' })
    }
    wasExposed.current = exposed
  }, [crowns.length])

  const toggleEdge = id => {
    if (running || edgeById[id].fixable === false) return
    setSevered(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    setReveal(Infinity)
  }
  const applyPlan = () => {
    if (!plan.length) return
    plan.forEach((p, i) => setTimeout(() => setSevered(s => new Set([...s, p.edgeId])), reduceMotion() ? 0 : i * 450))
  }
  const reset = () => { clearInterval(timer.current); setRunning(false); setSevered(new Set()); setEntry('internet'); setFocusCrown(null); setReveal(Infinity) }
  const pickEntry = id => { if (running || nodeById[id].crown) return; setEntry(id); setFocusCrown(null); setReveal(Infinity) }

  // New graph (demo<->live, or a fresh scan): reset simulation state
  useEffect(() => {
    setSevered(new Set()); setFocusCrown(null); setEntry('internet')
    wasExposed.current = crownsReached('internet', new Set(), envNodes, envEdges).length > 0
  }, [env])

  if (!nodeById[entry]) {
    return (
      <div className="animate-fade-in" style={{ padding: 24 }}>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>No attack graph yet</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {envError || 'Run a scan: the simulator is built from your real AWS inventory (EC2, IAM roles, S3, RDS, Lambda, DynamoDB, Secrets).'}
          </p>
        </div>
      </div>
    )
  }
  if (envNodes.length <= 1) {
    return (
      <div className="animate-fade-in" style={{ padding: 24 }}>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>No exposed paths found</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Nothing in the latest scan is reachable from the internet, and no data store is reachable through IAM. That is the goal.</p>
        </div>
      </div>
    )
  }

  const mood = running ? 'thinking' : crowns.length === 0 ? 'happy' : crowns.length === totalCrowns ? 'alarmed' : 'calm'
  const fe = focusEdge && edgeById[focusEdge]

  return (
    <div className="sim-page">
      <div className="page-hero sim-hero">
        <div>
          <div className="page-eyebrow"><Crosshair size={11} /> Threat simulation</div>
          <h1 className="page-title">Attack-Path Simulator</h1>
          <p className="page-subtitle">
            Click a node to <strong>assume breach</strong> there. Click an edge to <strong>sever</strong> it, as if you'd fixed it. Nimbus recomputes the blast radius as you go.
          </p>
        </div>
        <div className="mascot-say">
          <Mascot mood={mood} size={72} />
          <div className="speech-bubble">
            {running ? <>Tracing every path from <strong>{nodeById[entry].short}</strong>…</>
              : crowns.length === 0 ? <>Contained. No crown jewel is reachable from <strong>{nodeById[entry].short}</strong>.</>
              : <><strong>{crowns.length} of {totalCrowns}</strong> crown jewels reachable. {plan.length ? `${plan.length} fix${plan.length === 1 ? '' : 'es'} would close them all.` : 'No fixable edge closes the rest.'}</>}
          </div>
        </div>
      </div>

      <div className="sim-layout">
        <div className="card sim-canvas-card">
          <div className="sim-controls">
            <button className="btn btn-primary btn-sm" onClick={run} disabled={running}><Play size={13} /> {running ? 'Simulating…' : 'Run simulation'}</button>
            <button className="btn btn-secondary btn-sm" onClick={applyPlan} disabled={running || !plan.length}><Wand2 size={13} /> Apply fix plan</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}><RotateCcw size={13} /> Reset</button>
            <label className="sim-entry">
              Entry point
              <select className="input" value={entry} onChange={e => pickEntry(e.target.value)} disabled={running}>
                {envNodes.filter(n => !n.crown).map(n => <option key={n.id} value={n.id}>{n.short} · {n.kind}</option>)}
              </select>
            </label>
          </div>

          <div className="sim-svg-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg" role="img" aria-label="Attack graph. Use the fix list beside it for keyboard control.">
              <defs>
                <marker id="sim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" /></marker>
              </defs>
              {LAYERS.map((l, i) => (
                <text key={l} className="sim-layer-label" x={100 + i * ((W - 200) / (LAYERS.length - 1))} y={22} textAnchor="middle">{l.toUpperCase()}</text>
              ))}

              {envEdges.map(e => {
                const g = edgeGeom(pos[e.from], pos[e.to])
                const cut = severed.has(e.id)
                const live = !cut && shownHop(e.from) && shownHop(e.to) && treeEdges.has(e.id) && result.hop[e.to] <= reveal
                const reach = !cut && shownHop(e.from) && shownHop(e.to)
                const onPath = pathEdges.has(e.id)
                const cls = ['sim-edge', cut && 'cut', live && 'live', reach && !live && 'reach', onPath && 'onpath', focusEdge === e.id && 'focus', e.fixable === false && 'fixed-infra'].filter(Boolean).join(' ')
                return (
                  <g key={e.id} className={cls}
                     onClick={() => toggleEdge(e.id)}
                     onMouseEnter={() => setFocusEdge(e.id)} onMouseLeave={() => setFocusEdge(null)}>
                    <path d={g.d} className="sim-edge-hit" />
                    <path d={g.d} className="sim-edge-line" markerEnd="url(#sim-arrow)" />
                    {cut && <g transform={`translate(${g.mid[0]} ${g.mid[1]})`} className="sim-cut-mark"><circle r="11" /><path d="M-4 -4 L4 4 M4 -4 L-4 4" /></g>}
                  </g>
                )
              })}

              {envNodes.map(n => {
                const p = pos[n.id]; const Icon = ICONS[n.icon] || Server
                const hit = shownHop(n.id)
                const isEntry = n.id === entry
                const cls = ['sim-node', hit && 'hit', n.crown && 'crown', isEntry && 'entry', n.crown && !hit && 'safe'].filter(Boolean).join(' ')
                return (
                  <g key={n.id} className={cls} transform={`translate(${p.x - NW / 2} ${p.y - NH / 2})`}
                     onClick={() => n.crown ? setFocusCrown(focusCrown === n.id ? null : n.id) : pickEntry(n.id)}
                     style={{ '--delay': `${(result.hop[n.id] || 0) * 40}ms` }}>
                    <rect width={NW} height={NH} rx="10" className="sim-node-box" />
                    <foreignObject x="8" y="10" width="32" height="32"><div className="sim-node-icon"><Icon size={15} /></div></foreignObject>
                    <text x="46" y="23" className="sim-node-name">{clip(n.short, 15)}<title>{n.short}</title></text>
                    <text x="46" y="39" className="sim-node-kind">{clip(n.kind, 17)}</text>
                    {hit && !isEntry && <g transform={`translate(${NW - 2} 2)`}><circle r="10" className="sim-hop-badge" /><text className="sim-hop-text" textAnchor="middle" dy="3.5">{result.hop[n.id]}</text></g>}
                    {isEntry && <text x={NW / 2} y={-8} textAnchor="middle" className="sim-entry-tag">ENTRY</text>}
                    {n.crown && <text x={NW / 2} y={-8} textAnchor="middle" className="sim-crown-tag">♛ CROWN JEWEL</text>}
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="sim-inspect" aria-live="polite">
            {fe ? (
              <>
                <strong>{nodeById[fe.from].short} → {nodeById[fe.to].short}</strong>
                <span>{fe.technique}</span>
                {fe.findingId && findingById[fe.findingId] && <span className="badge badge-high">{findingById[fe.findingId].rule_id}</span>}
                <em>{fe.fixable === false ? 'Required infrastructure — cannot be severed' : severed.has(fe.id) ? 'Click to restore' : 'Click to sever'}</em>
              </>
            ) : <span className="sim-inspect-hint">Hover an edge to see the exploit technique behind it.</span>}
          </div>
        </div>

        <aside className="sim-side">
          <div className="card sim-metrics">
            <div className={`sim-metric ${crowns.length ? 'bad' : 'good'}`}>
              <span className="sim-metric-num">{crowns.length}<small>/{totalCrowns}</small></span>
              <span className="sim-metric-label">Crown jewels exposed</span>
            </div>
            <div className="sim-metric">
              <span className="sim-metric-num">{reachable}<small>/{envNodes.length - 1}</small></span>
              <span className="sim-metric-label">Assets reachable</span>
            </div>
            <div className="sim-metric">
              <span className="sim-metric-num">{maxDepth}</span>
              <span className="sim-metric-label">Max hop depth</span>
            </div>
            <div className="sim-metric">
              <span className="sim-metric-num">{baseReach ? Math.round((1 - reachable / baseReach) * 100) : 0}<small>%</small></span>
              <span className="sim-metric-label">Blast radius cut</span>
            </div>
          </div>

          <div className="card">
            <div className="card-kicker"><Wand2 size={11} /> Recommended fix plan</div>
            <p className="sim-note">Greedy chokepoint search: each step severs the single fix that removes the most crown-jewel exposure.</p>
            {plan.length === 0 ? (
              <div className="sim-done"><ShieldCheck size={15} /> {crowns.length ? 'Remaining paths use required infrastructure.' : 'Nothing left to fix from this entry point.'}</div>
            ) : (
              <ol className="sim-plan">
                {plan.map((p, i) => {
                  const e = edgeById[p.edgeId]; const f = e.findingId && findingById[e.findingId]
                  return (
                    <li key={p.edgeId} onMouseEnter={() => setFocusEdge(p.edgeId)} onMouseLeave={() => setFocusEdge(null)}>
                      <span className="sim-step">{i + 1}</span>
                      <span className="sim-plan-text">
                        <span className="sim-plan-title">{e.technique}</span>
                        <span className="sim-plan-sub">{nodeById[e.from].short} → {nodeById[e.to].short}{f ? ` · ${f.rule_id}` : ' · no finding yet'}</span>
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleEdge(p.edgeId)} aria-label={`Sever ${e.technique}`}><Scissors size={12} /></button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="card">
            <div className="card-kicker"><Crosshair size={11} /> Paths to crown jewels</div>
            {envNodes.filter(n => n.crown).map(n => {
              const reached = n.id in result.hop
              const path = reached ? pathTo(n.id, result.via, envEdges) : []
              return (
                <button key={n.id} className={`sim-path ${reached ? 'exposed' : 'safe'} ${focusCrown === n.id ? 'active' : ''}`}
                        onClick={() => setFocusCrown(focusCrown === n.id ? null : n.id)} disabled={!reached}>
                  <span className="sim-path-name">{n.short}</span>
                  <span className="sim-path-chain">
                    {reached
                      ? [nodeById[entry].short, ...path.map(id => nodeById[edgeById[id].to].short)].join(' → ')
                      : 'Unreachable'}
                  </span>
                  <span className="sim-path-hops">{reached ? `${path.length} hop${path.length === 1 ? '' : 's'}` : 'SAFE'}</span>
                </button>
              )
            })}
          </div>

          <details className="card sim-edge-list">
            <summary>All edges ({envEdges.length}) — keyboard control</summary>
            {envEdges.map(e => (
              <label key={e.id} className={e.fixable === false ? 'disabled' : ''}>
                <input type="checkbox" checked={severed.has(e.id)} disabled={e.fixable === false || running} onChange={() => toggleEdge(e.id)} />
                <span>{nodeById[e.from].short} → {nodeById[e.to].short}</span>
                <small>{e.technique}</small>
              </label>
            ))}
          </details>
        </aside>
      </div>
    </div>
  )
}
