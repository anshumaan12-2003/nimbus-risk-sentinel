import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import X from 'lucide-react/dist/esm/icons/x'
import { usePreflight } from '../hooks/queries'
import { getPreflight, apiError } from '../api/nimbus'
import { qk } from '../lib/queryClient'
import { useSentinelStore } from '../store/sentinelStore'

// Plain-English next step for the AWS errors people actually hit when connecting.
const AWS_ADVICE = [
  [/InvalidClientTokenId/i, 'The access key ID is unknown to AWS — it was deleted, deactivated or mistyped.'],
  [/SignatureDoesNotMatch/i, 'The secret access key is wrong (check for a stray space or quote in backend/.env).'],
  [/ExpiredToken|expired/i, 'These are temporary credentials that expired — set AWS_SESSION_TOKEN too, or run `aws sso login` again.'],
  [/Unable to locate credentials|NoCredentials/i, 'No credentials found — set AWS_PROFILE or access keys in backend/.env and restart the API.'],
  [/could not be found|ProfileNotFound/i, 'AWS_PROFILE names a profile that is not in ~/.aws/config.'],
  [/AccessDenied/i, 'The credentials work but are not allowed to call sts:GetCallerIdentity / assume the role.'],
  [/Could not connect|EndpointConnectionError|timed out/i, 'The API cannot reach AWS — check network, VPN or proxy.'],
]
const adviceFor = (err = '') => AWS_ADVICE.find(([re]) => re.test(err))?.[1]

/*
  Shows WHY the dashboard might be empty: backend down, AWS not connected, or specific
  read permissions missing. Silent when everything is healthy (after a short confirmation).
*/
export default function AccountHealthBanner() {
  const { dataSource } = useSentinelStore()
  const pre = usePreflight()          // shared cache with header + Settings (one request)
  const qc = useQueryClient()
  const [hidden, setHidden] = useState(false)
  const [checking, setChecking] = useState(false)
  const p = pre.data
  // Only speak up when something is wrong; a healthy connection shows in the header pill.
  const state = dataSource === 'demo' ? { kind: 'demo' }
    : pre.isError ? { kind: 'error', msg: pre.error?.response
        ? `The API could not check AWS: ${apiError(pre.error)}`
        : 'Backend unreachable — start the API (uvicorn on :8001) and keep the Vite dev server running.' }
    : !p ? null
    : !p.connected ? { kind: 'error', msg: `AWS not connected: ${adviceFor(p.error) || p.hint || ''}`, detail: p.error }
    : !p.ready ? { kind: 'warn', msg: `${p.checks.filter(c => !c.ok).length} AWS permission check(s) failing — scans will have blind spots. Open Settings for details.` }
    : null

  // Re-reads credentials on the server (drops cached AWS sessions) and updates every consumer.
  async function recheck() {
    setChecking(true)
    try { qc.setQueryData(qk.preflight, await getPreflight(true)) }
    catch { await qc.invalidateQueries({ queryKey: qk.preflight }) }
    finally { setChecking(false) }
  }

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
      <span style={{ flex: 1, minWidth: 0 }}>
        {palette.msg || state.msg}
        {state.detail && (
          <code style={{ display: 'block', marginTop: 4, fontSize: 11, opacity: 0.8, overflowWrap: 'anywhere' }}>{state.detail}</code>
        )}
      </span>
      {state.kind !== 'demo' && (
        <button className="btn btn-ghost btn-sm" onClick={recheck} disabled={checking}>
          {checking ? 'Checking…' : 'Re-check'}
        </button>
      )}
      <button aria-label="Dismiss" onClick={() => setHidden(true)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
        <X size={14} />
      </button>
    </div>
  )
}
