import axios from 'axios'

/*
  API_BASE empty (recommended) -> same-origin requests through the Vite proxy (/api, /ws).
  Same origin means no CORS, and the refresh cookie can be SameSite=Strict.
  Set VITE_API_URL only when the API is hosted on a different origin.
*/
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30000,
  withCredentials: true,          // sends the httpOnly refresh cookie to /auth/*
  headers: { 'Content-Type': 'application/json' },
})

export function wsUrl(token) {
  const base = import.meta.env.VITE_WS_URL
    || (API_BASE ? API_BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
  return `${base}/ws/events${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

/*
  Auth wiring. The auth store registers these handlers (avoids a circular import):
   - every request carries the in-memory access token
   - a 401 triggers ONE shared refresh (httpOnly cookie) and the request is retried once
   - if the refresh fails, the app returns to the sign-in screen
*/
let authHandlers = { getToken: () => null, refresh: async () => null, onExpired: () => {} }
export const configureAuth = (h) => { authHandlers = { ...authHandlers, ...h } }
const NO_RETRY = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/setup', '/auth/status'])

api.interceptors.request.use((config) => {
  const token = authHandlers.getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use((r) => r, async (error) => {
  const { config, response } = error
  if (response?.status !== 401 || !config || config._retried || NO_RETRY.has(config.url)) throw error
  config._retried = true
  const token = await authHandlers.refresh()
  if (!token) { authHandlers.onExpired(); throw error }
  config.headers.Authorization = `Bearer ${token}`
  return api(config)
})

// ─── Vesper (assistant) ───────────────────────────────────────────────────────
export const listConversations = () => api.get('/assistant/conversations').then(r => r.data)
export const getConversation = (id) => api.get(`/assistant/conversations/${id}`).then(r => r.data)
export const renameConversation = (id, title) => api.patch(`/assistant/conversations/${id}`, { title }).then(r => r.data)
export const deleteConversation = (id) => api.delete(`/assistant/conversations/${id}`)
export const rateMessage = (id, rating) => api.patch(`/assistant/messages/${id}`, { rating }).then(r => r.data)

/*
  Streams an answer from POST /assistant/chat (Server-Sent Events) and calls onEvent(name, data) for
  each event as it arrives. Uses fetch (axios can't stream in the browser) with the same auth rules:
  in-memory token, one shared refresh on 401, back to sign-in if that fails. Abort with `signal`.
*/
export async function streamChat(body, { signal, onEvent }) {
  const send = (token) => fetch(`${API_BASE}/api/v1/assistant/chat`, {
    method: 'POST', signal, credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  let res = await send(authHandlers.getToken())
  if (res.status === 401) {
    const token = await authHandlers.refresh()
    if (!token) { authHandlers.onExpired(); throw new Error('Your session ended. Sign in again.') }
    res = await send(token)
  }
  if (res.status === 404) {
    // The UI can deploy before the API does (Vercel is instant; a free Render build takes longer). An
    // API without Vesper's endpoint still has the older grounded chat, so answer through that: same
    // events, no saved conversation, no rating.
    const { answer, ai } = (await api.post('/copilot/chat', { question: body.question, history: [] }, { signal })).data
    onEvent('meta', { conversation_id: null, title: body.question.slice(0, 60) })
    onEvent('delta', { text: answer })
    onEvent('done', { message_id: null, ai, citations: [...new Set(answer.match(/\b(?:IAM|S3|EC2|RDS)-\d{3}\b/g) || [])], scan_completed_at: null })
    return
  }
  if (!res.ok) {
    let detail = `Vesper couldn't answer (HTTP ${res.status}).`
    try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : detail } catch { /* not JSON */ }
    throw new Error(detail)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let cut
    while ((cut = buf.indexOf('\n\n')) >= 0) {           // one SSE event per blank-line-terminated block
      const block = buf.slice(0, cut); buf = buf.slice(cut + 2)
      let event = 'message', data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (data) onEvent(event, JSON.parse(data))
    }
  }
}

// ─── Scans ────────────────────────────────────────────────────────────────────
export const triggerScan = (regions = null) =>
  api.post('/scans/trigger', { regions }).then(r => r.data)

export const listScans = (limit = 20) =>
  api.get('/scans', { params: { limit } }).then(r => r.data)

export const getLatestScan = () =>
  api.get('/scans/latest').then(r => r.data)

export const getScan = (scanId) =>
  api.get(`/scans/${scanId}`).then(r => r.data)

// ─── Findings ─────────────────────────────────────────────────────────────────
export const listFindings = (params = {}) =>
  api.get('/findings', { params }).then(r => r.data)

export const getFindingStats = (scanId = null) =>
  api.get('/findings/stats', { params: scanId ? { scan_id: scanId } : {} }).then(r => r.data)

export const getFinding = (findingId) =>
  api.get(`/findings/${findingId}`).then(r => r.data)

export const updateFindingStatus = (findingId, status) =>
  api.patch(`/findings/${findingId}/status`, null, { params: { status } }).then(r => r.data)

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthCheck = () =>
  axios.get(`${API_BASE}/health`).then(r => r.data)

// ─── Users (admin) ───────────────────────────────────────────────────────────
export const listUsers = () => api.get('/users').then(r => r.data)
export const createUser = (body) => api.post('/users', body).then(r => r.data)
export const updateUser = (id, body) => api.patch(`/users/${id}`, body).then(r => r.data)
export const resetUserPassword = (id) => api.post(`/users/${id}/reset-password`).then(r => r.data)
export const getScanProgress = (id) => api.get(`/scans/${id}/progress`).then(r => r.data)

// ─── Drift & Alerting ─────────────────────────────────────────────────────────
export const getLatestDrift = () =>
  api.get('/drift/latest').then(r => r.data)

export const getDriftTimeline = (limit = 10) =>
  api.get('/drift/timeline', { params: { limit } }).then(r => r.data)

export const testSlackWebhook = (webhook_url) =>
  api.post('/drift/webhook/test', { webhook_url }).then(r => r.data)

// ─── Auto-Remediation (four-eyes) ─────────────────────────────────────────────
// Prefer finding_id: the backend resolves the real AWS resource + region itself.
export const dryRunRemediation = (rule_id, resource_id, finding_id = null) =>
  api.post('/remediation/dry-run', { finding_id, rule_id, resource_id }).then(r => r.data)

// An engineer asks; a different approver approves (which is when AWS changes).
// The actor is taken from the session on the server — never sent by the browser.
export const requestRemediation = (finding_id, justification = '') =>
  api.post('/remediation/requests', { finding_id, justification }).then(r => r.data)

export const listRemediationRequests = (status) =>
  api.get('/remediation/requests', { params: status ? { status } : {} }).then(r => r.data)

export const approveRemediation = (id, note = '') =>
  api.post(`/remediation/requests/${id}/approve`, { note }).then(r => r.data)

export const rejectRemediation = (id, note) =>
  api.post(`/remediation/requests/${id}/reject`, { note }).then(r => r.data)

export const cancelRemediation = (id) =>
  api.post(`/remediation/requests/${id}/cancel`).then(r => r.data)

// Human-readable reason from an axios error (FastAPI puts it in response.data.detail)
export const apiError = (e) => {
  const d = e?.response?.data?.detail
  if (Array.isArray(d)) return d.map(x => x.msg?.replace(/^Value error, /, '')).join('; ')   // FastAPI 422
  return d || e?.message || 'Request failed'
}

export const getRemediationAudit = () =>
  api.get('/remediation/audit-trail').then(r => r.data)

// ─── Topology & Blast Radius ──────────────────────────────────────────────────
export const getTopologyGraph = () =>
  api.get('/topology/graph').then(r => r.data)

export const getAttackEnvironment = () =>
  api.get('/topology/environment').then(r => r.data)

export const getFindingBlastRadius = (exposedNodeId = 'internet') =>
  api.get(`/topology/blast-radius/${exposedNodeId}`).then(r => r.data)

// ─── Compliance & IaC ─────────────────────────────────────────────────────────
export const getComplianceBenchmarks = () =>
  api.get('/compliance').then(r => r.data)

export const getComplianceControls = () =>
  api.get('/compliance/controls').then(r => r.data)

// ─── Account / scan health ────────────────────────────────────────────────────
export const getPreflight = (refresh = false) =>
  api.get('/account/preflight', { params: { refresh } }).then(r => r.data)

export const getActiveScan = () =>
  api.get('/scans/active').then(r => r.data)

export const getScanWarnings = (scanId) =>
  api.get(`/scans/${scanId}/warnings`).then(r => r.data)

export const scanIacDemo = () =>
  api.get('/iac/scan/demo').then(r => r.data)

export default api
