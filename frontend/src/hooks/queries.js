import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authStore'
import { api } from '../api/nimbus'
import { qk } from '../lib/queryClient'
import { useEventStore } from '../store/eventStore'
import { useSentinelStore } from '../store/sentinelStore'

const get = (url, params) => api.get(url, { params }).then(r => r.data)
// Reactive: switching demo<->live enables/disables every query immediately.
// Queries also wait for a session, so nothing fires (and 401s) before sign-in.
const useLive = () => {
  const live = useSentinelStore(s => s.dataSource) !== 'demo'
  const signedIn = useAuth(s => s.status === 'signed-in' && !!s.token)
  return live && signedIn
}
const TERMINAL = new Set(['completed', 'failed'])

export function useScans(limit = 50) {
  const on = useLive()
  return useQuery({ queryKey: [...qk.scans, limit], queryFn: () => get('/scans', { limit }), enabled: on })
}

export function useActiveScan() {
  const on = useLive()
  return useQuery({ queryKey: qk.activeScan, queryFn: () => get('/scans/active'), refetchInterval: (q) => (q.state.data ? 3000 : false), enabled: on })
}

/* Live progress grid. WebSocket events write straight into this cache (see LiveStream);
   polling every 2s is only the fallback for when the socket is down. */
export function useScanProgress(id) {
  const on = useLive()
  return useQuery({
    queryKey: qk.scanProgress(id), queryFn: () => get(`/scans/${id}/progress`), enabled: !!id && on,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.stage) ? false : 2000),
  })
}

export function useRemediationRequests(status) {
  const on = useLive()
  return useQuery({ queryKey: qk.requests(status), queryFn: () => get('/remediation/requests', status ? { status } : {}), enabled: on })
}

export function useUsers() {
  const on = useLive()
  return useQuery({ queryKey: qk.users, queryFn: () => get('/users'), staleTime: 60_000, enabled: on })
}

export function useScanWarnings(id) {
  const on = useLive()
  return useQuery({ queryKey: qk.scanWarnings(id), queryFn: () => get(`/scans/${id}/warnings`), enabled: !!id && on })
}

export function useFinding(id) {
  const on = useLive()
  return useQuery({ queryKey: qk.finding(id), queryFn: () => get(`/findings/${id}`), enabled: !!id && on })
}

export function useFindings(params = {}, { enabled = true } = {}) {
  const on = useLive()
  return useQuery({ queryKey: qk.findings(params), queryFn: () => get('/findings', params), enabled: on && enabled })
}

export function useInventory({ enabled = true } = {}) {
  const on = useLive()
  return useQuery({ queryKey: qk.inventory, queryFn: () => get('/inventory'), enabled: on && enabled })
}

export function useControls() {
  const on = useLive()
  return useQuery({ queryKey: qk.controls, queryFn: () => get('/compliance/controls'), enabled: on })
}

export function usePreflight() {
  const on = useLive()
  // While AWS is not connected, re-check every 30s so fixing credentials shows up without a reload.
  return useQuery({ queryKey: qk.preflight, queryFn: () => get('/account/preflight'), staleTime: 5 * 60_000, enabled: on,
    refetchInterval: (q) => (q.state.data && !q.state.data.connected ? 30_000 : false) })
}

export function useConfig() {
  const on = useLive()
  return useQuery({ queryKey: qk.config, queryFn: () => get('/account/config'), staleTime: 5 * 60_000, enabled: on })
}

export function useAuditTrail() {
  const on = useLive()
  return useQuery({ queryKey: qk.audit, queryFn: () => get('/remediation/audit-trail'), enabled: on })
}

/*
  Push-based freshness: the backend emits events on /ws/events; we map each event type
  to the caches it makes stale. Pages refresh themselves the moment a scan finishes —
  no manual reloads, no polling loops.
*/
const INVALIDATES = {
  'scan.completed': [['scans'], ['findings'], ['inventory'], ['compliance'], ['drift'], ['topology']],
  'scan.failed': [['scans']],
  'scan.started': [['scans']],
  'remediation.applied': [['findings'], ['remediation'], ['compliance']],
  'remediation.requested': [['remediation'], ['findings']],
  'remediation.rejected': [['remediation']],
  'workflow.moved': [['findings']],
}

export function useLiveInvalidation() {
  const qc = useQueryClient()
  const triggerRefresh = useSentinelStore(s => s.triggerRefresh)
  useEffect(() => useEventStore.subscribe((state, prev) => {
    const latest = state.events[0]
    if (!latest || latest === prev.events[0] || latest.source !== 'live') return
    const keys = INVALIDATES[latest.type]
    if (!keys) return
    keys.forEach(queryKey => qc.invalidateQueries({ queryKey }))
    if (latest.type === 'scan.completed' || latest.type === 'remediation.applied') triggerRefresh()  // legacy pages
  }), [qc, triggerRefresh])
}

export function useFindingStats() {
  const on = useLive()
  return useQuery({ queryKey: qk.stats, queryFn: () => get('/findings/stats'), enabled: on })
}

export function useLatestDrift() {
  const on = useLive()
  return useQuery({ queryKey: [...qk.drift, 'latest'], queryFn: () => get('/drift/latest'), enabled: on })
}

export function useCompliance() {
  const on = useLive()
  return useQuery({ queryKey: qk.compliance, queryFn: () => get('/compliance'), enabled: on })
}

export function useBlastRadius(nodeId = 'internet') {
  const on = useLive()
  return useQuery({ queryKey: [...qk.topology, 'blast', nodeId], queryFn: () => get(`/topology/blast-radius/${nodeId}`), enabled: on })
}
