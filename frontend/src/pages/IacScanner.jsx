import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, ChevronRight, FileCode2, Play, Upload, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, Textarea, SeverityBadge, Badge, EmptyState, SkeletonRows,
  Tabs, TabsList, TabsTrigger, TabsContent, Sheet, SheetContent, DescriptionList, CodeBlock,
} from '@/components/ds'
import { api, apiError, scanIacDemo } from '@/api/nimbus'
import { useCan } from '@/auth/authStore'

const SEV = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }
const SAMPLE = `resource "aws_s3_bucket" "logs" {
  bucket = "acme-app-logs"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`

const CI_SNIPPET = `# .github/workflows/iac.yml — fail the PR on critical misconfigurations
- name: Breachpath IaC scan
  run: python cli/breachpath_cli.py scan iac ./infrastructure/terraform`

function Results({ data }) {
  const [sev, setSev] = useState('')
  const [open, setOpen] = useState(null)
  const [shown, setShown] = useState(null)
  const summary = data.severity_summary || {}
  const rows = useMemo(() => (data.findings || []).filter(f => !sev || f.severity === sev).sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)), [data, sev])
  const crit = summary.CRITICAL || 0
  const f = open || shown

  return (
    <div className="grid gap-4">
      <div role="status" className={cn('flex flex-wrap items-center gap-4 rounded-lg border p-4',
        data.passed ? 'border-low-line bg-low-soft' : 'border-crit-line bg-crit-soft')}>
        {data.passed ? <CheckCircle2 className="size-6 text-low-text" /> : <XCircle className="size-6 text-crit-text" />}
        <div className="min-w-0 flex-1">
          <p className={cn('font-semibold', data.passed ? 'text-low-text' : 'text-crit-text')}>
            {data.passed ? 'Passed — no critical misconfigurations' : `Would block the merge — ${crit} critical misconfiguration${crit === 1 ? '' : 's'}`}
          </p>
          <p className="num text-sm text-fg-2">{data.resources_scanned || 0} resources checked · {data.total_findings || 0} findings</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity">
        {['', ...SEV].map(s => (
          <button key={s || 'all'} type="button" onClick={() => setSev(s)} aria-pressed={sev === s}
                  className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    sev === s ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg')}>
            {s && <span className={cn('size-1.5 rounded-[2px]', SEV_STRIPE[s])} />}
            {s ? s[0] + s.slice(1).toLowerCase() : 'All'}
            <span className="num opacity-70">{s ? summary[s] || 0 : data.total_findings || 0}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState compact mood="happy" title={sev ? 'Nothing at this severity' : 'No misconfigurations found'} body={sev ? undefined : 'Every resource passed the Breachpath rules.'} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r, i) => (
              <li key={`${r.rule_id}-${r.file_path}-${r.line_number}-${i}`}>
                <button type="button" onClick={() => { setOpen(r); setShown(r) }}
                        className="group relative flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2">
                  <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 group-hover:opacity-70', SEV_STRIPE[r.severity])} />
                  <SeverityBadge severity={r.severity} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{r.title}</span>
                    <span className="block truncate font-mono text-xs text-fg-3">{r.rule_id} · {r.file_path}:{r.line_number}</span>
                  </span>
                  <span className="hidden truncate text-xs text-fg-2 md:block">{r.resource_type}.{r.resource_name}</span>
                  <ChevronRight className="size-4 shrink-0 text-fg-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null) }}>
        {f && (
          <SheetContent width={600} title={f.title} description={<span className="font-mono text-xs">{f.rule_id} · {f.file_path}:{f.line_number}</span>}
                        headerExtra={<div className="mt-3 flex gap-2"><SeverityBadge severity={f.severity} /><Badge className="num">Risk {f.risk_score}</Badge></div>}>
            <div className="grid gap-6 p-5">
              <p className="text-sm leading-6 text-fg">{f.description}</p>
              <DescriptionList items={[
                ['Resource', <span className="font-mono text-xs">{f.resource_type}.{f.resource_name}</span>],
                ['File', <span className="font-mono text-xs">{f.file_path}, line {f.line_number}</span>],
                ['Service', f.service],
              ]} />
              {f.compliance?.length > 0 && (
                <section className="grid gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Compliance</h3>
                  <div className="flex flex-wrap gap-1.5">{f.compliance.map(c => <Badge key={c} size="sm">{c}</Badge>)}</div>
                </section>
              )}
              {f.remediation_hcl && (
                <section className="grid gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Fixed Terraform</h3>
                  <CodeBlock language="hcl" code={f.remediation_hcl} />
                </section>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}

export default function IacScanner() {
  const can = useCan('iac:scan')
  const [mode, setMode] = useState('sample')
  const [hcl, setHcl] = useState('')
  const [file, setFile] = useState(null)
  const fileRef = useRef(null)
  const scan = useMutation({
    mutationFn: async () => {
      if (mode === 'paste') return (await api.post('/iac/scan/content', { hcl_content: hcl, filename: 'pasted.tf' })).data
      if (mode === 'upload') {
        const body = new FormData(); body.append('file', file)
        return (await api.post('/iac/scan/upload', body, { headers: { 'Content-Type': 'multipart/form-data' } })).data
      }
      return scanIacDemo()
    },
    onError: (e) => toast.error('Scan failed', { description: apiError(e) }),
  })
  const ready = mode === 'sample' || (mode === 'paste' ? hcl.trim().length > 0 : !!file)

  return (
    <Page>
      <PageHeader
        title="IaC scanner"
        description="Check Terraform for misconfigurations before it’s deployed — the same rules run in CI to block risky pull requests."
      />
      <div className="grid gap-5">
        <Card>
          <Tabs value={mode} onValueChange={(m) => { setMode(m); scan.reset() }}>
            <div className="px-5 pt-3"><TabsList>
              <TabsTrigger value="sample">Sample repo</TabsTrigger>
              <TabsTrigger value="paste">Paste Terraform</TabsTrigger>
              <TabsTrigger value="upload">Upload file</TabsTrigger>
            </TabsList></div>
            <CardBody className="pt-4">
              <TabsContent value="sample" className="text-sm text-fg-2">Scans the Terraform bundled with Breachpath (<span className="font-mono text-xs">infrastructure/terraform</span>) — a quick way to see the rules at work.</TabsContent>
              <TabsContent value="paste" className="grid gap-2">
                <Textarea value={hcl} onChange={e => setHcl(e.target.value)} spellCheck={false} aria-label="Terraform code"
                          placeholder={SAMPLE} className="min-h-64 font-mono text-xs leading-5" />
                <Button variant="link" size="sm" className="w-fit" onClick={() => setHcl(SAMPLE)}>Use an example</Button>
              </TabsContent>
              <TabsContent value="upload">
                <input ref={fileRef} type="file" accept=".tf,.zip" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f) }}
                        className="grid w-full place-items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center hover:border-accent">
                  <Upload className="size-5 text-fg-3" />
                  <span className="text-sm font-medium text-fg">{file ? file.name : 'Drop a .tf file or a .zip of a Terraform folder'}</span>
                  <span className="text-xs text-fg-3">{file ? `${(file.size / 1024).toFixed(1)} KB · click to change` : 'or click to choose'}</span>
                </button>
              </TabsContent>
              <div className="mt-4 flex items-center gap-3">
                <Button variant="primary" onClick={() => scan.mutate()} loading={scan.isPending} disabled={!ready || (mode !== 'sample' && !can.allowed)}
                        title={mode !== 'sample' && !can.allowed ? can.reason : undefined}>
                  {!scan.isPending && <Play />} {scan.isPending ? 'Scanning' : 'Scan'}
                </Button>
                {mode !== 'sample' && !can.allowed && <span className="text-xs text-fg-3">{can.reason}</span>}
              </div>
            </CardBody>
          </Tabs>
        </Card>

        {scan.isPending ? <SkeletonRows rows={6} /> : scan.data ? <Results data={scan.data} /> : (
          <Card><EmptyState icon={FileCode2} title="No scan yet" body="Choose a source above and press Scan." compact /></Card>
        )}

        <Card>
          <CardHeader title="Run it in CI" description="Fail pull requests that introduce a critical misconfiguration." />
          <CardBody><CodeBlock language="yaml" code={CI_SNIPPET} /></CardBody>
        </Card>
      </div>
    </Page>
  )
}
