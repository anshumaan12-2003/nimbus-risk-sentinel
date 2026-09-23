import { useState, useEffect, useRef } from 'react'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import X from 'lucide-react/dist/esm/icons/x'
import Send from 'lucide-react/dist/esm/icons/send'
import Bot from 'lucide-react/dist/esm/icons/bot'
import User from 'lucide-react/dist/esm/icons/user'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import Shield from 'lucide-react/dist/esm/icons/shield'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import Zap from 'lucide-react/dist/esm/icons/zap'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import CornerDownLeft from 'lucide-react/dist/esm/icons/corner-down-left'
import ReactMarkdown from 'react-markdown'
import { useSentinelStore } from '../store/sentinelStore'
import { api, apiError } from '../api/nimbus'

const SUGGESTIONS = [
  'Summarize my cloud risk posture',
  'What are my critical vulnerabilities in AWS?',
  'How do I fix Root Account MFA?',
  'Generate Terraform zero-trust hardening script'
]

export default function GlobalAICopilotDrawer() {
  const { globalCopilotOpen, closeGlobalCopilot, toggleGlobalCopilot } = useSentinelStore()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi! I'm the **Nimbus Security Copilot**. I answer from your latest scan: findings, risk score and fixes. Ask what to fix first, how to fix a rule, or for a Terraform / CLI patch.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // Listen for ⌘J / Ctrl+J
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        toggleGlobalCopilot()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleGlobalCopilot])

  useEffect(() => {
    if (globalCopilotOpen) {
      document.body.classList.add('modal-open')
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => document.body.classList.remove('modal-open')
  }, [messages, globalCopilotOpen])

  const handleSend = async (userText = input) => {
    const query = userText.trim()
    if (!query || loading) return

    const userMsg = {
      role: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // Server builds context from the latest scan and keeps the model grounded in it
      const history = messages.slice(1).map(m => ({ role: m.role, text: m.text }))
      const res = await api.post('/copilot/chat', { question: query, history })
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: res.data.answer,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `Could not reach the backend: ${apiError(err)}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Slide-out Conversational Drawer */}
      {globalCopilotOpen && (
        <div className="drawer-overlay" onClick={closeGlobalCopilot} style={{ zIndex: 2200 }}>
          <div
            className="drawer-card global-copilot-drawer"
            onClick={e => e.stopPropagation()}
            style={{ width: '520px', maxWidth: '92vw' }}
          >
            {/* Header */}
            <div className="copilot-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="copilot-avatar-box">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Nimbus AI Copilot
                    <span className="copilot-model-pill">GEMINI-FLASH</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    SecOps Copilot · grounded in latest scan
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="copilot-header-btn"
                  onClick={() => setMessages(messages.slice(0, 1))}
                  title="Clear Chat History"
                >
                  <RefreshCw size={13} />
                </button>
                <button className="copilot-header-btn" onClick={closeGlobalCopilot} title="Close (Esc)">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Suggestions Bar */}
            <div className="copilot-suggestions-bar">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>
                Suggested Inquiries
              </div>
              <div className="suggestions-scroll">
                {SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    className="suggestion-pill"
                    onClick={() => handleSend(sug)}
                    disabled={loading}
                  >
                    <ChevronRight size={11} color="#38bdf8" />
                    <span>{sug}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Thread */}
            <div className="copilot-messages-container">
              {messages.map((m, idx) => (
                <div key={idx} className={`copilot-message-row ${m.role === 'user' ? 'user-row' : 'bot-row'}`}>
                  <div className={`message-avatar ${m.role === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
                    {m.role === 'user' ? <User size={13} /> : <Bot size={14} />}
                  </div>

                  <div className={`message-bubble ${m.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}>
                    <div className="message-text markdown-body">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                    <div className="message-meta">
                      {m.role === 'assistant' ? 'Nimbus AI' : 'You'} · {m.time}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="copilot-message-row bot-row">
                  <div className="message-avatar bot-avatar">
                    <Bot size={14} />
                  </div>
                  <div className="message-bubble bot-bubble" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#38bdf8', fontSize: 13 }}>
                      <Sparkles className="animate-spin" size={15} />
                      <span>Synthesizing cloud telemetry with Gemini...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="copilot-input-bar">
              <form
                onSubmit={e => {
                  e.preventDefault()
                  handleSend()
                }}
                className="copilot-input-form"
              >
                <input
                  type="text"
                  placeholder="Ask anything about risks, IAM policies, or zero-trust patches..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={loading}
                  className="copilot-text-input"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="copilot-send-btn"
                  title="Send message (Enter)"
                >
                  <Send size={14} />
                </button>
              </form>
              <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                Press <strong>Enter</strong> to send · <strong>⌘J</strong> to toggle
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
