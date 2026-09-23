import { memo, useMemo } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath,
} from '@xyflow/react'
import { Crown, Database, Globe, HardDrive, KeyRound, Lock, Network, Scissors, Server, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSentinelStore } from '@/store/sentinelStore'

export const LAYERS = ['Internet', 'Edge', 'Compute', 'Identity', 'Data']
const ICONS = { globe: Globe, bucket: HardDrive, network: Network, server: Server, zap: Zap, key: KeyRound, lock: Lock, database: Database }
const COL = 250, ROW = 84, NODE_W = 196

/* Column layout: x by attack-surface layer, rows centred within each layer. */
function layout(nodes) {
  const byLayer = LAYERS.map((_, l) => nodes.filter(n => n.layer === l))
  const tallest = Math.max(1, ...byLayer.map(l => l.length))
  const pos = {}
  byLayer.forEach((list, l) => {
    const offset = ((tallest - list.length) * ROW) / 2
    list.forEach((n, i) => { pos[n.id] = { x: l * COL, y: offset + i * ROW } })
  })
  return pos
}

const AssetNode = memo(function AssetNode({ data }) {
  const { node, state } = data
  const Icon = ICONS[node.icon] || Server
  return (
    <div
      style={{ width: NODE_W }}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg border bg-surface px-3 py-2.5 shadow-raised transition-[opacity,box-shadow,border-color] duration-300',
        node.crown ? 'border-crit-line' : 'border-line',
        state.entry && 'border-accent ring-2 ring-accent-soft-2',
        state.selected && 'ring-2 ring-accent',
        state.onPath && !state.entry && 'border-high-line',
        state.dim && 'opacity-35',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md',
        node.crown ? 'bg-crit-soft text-crit-text' : state.entry ? 'bg-accent-soft text-accent-text' : 'bg-muted text-fg-2')}>
        {node.crown ? <Crown className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg" title={node.short}>{node.short}</span>
        <span className="block truncate text-2xs text-fg-3">{node.crown ? `${node.kind} · crown jewel` : node.kind}</span>
      </span>
      {state.hop != null && state.hop > 0 && (
        <span className="num shrink-0 rounded-xs bg-muted px-1 text-2xs text-fg-3" title={`${state.hop} step${state.hop === 1 ? '' : 's'} from the entry point`}>{state.hop}</span>
      )}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
    </div>
  )
})

function LayerLabel({ data }) {
  return <div style={{ width: NODE_W }} className="text-center text-xs font-medium tracking-wide text-fg-3 uppercase">{data.label}</div>
}

const EDGE_STYLE = {
  idle: { stroke: 'var(--line-strong)', strokeWidth: 1.25 },
  reached: { stroke: 'var(--high)', strokeWidth: 1.75 },
  path: { stroke: 'var(--crit)', strokeWidth: 2.25 },
  severed: { stroke: 'var(--fg-3)', strokeWidth: 1.5, strokeDasharray: '5 5' },
  dim: { stroke: 'var(--line)', strokeWidth: 1 },
}

function AttackEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const s = data.state
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={EDGE_STYLE[s] || EDGE_STYLE.idle}
                className={cn(s === 'path' && 'nimbus-edge-flow')} interactionWidth={16} />
      {(data.showLabel || s === 'severed') && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
               className={cn('nodrag nopan pointer-events-none absolute flex max-w-[180px] items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs shadow-raised',
                 s === 'severed' ? 'border-line bg-surface text-fg-3' : 'border-crit-line bg-crit-soft text-crit-text')}>
            {s === 'severed' && <Scissors className="size-3 shrink-0" />}
            <span className="truncate">{s === 'severed' ? 'Fixed' : data.edge.technique}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { asset: AssetNode, layer: LayerLabel }
const edgeTypes = { attack: AttackEdge }

/*
  Shared attack-graph canvas.
  view: { entry, hop: {id: n}, reveal, severed: Set, pathEdges: Set, treeEdges: Set, selectedNode, selectedEdge, simulate }
*/
export default function AttackCanvas({ nodes, edges, view, onNodeClick, onEdgeClick, height = 600, className }) {
  const theme = useSentinelStore(s => s.theme)
  const pos = useMemo(() => layout(nodes), [nodes])

  const rfNodes = useMemo(() => {
    const labels = LAYERS.map((label, l) => ({
      id: `layer-${l}`, type: 'layer', position: { x: l * COL, y: -48 }, data: { label },
      draggable: false, selectable: false, focusable: false,
    }))
    return [...labels, ...nodes.map(n => {
      const hop = view.hop?.[n.id]
      const reached = hop != null && hop <= (view.reveal ?? Infinity)
      return {
        id: n.id, type: 'asset', position: pos[n.id] || { x: 0, y: 0 },
        data: {
          node: n,
          state: {
            entry: n.id === view.entry, selected: n.id === view.selectedNode, hop: view.simulate && reached ? hop : null,
            onPath: view.pathNodes?.has(n.id), dim: view.simulate ? !reached : view.dimOffPath && !view.pathNodes?.has(n.id),
          },
        },
      }
    })]
  }, [nodes, pos, view])

  const rfEdges = useMemo(() => edges.map(e => {
    let state = 'idle'
    if (view.severed?.has(e.id)) state = 'severed'
    else if (view.pathEdges?.has(e.id)) state = 'path'
    else if (view.simulate) {
      const h = view.hop?.[e.from]
      state = view.treeEdges?.has(e.id) && h != null && h < (view.reveal ?? Infinity) ? 'reached' : 'dim'
    } else if (view.dimOffPath) state = 'dim'
    return {
      id: e.id, source: e.from, target: e.to, type: 'attack',
      data: { edge: e, state, showLabel: e.id === view.selectedEdge || (state === 'path' && view.labelPaths) },
      markerEnd: { type: 'arrowclosed', width: 14, height: 14, color: state === 'path' ? 'var(--crit)' : state === 'reached' ? 'var(--high)' : 'var(--line-strong)' },
      zIndex: state === 'path' ? 2 : state === 'reached' ? 1 : 0,
    }
  }), [edges, view])

  return (
    <div style={{ height }} className={cn('nimbus-flow min-w-0 overflow-hidden rounded-lg border border-line bg-surface-2', className)}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => n.type === 'asset' && onNodeClick?.(n.id)}
        onEdgeClick={(_, e) => onEdgeClick?.(e.id)}
        onPaneClick={() => { onNodeClick?.(null); onEdgeClick?.(null) }}
      >
        <Background gap={20} size={1} color="var(--line)" />
        <Controls showInteractive={false} position="bottom-left" />
        {nodes.length > 24 && (   // a minimap only helps once the graph no longer fits on screen
          <MiniMap pannable zoomable position="bottom-right" className="!hidden md:!block"
                   nodeColor={(n) => (n.data?.node?.crown ? 'var(--crit)' : n.type === 'layer' ? 'transparent' : 'var(--line-strong)')}
                   maskColor="color-mix(in srgb, var(--bg) 70%, transparent)" />
        )}
      </ReactFlow>
    </div>
  )
}
