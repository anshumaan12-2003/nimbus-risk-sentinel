import { useState, useEffect } from 'react'
import Compass from 'lucide-react/dist/esm/icons/compass'
import Shield from 'lucide-react/dist/esm/icons/shield'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Layers from 'lucide-react/dist/esm/icons/layers'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Lock from 'lucide-react/dist/esm/icons/lock'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import Download from 'lucide-react/dist/esm/icons/download'
import Check from 'lucide-react/dist/esm/icons/check'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import Database from 'lucide-react/dist/esm/icons/database'
import Server from 'lucide-react/dist/esm/icons/server'
import Key from 'lucide-react/dist/esm/icons/key'
import Globe from 'lucide-react/dist/esm/icons/globe'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import AttackPathGraph from '../components/AttackPathGraph'
import { getTopologyGraph, getFindingBlastRadius, listFindings } from '../api/nimbus'
import { useSentinelStore } from '../store/sentinelStore'

const ATTACK_VECTORS = [
  {
    id: 'node-s3',
    name: 'S3 Data Lake Exposure',
    icon: HardDrive,
    startAsset: 's3://customer-finance-records-2026',
    vectorDesc: 'Unauthenticated read/write access exposes pipeline configuration and secrets',
  },
  {
    id: 'node-ec2',
    name: 'EC2 Metadata IMDSv1 Compromise',
    icon: Server,
    startAsset: 'i-08249bf57a0129c (api-worker-node-03)',
    vectorDesc: 'SSRF or workload vulnerability extracts instance profile temporary STS credentials',
  },
  {
    id: 'node-iam',
    name: 'IAM Role Over-Privilege Pivot',
    icon: KeyRound,
    startAsset: 'arn:aws:iam::role/DataOpsPipelineEngine',
    vectorDesc: 'Excessive wildcard grants permit lateral access to production transactional datastore',
  },
]

export default function Topology() {
  const { dataSource } = useSentinelStore()
  const [selectedVector, setSelectedVector] = useState('node-s3')
  const [computing, setComputing] = useState(false)
  const [blastData, setBlastData] = useState({
    blast_radius_score: 95,
    severity: 'CRITICAL',
    reachable_nodes_count: 4,
    crown_jewels_at_risk: 1,
    identities_compromised: 1,
    reachable_assets: [
      {
        node: { id: 'node-ec2', name: 'EC2: api-worker-node-03', type: 'compute', service: 'ec2', threat_level: 'HIGH' },
        hop_distance: 1,
        attack_path: ['node-s3', 'node-ec2'],
      },
      {
        node: { id: 'node-iam', name: 'IAM: DataOpsPipelineEngine', type: 'identity', service: 'iam', threat_level: 'HIGH' },
        hop_distance: 2,
        attack_path: ['node-s3', 'node-ec2', 'node-iam'],
      },
      {
        node: { id: 'node-rds', name: 'RDS: prod-financial-aurora', type: 'crown_jewel', service: 'rds', threat_level: 'CRITICAL' },
        hop_distance: 3,
        attack_path: ['node-s3', 'node-ec2', 'node-iam', 'node-rds'],
      },
    ]
  })

  const [graphData, setGraphData] = useState(null)
  const [findings, setFindings] = useState([])

  // Load Topology Data (live: real graph from latest scan)
  useEffect(() => {
    if (dataSource !== 'demo') {
      getTopologyGraph().then(g => { setGraphData(g); computeRadius('internet') }).catch(console.error)
      listFindings().then(setFindings).catch(console.error)
    }
  }, [dataSource])

  // Live mode: starting points come from the real graph (nodes with outgoing attack edges)
  const ICON_BY_SERVICE = { internet: Globe, s3: HardDrive, ec2: Server, lambda: Zap, iam: KeyRound, secretsmanager: Lock, rds: Database, dynamodb: Database }
  const vectors = dataSource === 'demo' || !graphData?.nodes
    ? ATTACK_VECTORS
    : graphData.nodes
        .filter(n => n.id === 'internet' || graphData.edges.some(e => e.from === n.id))
        .filter(n => n.type !== 'crown_jewel')
        .slice(0, 6)
        .map(n => ({ id: n.id, name: n.id === 'internet' ? 'Public Internet' : n.label, icon: ICON_BY_SERVICE[n.service] || Server }))

  // Load Blast Radius on vector change
  const computeRadius = async (nodeId) => {
    setSelectedVector(nodeId)
    setComputing(true)
    if (dataSource !== 'demo') {
      try {
        const res = await getFindingBlastRadius(nodeId)
        setBlastData(res)          // real result, including a legitimate score of 0
      } catch (e) {
        console.warn('[topology] blast radius unavailable:', e?.message)
        setBlastData({ blast_radius_score: 0, severity: 'LOW', reachable_nodes_count: 0, crown_jewels_at_risk: 0, identities_compromised: 0, reachable_assets: [] })
      }
      setComputing(false)
      return
    }
    // Demo mode only: canned sample results below

    // Dynamic client-side calculation based on selected node
    setTimeout(() => {
      if (nodeId === 'node-s3') {
        setBlastData({
          blast_radius_score: 95,
          severity: 'CRITICAL',
          reachable_nodes_count: 4,
          crown_jewels_at_risk: 1,
          identities_compromised: 1,
          reachable_assets: [
            { node: { id: 'node-ec2', name: 'EC2: api-worker-node-03', type: 'compute', service: 'ec2', threat_level: 'HIGH' }, hop_distance: 1 },
            { node: { id: 'node-iam', name: 'IAM: DataOpsPipelineEngine', type: 'identity', service: 'iam', threat_level: 'HIGH' }, hop_distance: 2 },
            { node: { id: 'node-rds', name: 'RDS: prod-financial-aurora', type: 'crown_jewel', service: 'rds', threat_level: 'CRITICAL' }, hop_distance: 3 },
          ]
        })
      } else if (nodeId === 'node-ec2') {
        setBlastData({
          blast_radius_score: 82,
          severity: 'CRITICAL',
          reachable_nodes_count: 3,
          crown_jewels_at_risk: 1,
          identities_compromised: 1,
          reachable_assets: [
            { node: { id: 'node-iam', name: 'IAM: DataOpsPipelineEngine', type: 'identity', service: 'iam', threat_level: 'HIGH' }, hop_distance: 1 },
            { node: { id: 'node-rds', name: 'RDS: prod-financial-aurora', type: 'crown_jewel', service: 'rds', threat_level: 'CRITICAL' }, hop_distance: 2 },
          ]
        })
      } else {
        setBlastData({
          blast_radius_score: 68,
          severity: 'HIGH',
          reachable_nodes_count: 2,
          crown_jewels_at_risk: 1,
          identities_compromised: 0,
          reachable_assets: [
            { node: { id: 'node-rds', name: 'RDS: prod-financial-aurora', type: 'crown_jewel', service: 'rds', threat_level: 'CRITICAL' }, hop_distance: 1 },
          ]
        })
      }
      setComputing(false)
    }, 300)
  }

  return (
    <div className="topology-page">
      {/* Page Header */}
      <div className="page-header reveal-on-scroll">
        <div>
          <div className="page-tag">
            <Compass size={12} />
            <span>Multi-Hop Graph Engine · BFS Reachability</span>
          </div>
          <h1 className="page-title">Cloud Attack Vector Topology & Blast Radius</h1>
          <p className="page-subtitle">
            Sentinel automated graph traversal correlates public perimeter exposure, lateral movement identities, and crown jewel databases.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphData, null, 2))
              const dlAnchor = document.createElement('a')
              dlAnchor.setAttribute("href", dataStr)
              dlAnchor.setAttribute("download", `sentinel-attack-graph-${Date.now()}.json`)
              document.body.appendChild(dlAnchor)
              dlAnchor.click()
              dlAnchor.remove()
            }}
          >
            <Download size={14} />
            Export Graph JSON
          </button>
        </div>
      </div>

      <div className="bento-grid">
        {/* Interactive Vector Selector / Simulator Bar */}
        <div className="card bento-col-12 reveal-on-scroll" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                Select Compromise Starting Point (Blast Radius Simulation)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {vectors.map(v => {
                  const IconComponent = v.icon
                  return (
                    <button
                      key={v.id}
                      className={`filter-chip ${selectedVector === v.id ? 'active' : ''}`}
                      onClick={() => computeRadius(v.id)}
                      style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <IconComponent size={13} />
                      <span>{v.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Simulated Blast Score
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900,
                  color: blastData.blast_radius_score >= 80 ? 'var(--sev-critical)' : 'var(--sev-high)'
                }}>
                  {computing ? '...' : `${blastData.blast_radius_score} / 100`}
                </div>
              </div>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => computeRadius(selectedVector)}
                disabled={computing}
                title="Re-run Multi-Hop BFS Graph Traversal"
              >
                <RefreshCw size={13} className={computing ? 'spin' : ''} />
                {computing ? 'Computing BFS...' : 'Recalculate'}
              </button>
            </div>
          </div>
        </div>

        {/* Primary Attack Path Graph Component */}
        <div className="bento-col-12 reveal-on-scroll">
          {graphData && (
            <AttackPathGraph graphData={graphData} allFindings={findings} />
          )}
        </div>

        {/* Downstream Blast Radius Impact Breakdown */}
        <div className="card bento-col-12 reveal-on-scroll">
          <div className="card-header">
            <div className="card-title">
              <Layers size={14} />
              Downstream Blast Radius & Compromised Cloud Assets
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              BFS Multi-Hop Path Analysis
            </span>
          </div>

        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Hop Distance</th>
                <th>Asset Target</th>
                <th>Service</th>
                <th>Type</th>
                <th>Threat Impact</th>
              </tr>
            </thead>
            <tbody>
              {blastData.reachable_assets?.map((asset, idx) => (
                <tr key={idx}>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontWeight: 700, fontSize: 12, color: 'var(--accent-primary)'
                    }}>
                      <ArrowRight size={13} /> Hop {asset.hop_distance}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {asset.node?.name || asset.node?.id}
                    </span>
                  </td>
                  <td>
                    <span style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>
                      {asset.node?.service}
                    </span>
                  </td>
                  <td>
                    <span className="compliance-pill">
                      {asset.node?.type?.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 800, fontSize: 11,
                      color: asset.node?.threat_level === 'CRITICAL' ? 'var(--sev-critical)' : 'var(--sev-high)'
                    }}>
                      {asset.node?.threat_level || 'ELEVATED'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Bottom Insights Grid */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card reveal-on-scroll">
          <div className="card-title">
            <Shield size={13} />
            Perimeter Exposure
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sev-critical)', marginTop: 8 }}>
            1 Public Bucket
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Direct read/write access via ACL permits anonymous adversaries to stage payload drops or harvest telemetry credentials.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Zap size={13} />
            Privilege Escalation Vector
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sev-high)', marginTop: 8 }}>
            {blastData.identities_compromised} Identity Compromised
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            EC2 IMDSv1 tokenless metadata endpoint allows extraction of instance profile credentials belonging to DataOpsPipelineEngine.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Lock size={13} />
            Crown Jewel Impact
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-primary)', marginTop: 8 }}>
            {blastData.crown_jewels_at_risk} Crown Jewel At Risk
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Target RDS database is publicly routable without KMS customer-managed key encryption at rest.
          </p>
        </div>
      </div>
    </div>
  )
}
