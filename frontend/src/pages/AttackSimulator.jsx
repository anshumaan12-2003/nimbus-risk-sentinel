import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Crown, Play, RotateCcw, Scissors, ShieldCheck, Wand2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, EmptyState, ErrorState, Skeleton, SeverityBadge, Badge,
} from '@/components/ds'
import AttackCanvas from '@/components/graph/AttackCanvas'
import { useAttackEnvironment, useFindings } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { emitEvent } from '@/store/eventStore'
import { ENV_NODES, ENV_EDGES, bfs, pathTo, crownsReached, greedyFixPlan } from '@/data/cloudEnvironment'
import { MOCK_FINDINGS } from '@/data/mockData'

const STEP_MS = 650
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function AttackSimulator() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const { openScanModal } = useSentinelStore()
  const q = useAttackEnvironment()
  const findingsQ = useFindings({ limit: 500 })
  const env = useMemo(() => (demo ? { nodes: ENV_NODES, edges: ENV_EDGES } : (q.data?.nodes ? q.data : { nodes: [], edges: [] })), [demo, q.data])
  const findings = demo ? MOCK_FINDINGS : (findingsQ.data || [])
  const nodeById = useMemo(() => Object.fromEntries(env.nodes.map(n => [n.id, n])), [env.nodes])
  const edgeById = useMemo(() => Object.fromEntries(env.edges.map(e => [e.id, e])), [env.edges])
  const findingById = useMemo(() => Object.fromEntries(findings.map(f => [f.id, f])), [findings])

  const [params] = useSearchParams()
  const [entry, setEntry] = useState(params.get('entry') || 'internet')
  const [severed, setSevered] = useState(() => new Set())
  const [reveal, setReveal] = useState(Infinity)
  const [running, setRunning] = useState(false)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [focusCrown, setFocusCrown] = useState(null)
  const timer = useRef(null)
  const wasExposed = useRef(true)

  const result = useMemo(() => bfs(entry, severed, env.edges), [entry, severed, env.edges])
  const baseline = useMemo(() => bfs(entry, new Set(), env.edges), [entry, env.edges])
  const crowns = useMemo(() => crownsReached(entry, severed, env.nodes, env.edges), [entry, severed, env.nodes, env.edges])
  const plan = useMemo(() => greedyFixPlan(entry, severed, env.nodes, env.edges), [entry, severed, env.nodes, env.edges])
  const totalCrowns = env.nodes.filter(n => n.crown).length
  const reachable = Object.keys(result.hop).length - 1
  const baseReach = Object.keys(baseline.hop).length - 1
  const maxDepth = result.levels.length - 1
  const treeEdges = useMemo(() => new Set(Object.values(result.via)), [result])
  const pathEdges = useMemo(() => {
    const targets = focusCrown ? [focusCrown] : crowns
    return new Set(targets.filter(c => c in result.hop).flatMap(c => pathTo(c, result.via, env.edges)))
  }, [focusCrown, crowns, result, env.edges])

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
  useEffect(() => () => clearInterval(timer.current), [])
  // New graph (demo<->live, or a fresh scan): reset, keeping a requested entry point if it exists.
  useEffect(() => {
    setSevered(new Set()); setFocusCrown(null)
    setEntry(e => (e in nodeById ? e : 'internet'))
    wasExposed.current = true
  }, [env]) // eslint-disable-line react-hooks/exhaustive-deps

  // Announce containment once, when the last crown jewel is cut off.
  useEffect(() => {
    const exposed = crowns.length > 0
    if (wasExposed.current && !exposed && severed.size > 0) {
      emitEvent({ type: 'simulation.contained', severity: 'INFO', title: 'Simulation: every crown jewel contained', detail: `${severed.size} fix${severed.size === 1 ? '' : 'es'} from ${nodeById[entry]?.short}`, link: '/simulator' })
    }
    wasExposed.current = exposed
  }, [crowns.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEdge = (id) => {
    setSelectedEdge(id)
    if (!id || running || edgeById[id]?.fixable === false) return
    setSevered(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    setReveal(Infinity)
  }
  const applyPlan = () => plan.forEach((p, i) => setTimeout(() => setSevered(s => new Set([...s, p.edgeId])), reduceMotion() ? 0 : i * 450))
  const reset = () => { clearInterval(timer.current); setRunning(false); setSevered(new Set()); setEntry('internet'); setFocusCrown(null); setReveal(Infinity); setSelectedEdge(null) }
  const pickEntry = (id) => { if (!id || running || nodeById[id]?.crown) return; setEntry(id); setFocusCrown(null); setReveal(Infinity) }

  const header = (
    <PageHeader
      title="Breach simulator"
      description="Assume an attacker gets in somewhere. Click an asset to start the breach there; click a link to cut it, as if you’d fixed it. Nimbus recomputes what they can still reach."
    />
  )
  if (!demo && q.isLoading) return <Page wide>{header}<Skeleton className="h-[600px] rounded-lg" /></Page>
  if (!demo && q.isError) return <Page wide>{header}<Card><ErrorState error={q.error} onRetry={q.refetch} /></Card></Page>
  if (!nodeById[entry] || env.nodes.length <= 1) {
    return (
      <Page wide>{header}
        <Card><EmptyState title="Nothing to simulate yet" body="The simulator uses the attack graph from your latest scan."
          action={<Button variant="primary" onClick={openScanModal}><Play /> Run a scan</Button>} /></Card>
      </Page>
    )
  }

  const contained = crowns.length === 0
  const edge = selectedEdge && edgeById[selectedEdge]
  const edgeFinding = edge?.findingId && findingById[edge.findingId]

  return (
    <Page wide>
      {header}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={run} disabled={running}><Play /> {running ? 'Simulating…' : 'Replay the breach'}</Button>
            <Button onClick={applyPlan} disabled={running || !plan.length}><Wand2 /> Apply fix plan</Button>
            <Button variant="ghost" onClick={reset} disabled={running}><RotateCcw /> Reset</Button>
            <label className="ml-auto flex items-center gap-2 text-sm text-fg-2">
              Breach starts at
              <select value={entry} onChange={e => pickEntry(e.target.value)} disabled={running}
                      className="h-8 max-w-[220px] rounded-md border border-line-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none">
                {env.nodes.filter(n => !n.crown).map(n => <option key={n.id} value={n.id}>{n.short}</option>)}
              </select>
            </label>
          </div>
          <AttackCanvas
            nodes={env.nodes}
            edges={env.edges}
            height={620}
            view={{ simulate: true, entry, hop: result.hop, reveal, severed, treeEdges, pathEdges: running ? new Set() : pathEdges, selectedEdge }}
            onNodeClick={pickEntry}
            onEdgeClick={toggleEdge}
          />
          <p className="text-xs text-fg-3">Numbers on assets are steps from the breach. Dashed links are fixed in this simulation only — nothing changes in AWS.</p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <Card className={cn('p-5', contained ? 'border-low-line' : 'border-crit-line')}>
            <p className="text-sm text-fg-2">From <span className="font-medium text-fg">{nodeById[entry].short}</span> an attacker reaches</p>
            <div className="mt-3 flex items-end gap-6">
              <div>
                <p className={cn('num text-3xl font-semibold', contained ? 'text-low-text' : 'text-crit-text')}>{crowns.length}<span className="text-lg text-fg-3"> / {totalCrowns}</span></p>
                <p className="text-xs text-fg-3">crown jewels</p>
              </div>
              <div>
                <p className="num text-3xl font-semibold text-fg">{reachable}</p>
                <p className="text-xs text-fg-3">assets{severed.size > 0 && baseReach !== reachable ? ` (was ${baseReach})` : ''}</p>
              </div>
            </div>
            {contained
              ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-low-text"><ShieldCheck className="size-4" /> Contained — no crown jewel is reachable.</p>
              : <p className="mt-4 text-sm text-fg-2">{plan.length ? <><span className="font-medium text-fg">{plan.length} fix{plan.length === 1 ? '' : 'es'}</span> would cut off every crown jewel.</> : 'No fixable link closes the remaining paths.'}</p>}
          </Card>

          {crowns.length > 0 && (
            <Card>
              <CardHeader title="Exposed crown jewels" description="Pick one to trace its path." />
              <ul className="divide-y divide-line border-t border-line">
                {crowns.map(id => (
                  <li key={id}>
                    <button type="button" onClick={() => setFocusCrown(f => (f === id ? null : id))}
                            className={cn('flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm hover:bg-surface-2', focusCrown === id && 'bg-crit-soft')}>
                      <Crown className="size-4 text-crit-text" />
                      <span className="min-w-0 flex-1 truncate text-fg">{nodeById[id].short}</span>
                      <span className="num text-xs text-fg-3">{result.hop[id]} steps</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {plan.length > 0 && (
            <Card>
              <CardHeader title="Fix plan" description="Smallest set of fixes found, most impact first." />
              <ol className="divide-y divide-line border-t border-line">
                {plan.map((p, i) => {
                  const e = edgeById[p.edgeId]
                  const f = e.findingId && findingById[e.findingId]
                  return (
                    <li key={p.edgeId} className="grid grid-cols-1 gap-1 px-5 py-3">
                      <p className="flex items-center gap-2 text-sm text-fg">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-2xs font-semibold text-fg-2">{i + 1}</span>
                        <span className="min-w-0 truncate">{e.technique}</span>
                      </p>
                      <p className="pl-7 text-xs text-fg-3">Cuts off {p.crownsCut} crown jewel{p.crownsCut === 1 ? '' : 's'}{f ? '' : ` · ${nodeById[e.from]?.short} → ${nodeById[e.to]?.short}`}</p>
                      {f && (
                        <Link to={`/findings/${f.id}`} className="ml-7 flex items-center gap-1.5 text-xs font-medium text-accent-text hover:underline">
                          Fix via {f.rule_id} <ChevronRight className="size-3.5" />
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}

          {edge && (
            <Card className="animate-rise-in">
              <CardHeader title="Selected link" description={`${nodeById[edge.from]?.short} → ${nodeById[edge.to]?.short}`} />
              <CardBody className="grid gap-3">
                <p className="text-sm text-fg">{edge.technique}</p>
                {severed.has(edge.id)
                  ? <Badge tone="low" className="w-fit"><Scissors className="size-3" /> Fixed in this simulation</Badge>
                  : edge.fixable === false ? <p className="text-xs text-fg-3">Built-in AWS behaviour — can’t be cut directly.</p> : null}
                {edgeFinding && (
                  <Link to={`/findings/${edgeFinding.id}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2">
                    <SeverityBadge severity={edgeFinding.severity} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{edgeFinding.title}</span>
                    <ChevronRight className="size-4 text-fg-3" />
                  </Link>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}
