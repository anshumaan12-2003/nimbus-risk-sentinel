/*
  Service x region grid for one scan. Each cell merges the rule-check task and the inventory task
  for that service in that region, so you can see exactly what Nimbus has looked at, what it is
  looking at now, and where AWS said no.
*/
import { Fragment } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Check from 'lucide-react/dist/esm/icons/check'
import Minus from 'lucide-react/dist/esm/icons/minus'
import X from 'lucide-react/dist/esm/icons/x'

const SERVICES = [
  ['iam', 'IAM', 'global'], ['s3', 'S3', 'global'],
  ['ec2', 'EC2', 'regional'], ['rds', 'RDS', 'regional'], ['lambda', 'Lambda', 'regional'],
  ['dynamodb', 'DynamoDB', 'regional'], ['secretsmanager', 'Secrets Manager', 'regional'],
]
const RANK = { failed: 4, running: 3, partial: 2, queued: 1, done: 0 }
const STATUS_TEXT = { queued: 'Waiting', running: 'Scanning', done: 'Done', partial: 'Partly denied', failed: 'Failed' }

export function mergeCell(tasks) {
  if (!tasks.length) return null
  const anyRunning = tasks.some(t => t.status === 'running')
  const allQueued = tasks.every(t => t.status === 'queued')
  const failed = tasks.some(t => t.status === 'failed')
  const partial = tasks.some(t => t.status === 'partial')
  const finished = tasks.every(t => ['done', 'partial', 'failed'].includes(t.status))
  const status = failed && finished ? 'failed'
    : anyRunning || (!allQueued && !finished) ? 'running'
    : allQueued ? 'queued'
    : partial ? 'partial' : 'done'
  const findings = tasks.reduce((n, t) => n + (t.findings || 0), 0)
  const hasCheck = tasks.some(t => t.phase === 'checks')
  const ms = tasks.reduce((n, t) => n + (t.duration_ms || 0), 0)
  return { status, findings: hasCheck && finished ? findings : null, ms, tasks }
}

function describe(cell, label, region) {
  const parts = [`${label} ${region === 'global' ? '(account-wide)' : `in ${region}`}: ${STATUS_TEXT[cell.status]}`]
  if (cell.findings != null) parts.push(`${cell.findings} finding${cell.findings === 1 ? '' : 's'}`)
  cell.tasks.forEach(t => {
    const what = t.phase === 'checks' ? 'rule checks' : 'inventory'
    if (t.status === 'failed') parts.push(`${what} failed: ${t.error}`)
    else if (t.status === 'partial') parts.push(`${what}: ${t.warnings} AWS call${t.warnings === 1 ? '' : 's'} denied`)
    else if (t.duration_ms != null) parts.push(`${what} ${(t.duration_ms / 1000).toFixed(1)}s`)
  })
  return parts.join(' · ')
}

function Cell({ cell, label, region }) {
  if (!cell) return <td className="spg-cell spg-na" aria-label={`${label} not scanned per region`}><Minus size={12} /></td>
  const text = describe(cell, label, region)
  return (
    <td className={`spg-cell spg-${cell.status}`} title={text} aria-label={text}>
      <span className="spg-chip">
        {cell.status === 'done' && <Check size={12} strokeWidth={3} />}
        {cell.status === 'partial' && <AlertTriangle size={12} />}
        {cell.status === 'failed' && <X size={12} strokeWidth={3} />}
        {cell.findings != null && cell.findings > 0 && <span className="spg-count">{cell.findings}</span>}
      </span>
    </td>
  )
}

export default function ScanProgressGrid({ progress, compact = false }) {
  if (!progress) return null
  const tasks = progress.tasks || []
  if (!tasks.length) {
    return <p className="spg-legacy">This scan ran before per-service progress was recorded (v1.2 or earlier).</p>
  }
  const regions = progress.regions || []
  const cols = ['global', ...regions]
  const byKey = {}
  tasks.forEach(t => { (byKey[`${t.service}|${t.region}`] ||= []).push(t) })
  const graph = tasks.find(t => t.phase === 'analysis')

  return (
    <div className={`spg ${compact ? 'spg-compact' : ''}`}>
      <div className="spg-scroll">
        <table className="spg-table">
          <caption className="sr-only">Scan coverage by service and region</caption>
          <colgroup><col className="spg-col-svc" />{cols.map(r => <col key={r} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col" className="spg-svc">Service</th>
              {cols.map(r => <th key={r} scope="col">{r === 'global' ? 'Global' : r}</th>)}
            </tr>
          </thead>
          <tbody>
            {SERVICES.map(([svc, label, scope]) => (
              <tr key={svc}>
                <th scope="row" className="spg-svc">{label}</th>
                {cols.map(r => {
                  const applies = scope === 'global' ? r === 'global' : r !== 'global'
                  return <Fragment key={r}>{applies
                    ? <Cell cell={mergeCell(byKey[`${svc}|${r}`] || [])} label={label} region={r} />
                    : <td className="spg-cell spg-blank" aria-hidden="true" />}</Fragment>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="spg-legend" aria-hidden="true">
        <span><i className="spg-key spg-queued" />Waiting</span>
        <span><i className="spg-key spg-running" />Scanning</span>
        <span><i className="spg-key spg-done" />Done</span>
        <span><i className="spg-key spg-partial" />Partly denied</span>
        <span><i className="spg-key spg-failed" />Failed</span>
        {graph && <span className="spg-graph">Attack graph: {STATUS_TEXT[graph.status].toLowerCase()}</span>}
      </div>
    </div>
  )
}

export function progressProblems(progress) {
  return (progress?.tasks || []).filter(t => t.status === 'failed' || t.status === 'partial')
}
