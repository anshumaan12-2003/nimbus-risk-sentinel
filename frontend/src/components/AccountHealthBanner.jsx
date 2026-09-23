import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ds'
import { cn } from '@/lib/cn'
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
  const tone = {
    demo: 'border-accent-line bg-accent-soft text-accent-text',
    error: 'border-crit-line bg-crit-soft text-crit-text',
    warn: 'border-med-line bg-med-soft text-med-text',
  }[state.kind]
  return (
    <div role="status" className={cn('mx-3 mt-3 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm sm:mx-5', tone)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{state.kind === 'demo' ? 'Demo mode — sample data, not your AWS account.' : state.msg}</p>
        {state.detail && <p className="mt-1 font-mono text-xs break-words opacity-80">{state.detail}</p>}
      </div>
      {state.kind !== 'demo' && (
        <Button size="sm" onClick={recheck} loading={checking}>{checking ? 'Checking' : 'Re-check'}</Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setHidden(true)} className="text-current hover:bg-black/5 dark:hover:bg-white/10"><X /></Button>
    </div>
  )
}
