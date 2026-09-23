import { create } from 'zustand'

/*
  Event schema — the contract a backend WebSocket (/ws/events) should emit:
  {
    type:     'finding.new' | 'finding.resolved' | 'drift.detected' |
              'scan.completed' | 'remediation.applied' | 'workflow.moved' |
              'simulation.contained',
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO',
    title:    string,          // one line, human readable
    detail?:  string,
    link?:    string,          // in-app route to open on click
  }
  `source` ('live' | 'simulated' | 'you') and `id`/`ts` are added client-side.
*/
const MAX_EVENTS = 60

export const useEventStore = create((set) => ({
  events: [],
  mode: 'connecting',        // 'connecting' | 'live' | 'simulated' | 'offline'
  paused: false,
  push: (e) => set(s => ({
    events: [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...e }, ...s.events].slice(0, MAX_EVENTS),
  })),
  setMode: (mode) => set({ mode }),
  togglePause: () => set(s => ({ paused: !s.paused })),
}))

export const emitEvent = (e) => useEventStore.getState().push({ source: 'you', ...e })

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}
