import { useState, useEffect, useCallback } from 'react'
import GitPullRequest from 'lucide-react/dist/esm/icons/git-pull-request'
import Shield from 'lucide-react/dist/esm/icons/shield'
import Search from 'lucide-react/dist/esm/icons/search'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import XCircle from 'lucide-react/dist/esm/icons/x-circle'
import Code2 from 'lucide-react/dist/esm/icons/code-2'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import X from 'lucide-react/dist/esm/icons/x'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import Copy from 'lucide-react/dist/esm/icons/copy'
import Check from 'lucide-react/dist/esm/icons/check'
import Upload from 'lucide-react/dist/esm/icons/upload'
import Play from 'lucide-react/dist/esm/icons/play'
import Activity from 'lucide-react/dist/esm/icons/activity'
import FileCode from 'lucide-react/dist/esm/icons/file-code'
import Layers from 'lucide-react/dist/esm/icons/layers'
import Lock from 'lucide-react/dist/esm/icons/lock'
import Zap from 'lucide-react/dist/esm/icons/zap'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import Server from 'lucide-react/dist/esm/icons/server'
import Database from 'lucide-react/dist/esm/icons/database'
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert'
import MessageSquareCode from 'lucide-react/dist/esm/icons/message-square-code'
import { useSentinelStore } from '../store/sentinelStore'
import SeverityBadge from '../components/SeverityBadge'
import EmptyState from '../components/EmptyState'
import { scanIacDemo, api, apiError } from '../api/nimbus'

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const SEVERITY_COLORS = {
  CRITICAL: { bg: 'var(--sev-critical-bg)', border: 'var(--sev-critical-border)', text: 'var(--sev-critical)', dot: 'var(--sev-critical)' },
  HIGH:     { bg: 'var(--sev-high-bg)',     border: 'var(--sev-high-border)',     text: 'var(--sev-high)',     dot: 'var(--sev-high)' },
  MEDIUM:   { bg: 'var(--sev-medium-bg)',   border: 'var(--sev-medium-border)',   text: 'var(--sev-medium)',   dot: 'var(--sev-medium)' },
  LOW:      { bg: 'var(--sev-low-bg)',      border: 'var(--sev-low-border)',      text: 'var(--sev-low)',      dot: 'var(--sev-low)' },
}
const SERVICE_ICONS = {
  s3: HardDrive,
  iam: KeyRound,
  ec2: Server,
  rds: Database
}



export default function IacScanner() {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [filterSev, setFilterSev] = useState('')
  const [filterSvc, setFilterSvc] = useState('')
  const [hclInput, setHclInput] = useState('')
  const [mode, setMode] = useState('demo') // 'demo' | 'paste'
  const [toast, setToast] = useState(null)
  const { dataSource } = useSentinelStore()

  const runScan = useCallback(async () => {
    setLoading(true)
    setResults(null)
    setSelected(null)
    try {
      let data
      if (mode === 'paste' && hclInput.trim()) {
        // through the shared client: correct base URL + the signed-in user's token
        data = (await api.post('/iac/scan/content', { hcl_content: hclInput, filename: 'user-input.tf' })).data
      } else {
        data = await scanIacDemo()
      }
      setResults(data)
    } catch (e) {
      showToast(`Scan failed: ${apiError(e)}`)
    } finally {
      setLoading(false)
    }
  }, [mode, hclInput])

  // Auto-run demo scan on mount
  useEffect(() => { runScan() }, [])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('Copied to clipboard')
  }

  const filtered = (results?.findings || []).filter(f =>
    (!filterSev || f.severity === filterSev) &&
    (!filterSvc || f.service === filterSvc) &&
    (!search || f.title.toLowerCase().includes(search.toLowerCase()) || f.rule_id.toLowerCase().includes(search.toLowerCase()) || f.file_path.toLowerCase().includes(search.toLowerCase()))
  )

  const summary = results?.severity_summary || {}
  const criticalCount = summary.CRITICAL || 0
  const passed = results?.passed

  return (
    <div className="findings-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-tag">
            <GitPullRequest size={12} />
            <span>Shift-Left Security · Pre-Commit & CI/CD</span>
          </div>
          <h1 className="page-title">IaC Security Scanner</h1>
          <p className="page-subtitle">
            Static analysis of Terraform infrastructure-as-code. Detects misconfigurations before deployment via GitHub Actions PR integration.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={`filter-chip ${mode === 'demo' ? 'active' : ''}`}
            onClick={() => setMode('demo')}
          >
            <Play size={12} /> Demo Scan
          </button>
          <button
            className={`filter-chip ${mode === 'paste' ? 'active' : ''}`}
            onClick={() => setMode('paste')}
          >
            <Code2 size={12} /> Paste HCL
          </button>
          <button className="btn btn-primary" onClick={runScan} disabled={loading}>
            <Zap size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            {loading ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </div>

      {/* HCL Paste Mode */}
      {mode === 'paste' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileCode size={13} /> Paste Terraform HCL Configuration
          </div>
          <textarea
            value={hclInput}
            onChange={e => setHclInput(e.target.value)}
            placeholder={`# Paste your Terraform resource blocks here\nresource "aws_s3_bucket" "example" {\n  bucket = "my-bucket"\n}\n\nresource "aws_s3_bucket_public_access_block" "example" {\n  bucket               = aws_s3_bucket.example.id\n  block_public_acls    = false  # Flagged by Sentinel!\n  ignore_public_acls   = false\n  block_public_policy  = true\n  restrict_public_buckets = true\n}`}
            style={{
              width: '100%', minHeight: 200, fontFamily: "var(--font-mono)",
              fontSize: 12, lineHeight: 1.7, padding: '14px 16px', resize: 'vertical',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Scan Status Banner */}
      {results && (
        <div style={{
          padding: '16px 20px',
          background: passed ? 'var(--sev-low-bg)' : 'var(--sev-critical-bg)',
          border: `1px solid ${passed ? 'var(--sev-low-border)' : 'var(--sev-critical-border)'}`,
          borderRadius: 14,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          {passed
            ? <CheckCircle2 size={22} color="var(--sev-low)" />
            : <XCircle size={22} color="var(--sev-critical)" />
          }
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: passed ? 'var(--sev-low)' : 'var(--sev-critical)' }}>
              {passed ? 'IaC Scan Passed — Zero Critical Violations' : `PR Merge Blocked — ${criticalCount} Critical Misconfiguration${criticalCount > 1 ? 's' : ''} Detected`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Scanned {results.resources_scanned || 0} Terraform resources · {results.total_findings || 0} total findings
            </div>
          </div>
          {!passed && (
            <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--sev-critical)', background: 'var(--sev-critical-bg)', border: '1px solid var(--sev-critical-border)', padding: '4px 10px', borderRadius: 6, letterSpacing: '0.02em' }}>
              BLOCKS GITHUB MERGE
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      {results && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {SEVERITY_ORDER.map(sev => {
            const col = SEVERITY_COLORS[sev]
            const count = summary[sev] || 0
            const isSelected = filterSev === sev
            return (
              <div
                key={sev}
                className="card hover-lift"
                onClick={() => setFilterSev(isSelected ? '' : sev)}
                style={{
                  padding: '16px 20px', cursor: 'pointer',
                  borderColor: isSelected ? col.dot : undefined,
                  background: isSelected ? col.bg : undefined,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: col.text, marginBottom: 6 }}>
                  {sev}
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-1.5px', color: col.dot }}>
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters Bar */}
      {results && (
        <div className="card filters-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center' }}>
            <div className="search-input-wrap" style={{ flex: 1, minWidth: 220 }}>
              <Search size={14} className="search-icon" />
              <input type="text" placeholder="Search by rule ID, title, or file path..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="filter-select" value={filterSev} onChange={e => setFilterSev(e.target.value)}>
              <option value="">All Severities</option>
              {SEVERITY_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="filter-select" value={filterSvc} onChange={e => setFilterSvc(e.target.value)}>
              <option value="">All Services</option>
              {['s3', 'iam', 'ec2', 'rds'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
            {(filterSev || filterSvc || search) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSev(''); setFilterSvc(''); setSearch('') }}>
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%', margin: '0 auto 16px',
            background: 'var(--accent-glow)', border: '1px solid var(--accent-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)'
          }}>
            <Activity size={26} className="spin" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Executing Shift-Left Policy Verification...</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Analyzing Terraform resources for misconfigurations against CIS AWS Benchmark rules
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {['Parsing HCL AST', 'Checking S3 Policies', 'Validating IAM Permissions', 'Auditing EC2 Ingress', 'RDS Storage Encryption'].map((step, i) => (
              <span key={step} style={{
                fontSize: 11, padding: '4px 10px',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: 6, fontWeight: 600
              }}>
                {step}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Findings Table */}
      {!loading && results && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Service</th>
                  <th>Rule ID</th>
                  <th>Title & Resource</th>
                  <th>File Location</th>
                  <th>Compliance</th>
                  <th>Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState compact mood="thinking" title="Nothing matches those filters" description="Loosen a filter or scan another template." />
                    </td>
                  </tr>
                ) : filtered.map((f, i) => {
                  const SvcIcon = SERVICE_ICONS[f.service] || Layers
                  return (
                    <tr key={i} onClick={() => setSelected(f)} style={{ cursor: 'pointer' }} className={selected?.rule_id === f.rule_id && selected?.resource_name === f.resource_name ? 'row-selected' : ''}>
                      <td><SeverityBadge severity={f.severity} /></td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                          <SvcIcon size={13} style={{ color: 'var(--accent-primary)' }} />
                          {f.service}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-cyan" style={{ fontSize: 12, fontWeight: 600 }}>{f.rule_id}</span>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }} className="truncate">{f.title}</div>
                        <div className="font-mono text-secondary truncate" style={{ fontSize: 11 }}>{f.resource_type}.{f.resource_name}</div>
                      </td>
                      <td>
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--accent-primary)' }}>{f.file_path}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>line {f.line_number}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
                          {(f.compliance || []).slice(0, 2).map(c => (
                            <span key={c} className="compliance-pill" style={{ fontSize: 10 }}>{c}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 800, fontSize: 13,
                          color: f.risk_score >= 90 ? 'var(--sev-critical)' : f.risk_score >= 70 ? 'var(--sev-high)' : f.risk_score >= 50 ? 'var(--sev-medium)' : 'var(--sev-low)'
                        }}>{f.risk_score}</span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelected(f) }}>
                          Inspect <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer-card" onClick={e => e.stopPropagation()} style={{ width: '560px' }}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SeverityBadge severity={selected.severity} />
                <span className="font-mono text-cyan" style={{ fontWeight: 700 }}>{selected.rule_id}</span>
              </div>
              <button className="drawer-close-btn" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{selected.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{selected.description}</p>
              </div>

              {/* File Location */}
              <div className="card" style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>File Location</div>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--accent-primary)' }}>
                  {selected.file_path}:{selected.line_number}
                </div>
              </div>

              {/* Compliance Tags */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={11} /> Compliance Frameworks
                </div>
                <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', gap: 6 }}>
                  {(selected.compliance || []).map(c => (
                    <span key={c} className="compliance-pill">{c}</span>
                  ))}
                </div>
              </div>

              {/* Terraform Fix */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Terminal size={11} /> Terraform Fix (HCL)
                  </div>
                  <button className="btn-copy-code" onClick={() => handleCopy(selected.remediation_hcl)}>
                    {copied ? <Check size={12} color="var(--sev-low)" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="inspector-code-block" style={{ maxHeight: '160px' }}>
                  <code>{selected.remediation_hcl}</code>
                </pre>
              </div>

              {/* Risk Score */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="card" style={{ flex: 1, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Risk Score</div>
                  <div style={{
                    fontSize: 28, fontWeight: 900,
                    color: selected.risk_score >= 90 ? 'var(--sev-critical)' : selected.risk_score >= 70 ? 'var(--sev-high)' : 'var(--sev-medium)'
                  }}>{selected.risk_score}</div>
                </div>
                <div className="card" style={{ flex: 2, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Resource</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{selected.resource_type}</div>
                  <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>"{selected.resource_name}"</div>
                </div>
              </div>

              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CI/CD Pipeline Info Panel */}
      {!loading && results && (
        <div className="card" style={{ marginTop: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <GitPullRequest size={16} color="var(--accent-primary)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>GitHub Actions PR Integration</div>
            <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--sev-low-bg)', color: 'var(--sev-low)', borderRadius: 4, fontWeight: 700 }}>ACTIVE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 12 }}>
            {[
              { Icon: Search, label: 'Scan Trigger', value: 'Every PR modifying **.tf files', color: 'var(--accent-primary)' },
              { Icon: ShieldAlert, label: 'Block Condition', value: 'Any CRITICAL finding → PR blocked', color: 'var(--sev-critical)' },
              { Icon: MessageSquareCode, label: 'PR Comments', value: 'Auto-posts findings as review comments', color: 'var(--cyan)' },
            ].map(({ Icon, label, value, color }) => (
              <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-surface)', color
                }}>
                  <Icon size={16} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="dynamic-island-wrapper">
          <div className="dynamic-island expanded">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  )
}
