import { useState, useEffect } from 'react'
import Shield from 'lucide-react/dist/esm/icons/shield'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import Copy from 'lucide-react/dist/esm/icons/copy'
import Check from 'lucide-react/dist/esm/icons/check'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Database from 'lucide-react/dist/esm/icons/database'
import Lock from 'lucide-react/dist/esm/icons/lock'
import Eye from 'lucide-react/dist/esm/icons/eye'
import AlertOctagon from 'lucide-react/dist/esm/icons/alert-octagon'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw'
import Globe from 'lucide-react/dist/esm/icons/globe'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import Server from 'lucide-react/dist/esm/icons/server'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import RemediationModal from './RemediationModal'

function getNodeIcon(node, isRemediated) {
  if (isRemediated) return ShieldCheck
  if (!node) return Shield

  const type = (node.type || '').toLowerCase()
  const id = (node.id || '').toLowerCase()

  if (type === 'attacker' || id.includes('internet')) return Globe
  if (id.includes('s3') || type.includes('s3')) return HardDrive
  if (id.includes('iam') || type.includes('iam') || type.includes('lateral')) return KeyRound
  if (id.includes('ec2') || type.includes('pivot') || type.includes('compute')) return Server
  if (id.includes('rds') || type === 'crown_jewel') return Database

  return Shield
}

export default function AttackPathGraph({ interactive = true, graphData, allFindings = [] }) {
  const [selectedNode, setSelectedNode] = useState(graphData?.nodes?.[1] || graphData?.nodes?.[0] || null)
  const [copied, setCopied] = useState(false)
  const [remediatingFinding, setRemediatingFinding] = useState(null)
  const [remediatedNodes, setRemediatedNodes] = useState(new Set())

  useEffect(() => {
    if (graphData?.nodes?.length > 1) {
      setSelectedNode(graphData.nodes[1])
    } else if (graphData?.nodes?.length > 0) {
      setSelectedNode(graphData.nodes[0])
    }
  }, [graphData])

  const selectedFinding = selectedNode?.findingId
    ? allFindings.find(f => f.id === selectedNode.findingId)
    : null

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="attack-path-container animate-fade-in">
      {/* Top Threat Banner */}
      <div className="attack-header">
        <div className="attack-header-title">
          <div className="threat-pulse-orb" />
          <div>
            <h3 className="attack-title">{graphData.title || 'Cloud Lateral Movement Kill Chain'}</h3>
            <p className="attack-subtitle">
              Calculated by Sentinel Graph Analysis Engine · Composite CVSS: <strong>{graphData.cvssComposite || '9.8'}</strong>
            </p>
          </div>
        </div>

        <div className="attack-header-metrics">
          <div className="metric-box">
            <span className="metric-label">Blast Radius</span>
            <span className="metric-value text-critical">{graphData.blastRadiusScore ?? 92} / 100</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Kill Chain Hops</span>
            <span className="metric-value">{graphData.nodes?.length || 4} Vertices</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Graph Canvas */}
      <div className="attack-canvas-wrap">
        <div className="attack-nodes-row">
          {(graphData?.nodes || []).map((node, index) => {
            const isSelected = selectedNode?.id === node.id
            const isRemediated = remediatedNodes.has(node.id)
            const nodeThreat = node.threatLevel || node.threat_level || 'MEDIUM'
            const isCritical = nodeThreat === 'CRITICAL' && !isRemediated
            const isAttacker = node.type === 'attacker'
            const isCrown = node.type === 'crown_jewel'
            const IconComp = getNodeIcon(node, isRemediated)

            return (
              <div key={node.id} className="node-wrapper">
                {/* Node Box */}
                <div
                  className={`graph-node ${isSelected ? 'selected' : ''} ${isCritical ? 'critical' : ''} ${isAttacker ? 'attacker' : ''} ${isCrown ? 'crown' : ''}`}
                  style={isRemediated ? { borderColor: 'var(--sev-low)', background: 'var(--low-dim)' } : {}}
                  onClick={() => setSelectedNode(node)}
                >
                  <div className="node-icon-header">
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isRemediated ? 'var(--sev-low-bg)' : isCritical ? 'var(--sev-critical-bg)' : 'var(--bg-elevated)',
                      color: isRemediated ? 'var(--sev-low)' : isCritical ? 'var(--sev-critical)' : 'var(--text-primary)'
                    }}>
                      <IconComp size={15} />
                    </div>
                    <span className={`node-threat-pill ${isRemediated ? 'low' : nodeThreat.toLowerCase()}`}>
                      {isRemediated ? 'HARDENED' : nodeThreat}
                    </span>
                  </div>
                  <div className="node-label">{node.label || node.name || node.id}</div>
                  <div className="node-subdetail" title={isRemediated ? 'Remediated & Verified' : (node.detail || node.description || 'Target Asset')}>
                    {isRemediated ? 'Remediated & Verified' : (node.detail || node.description || 'Target Asset')}
                  </div>

                  {/* Pulsing ring on critical crown jewel */}
                  {isCrown && !remediatedNodes.size && <div className="crown-jewel-pulse" />}
                </div>

                {/* Arrow to Next Node */}
                {index < (graphData?.nodes || []).length - 1 && (
                  <div className="graph-connector">
                    <div className="connector-line" style={isRemediated ? { background: 'var(--border-subtle)' } : {}}>
                      {!isRemediated && <div className="animated-pulse-dot" />}
                    </div>
                    {(() => {
                      const hop = graphData.edges?.[index]?.label?.split('. ')[1] || graphData.edges?.[index]?.relation || 'Lateral Hop'
                      return <span className="connector-label" title={hop}>{hop}</span>
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Node Threat Inspector Panel */}
      {selectedNode && (
        <div className="attack-inspector-card">
          <div className="inspector-header">
            <div className="inspector-left">
              {(() => {
                const InspectIcon = getNodeIcon(selectedNode, remediatedNodes.has(selectedNode.id))
                return (
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: remediatedNodes.has(selectedNode.id) ? 'var(--sev-low-bg)' : 'var(--bg-elevated)',
                    color: remediatedNodes.has(selectedNode.id) ? 'var(--sev-low)' : 'var(--accent-primary)',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <InspectIcon size={18} />
                  </div>
                )
              })()}
              <div>
                <h4 className="inspector-title">{selectedNode.label || selectedNode.name || selectedNode.id}</h4>
                <span className="inspector-type">
                  Type: <strong>{(selectedNode.type || 'ASSET').toUpperCase()}</strong> · Status:{' '}
                  {remediatedNodes.has(selectedNode.id) ? (
                    <span style={{ color: 'var(--sev-low)', fontWeight: 800 }}>HARDENED (Zero-Trust Verified)</span>
                  ) : (
                    <span className="text-critical">{selectedNode.threatLevel || selectedNode.threat_level || 'ELEVATED'}</span>
                  )}
                </span>
              </div>
            </div>
            {selectedFinding && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="inspector-rule-tag">
                  Rule Violation: <strong>{selectedFinding.rule_id}</strong>
                </span>
                {!remediatedNodes.has(selectedNode.id) && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ gap: 6 }}
                    onClick={() => setRemediatingFinding(selectedFinding)}
                  >
                    <Zap size={13} /> Auto-Remediate (Dry-Run)
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="inspector-body">
            <div className="inspector-grid">
              <div className="inspector-col">
                <span className="inspector-label">Vulnerability Impact & Blast Radius</span>
                <p className="inspector-desc">
                  {remediatedNodes.has(selectedNode.id)
                    ? 'This cloud resource has been successfully remediated. The lateral movement vector is severed.'
                    : (selectedFinding ? selectedFinding.blast_radius : (selectedNode.description || selectedNode.detail || 'Exposed cloud resource.'))}
                </p>
                {selectedFinding && (
                  <div className="inspector-compliance-tags">
                    {(selectedFinding.compliance || []).map(c => (
                      <span key={c} className="compliance-pill">{c}</span>
                    ))}
                  </div>
                )}
              </div>

              {selectedFinding && (
                <div className="inspector-col">
                  <div className="inspector-action-header">
                    <span className="inspector-label">Remediation Script (AWS CLI)</span>
                    <button
                      className="btn-copy-code"
                      onClick={() => handleCopy(selectedFinding.remediation_cli)}
                    >
                      {copied ? <Check size={12} color="var(--sev-low)" /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy CLI'}
                    </button>
                  </div>
                  <pre className="inspector-code-block">
                    <code>{selectedFinding.remediation_cli}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Remediation Dry-Run Modal Triggered from Graph */}
      {remediatingFinding && (
        <RemediationModal
          finding={remediatingFinding}
          onClose={() => setRemediatingFinding(null)}
        />
      )}
    </div>
  )
}
