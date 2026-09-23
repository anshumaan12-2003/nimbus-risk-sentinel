import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDashed, Download, Search, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, Button, Input, Badge, EmptyState, ErrorState, SkeletonRows, Skeleton, Tabs, TabsList, TabsTrigger,
} from '@/components/ds'
import { downloadFile } from '@/components/ui'
import { useCompliance, useControls } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { SERVICE_NAMES } from '@/lib/aws'

const FW = [
  { key: 'cis', match: /^cis/, short: 'CIS AWS' },
  { key: 'soc2', match: /^soc2/, short: 'SOC 2' },
  { key: 'pci', match: /^pci/, short: 'PCI DSS' },
  { key: 'hipaa', match: /^hipaa/, short: 'HIPAA' },
]
const fwFor = (b) => FW.find(f => f.match.test(b.id || '')) || { key: b.id, short: b.name }
const STATUS = {
  PASS: { label: 'Passing', icon: CheckCircle2, cls: 'text-low-text' },
  FAIL: { label: 'Failing', icon: XCircle, cls: 'text-crit-text' },
  NOT_EVALUATED: { label: 'Not checked', icon: CircleDashed, cls: 'text-fg-3' },
}

// Demo mode: a small sample shaped like the live API.
const DEMO_BENCHMARKS = [
  { id: 'cis-aws-3.0', name: 'CIS AWS Foundations Benchmark v3.0', score: 82, passingRules: 41, failingRules: 9, category: 'Foundational Baseline' },
  { id: 'soc2-type2', name: 'SOC 2 Type II', score: 89, passingRules: 34, failingRules: 4, category: 'Trust Services Criteria' },
  { id: 'pci-dss-4.0', name: 'PCI DSS v4.0', score: 74, passingRules: 29, failingRules: 10, category: 'Payment Card Security' },
  { id: 'hipaa-sec', name: 'HIPAA Security Rule', score: 86, passingRules: 31, failingRules: 5, category: 'Healthcare Data Privacy' },
]
const DEMO_CONTROLS = [
  { id: '1.5', title: 'Root account has MFA', service: 'iam', status: 'FAIL', frameworks: { cis: '1.5', soc2: 'CC6.1', pci: '8.4.1', hipaa: '164.312(d)' }, failing_finding_ids: ['find-iam-001'] },
  { id: '2.1.4', title: 'S3 Block Public Access enabled', service: 's3', status: 'FAIL', frameworks: { cis: '2.1.4', soc2: 'CC6.6', pci: '1.3.1' }, failing_finding_ids: ['find-s3-001'] },
  { id: '5.2', title: 'No security group allows SSH from 0.0.0.0/0', service: 'ec2', status: 'FAIL', frameworks: { cis: '5.2', pci: '1.3.1' }, failing_finding_ids: ['find-ec2-001'] },
  { id: '2.3.3', title: 'RDS instances not publicly accessible', service: 'rds', status: 'PASS', frameworks: { cis: '2.3.3', hipaa: '164.312(e)(1)' }, failing_finding_ids: [] },
  { id: '3.1', title: 'CloudTrail enabled in all regions', service: 'cloudtrail', status: 'NOT_EVALUATED', frameworks: { cis: '3.1', soc2: 'CC7.2' }, failing_finding_ids: [] },
]

export default function Compliance() {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const benchQ = useCompliance()
  const controlsQ = useControls()
  const benchmarks = demo ? DEMO_BENCHMARKS : (benchQ.data || [])
  const controls = demo ? DEMO_CONTROLS : (controlsQ.data?.controls || [])
  const [fw, setFw] = useState('all')
  const [status, setStatus] = useState('FAIL')
  const [q, setQ] = useState('')

  const rows = useMemo(() => controls.filter(c =>
    (fw === 'all' || c.frameworks?.[fw]) &&
    (status === 'all' || c.status === status) &&
    (!q || `${c.id} ${c.title} ${c.service}`.toLowerCase().includes(q.toLowerCase())),
  ), [controls, fw, status, q])
  const counts = useMemo(() => {
    const inFw = controls.filter(c => fw === 'all' || c.frameworks?.[fw])
    return { all: inFw.length, FAIL: inFw.filter(c => c.status === 'FAIL').length, PASS: inFw.filter(c => c.status === 'PASS').length, NOT_EVALUATED: inFw.filter(c => c.status === 'NOT_EVALUATED').length }
  }, [controls, fw])

  const exportPack = () => downloadFile(
    `nimbus-compliance-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ generated_at: new Date().toISOString(), benchmarks, controls }, null, 2),
    'application/json',
  )
  const loading = !demo && (benchQ.isLoading || controlsQ.isLoading)
  const error = !demo && (benchQ.error || controlsQ.error)

  return (
    <Page wide>
      <PageHeader
        title="Compliance"
        description="Automated controls checked on every scan, mapped to CIS AWS, SOC 2, PCI DSS and HIPAA. These cover the technical controls Nimbus can verify — not a full audit."
        actions={<Button onClick={exportPack} disabled={!controls.length}><Download /> Export evidence (JSON)</Button>}
      />

      {error ? <Card><ErrorState error={error} onRetry={() => { benchQ.refetch(); controlsQ.refetch() }} /></Card>
        : loading ? <div className="grid gap-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div><SkeletonRows rows={8} /></div>
        : benchmarks.length === 0 ? <Card><EmptyState title="No compliance data yet" body="Scores are computed from the latest scan." /></Card>
        : (
        <div className="grid gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {benchmarks.map(b => {
              const f = fwFor(b)
              const score = Number(b.score) || 0
              const active = fw === f.key
              return (
                <button key={b.id} type="button" onClick={() => setFw(active ? 'all' : f.key)} aria-pressed={active}
                        className={cn('grid gap-3 rounded-lg border bg-surface p-4 text-left shadow-raised transition-colors hover:border-line-strong',
                          active ? 'border-accent ring-2 ring-accent-soft-2' : 'border-line')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{f.short}</p>
                      <p className="truncate text-xs text-fg-3" title={b.name}>{b.category || b.name}</p>
                    </div>
                    <span className="num text-xl font-semibold text-fg">{score}%</span>
                  </div>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted-2">
                    <span className={cn('block h-full rounded-full', score >= 85 ? 'bg-low' : score >= 60 ? 'bg-med' : 'bg-crit')} style={{ width: `${score}%` }} />
                  </span>
                  <p className="num text-xs text-fg-2">
                    <span className="text-fg">{b.passingRules}</span> passing · <span className={b.failingRules ? 'text-crit-text' : ''}>{b.failingRules} failing</span>
                    {b.notEvaluated ? <> · {b.notEvaluated} not checked</> : null}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList segmented>
                <TabsTrigger value="FAIL">Failing <span className="num text-fg-3">{counts.FAIL}</span></TabsTrigger>
                <TabsTrigger value="PASS">Passing <span className="num text-fg-3">{counts.PASS}</span></TabsTrigger>
                <TabsTrigger value="NOT_EVALUATED">Not checked <span className="num text-fg-3">{counts.NOT_EVALUATED}</span></TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            {fw !== 'all' && <Badge tone="accent" className="cursor-pointer" onClick={() => setFw('all')}>{FW.find(f => f.key === fw)?.short} only ✕</Badge>}
            <div className="ml-auto w-full sm:w-64"><Input icon={Search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search controls" aria-label="Search controls" /></div>
          </div>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState compact mood={status === 'FAIL' ? 'happy' : 'thinking'}
                          title={status === 'FAIL' ? 'No failing controls' : 'No controls match'}
                          body={status === 'FAIL' ? 'Every automated control in this view is passing.' : 'Try another framework or clear the search.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-surface-2">
                    <tr className="border-b border-line text-left text-xs text-fg-3">
                      <th className="h-9 pr-3 pl-5 font-medium">Control</th>
                      <th className="px-3 font-medium">Frameworks</th>
                      <th className="px-3 font-medium">Service</th>
                      <th className="px-3 font-medium">Status</th>
                      <th className="pr-5 pl-3 text-right font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => {
                      const s = STATUS[c.status] || STATUS.NOT_EVALUATED
                      const failing = c.failing_finding_ids || []
                      return (
                        <tr key={c.id} className="border-b border-line last:border-0">
                          <td className="py-3 pr-3 pl-5 align-top">
                            <p className="font-medium text-fg">{c.title}</p>
                            <p className="font-mono text-xs text-fg-3">{c.id}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(c.frameworks || {}).map(([k, ref]) => (
                                <Badge key={k} size="sm" className="font-mono">{FW.find(f => f.key === k)?.short || k} {ref}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top text-fg-2">{SERVICE_NAMES[c.service] || c.service}</td>
                          <td className="px-3 py-3 align-top">
                            <span className={cn('inline-flex items-center gap-1.5 font-medium', s.cls)}><s.icon className="size-4" />{s.label}</span>
                          </td>
                          <td className="py-3 pr-5 pl-3 text-right align-top whitespace-nowrap">
                            {failing.length === 0 ? <span className="text-fg-3">—</span>
                              : failing.length === 1 ? <Link to={`/findings/${failing[0]}`} className="text-accent-text hover:underline">1 finding</Link>
                              : <Link to={`/findings?service=${c.service}`} className="num text-accent-text hover:underline">{failing.length} findings</Link>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </Page>
  )
}
