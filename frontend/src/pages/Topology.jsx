import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Crosshair, Crown, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, StatTile, EmptyState, ErrorState, Skeleton, Switch,
  SeverityBadge, ResourceId, Badge,
} from '@/components/ds'
import AttackCanvas, { LAYERS } from '@/components/graph/AttackCanvas'
import { useAttackEnvironment, useFindings } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { ENV_NODES, ENV_EDGES, bfs, pathTo } from '@/data/cloudEnvironment'
import { MOCK_FINDINGS } from '@/data/mockData'

/* Everything reachable from the internet, and the shortest route to each reachable crown jewel. */
function analyse(nodes, edges) {
  const r = bfs('internet', new Set(), edges)
  const crowns = nodes.filter(n => n.crown)
  const reachedCrowns = crowns.filter(n => n.id in r.hop)
  const pathEdges = new Set(reachedCrowns.flatMap(c => pathTo(c.id, r.via, edges)))
  const byId = Object.fromEntries(edges.map(e => [e.id, e]))
  const pathNodes = new Set(['internet', ...[...pathEdges].flatMap(id => [byId[id].from, byId[id].to])])
  return { ...r, crowns, reachedCrowns, pathEdges, pathNodes, reachable: Object.keys(r.hop).length - 1 }
}

function NodePanel({ node, nodes, edges, findings, onClose }) {
  const navigate = useNavigate()
  const from = useMemo(() => bfs(node.id, new Set(), edges), [node.id, edges])
  const fromInternet = useMemo(() => bfs('internet', new Set(), edges).hop[node.id], [node.id, edges])
  const crownsFromHere = nodes.filter(n => n.crown && n.id !== node.id && n.id in from.hop)
  const touching = edges.filter(e => e.from === node.id || e.to === node.id)
  const findingIds = new Set(touching.map(e => e.findingId).filter(Boolean))
  const related = findings.filter(f => findingIds.has(f.id) || (node.arn && f.resource_id === node.arn) || f.resource_id === node.id)

  return (
    <Card className="animate-rise-in">
      <CardHeader title={node.short} description={`${node.kind} · ${LAYERS[node.layer]}`}
                  actions={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>} />
      <CardBody className="grid gap-5">
        {node.crown && <Badge tone="critical"><Crown className="size-3" /> Crown jewel</Badge>}
        {node.arn && <ResourceId value={node.arn} />}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-surface-2 p-3">
            <dt className="text-xs text-fg-3">From the internet</dt>
            <dd className="mt-0.5 font-semibold text-fg">{node.id === 'internet' ? '—' : fromInternet != null ? `${fromInternet} step${fromInternet === 1 ? '' : 's'}` : 'Not reachable'}</dd>
          </div>
          <div className="rounded-md bg-surface-2 p-3">
            <dt className="text-xs text-fg-3">Reaches from here</dt>
            <dd className="num mt-0.5 font-semibold text-fg">{Object.keys(from.hop).length - 1} assets</dd>
          </div>
        </dl>
        {crownsFromHere.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">Crown jewels exposed from here</p>
            <ul className="grid gap-1 text-sm text-fg">{crownsFromHere.map(c => <li key={c.id} className="flex items-center gap-2"><Crown className="size-3.5 text-crit-text" />{c.short}</li>)}</ul>
          </div>
        )}
        <div className="grid gap-1.5">
          <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">Findings that open these routes</p>
          {related.length === 0 ? <p className="text-sm text-fg-2">None linked to this asset.</p> : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {related.slice(0, 6).map(f => (
                <li key={f.id}>
                  <Link to={`/findings/${f.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                    <SeverityBadge severity={f.severity} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-fg">{f.title}</span>
                    <ChevronRight className="size-4 text-fg-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!node.crown && (
          <Button variant="primary" className="w-fit" onClick={() => navigate(`/simulator?entry=${encodeURIComponent(node.id)}`)}>
            <Crosshair /> Simulate a breach from here
          </Button>
        )}
      </CardBody>
    </Card>
  )
}

export default function Topology() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const { openScanModal } = useSentinelStore()
  const q = useAttackEnvironment()
  const findingsQ = useFindings({ limit: 500 })
  const env = demo ? { nodes: ENV_NODES, edges: ENV_EDGES } : (q.data?.nodes ? q.data : { nodes: [], edges: [] })
  const findings = demo ? MOCK_FINDINGS : (findingsQ.data || [])
  const a = useMemo(() => analyse(env.nodes, env.edges), [env.nodes, env.edges])
  const [onlyPaths, setOnlyPaths] = useState(false)
  const [selected, setSelected] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const node = env.nodes.find(n => n.id === selected)
  const edge = env.edges.find(e => e.id === selectedEdge)
  const edgeFinding = edge?.findingId && findings.find(f => f.id === edge.findingId)

  const header = (
    <PageHeader
      title="Attack paths"
      description="How an attacker on the internet could move through your account — network exposure, IAM permissions and data access, built from the latest scan."
      actions={<Button asChild><Link to="/simulator"><Play /> Open breach simulator</Link></Button>}
    />
  )

  if (!demo && q.isLoading) return <Page wide>{header}<Skeleton className="h-[420px] rounded-lg" /></Page>
  if (!demo && q.isError) return <Page wide>{header}<Card><ErrorState error={q.error} onRetry={q.refetch} /></Card></Page>
  if (env.nodes.length <= 1) {
    return (
      <Page wide>{header}
        <Card><EmptyState mood={q.data?.message ? 'calm' : 'happy'}
          title={q.data?.message ? 'No attack graph yet' : 'No exposed paths'}
          body={q.data?.message ? 'The graph is built from a scan’s inventory. Run a scan to map EC2, IAM, S3, RDS, Lambda, DynamoDB and Secrets.' : 'Nothing is reachable from the internet, and no data store is reachable through IAM.'}
          action={q.data?.message && <Button variant="primary" onClick={openScanModal}><Play /> Run a scan</Button>} /></Card>
      </Page>
    )
  }

  return (
    <Page wide>
      {header}
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Reachable from the internet" value={a.reachable} tone={a.reachable ? 'high' : 'low'} hint={`of ${env.nodes.length - 1} mapped assets`} />
          <StatTile label="Crown jewels exposed" value={`${a.reachedCrowns.length} / ${a.crowns.length}`} tone={a.reachedCrowns.length ? 'critical' : 'low'} hint="data stores an attacker can reach" />
          <StatTile label="Steps on shortest path" value={a.reachedCrowns.length ? Math.min(...a.reachedCrowns.map(c => a.hop[c.id])) : '—'} tone="neutral" hint="fewer means easier to exploit" />
          <StatTile label="Links to cut" value={[...a.pathEdges].filter(id => env.edges.find(e => e.id === id)?.fixable !== false).length} tone="accent" hint="links on the critical paths" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-fg-2">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-crit" /> Path to a crown jewel</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-line-strong" /> Other access</span>
            <span className="flex items-center gap-1.5"><Crown className="size-3.5 text-crit-text" /> Crown jewel</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <Switch checked={onlyPaths} onCheckedChange={setOnlyPaths} aria-label="Focus on attack paths" /> Focus on attack paths
          </label>
        </div>

        <div className={cn('grid items-start gap-4', (node || edge) && 'xl:grid-cols-[minmax(0,1fr)_380px]')}>
          <AttackCanvas
            nodes={env.nodes}
            edges={env.edges}
            height={620}
            view={{ entry: 'internet', pathEdges: a.pathEdges, pathNodes: a.pathNodes, dimOffPath: onlyPaths, labelPaths: onlyPaths, selectedNode: selected, selectedEdge }}
            onNodeClick={(id) => { setSelected(id); setSelectedEdge(null) }}
            onEdgeClick={(id) => { setSelectedEdge(id); setSelected(null) }}
          />
          {node && <NodePanel node={node} nodes={env.nodes} edges={env.edges} findings={findings} onClose={() => setSelected(null)} />}
          {edge && !node && (
            <Card className="animate-rise-in">
              <CardHeader title="How this step works" description={`${env.nodes.find(n => n.id === edge.from)?.short} → ${env.nodes.find(n => n.id === edge.to)?.short}`}
                          actions={<Button variant="ghost" size="sm" onClick={() => setSelectedEdge(null)}>Close</Button>} />
              <CardBody className="grid gap-4">
                <p className="text-sm text-fg">{edge.technique}</p>
                {a.pathEdges.has(edge.id) && <Badge tone="critical" className="w-fit">On a path to a crown jewel</Badge>}
                {edgeFinding ? (
                  <Link to={`/findings/${edgeFinding.id}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5 text-sm hover:bg-surface-2">
                    <SeverityBadge severity={edgeFinding.severity} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-fg">{edgeFinding.title}</span>
                    <ChevronRight className="size-4 text-fg-3" />
                  </Link>
                ) : <p className="text-sm text-fg-2">{edge.fixable === false ? 'Built-in AWS behaviour — this link can’t be removed directly.' : 'Not tied to a single finding.'}</p>}
              </CardBody>
            </Card>
          )}
        </div>
        <p className="text-xs text-fg-3">Click an asset to see where an attacker could go from it, or a link to see how that step works. Scroll to zoom, drag to pan.</p>
      </div>
    </Page>
  )
}
