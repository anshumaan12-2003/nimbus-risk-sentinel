import { useState } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import X from 'lucide-react/dist/esm/icons/x'
import { usePreflight } from '../hooks/queries'
import { useSentinelStore } from '../store/sentinelStore'

/*
  Shows WHY the dashboard might be empty: backend down, AWS not connected, or specific
  read permissions missing. Silent when everything is healthy (after a short confirmation).
*/
export default function AccountHealthBanner() {
  const { dataSource } = useSentinelStore()
  const pre = usePreflight()          // shared cache with header + Settings (one request)
  const [hidden, setHidden] = useState(false)
  const p = pre.data
  // Only speak up when something is wrong; a healthy connection shows in the header pill.
  const state = dataSource === 'demo' ? { kind: 'demo' }
    : pre.isError ? { kind: 'error', msg: 'Backend unreachable at VITE_API_URL — start the API on :8000.' }
    : !p ? null
    : !p.connected ? { kind: 'error', msg: `AWS not connected: ${p.hint || p.error}` }
    : !p.ready ? { kind: 'warn', msg: `${p.checks.filter(c => !c.ok).length} AWS permission check(s) failing — scans will have blind spots. Open Settings for details.` }
    : null

  if (!state || hidden) return null
  const palette = {
    demo:  { bg: 'var(--violet-dim)',   bd: 'var(--border-normal)',   Icon: AlertTriangle, msg: 'Demo mode: sample data, not your AWS account.' },
    error: { bg: 'var(--critical-dim)', bd: 'var(--critical-border)', Icon: AlertTriangle },
    warn:  { bg: 'var(--high-dim, #ffedd5)', bd: 'var(--border-normal)', Icon: AlertTriangle },
    ok:    { bg: 'var(--low-dim)',      bd: 'var(--low-border)',      Icon: ShieldCheck },
  }[state.kind]
  const { Icon } = palette
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 24px 0', padding: '10px 14px',
      borderRadius: 8, background: palette.bg, border: `1px solid ${palette.bd}`, fontSize: 13 }}>
      <Icon size={15} />
      <span style={{ flex: 1 }}>{palette.msg || state.msg}</span>
      <button aria-label="Dismiss" onClick={() => setHidden(true)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
        <X size={14} />
      </button>
    </div>
  )
}
