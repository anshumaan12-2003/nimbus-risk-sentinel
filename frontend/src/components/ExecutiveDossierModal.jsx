/*
  Executive report: a printable one-pager for leadership and auditors.
  Every number comes from the latest scan — nothing here is pre-written or estimated.
*/
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Printer, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, SkeletonRows } from '@/components/ds'
import { BrandMark } from '@/components/shell/Sidebar'
import { useSentinelStore } from '@/store/sentinelStore'
import {
  useBlastRadius, useCompliance, useControls, useFindingStats, useFindings, useLatestDrift, usePreflight, useScans,
} from '@/hooks/queries'
import { dateTime } from '@/lib/time'
import { SERVICE_NAMES } from '@/lib/aws'

const num = (v) => Number(v) || 0
const SEV_TEXT = { CRITICAL: 'text-crit-text', HIGH: 'text-high-text', MEDIUM: 'text-med-text', LOW: 'text-low-text' }
const FW_SHORT = [[/^cis/, 'CIS AWS'], [/^soc2/, 'SOC 2'], [/^pci/, 'PCI DSS'], [/^hipaa/, 'HIPAA']]

function riskWords(score) {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 50) return 'elevated'
  if (score >= 30) return 'moderate'
  return 'low'
}

function H({ n, children }) {
  return <h2 className="mt-8 mb-3 flex items-baseline gap-2 border-b border-line pb-2 text-md font-semibold text-fg break-after-avoid"><span className="num text-fg-3">{n}</span>{children}</h2>
}

function Report() {
  const pre = usePreflight()
  const stats = useFindingStats()
  const scans = useScans(5)
  const findings = useFindings({ limit: 500 })
  const compliance = useCompliance()
  const controls = useControls()
  const drift = useLatestDrift()
  const blast = useBlastRadius()

  if (stats.isLoading || scans.isLoading || findings.isLoading) return <div className="p-10"><SkeletonRows rows={10} /></div>
  const latest = (scans.data || []).find(s => s.status === 'COMPLETED')
  if (!latest) return <p className="p-10 text-sm text-fg-2">Run a scan first — the report is built from the latest completed scan.</p>

  const s = stats.data || {}
  const score = num(latest.risk_score)
  const open = (findings.data || []).filter(f => f.status === 'OPEN' || f.status === 'IN_PROGRESS')
  const top = open.slice(0, 10)
  const failing = (controls.data?.controls || []).filter(c => c.status === 'FAIL')
  const d = drift.data?.summary
  const b = blast.data

  return (
    <article className="mx-auto max-w-[820px] px-10 py-10 text-fg print:max-w-none print:px-0 print:py-0">
      <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <div>
            <p className="text-lg font-semibold">Cloud security report</p>
            <p className="text-sm text-fg-2">Breachpath · AWS {pre.data?.account_id || latest.account_id}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right text-xs">
          <dt className="text-fg-3">Scan completed</dt><dd>{dateTime(latest.completed_at)}</dd>
          <dt className="text-fg-3">Regions</dt><dd className="font-mono">{latest.region}</dd>
          <dt className="text-fg-3">Prepared</dt><dd>{dateTime(new Date())}</dd>
        </dl>
      </header>

      <H n="1">Summary</H>
      <div className="grid grid-cols-[auto_1fr] items-start gap-6">
        <div className="rounded-lg border border-line px-5 py-4 text-center">
          <p className="num text-4xl font-semibold tracking-tight">{score}</p>
          <p className="text-xs text-fg-3">risk score / 100</p>
        </div>
        <p className="text-sm leading-6">
          The account’s overall risk is <strong>{riskWords(score)}</strong>. The latest scan found <strong>{num(s.open)}</strong> open issue{num(s.open) === 1 ? '' : 's'}
          {' '}— <span className={SEV_TEXT.CRITICAL}>{num(s.critical)} critical</span>, <span className={SEV_TEXT.HIGH}>{num(s.high)} high</span>, {num(s.medium)} medium and {num(s.low)} low.
          {d && <> Since the previous scan, {d.new_count} appeared, {d.resolved_count} were fixed and {d.regressed_count} came back.</>}
          {b && num(b.reachable_nodes_count) > 0 && <> From the public internet an attacker could reach {num(b.reachable_nodes_count)} assets, including {num(b.crown_jewels_at_risk)} sensitive data store{num(b.crown_jewels_at_risk) === 1 ? '' : 's'}.</>}
        </p>
      </div>

      <H n="2">Compliance</H>
      {compliance.data?.length ? (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-fg-3"><th className="py-1.5 font-medium">Framework</th><th className="font-medium">Controls passing</th><th className="text-right font-medium">Score</th></tr></thead>
          <tbody>
            {compliance.data.map(f => (
              <tr key={f.id} className="border-b border-line">
                <td className="py-2">{FW_SHORT.find(([re]) => re.test(f.id))?.[1] || f.name}</td>
                <td className="num">{f.passingRules} of {num(f.passingRules) + num(f.failingRules)}{f.notEvaluated ? ` (${f.notEvaluated} not checked)` : ''}</td>
                <td className="num text-right font-semibold">{f.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-fg-2">No compliance data.</p>}
      <p className="mt-2 text-xs text-fg-3">Automated technical controls only. This is evidence for an audit, not a certification.</p>

      {failing.length > 0 && (
        <>
          <H n="3">Failing controls</H>
          <ul className="grid gap-1.5 text-sm">
            {failing.map(c => (
              <li key={c.id} className="grid grid-cols-[90px_1fr] gap-3 break-inside-avoid">
                <span className="font-mono text-xs text-fg-3">{c.id}</span>
                <span>{c.title} <span className="text-fg-3">· {Object.entries(c.frameworks || {}).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(', ')}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}

      <H n={failing.length ? '4' : '3'}>Top open findings</H>
      {top.length === 0 ? <p className="text-sm text-fg-2">No open findings.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-fg-3"><th className="py-1.5 font-medium">Severity</th><th className="font-medium">Finding</th><th className="font-medium">Resource</th><th className="text-right font-medium">Risk</th></tr></thead>
          <tbody>
            {top.map(f => (
              <tr key={f.id} className="border-b border-line align-top break-inside-avoid">
                <td className={cn('py-2 pr-3 text-xs font-semibold', SEV_TEXT[f.severity])}>{f.severity[0] + f.severity.slice(1).toLowerCase()}</td>
                <td className="py-2 pr-3">{f.title}<div className="font-mono text-2xs text-fg-3">{f.rule_id}</div></td>
                <td className="py-2 pr-3 text-xs text-fg-2">{f.resource_name}<div className="text-2xs text-fg-3">{SERVICE_NAMES[f.service] || f.service}</div></td>
                <td className="num py-2 text-right font-semibold">{f.risk_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open.length > top.length && <p className="mt-2 text-xs text-fg-3">+{open.length - top.length} more in Breachpath.</p>}

      <footer className="mt-10 border-t border-line pt-4 text-2xs text-fg-3">
        Generated by Breachpath from scan {latest.id.slice(0, 8)}. Fixes are applied only after a second person approves them, and every change is recorded with a rollback.
      </footer>
    </article>
  )
}

export default function ExecutiveDossierModal() {
  const { executiveDossierOpen, closeExecutiveDossier } = useSentinelStore()
  return (
    <DialogPrimitive.Root open={executiveDossierOpen} onOpenChange={(o) => { if (!o) closeExecutiveDossier() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-scrim print:hidden" />
        <DialogPrimitive.Content
          data-report
          aria-describedby={undefined}
          className="anim-dialog fixed top-1/2 left-1/2 z-50 grid max-h-[92vh] w-[min(900px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_1fr] overflow-hidden rounded-xl border border-line bg-surface shadow-popover focus:outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 print:hidden">
            <DialogPrimitive.Title className="text-md font-semibold text-fg">Executive report</DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => window.print()}><Printer /> Print or save as PDF</Button>
              <DialogPrimitive.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button></DialogPrimitive.Close>
            </div>
          </div>
          <div className="overflow-y-auto print:overflow-visible">{executiveDossierOpen && <Report />}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
