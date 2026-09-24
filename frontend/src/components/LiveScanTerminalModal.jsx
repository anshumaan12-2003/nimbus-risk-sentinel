/*
  Scan window: starts a scan (or attaches to the running one) and shows the real per-service,
  per-region grid as it fills in. Every number here comes from the backend; nothing is animated
  on a timer.
*/
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button, Dialog, DialogClose, DialogContent, SkeletonRows } from '@/components/ds'
import { parseUtc } from '@/lib/time'
import { useQueryClient } from '@tanstack/react-query'
import { useSentinelStore } from '../store/sentinelStore'
import { useScanProgress, useScans, usePreflight } from '../hooks/queries'
import { triggerScan, getActiveScan, apiError } from '../api/nimbus'
import { useCan } from '../auth/authStore'
import { qk } from '../lib/queryClient'
import ScanProgressGrid, { progressProblems } from './ScanProgressGrid'

const STAGE_TEXT = {
  queued: 'Waiting for a worker', discovering: 'Reading your AWS account',
  analyzing: 'Building the attack graph', completed: 'Scan complete', failed: 'Scan failed',
}

const secs = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`)

function useElapsed(startIso, running) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return startIso ? Math.max(0, now - parseUtc(startIso).getTime()) : 0
}

export default function LiveScanTerminalModal() {
  const { scanModalOpen, closeScanModal, triggerRefresh } = useSentinelStore()
  const canRun = useCan('scan:run')
  const qc = useQueryClient()
  const [scanId, setScanId] = useState(null)
  const [startError, setStartError] = useState(null)
  const [attached, setAttached] = useState(false)
  const started = useRef(false)
  const progress = useScanProgress(scanId)
  const scans = useScans(20)
  const pre = usePreflight()

  // Open: attach to a running scan if there is one, otherwise start a new one
  useEffect(() => {
    if (!scanModalOpen) { setScanId(null); setStartError(null); setAttached(false); started.current = false; return }
    if (started.current) return
    started.current = true
    let cancelled = false
    ;(async () => {
      try {
        const active = await getActiveScan()
        if (active) { if (!cancelled) { setScanId(active.id); setAttached(true) } return }
        if (!canRun.allowed) { if (!cancelled) setStartError(canRun.reason); return }
        const scan = await triggerScan()
        if (!cancelled) setScanId(scan.id)
        qc.invalidateQueries({ queryKey: qk.activeScan })
      } catch (err) {
        if (err?.response?.status === 409) {
          const active = await getActiveScan().catch(() => null)
          if (!cancelled && active) { setScanId(active.id); setAttached(true); return }
        }
        if (!cancelled) setStartError(apiError(err))
      }
    })()
    return () => { cancelled = true }
  }, [scanModalOpen])   // eslint-disable-line react-hooks/exhaustive-deps

  const p = progress.data
  const done = p && (p.stage === 'completed' || p.stage === 'failed')
  useEffect(() => { if (done) { triggerRefresh(); qc.invalidateQueries({ queryKey: ['scans'] }) } }, [done])   // eslint-disable-line

  const elapsed = useElapsed(p?.started_at, !done)
  const scanRow = (scans.data || []).find(s => s.id === scanId)
  const prev = (scans.data || []).find(s => s.id !== scanId && s.status === 'COMPLETED' && s.completed_at)
  const typical = prev ? parseUtc(prev.completed_at) - parseUtc(prev.started_at) : null
  const problems = progressProblems(p)
  const account = p?.account_id || pre.data?.account_id
  const failed = p?.stage === 'failed'
  const title = p ? STAGE_TEXT[p.stage] || 'Scanning' : startError ? 'Scan not started' : 'Starting scan'

  return (
    <Dialog open={scanModalOpen} onOpenChange={(o) => { if (!o) closeScanModal() }}>
      <DialogContent
        className="w-[min(760px,calc(100vw-24px))]"
        title={title}
        description={<>{account ? <span className="font-mono text-xs">AWS {account}</span> : 'Connecting to AWS'}{attached && ' · joined a scan that was already running'}</>}
        footer={done && p?.stage === 'completed' ? (
          <>
            <DialogClose asChild><Button>Close</Button></DialogClose>
            <Button variant="primary" asChild><Link to="/findings" onClick={closeScanModal}>View findings</Link></Button>
          </>
        ) : (
          <DialogClose asChild><Button>{startError || done ? 'Close' : 'Keep scanning in the background'}</Button></DialogClose>
        )}
      >
        {startError ? (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-crit-line bg-crit-soft px-3 py-2.5 text-sm text-crit-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{startError}</p>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted-2" role="progressbar" aria-valuemin={0} aria-valuemax={100}
                   aria-valuenow={p?.percent || 0} aria-label="Scan progress">
                <div className={`h-full rounded-full transition-[width] duration-500 ease-standard ${failed ? 'bg-crit' : done ? 'bg-low' : 'bg-accent'}`}
                     style={{ width: `${p?.percent || 0}%` }} />
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Progress', p ? `${p.percent}%` : '—'],
                  ['Units', p?.totals ? `${p.totals.finished} / ${p.totals.tasks}` : '—'],
                  ['Findings', p?.totals ? p.totals.findings : '—'],
                  ['Elapsed', p ? secs(elapsed) : '—', typical > 2000 && !done ? `last took ${secs(typical)}` : null],
                ].map(([k, v, hint]) => (
                  <div key={k} className="rounded-md bg-surface-2 px-3 py-2">
                    <dt className="text-xs text-fg-3">{k}</dt>
                    <dd className="num text-lg font-semibold text-fg">{v}{hint && <span className="ml-1.5 text-xs font-normal text-fg-3">{hint}</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {p ? <ScanProgressGrid progress={p} /> : <SkeletonRows rows={5} />}
            {problems.length > 0 && (
              <details className="rounded-md border border-med-line bg-med-soft px-3 py-2.5 text-sm text-med-text" open={done}>
                <summary className="cursor-pointer font-medium">{problems.length} unit{problems.length === 1 ? '' : 's'} couldn’t see everything</summary>
                <ul className="mt-2 grid gap-1 text-fg-2">
                  {problems.map(t => (
                    <li key={t.id}><span className="font-medium text-fg">{t.label}</span>{t.region === 'global' ? '' : ` in ${t.region}`} — {t.status === 'failed'
                      ? t.error : `${t.warnings} AWS call${t.warnings === 1 ? '' : 's'} denied. Attach SecurityAudit + ViewOnlyAccess to the scanner.`}</li>
                  ))}
                </ul>
              </details>
            )}
            {failed && scanRow?.error_message && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-crit-line bg-crit-soft px-3 py-2.5 text-sm text-crit-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{scanRow.error_message}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
