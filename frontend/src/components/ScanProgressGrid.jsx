/*
  Service x region grid for one scan. Each cell merges the rule-check task and the inventory task
  for that service in that region, so you can see exactly what Nimbus has looked at, what it is
  looking at now, and where AWS said no.
*/
import { Fragment } from 'react'
import { AlertTriangle, Check, Minus, X } from 'lucide-react'

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

const CELL = {
  queued: 'border-line bg-surface text-fg-3',
  running: 'border-accent-line bg-accent-soft text-accent-text animate-pulse',
  done: 'border-low-line bg-low-soft text-low-text',
  partial: 'border-med-line bg-med-soft text-med-text',
  failed: 'border-crit-line bg-crit-soft text-crit-text',
}
const KEY = [['queued', 'Waiting'], ['running', 'Scanning'], ['done', 'Done'], ['partial', 'Partly denied'], ['failed', 'Failed']]

function Cell({ cell, label, region }) {
  if (!cell) {
    return <td className="p-1" aria-label={`${label} not scanned per region`}><span className="grid h-8 place-items-center text-fg-3"><Minus className="size-3" /></span></td>
  }
  const text = describe(cell, label, region)
  return (
    <td className="p-1" title={text} aria-label={text}>
      <span className={`flex h-8 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors duration-300 ${CELL[cell.status]}`}>
        {cell.status === 'done' && <Check className="size-3.5" strokeWidth={3} />}
        {cell.status === 'partial' && <AlertTriangle className="size-3.5" />}
        {cell.status === 'failed' && <X className="size-3.5" strokeWidth={3} />}
        {cell.findings != null && cell.findings > 0 && <span className="num">{cell.findings}</span>}
      </span>
    </td>
  )
}

export default function ScanProgressGrid({ progress, compact = false }) {
  if (!progress) return null
  const tasks = progress.tasks || []
  if (!tasks.length) {
    return <p className="text-sm text-fg-2">This scan ran before per-service progress was recorded (v1.2 or earlier).</p>
  }
  const regions = progress.regions || []
  const cols = ['global', ...regions]
  const byKey = {}
  tasks.forEach(t => { (byKey[`${t.service}|${t.region}`] ||= []).push(t) })
  const graph = tasks.find(t => t.phase === 'analysis')

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse ${compact ? 'min-w-[360px]' : 'min-w-[440px]'}`}>
          <caption className="sr-only">Scan coverage by service and region</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 pb-1 text-left text-xs font-medium text-fg-3">Service</th>
              {cols.map(r => <th key={r} scope="col" className="pb-1 text-center font-mono text-2xs font-medium text-fg-3">{r === 'global' ? 'Global' : r}</th>)}
            </tr>
          </thead>
          <tbody>
            {SERVICES.map(([svc, label, scope]) => (
              <tr key={svc}>
                <th scope="row" className="pr-2 text-left text-sm font-normal text-fg">{label}</th>
                {cols.map(r => {
                  const applies = scope === 'global' ? r === 'global' : r !== 'global'
                  return <Fragment key={r}>{applies
                    ? <Cell cell={mergeCell(byKey[`${svc}|${r}`] || [])} label={label} region={r} />
                    : <td className="p-1" aria-hidden="true"><span className="block h-8 rounded-md bg-surface-2" /></td>}</Fragment>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-2" aria-hidden="true">
        {KEY.map(([k, label]) => <span key={k} className="flex items-center gap-1.5"><i className={`size-2.5 rounded-[3px] border ${CELL[k].replace('animate-pulse', '')}`} />{label}</span>)}
        {graph && <span className="ml-auto text-fg-3">Attack graph: {STATUS_TEXT[graph.status].toLowerCase()}</span>}
      </div>
    </div>
  )
}

export function progressProblems(progress) {
  return (progress?.tasks || []).filter(t => t.status === 'failed' || t.status === 'partial')
}
