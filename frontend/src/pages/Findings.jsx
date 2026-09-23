import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import Search from 'lucide-react/dist/esm/icons/search'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import X from 'lucide-react/dist/esm/icons/x'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import Copy from 'lucide-react/dist/esm/icons/copy'
import Check from 'lucide-react/dist/esm/icons/check'
import Download from 'lucide-react/dist/esm/icons/download'
import Code2 from 'lucide-react/dist/esm/icons/code-2'
import Layers from 'lucide-react/dist/esm/icons/layers'
import Shield from 'lucide-react/dist/esm/icons/shield'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import Play from 'lucide-react/dist/esm/icons/play'
import Globe from 'lucide-react/dist/esm/icons/globe'
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right'
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import Server from 'lucide-react/dist/esm/icons/server'
import Database from 'lucide-react/dist/esm/icons/database'
import ReactMarkdown from 'react-markdown'
import {
  listFindings, updateFindingStatus, requestRemediation,
  dryRunRemediation, api, apiError
} from '../api/nimbus'
import { useCan } from '../auth/authStore'
import SeverityBadge from '../components/SeverityBadge'
import { useSentinelStore } from '../store/sentinelStore'
import EmptyState from '../components/EmptyState'
import { MOCK_FINDINGS } from '../data/mockData'

const SEVERITIES = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const STATUSES   = ['', 'OPEN', 'RESOLVED']
const SERVICES   = ['', 's3', 'iam', 'ec2', 'rds']

function renderServiceIcon(service) {
  switch ((service || '').toLowerCase()) {
    case 's3':  return <HardDrive size={12} className="service-vector-icon" />
    case 'iam': return <KeyRound size={12} className="service-vector-icon" />
    case 'ec2': return <Server size={12} className="service-vector-icon" />
    case 'rds': return <Database size={12} className="service-vector-icon" />
    default:    return <Layers size={12} className="service-vector-icon" />
  }
}

export default function Findings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshDataTrigger, triggerRefresh, dataSource } = useSentinelStore()

  const canRequest = useCan('remediation:request')
  const canTriage = useCan('finding:triage')
  const [findings, setFindings] = useState([])
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [inspectorTab, setInspectorTab] = useState('overview') // 'overview' | 'copilot' | 'remediate'
  const [remediationTab, setRemediationTab] = useState('cli') // 'cli' | 'tf' | 'cf'
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState(null)

  // AI Copilot state inside inspector
  const [aiLoading, setAiLoading] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')
  const [aiScript, setAiScript] = useState('')
  const [aiError, setAiError] = useState(null)

  // Auto-remediation execution state
  const [remediating, setRemediating] = useState(false)
  const [remediated, setRemediated] = useState(false)

  // Multi-select bulk state
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkRemediating, setBulkRemediating] = useState(false)

  // Filters
  const [severity, setSeverity] = useState(searchParams.get('severity') || '')
  const [status, setStatus]     = useState(searchParams.get('status') || '')
  const [service, setService]   = useState(searchParams.get('service') || '')
  const [search, setSearch]     = useState(searchParams.get('search') || '')

  useEffect(() => {
    if (searchParams.get('severity')) setSeverity(searchParams.get('severity'))
    if (searchParams.get('service'))  setService(searchParams.get('service'))
  }, [searchParams])

  const load = useCallback(async () => {
    if (dataSource === 'demo') {
      setOffline(false)
      let f = MOCK_FINDINGS
      if (severity) f = f.filter(x => x.severity === severity)
      if (status) f = f.filter(x => x.status === status)
      if (service) f = f.filter(x => x.service === service)
      setFindings(f)
      return
    }

    setLoading(true)
    try {
      const p = {}
      if (severity) p.severity = severity
      if (status)   p.status   = status
      if (service)  p.service  = service
      const data = await listFindings(p)
      setFindings(Array.isArray(data) ? data : [])
      setOffline(false)
    } catch {
      setFindings([])
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [severity, status, service, refreshDataTrigger, dataSource])

  useEffect(() => { load() }, [load])

  // Fetch AI Copilot insight when user switches to 'copilot' tab or selects a finding
  const fetchAICopilot = useCallback(async (finding) => {
    if (!finding) return
    setAiLoading(true)
    setAiError(null)
    try {
      const [expRes, scriptRes] = await Promise.all([
        api.post('/copilot/explain', finding),
        api.post('/copilot/remediate', { ...finding, format: 'cli' }),
      ])
      setAiExplanation(expRes.data.explanation)
      setAiScript(scriptRes.data.script)
    } catch (err) {
      setAiError("AI Copilot is currently offline or unreachable.")
    } finally {
      setAiLoading(false)
    }
  }, [])

  const handleSelectFinding = (f, initialTab = 'overview') => {
    setSelected(f)
    setInspectorTab(initialTab)
    setRemediated(f.status === 'RESOLVED')
    if (initialTab === 'copilot' || !aiExplanation) {
      fetchAICopilot(f)
    }
  }
  // Deep link: /findings/:findingId opens that finding's inspector (shareable URL)
  const { findingId } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    if (!findingId || !findings.length) return
    const f = findings.find(x => x.id === findingId)
    if (f && selected?.id !== f.id) handleSelectFinding(f)
  }, [findingId, findings])
  const wasOpen = useRef(false)
  useEffect(() => {
    if (selected) { wasOpen.current = true; return }
    if (findingId && wasOpen.current) navigate('/findings', { replace: true })   // closed -> clean URL
    wasOpen.current = false
  }, [selected])


  // Four-eyes: this sends the fix to an approver; AWS changes only when they approve it.
  async function handleApplyRemediation() {
    if (!selected?.id) return
    setRemediating(true)
    try {
      await requestRemediation(selected.id, '')
      setRemediated(true)
      setFindings(prev => prev.map(f => f.id === selected.id ? { ...f, status: 'IN_PROGRESS' } : f))
      setSelected(prev => ({ ...prev, status: 'IN_PROGRESS' }))
      showToast('Sent for approval — see Approvals')
      triggerRefresh()
    } catch (err) {
      showToast(`Not requested: ${apiError(err)}`)
    } finally {
      setRemediating(false)
    }
  }

  async function toggleResolve(id) {
    const nextStatus = selected?.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED'
    try {
      await updateFindingStatus(id, nextStatus)
      setFindings(prev => prev.map(f => f.id === id ? { ...f, status: nextStatus } : f))
      setSelected(prev => ({ ...prev, status: nextStatus }))
      setRemediated(nextStatus === 'RESOLVED')
      showToast(`Finding marked as ${nextStatus}`)
      triggerRefresh()
    } catch {
      showToast('Failed to update finding status')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filtered = findings.filter(f =>
    !search ||
    (f.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.resource_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.rule_id || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleSelectFinding = (id, e) => {
    e?.stopPropagation()
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map(f => f.id || f.rule_id))
    }
  }

  const handleBulkRemediate = async () => {
    if (selectedIds.length === 0 || bulkRemediating) return
    setBulkRemediating(true)
    try {
      const targets = findings.filter(f => selectedIds.includes(f.id || f.rule_id))
      const fixed = [], failed = []
      for (const target of targets) {
        try {
          await requestRemediation(target.id, 'Bulk request from Findings')
          fixed.push(target.id)
        } catch (err) {
          failed.push(`${target.rule_id}: ${apiError(err)}`)
        }
      }
      setFindings(prev => prev.map(f => fixed.includes(f.id) ? { ...f, status: 'IN_PROGRESS' } : f))
      showToast(`Sent ${fixed.length}/${targets.length} for approval` + (failed.length ? ` — failed: ${failed[0]}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}` : ''))
      setSelectedIds([])
      triggerRefresh()
    } catch {
      showToast('Bulk remediation encountered an issue')
    } finally {
      setBulkRemediating(false)
    }
  }

  const handleBulkResolve = async () => {
    if (selectedIds.length === 0) return
    try {
      const targets = findings.filter(f => selectedIds.includes(f.id || f.rule_id))
      for (const target of targets) {
        if (target.id) {
          await updateFindingStatus(target.id, 'RESOLVED').catch(() => {})
        }
      }
      setFindings(prev => prev.map(f => selectedIds.includes(f.id || f.rule_id) ? { ...f, status: 'RESOLVED' } : f))
      showToast(`Marked ${selectedIds.length} findings as RESOLVED`)
      setSelectedIds([])
      triggerRefresh()
    } catch {
      showToast('Failed to update findings')
    }
  }

  const handleExportSelectedCSV = () => {
    const targets = findings.filter(f => selectedIds.includes(f.id || f.rule_id))
    const headers = ['ID', 'Rule', 'Severity', 'Service', 'Title', 'Resource', 'RiskScore', 'Status']
    const rows = targets.map(f => [
      f.id, f.rule_id, f.severity, f.service, `"${(f.title || '').replace(/"/g, '""')}"`, `"${f.resource_id || f.resource_name}"`, f.risk_score, f.status
    ])
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `sentinel-selected-${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleExportCSV = () => {
    const headers = ['ID', 'Rule', 'Severity', 'Service', 'Title', 'Resource', 'RiskScore', 'Status']
    const rows = filtered.map(f => [
      f.id, f.rule_id, f.severity, f.service, `"${(f.title || '').replace(/"/g, '""')}"`, `"${f.resource_id || f.resource_name}"`, f.risk_score, f.status
    ])
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `sentinel-findings-${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="findings-container">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-tag">
            <AlertTriangle size={12} />
            <span>Continuous Misconfiguration Detection</span>
          </div>
          <h1 className="page-title">Security Findings</h1>
          <p className="page-subtitle">
            Autonomous multi-cloud policy audit results with Gemini AI Copilot risk analysis & one-click remediation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={handleExportCSV} title="Export CSV for SOC 2 / CIS Audit">
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-ghost" onClick={load} disabled={loading} title="Reload findings from live database">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div className="findings-filter-bar">
        <div className="search-input-wrap" style={{ minWidth: 280, flex: 1 }}>
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Filter by title, rule ID, ARN, or resource..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Severity filter pills */}
        <div className="filter-group">
          {SEVERITIES.map(sev => (
            <button
              key={sev}
              className={`filter-chip ${severity === sev ? 'active' : ''}`}
              onClick={() => setSeverity(sev)}
            >
              {sev || 'All Severities'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="filter-group">
          {STATUSES.map(st => (
            <button
              key={st}
              className={`filter-chip ${status === st ? 'active' : ''}`}
              onClick={() => setStatus(st)}
            >
              {st || 'All Statuses'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Findings Table ─────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {offline && (
            <div className="offline-banner" role="status" style={{ margin: '12px 12px 4px' }}>
              <span className="offline-dot" />
              Backend unreachable — showing demo findings, not your live cloud.
              <button className="offline-retry" onClick={load}>Retry</button>
            </div>
          )}
          <table className="findings-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="finding-checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                    title="Select All Filtered"
                  />
                </th>
                <th style={{ width: 128 }}>Severity</th>
                <th style={{ width: 95 }}>Service</th>
                <th style={{ width: 110 }}>Rule ID</th>
                <th>Finding Title & Cloud Asset</th>
                <th style={{ width: 85 }}>Risk</th>
                <th style={{ width: 105 }}>Status</th>
                <th style={{ width: 190, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      compact
                      mood="thinking"
                      title="Nothing matches those filters"
                      description="Try widening the severity or service filters, or clear the search to see everything."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map(f => {
                  const isChecked = selectedIds.includes(f.id || f.rule_id)
                  const isRowSelected = selected?.id === f.id
                  return (
                      <tr
                        key={f.id || f.rule_id}
                        onClick={() => handleSelectFinding(f, 'overview')}
                        style={{ cursor: 'pointer' }}
                        className={`finding-row ${isRowSelected ? 'row-selected' : ''} ${isChecked ? 'row-checked' : ''}`}
                      >
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="finding-checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleSelectFinding(f.id || f.rule_id, e)}
                        />
                      </td>
                      <td>
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td>
                        <span className="service-chip">
                          {renderServiceIcon(f.service)}
                          <span>{f.service?.toUpperCase()}</span>
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-cyan" style={{ fontWeight: 700, fontSize: 12 }}>
                          {f.rule_id}
                        </span>
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }} className="truncate">
                          {f.title}
                        </div>
                        <div className="font-mono text-secondary truncate" style={{ fontSize: 11 }}>
                          {f.resource_id || f.resource_name}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 800,
                          fontSize: 13,
                          color: f.risk_score >= 80 ? 'var(--sev-critical)' : f.risk_score >= 60 ? 'var(--sev-high)' : 'var(--sev-low)'
                        }}>
                          {f.risk_score}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-pill ${f.status === 'RESOLVED' ? 'badge-low' : 'badge-high'}`}>
                          {f.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="hover-actions-bar">
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--sev-low)', background: 'var(--sev-low-bg)', border: '1px solid var(--sev-low-border)' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectFinding(f, 'copilot')
                            }}
                            title="Open Gemini AI Security Analyst"
                          >
                            <Sparkles size={12} /> Copilot
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectFinding(f, 'remediate')
                            }}
                          >
                            <Zap size={12} /> Fix
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FLOATING BULK REMEDIATION ACTION DOCK ────────────── */}
      {selectedIds.length > 0 && (
        <div className="bulk-action-dock">
          <div className="dock-left">
            <span className="dock-pill">{selectedIds.length} SELECTED</span>
            <span className="dock-label">Misconfigurations staged for batch mitigation</span>
          </div>

          <div className="dock-actions">
            <button
              className="btn btn-primary btn-sm dock-action-btn pulse-glow"
              onClick={handleBulkRemediate}
              disabled={bulkRemediating || !canRequest.allowed}
              title={canRequest.reason || 'Send the selected fixes to an approver'}
            >
              <Zap size={14} className={bulkRemediating ? 'animate-spin' : ''} />
              {bulkRemediating ? `Requesting (${selectedIds.length})…` : `Request approval (${selectedIds.length})`}
            </button>

            <button
              className="btn btn-ghost btn-sm dock-action-btn"
              onClick={handleBulkResolve}
              disabled={bulkRemediating || !canTriage.allowed}
              title={canTriage.reason || undefined}
            >
              <CheckCircle2 size={14} color="#10b981" />
              <span>Mark Resolved</span>
            </button>

            <button
              className="btn btn-ghost btn-sm dock-action-btn"
              onClick={handleExportSelectedCSV}
              disabled={bulkRemediating}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

            <button
              className="btn-dock-clear"
              onClick={() => setSelectedIds([])}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── UNIFIED ALL-IN-ONE FINDING INSPECTOR DRAWER ────── */}
      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer-card inspector-drawer" onClick={e => e.stopPropagation()} style={{ width: '640px' }}>
            
            {/* Drawer Header */}
            <div className="drawer-header" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SeverityBadge severity={selected.severity} />
                <span className="font-mono text-cyan" style={{ fontWeight: 800, fontSize: 13 }}>{selected.rule_id}</span>
                <span className="service-chip" style={{ fontSize: 11 }}>
                  {renderServiceIcon(selected.service)}
                  <span>{selected.service?.toUpperCase()}</span>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className={`btn btn-sm ${selected.status === 'RESOLVED' ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={() => toggleResolve(selected.id)}
                  disabled={!canTriage.allowed}
                  title={canTriage.reason || undefined}
                  style={{ fontSize: 11.5 }}
                >
                  {selected.status === 'RESOLVED' ? <RefreshCw size={12} /> : <CheckCircle2 size={12} />}
                  {selected.status === 'RESOLVED' ? 'Reopen Finding' : 'Mark Resolved'}
                </button>
                <button className="drawer-close-btn" onClick={() => setSelected(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Inspector Navigation Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '0 24px' }}>
              <button
                className={`inspector-nav-tab ${inspectorTab === 'overview' ? 'active' : ''}`}
                onClick={() => setInspectorTab('overview')}
              >
                <Shield size={13} /> Threat Overview
              </button>
              <button
                className={`inspector-nav-tab ${inspectorTab === 'copilot' ? 'active' : ''}`}
                onClick={() => {
                  setInspectorTab('copilot')
                  if (!aiExplanation) fetchAICopilot(selected)
                }}
              >
                <Sparkles size={13} color="#10b981" /> AI Copilot Analyst
              </button>
              <button
                className={`inspector-nav-tab ${inspectorTab === 'remediate' ? 'active' : ''}`}
                onClick={() => setInspectorTab('remediate')}
              >
                <Zap size={13} color="var(--violet-bright)" /> Remediation
              </button>
            </div>

            {/* Inspector Content Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>
              
              {/* TAB 1: THREAT OVERVIEW */}
              {inspectorTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                      {selected.title}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {selected.description}
                    </p>
                  </div>

                  {/* Target Cloud Resource Box */}
                  <div className="card" style={{ padding: '14px', background: 'var(--bg-subtle)', border: '1px solid var(--border-normal)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                      Target Cloud Resource ARN
                    </div>
                    <div className="font-mono text-cyan" style={{ fontSize: 12, wordBreak: 'break-all', fontWeight: 600 }}>
                      {selected.resource_id || selected.resource_name}
                    </div>
                  </div>

                  {/* Blast Radius Assessment */}
                  <div className="card" style={{ padding: '16px', background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--critical)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} /> Blast Radius Assessment
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {selected.blast_radius || `Direct exposure: unauthorized compromise of ${selected.resource_name || 'asset'} grants lateral movement across VPC.`}
                    </div>
                  </div>

                  {/* Compliance Mappings */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Governing Compliance Frameworks
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(selected.compliance || ['CIS AWS 1.4 Benchmark §2.1', 'SOC 2 Type II CC6.1', 'PCI-DSS v3.2.1']).map(c => (
                        <span key={c} className="compliance-pill" style={{ padding: '4px 10px', fontSize: 11.5 }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Quick Action Button */}
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', gap: 8, height: 42 }}
                      onClick={() => {
                        setInspectorTab('copilot')
                        fetchAICopilot(selected)
                      }}
                    >
                      <Sparkles size={15} /> Analyze with Gemini AI Copilot
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: ✨ AI COPILOT ANALYST */}
              {inspectorTab === 'copilot' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {aiLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 14 }}>
                      <Sparkles className="animate-pulse" size={36} color="#10b981" />
                      <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>
                        Generating risk analysis with Gemini 3.5 Flash...
                      </div>
                    </div>
                  ) : aiError ? (
                    <div style={{ padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10, color: '#ef4444', display: 'flex', gap: 10 }}>
                      <AlertTriangle size={18} />
                      <div>{aiError}</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* AI Risk Card with High-Contrast Dark Styling */}
                      <div className="ai-analyst-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#38bdf8' }}>
                            Executive Risk Analysis
                          </span>
                          <button
                            onClick={() => fetchAICopilot(selected)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <RefreshCw size={11} /> Re-analyze
                          </button>
                        </div>
                        <div className="markdown-body">
                          <ReactMarkdown>{aiExplanation}</ReactMarkdown>
                        </div>
                      </div>

                      {/* Next Step Action */}
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', gap: 8, height: 42 }}
                        onClick={() => setInspectorTab('remediate')}
                      >
                        <Zap size={14} /> Review the fix
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ⚡ AUTO-REMEDIATION */}
              {inspectorTab === 'remediate' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className={`filter-chip ${remediationTab === 'cli' ? 'active' : ''}`}
                        onClick={() => setRemediationTab('cli')}
                      >
                        <Terminal size={12} /> AWS CLI
                      </button>
                      <button
                        className={`filter-chip ${remediationTab === 'tf' ? 'active' : ''}`}
                        onClick={() => setRemediationTab('tf')}
                      >
                        <Code2 size={12} /> Terraform HCL
                      </button>
                      <button
                        className={`filter-chip ${remediationTab === 'cf' ? 'active' : ''}`}
                        onClick={() => setRemediationTab('cf')}
                      >
                        <Layers size={12} /> CloudFormation
                      </button>
                    </div>

                    <button
                      className="btn-copy-code"
                      onClick={() => {
                        const code = remediationTab === 'cli' ? selected.remediation_cli || aiScript
                          : remediationTab === 'tf' ? selected.remediation_tf
                          : selected.remediation_cf || selected.remediation_cli
                        handleCopy(code)
                      }}
                    >
                      {copied ? <Check size={12} color="var(--low)" /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {/* Syntax Code Box */}
                  <pre className="inspector-code-block" style={{ maxHeight: '220px', background: '#050811', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 16 }}>
                    <code style={{ color: '#a7f3d0', fontSize: 13, lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace' }}>
                      {remediationTab === 'cli'
                        ? selected.remediation_cli || aiScript || `aws ${selected.service} remediate --resource-id ${selected.resource_id}`
                        : remediationTab === 'tf'
                        ? selected.remediation_tf || `# Terraform remediation block for ${selected.rule_id}\nresource "aws_${selected.service}_hardened" "this" {\n  # zero-trust compliance policy\n}`
                        : selected.remediation_cf || `# CloudFormation template for ${selected.rule_id}`
                      }
                    </code>
                  </pre>

                  {/* 1-Click Action */}
                  <div style={{ marginTop: 10 }}>
                    {selected.status !== 'RESOLVED' && selected.status !== 'IN_PROGRESS' && !remediated ? (
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', height: 44, gap: 8, fontSize: 13, fontWeight: 700 }}
                        onClick={handleApplyRemediation}
                        disabled={remediating || !canRequest.allowed}
                        title={canRequest.reason || 'Previews the change, then sends it to an approver'}
                      >
                        {remediating ? (
                          <>
                            <Sparkles className="animate-spin" size={15} /> Sending for approval…
                          </>
                        ) : (
                          <>
                            <Zap size={15} /> Request approval to auto-fix
                          </>
                        )}
                      </button>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--low)', borderRadius: 10, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <CheckCircle2 size={16} /> {selected.status === 'RESOLVED' ? 'Resolved' : 'Waiting for approval'}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Dynamic Island Toast */}
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
