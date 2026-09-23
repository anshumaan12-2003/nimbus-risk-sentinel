import { useState, useEffect } from 'react'
import Shield from 'lucide-react/dist/esm/icons/shield'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Download from 'lucide-react/dist/esm/icons/download'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import Search from 'lucide-react/dist/esm/icons/search'
import Check from 'lucide-react/dist/esm/icons/check'
import Filter from 'lucide-react/dist/esm/icons/filter'
import FileCheck from 'lucide-react/dist/esm/icons/file-check'
import CreditCard from 'lucide-react/dist/esm/icons/credit-card'
import Activity from 'lucide-react/dist/esm/icons/activity'
import Layers from 'lucide-react/dist/esm/icons/layers'
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right'
import { getComplianceBenchmarks } from '../api/nimbus'
import { useSentinelStore } from '../store/sentinelStore'
import { useControls } from '../hooks/queries'
import { Link } from 'react-router-dom'

const BENCHMARK_ICONS = {
  'cis-aws-1.4': Shield,
  'cis-aws-3.0': Shield,
  'soc2-type2': FileCheck,
  'pci-dss-4.0': CreditCard,
  'hipaa-sec': Activity
}

const DEMO_RULES = [
  { id: 'cis-1.4', framework: 'CIS AWS 1.4', section: '1.4', title: 'Ensure root user has no active programmatic access keys', status: 'FAIL', severity: 'CRITICAL', service: 'IAM', recommendation: 'Delete active access keys for the root account.' },
  { id: 'cis-2.1.5', framework: 'CIS AWS 1.4', section: '2.1.5', title: 'Ensure S3 Buckets enforce S3 Block Public Access', status: 'FAIL', severity: 'CRITICAL', service: 'S3', recommendation: 'Enable all four S3 Block Public Access settings.' },
  { id: 'cis-4.1', framework: 'CIS AWS 1.4', section: '4.1', title: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22', status: 'FAIL', severity: 'HIGH', service: 'EC2', recommendation: 'Restrict SSH ingress to authorized corporate IP CIDR ranges.' },
  { id: 'cis-2.3.1', framework: 'CIS AWS 1.4', section: '2.3.1', title: 'Ensure RDS instances are not publicly accessible', status: 'FAIL', severity: 'CRITICAL', service: 'RDS', recommendation: 'Modify RDS instance to disable public accessibility.' },
  { id: 'cis-1.1', framework: 'CIS AWS 1.4', section: '1.1', title: 'Avoid the use of the root account for everyday administrative tasks', status: 'PASS', severity: 'LOW', service: 'IAM', recommendation: 'Root account has not executed console logins in 90 days.' },
  { id: 'cis-2.1.1', framework: 'CIS AWS 1.4', section: '2.1.1', title: 'Ensure S3 bucket server-side encryption is enabled', status: 'FAIL', severity: 'MEDIUM', service: 'S3', recommendation: 'Enable AWS KMS default encryption.' },
  { id: 'cis-3.1', framework: 'CIS AWS 1.4', section: '3.1', title: 'Ensure CloudTrail is enabled in all regions', status: 'PASS', severity: 'LOW', service: 'CloudTrail', recommendation: 'Multi-region CloudTrail trail is active.' },
  { id: 'soc2-cc6.1', framework: 'SOC 2 Type II', section: 'CC6.1', title: 'Logical access security perimeter & encryption controls', status: 'FAIL', severity: 'CRITICAL', service: 'S3', recommendation: 'Enforce transport-layer encryption (HTTPS) & KMS.' },
  { id: 'soc2-cc6.3', framework: 'SOC 2 Type II', section: 'CC6.3', title: 'Role-based authorization and multi-factor authentication', status: 'FAIL', severity: 'CRITICAL', service: 'IAM', recommendation: 'Require MFA for all administrative identities.' },
]

const DEMO_BENCHMARKS = [
        { id: 'cis-aws-1.4', name: 'CIS AWS Foundations Benchmark v1.4', score: 82, passingRules: 41, failingRules: 9, category: 'Foundational Baseline', status: 'ACTION_REQUIRED', icon: 'shield', color: '#8b5cf6' },
        { id: 'soc2-type2', name: 'SOC 2 Type II (Security & Confidentiality)', score: 89, passingRules: 34, failingRules: 4, category: 'Trust Services Criteria', status: 'NEAR_COMPLIANT', icon: 'file-check', color: '#06b6d4' },
        { id: 'pci-dss-4.0', name: 'PCI-DSS v4.0 (Cardholder Data Protection)', score: 74, passingRules: 29, failingRules: 10, category: 'Payment Card Security', status: 'HIGH_RISK', icon: 'credit-card', color: '#f97316' },
        { id: 'hipaa-sec', name: 'HIPAA Security Rule (ePHI Safeguards)', score: 86, passingRules: 31, failingRules: 5, category: 'Healthcare Data Privacy', status: 'NEAR_COMPLIANT', icon: 'activity', color: '#10b981' }
]

export default function Compliance() {
  const [selectedFramework, setSelectedFramework] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [benchmarks, setBenchmarks] = useState([])
  const { dataSource } = useSentinelStore()

  useEffect(() => {
    if (dataSource !== 'demo') {
      getComplianceBenchmarks().then(setBenchmarks).catch(err => {
        console.warn('[compliance] live data unavailable:', err?.message)
        setBenchmarks([])
      })
    } else {
      // Inline mock fallback for demo mode
      setBenchmarks(DEMO_BENCHMARKS)
    }
  }, [dataSource])

  // Live: real per-control results from the latest scan (GET /compliance/controls)
  const controlsQ = useControls()
  const FW_LABEL = { cis: 'CIS', soc2: 'SOC 2', pci: 'PCI', hipaa: 'HIPAA' }
  const rules = dataSource === 'demo' ? DEMO_RULES : (controlsQ.data?.controls || []).map(c => ({
    id: c.id,
    section: c.id,
    framework: Object.entries(c.frameworks).map(([k, v]) => `${FW_LABEL[k]} ${v}`).join(' · '),
    title: c.title,
    status: c.status,
    service: c.service,
    rules: c.rules,
    failing: c.failing_finding_ids,
  }))

  const filteredRules = rules.filter((r) => {
    if (selectedFramework !== 'ALL' && !r.framework.includes(selectedFramework)) return false
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.section.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalPassing = benchmarks.reduce((acc, b) => acc + b.passingRules, 0)
  const totalFailing = benchmarks.reduce((acc, b) => acc + b.failingRules, 0)
  const averagePassingScore = benchmarks.length ? Math.round(
    benchmarks.reduce((acc, b) => acc + b.score, 0) / benchmarks.length
  ) : 0

  return (
    <div className="compliance-page animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-tag">
            <Shield size={12} />
            <span>Compliance & Regulatory Auditing</span>
          </div>
          <h1 className="page-title">Security Compliance Matrix</h1>
          <p className="page-subtitle">
            Automated continuous mapping against CIS AWS Foundations v1.4, SOC 2 Type II, PCI-DSS v4.0, and HIPAA.
          </p>
        </div>

        <button
          className="btn btn-ghost"
          onClick={() => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(benchmarks, null, 2))
            const dlAnchor = document.createElement('a')
            dlAnchor.setAttribute("href", dataStr)
            dlAnchor.setAttribute("download", `compliance-matrix-${Date.now()}.json`)
            document.body.appendChild(dlAnchor)
            dlAnchor.click()
            dlAnchor.remove()
          }}
        >
          <Download size={14} />
          Export Audit Pack (JSON)
        </button>
      </div>

      {/* 4 Benchmark Dials */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        {benchmarks.map((bench) => {
          const IconComp = BENCHMARK_ICONS[bench.id] || Shield
          return (
            <div key={bench.id} className="card hover-lift" style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${bench.color}18`, color: bench.color,
                  border: `1px solid ${bench.color}30`
                }}>
                  <IconComp size={18} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                  background: `${bench.color}15`, color: bench.color, border: `1px solid ${bench.color}30`,
                  letterSpacing: '0.02em'
                }}>
                  {bench.score}% Passing
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.01em' }}>{bench.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>{bench.category}</div>

              {/* Progress */}
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{
                  height: '100%', width: `${bench.score}%`,
                  background: bench.color,
                  borderRadius: 3,
                  transition: 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{bench.passingRules} Controls Met</span>
                <span style={{ color: 'var(--sev-critical)', fontWeight: 600 }}>{bench.failingRules} Violations</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rules Table Filter */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['ALL', 'CIS', 'SOC 2', 'PCI', 'HIPAA'].map((f) => (
              <button
                key={f}
                className={`filter-chip ${selectedFramework === f ? 'active' : ''}`}
                onClick={() => setSelectedFramework(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'FAIL', 'PASS', 'NOT_EVALUATED'].map((s) => (
                <button
                  key={s}
                  className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'NOT_EVALUATED' ? 'NOT EVALUATED' : s}
                </button>
              ))}
            </div>

            <div className="search-input-wrap" style={{ width: 240 }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search rule or section..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Section</th>
                <th>Framework</th>
                <th>Security Control Title</th>
                <th>Service</th>
                <th>Remediation Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {dataSource !== 'demo' && controlsQ.isLoading && (
                <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Loading controls…</td></tr>
              )}
              {dataSource !== 'demo' && !controlsQ.isLoading && filteredRules.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                  {controlsQ.data?.scan_id ? 'No controls match these filters.' : 'No completed scan yet — run a scan to evaluate controls.'}
                </td></tr>
              )}
              {filteredRules.map((rule) => {
                const isFail = rule.status === 'FAIL'
                const notEval = rule.status === 'NOT_EVALUATED'
                return (
                  <tr key={rule.id}>
                    <td>
                      <span className={`badge-pill ${isFail ? 'badge-critical' : notEval ? 'badge-medium' : 'badge-low'}`}
                            title={notEval ? 'Scanner could not read this service (permission/API warning)' : undefined}>
                        {notEval ? 'N/E' : rule.status}
                      </span>
                    </td>
                    <td className="font-mono text-cyan" style={{ fontWeight: 600 }}>{rule.section}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rule.framework}</td>
                    <td style={{ fontWeight: 600, maxWidth: 300 }}>{rule.title}</td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--accent-primary)' }}>
                        {rule.service}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {rule.recommendation ?? (
                        rule.failing?.length
                          ? <Link to={`/findings?search=${rule.rules[0]}`}>{rule.failing.length} failing finding{rule.failing.length > 1 ? 's' : ''} → fix</Link>
                          : <span className="font-mono">{rule.rules?.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
