/* Empty, well-formed shapes used in LIVE mode when the backend has no data yet
   or is unreachable. Live mode must never show demo numbers: an empty state that
   says "run a scan" is honest; a fake 82% compliance score is not. */
export const EMPTY_STATS = { total: 0, critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0, risk_score: 0 }
export const EMPTY_GRAPH = { nodes: [], edges: [] }
export const EMPTY_ENV = { layers: ['Internet', 'Edge', 'Compute', 'Identity', 'Data'], nodes: [], edges: [] }
