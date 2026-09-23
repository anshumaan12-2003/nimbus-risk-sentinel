import { useState, useEffect } from 'react'
import X from 'lucide-react/dist/esm/icons/x'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Play from 'lucide-react/dist/esm/icons/play'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import Copy from 'lucide-react/dist/esm/icons/copy'
import Check from 'lucide-react/dist/esm/icons/check'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import ReactMarkdown from 'react-markdown'
import { api, requestRemediation, apiError } from '../api/nimbus'
import { useCan } from '../auth/authStore'

export default function AICopilotModal({ finding, onClose, onResolved }) {
  const [loading, setLoading] = useState(true)
  const [explanation, setExplanation] = useState('')
  const [script, setScript] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executed, setExecuted] = useState(false)
  const canRequest = useCan('remediation:request')

  useEffect(() => {
    async function fetchAI() {
      if (!finding) return
      try {
        setLoading(true)
        const [expRes, scriptRes] = await Promise.all([
          api.post('/copilot/explain', finding),
          api.post('/copilot/remediate', { ...finding, format: 'cli' })
        ])
        setExplanation(expRes.data.explanation)
        setScript(scriptRes.data.script)
      } catch (err) {
        console.error(err)
        setError("AI Copilot is currently offline or unreachable.")
      } finally {
        setLoading(false)
      }
    }
    fetchAI()
  }, [finding])

  const handleCopy = () => {
    // Extract code block content if wrapped in markdown
    const codeMatch = script.match(/```(?:bash|sh|aws)?\n([\s\S]*?)```/)
    const textToCopy = codeMatch ? codeMatch[1].trim() : script.trim()
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Asks for approval — the fix is applied by an approver, never straight from the Copilot
  const handleExecute = async () => {
    setExecuting(true)
    try {
      if (finding.id) await requestRemediation(finding.id, 'Requested from the AI Copilot explanation')
      setExecuted(true)
    } catch (err) {
      setError(`Not requested: ${apiError(err)}`)
    } finally {
      setExecuting(false)
    }
  }

  if (!finding) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content ai-copilot-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 840, padding: 0 }}>
        
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.1) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(16, 185, 129, 0.25)' }}>
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                AI Security Analyst
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 6, color: '#34d399', letterSpacing: '0.05em' }}>GEMINI-FLASH</span>
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                Analyzing finding: <strong style={{ color: '#f8fafc' }}>{finding.title}</strong>
              </p>
            </div>
          </div>
          <button className="ai-copilot-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px', maxHeight: '72vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16 }}>
              <Sparkles className="animate-pulse" size={36} color="#10b981" />
              <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500 }}>Analyzing cloud risk telemetry with Gemini...</div>
            </div>
          ) : error ? (
            <div style={{ padding: 20, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#f87171', display: 'flex', gap: 12 }}>
              <AlertTriangle size={20} />
              <div>{error}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Explanation Section */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 22px' }}>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#38bdf8', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  <ChevronRight size={14} /> Risk & Business Impact Analysis
                </h3>
                <div className="markdown-body">
                  <ReactMarkdown>{explanation}</ReactMarkdown>
                </div>
              </div>

              {/* Remediation Script Section */}
              <div style={{ background: '#050811', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 12, padding: '20px 22px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', gap: 10 }}>
                  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                    <Terminal size={14} /> Auto-Generated Remediation (AWS CLI)
                  </h3>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleCopy}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: copied ? '#34d399' : '#e2e8f0',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? 'Copied CLI' : 'Copy Script'}
                    </button>

                    <button
                      onClick={handleExecute}
                      disabled={executing || executed || !canRequest.allowed}
                      title={canRequest.reason || 'Send this fix to an approver'}
                      style={{
                        background: executed ? 'rgba(16, 185, 129, 0.2)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: executed ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
                        color: executed ? '#34d399' : '#ffffff',
                        borderRadius: 6,
                        padding: '5px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: executing || executed ? 'default' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: executed ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {executed ? (
                        <>
                          <CheckCircle2 size={13} /> Sent for approval
                        </>
                      ) : executing ? (
                        <>
                          <Sparkles className="animate-spin" size={13} /> Sending…
                        </>
                      ) : (
                        <>
                          <Play size={12} fill="currentColor" /> Request approval
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="markdown-body">
                  <ReactMarkdown>{script}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
