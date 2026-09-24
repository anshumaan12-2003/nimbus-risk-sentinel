import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pageFor } from '@/app/nav'
import { useFindings } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { deleteConversation, getConversation, listConversations, rateMessage, renameConversation, streamChat } from '@/api/nimbus'

export const RULE_RE = /\b(?:IAM|S3|EC2|RDS)-\d{3}\b/g
const CONVERSATIONS = ['vesper', 'conversations']

/* Slash commands expand into full questions. {focus} is the open finding's rule id, else "my top risk". */
export const SLASH = [
  { cmd: '/first', label: 'What should I fix first?', prompt: () => 'What should I fix first, and why that one?' },
  { cmd: '/explain', label: 'Explain in plain language', prompt: f => `Explain ${f} in plain language: what's wrong, why it matters, and what an attacker could do with it.` },
  { cmd: '/fix', label: 'How to fix it safely', prompt: f => `How do I fix ${f}? Give the safest change, what it could break, and a CLI or Terraform reference.` },
  { cmd: '/report', label: 'Status update for a manager', prompt: () => 'Write a short status update on our cloud risk for a manager: overall posture, the top three risks, and what to do next.' },
]

/*
  Everything Vesper's panel and full page share: the active conversation (kept in the store so both
  views show the same one), streaming with stop/regenerate, page context, citations and ratings.
*/
export function useVesper() {
  const qc = useQueryClient()
  const location = useLocation()
  const { vesperConversationId: convoId, setVesperConversation } = useSentinelStore()
  const [title, setTitle] = useState('')
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const loadedRef = useRef(null)

  const findings = useFindings()
  const byRule = useMemo(() => {
    const m = new Map()
    for (const f of findings.data || []) {
      const list = m.get(f.rule_id) || []
      list.push(f); m.set(f.rule_id, list)
    }
    for (const list of m.values()) list.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    return m
  }, [findings.data])

  // What the reader is looking at: sent with each question, and shown as a chip.
  const page = pageFor(location.pathname)
  const findingId = matchPath('/findings/:findingId', location.pathname)?.params.findingId
  const openFinding = findingId ? (findings.data || []).find(f => String(f.id) === findingId) : null
  const context = { page: page?.label?.toLowerCase(), finding_id: findingId || undefined }
  const focus = openFinding ? openFinding.rule_id : 'my top risk'

  const conversations = useQuery({ queryKey: CONVERSATIONS, queryFn: listConversations, staleTime: 30_000 })

  // Load a saved conversation when it becomes active (not while we're the ones writing it).
  useEffect(() => {
    if (!convoId || streaming || loadedRef.current === convoId) return
    loadedRef.current = convoId
    getConversation(convoId).then(c => { setTitle(c.title); setMessages(c.messages) })
      .catch(() => { setVesperConversation(null) })
  }, [convoId, streaming, setVesperConversation])

  const newConversation = useCallback(() => {
    abortRef.current?.abort()
    loadedRef.current = null
    setVesperConversation(null); setTitle(''); setMessages([]); setError(null)
  }, [setVesperConversation])

  const openConversation = useCallback((id) => {
    abortRef.current?.abort()
    loadedRef.current = null
    setError(null); setMessages([]); setVesperConversation(id)
  }, [setVesperConversation])

  const send = useCallback(async (question) => {
    const q = question.trim()
    if (!q || streaming) return
    setError(null)
    const ctrl = new AbortController(); abortRef.current = ctrl
    setStreaming(true)
    setMessages(m => [...m, { role: 'user', text: q }, { role: 'assistant', text: '', streaming: true, citations: [] }])
    const patchLast = (fn) => setMessages(m => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c })
    try {
      await streamChat({ question: q, conversation_id: convoId || undefined, context }, {
        signal: ctrl.signal,
        onEvent: (name, data) => {
          if (name === 'meta') {
            loadedRef.current = data.conversation_id
            if (!convoId) setVesperConversation(data.conversation_id)
            setTitle(data.title)
          } else if (name === 'delta') {
            patchLast(a => ({ ...a, text: a.text + data.text }))
          } else if (name === 'done') {
            patchLast(a => ({ ...a, id: data.message_id, ai: data.ai, citations: data.citations, scanAt: data.scan_completed_at, streaming: false }))
          } else if (name === 'error') {
            patchLast(a => ({ ...a, streaming: false, failed: data.detail }))
          }
        },
      })
    } catch (e) {
      if (e.name === 'AbortError') patchLast(a => ({ ...a, streaming: false, stopped: true }))
      else { patchLast(a => ({ ...a, streaming: false, failed: e.message })); setError(e.message) }
    } finally {
      setStreaming(false)
      abortRef.current = null
      qc.invalidateQueries({ queryKey: CONVERSATIONS })
    }
  }, [streaming, convoId, context.page, context.finding_id, setVesperConversation, qc]) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const regenerate = useCallback(() => {
    const lastQ = [...messages].reverse().find(m => m.role === 'user')
    if (lastQ) send(lastQ.text)
  }, [messages, send])

  const rate = useCallback(async (messageId, rating) => {
    setMessages(m => m.map(x => x.id === messageId ? { ...x, rating: rating || null } : x))
    try { await rateMessage(messageId, rating) } catch { /* a lost rating isn't worth an error */ }
  }, [])

  const rename = useCallback(async (t) => {
    const clean = t.trim()
    if (!convoId || !clean) return
    setTitle(clean)
    await renameConversation(convoId, clean)
    qc.invalidateQueries({ queryKey: CONVERSATIONS })
  }, [convoId, qc])

  const remove = useCallback(async (id) => {
    await deleteConversation(id)
    if (id === convoId) newConversation()
    qc.invalidateQueries({ queryKey: CONVERSATIONS })
  }, [convoId, newConversation, qc])

  return {
    convoId, title, messages, streaming, error, conversations, byRule, page, openFinding, focus,
    send, stop, regenerate, rate, rename, remove, newConversation, openConversation,
  }
}

/* Turns rule ids in an answer into citation links the renderer shows as chips: `RDS-001`, [RDS-001], RDS-001. */
export function linkCitations(text) {
  return text
    .replace(/`((?:IAM|S3|EC2|RDS)-\d{3})`/g, '[$1](#cite-$1)')
    .replace(/\[((?:IAM|S3|EC2|RDS)-\d{3})\](?!\()/g, '[$1](#cite-$1)')
    .replace(/(?<![[\w#-])((?:IAM|S3|EC2|RDS)-\d{3})(?![\w\]])/g, '[$1](#cite-$1)')
}

/* Follow-up questions offered under the latest answer, built from what it cited. */
export function followUps(citations = []) {
  const first = citations[0]
  if (!first) return ['What should I fix first?', 'Summarise my risk for a manager']
  const out = [`How do I fix ${first} safely?`, `What breaks if I fix ${first}?`]
  if (citations[1]) out.push(`Is ${citations[1]} related to ${first}?`)
  else out.push('Explain this for my manager')
  return out
}
