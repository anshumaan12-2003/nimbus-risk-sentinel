/*
  Scan window: starts a scan (or attaches to the running one) and shows the real per-service,
  per-region grid as it fills in. Every number here comes from the backend; nothing is animated
  on a timer.
*/
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import X from 'lucide-react/dist/esm/icons/x'
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
  return startIso ? Math.max(0, now - new Date(startIso).getTime()) : 0
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
  const dialogRef = useRef(null)

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

  useEffect(() => {
    if (!scanModalOpen) return
    const onKey = (e) => e.key === 'Escape' && closeScanModal()
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [scanModalOpen, closeScanModal])

  const elapsed = useElapsed(p?.started_at, !done)
  if (!scanModalOpen) return null

  const scanRow = (scans.data || []).find(s => s.id === scanId)
  const prev = (scans.data || []).find(s => s.id !== scanId && s.status === 'COMPLETED' && s.completed_at)
  const typical = prev ? new Date(prev.completed_at) - new Date(prev.started_at) : null
  const problems = progressProblems(p)
  const account = p?.account_id || pre.data?.account_id

  return (
    <div className="ui-drawer-overlay ui-modal-overlay" onClick={closeScanModal}>
      <div className="ui-scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title"
           tabIndex={-1} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <header className="ui-scan-head">
          <div>
            <h2 id="scan-title">{p ? STAGE_TEXT[p.stage] || 'Scanning' : startError ? 'Scan not started' : 'Starting scan'}</h2>
            <p className="ui-scan-sub">
              {account ? `AWS account ${account}` : 'Connecting to AWS'}
              {attached && ' · joined a scan that was already running'}
            </p>
          </div>
          <button className="header-icon-btn" onClick={closeScanModal} aria-label="Close"><X size={15} /></button>
        </header>

        {startError ? (
          <div className="ui-scan-error" role="alert"><AlertTriangle size={15} /><span>{startError}</span></div>
        ) : (
          <>
            <div className="ui-scan-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100}
                 aria-valuenow={p?.percent || 0} aria-label="Scan progress">
              <div className={`ui-scan-meter-fill ${p?.stage === 'failed' ? 'is-failed' : ''}`} style={{ width: `${p?.percent || 0}%` }} />
            </div>
            <dl className="ui-scan-stats">
              <div><dt>Progress</dt><dd>{p ? `${p.percent}%` : '—'}</dd></div>
              <div><dt>Units</dt><dd>{p ? `${p.totals.finished}/${p.totals.tasks}` : '—'}</dd></div>
              <div><dt>Findings</dt><dd>{p ? p.totals.findings : '—'}</dd></div>
              <div><dt>Elapsed</dt><dd>{p ? secs(elapsed) : '—'}{typical > 2000 && !done ? <small> · last took {secs(typical)}</small> : null}</dd></div>
            </dl>
            {p ? <ScanProgressGrid progress={p} /> : <div className="ui-scan-wait">Waiting for the first progress update…</div>}

            {problems.length > 0 && (
              <details className="ui-scan-problems" open={done}>
                <summary>{problems.length} unit{problems.length === 1 ? '' : 's'} could not see everything</summary>
                <ul>
                  {problems.map(t => (
                    <li key={t.id}><strong>{t.label}</strong> {t.region === 'global' ? '' : `in ${t.region}`} — {t.status === 'failed'
                      ? t.error : `${t.warnings} AWS call${t.warnings === 1 ? '' : 's'} denied. Attach SecurityAudit + ViewOnlyAccess to the scanner.`}</li>
                  ))}
                </ul>
              </details>
            )}
            {p?.stage === 'failed' && scanRow?.error_message && (
              <div className="ui-scan-error" role="alert"><AlertTriangle size={15} /><span>{scanRow.error_message}</span></div>
            )}
          </>
        )}

        <footer className="ui-scan-foot">
          {done && p?.stage === 'completed' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={closeScanModal}>Close</button>
              <Link to="/findings" className="btn btn-primary btn-sm" onClick={closeScanModal}>View findings</Link>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={closeScanModal}>
              {startError || done ? 'Close' : 'Keep scanning in the background'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
