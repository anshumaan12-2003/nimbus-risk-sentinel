/*
  Simulated AWS environment for the Attack-Path Simulator.
  layer: 0 Internet · 1 Edge · 2 Compute · 3 Identity · 4 Data
  Each edge is an exploitable relationship an attacker can traverse.
  findingId links an edge to the finding whose remediation severs it.
  When the backend exposes GET /topology/environment in this shape,
  the simulator can swap this file for live data with no UI changes.
*/
export const LAYERS = ['Internet', 'Edge', 'Compute', 'Identity', 'Data']

export const ENV_NODES = [
  { id: 'internet',   layer: 0, short: 'Public Internet',   kind: 'Attacker',     icon: 'globe' },

  { id: 's3-public',  layer: 1, short: 'customer-finance',  kind: 'S3 Bucket',    icon: 'bucket' },
  { id: 'alb',        layer: 1, short: 'prod-alb',          kind: 'Load Balancer',icon: 'network' },
  { id: 'apigw',      layer: 1, short: 'partner-api',       kind: 'API Gateway',  icon: 'network' },

  { id: 'ec2',        layer: 2, short: 'api-worker-03',     kind: 'EC2',          icon: 'server' },
  { id: 'lambda',     layer: 2, short: 'image-resize',      kind: 'Lambda',       icon: 'zap' },
  { id: 'eks',        layer: 2, short: 'eks-prod-ng',       kind: 'EKS Nodes',    icon: 'server' },

  { id: 'role-data',  layer: 3, short: 'DataOpsPipeline',   kind: 'IAM Role',     icon: 'key' },
  { id: 'role-ci',    layer: 3, short: 'ci-deploy',         kind: 'IAM Role',     icon: 'key' },
  { id: 'secrets',    layer: 3, short: 'prod/db-creds',     kind: 'Secrets Mgr',  icon: 'lock' },

  { id: 'rds',        layer: 4, short: 'financial-aurora',  kind: 'RDS Aurora',   icon: 'database', crown: true },
  { id: 'dynamo',     layer: 4, short: 'customers-table',   kind: 'DynamoDB',     icon: 'database', crown: true },
  { id: 's3-backups', layer: 4, short: 'nightly-backups',   kind: 'S3 Bucket',    icon: 'bucket',   crown: true },
]

export const ENV_EDGES = [
  { id: 'e1',  from: 'internet',  to: 's3-public',  technique: 'Anonymous bucket listing (public ACL)',      findingId: 'find-s3-001' },
  { id: 'e2',  from: 'internet',  to: 'alb',        technique: 'Public HTTPS listener',                       fixable: false },
  { id: 'e3',  from: 'internet',  to: 'apigw',      technique: 'Unauthenticated route /v1/export' },
  { id: 'e4',  from: 'internet',  to: 'ec2',        technique: 'SSH open to 0.0.0.0/0',                       findingId: 'find-ec2-001' },
  { id: 'e5',  from: 'internet',  to: 'rds',        technique: 'Publicly accessible DB endpoint',             findingId: 'find-rds-001' },
  { id: 'e6',  from: 'alb',       to: 'ec2',        technique: 'SSRF in /fetch-preview handler' },
  { id: 'e7',  from: 'apigw',     to: 'lambda',     technique: 'Invoke without authorizer' },
  { id: 'e8',  from: 's3-public', to: 'ec2',        technique: 'Leaked pipeline config with host keys' },
  { id: 'e9',  from: 's3-public', to: 'role-ci',    technique: 'CI access keys in build artifacts' },
  { id: 'e10', from: 'ec2',       to: 'role-data',  technique: 'IMDSv1 instance-profile credential theft',    findingId: 'find-ec2-002' },
  { id: 'e11', from: 'lambda',    to: 'secrets',    technique: 'Over-broad secretsmanager:GetSecretValue' },
  { id: 'e12', from: 'role-ci',   to: 'eks',        technique: 'kubectl access via deploy role' },
  { id: 'e13', from: 'eks',       to: 'secrets',    technique: 'Mounted service-account token' },
  { id: 'e14', from: 'role-data', to: 'rds',        technique: 'Wildcard admin → snapshot export',            findingId: 'find-iam-002' },
  { id: 'e15', from: 'role-data', to: 'dynamo',     technique: 'dynamodb:* on all tables',                    findingId: 'find-iam-002' },
  { id: 'e16', from: 'secrets',   to: 'rds',        technique: 'DB master password stored in secret' },
  { id: 'e17', from: 'role-ci',   to: 's3-backups', technique: 's3:* on backup bucket' },
]

/* ─── Graph algorithms ─────────────────────────────────────────────
   Pure functions so they can be unit-tested and reused server-side. */

// BFS from an entry node, ignoring severed edges.
// Returns hop depth per node, the edge used to first reach it, and levels.
export function bfs(entryId, severed = new Set(), edges = ENV_EDGES) {
  const hop = { [entryId]: 0 }
  const via = {}
  const levels = [[entryId]]
  let frontier = [entryId]
  while (frontier.length) {
    const next = []
    for (const n of frontier) {
      for (const e of edges) {
        if (e.from !== n || severed.has(e.id) || e.to in hop) continue
        hop[e.to] = hop[n] + 1
        via[e.to] = e.id
        next.push(e.to)
      }
    }
    if (next.length) levels.push(next)
    frontier = next
  }
  return { hop, via, levels }
}

// Reconstruct the shortest path (as edge ids) from entry to a target.
export function pathTo(targetId, via, edges = ENV_EDGES) {
  const byId = Object.fromEntries(edges.map(e => [e.id, e]))
  const path = []
  let cur = targetId
  while (via[cur]) { const e = byId[via[cur]]; path.unshift(e.id); cur = e.from }
  return path
}

export function crownsReached(entryId, severed, nodes = ENV_NODES, edges = ENV_EDGES) {
  const { hop } = bfs(entryId, severed, edges)
  return nodes.filter(n => n.crown && n.id in hop).map(n => n.id)
}

/*
  Greedy fix plan: repeatedly sever the single fixable edge that cuts
  off the most crown jewels (tie-break: fewest assets still reachable)
  until no crown jewel is reachable. Greedy approximates the true
  minimum cut — good enough for prioritisation, and labelled as such.
*/
export function greedyFixPlan(entryId, alreadySevered = new Set(), nodes = ENV_NODES, edges = ENV_EDGES) {
  const severed = new Set(alreadySevered)
  const plan = []
  for (let guard = 0; guard < edges.length; guard++) {
    const before = crownsReached(entryId, severed, nodes, edges).length
    if (before === 0) break
    let best = null
    for (const e of edges) {
      if (severed.has(e.id) || e.fixable === false) continue
      const trial = new Set(severed); trial.add(e.id)
      const crowns = crownsReached(entryId, trial, nodes, edges).length
      const reach = Object.keys(bfs(entryId, trial, edges).hop).length
      const score = [crowns, reach]
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
        best = { edge: e, score, cut: before - crowns }
      }
    }
    if (!best) break          // nothing fixable left — path can't be closed
    severed.add(best.edge.id)
    plan.push({ edgeId: best.edge.id, crownsCut: best.cut, crownsLeft: best.score[0] })
  }
  return plan
}
