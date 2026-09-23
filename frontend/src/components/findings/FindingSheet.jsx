import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Undo2, Wrench } from 'lucide-react'
import {
  Sheet, SheetContent, Tabs, TabsList, TabsTrigger, TabsContent, SeverityBadge, StatusBadge, Button, Badge,
  DescriptionList, ResourceId, CodeBlock, Textarea, Field, Skeleton, EmptyState,
} from '@/components/ds'
import { api, apiError, dryRunRemediation, requestRemediation, updateFindingStatus } from '@/api/nimbus'
import { useCan } from '@/auth/authStore'
import { useControls } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'
import { consoleUrl, SERVICE_NAMES } from '@/lib/aws'
import { ago, dateTime } from '@/lib/time'

function Section({ title, children }) {
  return (
    <section className="grid gap-2.5">
      <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function StateBox({ label, value, tone }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-2">
      <p className={`border-b border-line px-3 py-1.5 text-xs font-medium ${tone}`}>{label}</p>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-fg">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  )
}

/* Fix tab: live preview of the change (dry run), then send it to an approver. */
function FixPanel({ finding, demo }) {
  const canRequest = useCan('remediation:request')
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const preview = useQuery({
    queryKey: ['remediation', 'dry-run', finding.id],
    queryFn: () => dryRunRemediation(finding.rule_id, finding.resource_id, finding.id),
    enabled: !demo && canRequest.allowed && finding.status !== 'RESOLVED',
    staleTime: 60_000, retry: false,
  })
  const request = useMutation({
    mutationFn: () => requestRemediation(finding.id, reason),
    onSuccess: () => {
      toast.success('Sent for approval', { description: 'An approver will review the preview before anything changes in AWS.' })
      qc.invalidateQueries({ queryKey: ['findings'] }); qc.invalidateQueries({ queryKey: ['remediation'] })
    },
    onError: (e) => toast.error('Not sent', { description: apiError(e) }),
  })
  const d = preview.data?.dry_run
  const cmd = d?.remediation_cmd || finding.remediation_cmd || finding.remediation_cli

  return (
    <div className="grid gap-6">
      {finding.recommendation && (
        <Section title="How to fix it"><p className="text-sm leading-6 text-fg">{finding.recommendation}</p></Section>
      )}

      {!canRequest.allowed ? (
        <p className="rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg-2">{canRequest.reason}. You can still copy the command below.</p>
      ) : demo ? null : preview.isLoading ? (
        <Section title="Preview"><Skeleton className="h-28" /></Section>
      ) : preview.isError ? (
        <p className="rounded-md border border-crit-line bg-crit-soft px-3 py-2.5 text-sm text-crit-text">Couldn’t read the live resource: {apiError(preview.error)}</p>
      ) : d && (
        <Section title={preview.data.supported ? 'What will change' : 'Manual fix needed'}>
          <div className="grid gap-3 rounded-lg border border-line p-4">
            <p className="text-sm font-medium text-fg">{d.action}</p>
            <div className="grid items-start gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <StateBox label="Now" value={d.before_state} tone="text-crit-text" />
              <ArrowRight className="mx-auto size-4 rotate-90 text-fg-3 sm:mt-10 sm:rotate-0" aria-hidden />
              <StateBox label="After" value={d.after_state} tone="text-low-text" />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-fg-3">Risk reduction</dt><dd className="text-fg">{d.risk_reduction || '—'}</dd></div>
              <div><dt className="text-xs text-fg-3">Expected downtime</dt><dd className="text-fg">{d.estimated_downtime || '—'}</dd></div>
            </dl>
          </div>
        </Section>
      )}

      {cmd && <Section title="Command"><CodeBlock language="aws cli" code={cmd} /></Section>}
      {d?.rollback_cmd && <Section title="Rollback"><CodeBlock language="aws cli" code={d.rollback_cmd} /></Section>}

      {canRequest.allowed && !demo && preview.data?.supported && finding.status !== 'RESOLVED' && (
        <Section title="Request this fix">
          <Field label="Why is this change needed?" hint="Shown to the approver. Optional, but it speeds up review.">
            {(p) => <Textarea {...p} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer data bucket must not be public." />}
          </Field>
          <Button variant="primary" className="w-fit" loading={request.isPending} onClick={() => request.mutate()}>
            <ShieldCheck /> Send for approval
          </Button>
          <p className="text-xs text-fg-3">Nothing changes in AWS until a different approver applies it{preview.data?.two_person_rule === false ? ' (self-approval allowed on this install)' : ''}.</p>
        </Section>
      )}
    </div>
  )
}

function CopilotPanel({ finding }) {
  const q = useQuery({
    queryKey: ['copilot', 'explain', finding.id],
    queryFn: () => api.post('/copilot/explain', finding).then(r => r.data.explanation),
    staleTime: Infinity, retry: false,
  })
  if (q.isLoading) return <div className="grid gap-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>
  if (q.isError) return <EmptyState compact icon={Sparkles} title="Copilot is unavailable" body={apiError(q.error)} />
  return (
    <div className="prose-nimbus text-sm leading-6 text-fg [&_code]:rounded-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-md [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-2 [&_pre]:p-3 [&_ul]:list-disc">
      <ReactMarkdown>{q.data || ''}</ReactMarkdown>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-3"><Sparkles className="size-3.5" /> Written by Copilot from this finding. Check before acting.</p>
    </div>
  )
}

export default function FindingSheet({ finding, open, onOpenChange }) {
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const canTriage = useCan('finding:triage')
  const controls = useControls()
  const qc = useQueryClient()
  const [tab, setTab] = useState('overview')

  const broken = useMemo(() => (controls.data?.controls || []).filter(c => (c.failing_finding_ids || []).includes(finding?.id)), [controls.data, finding?.id])
  const setStatus = useMutation({
    mutationFn: (status) => updateFindingStatus(finding.id, status),
    onSuccess: (_, status) => {
      toast.success(status === 'RESOLVED' ? 'Marked resolved' : status === 'ACCEPTED' ? 'Risk accepted' : 'Reopened')
      qc.invalidateQueries({ queryKey: ['findings'] })
    },
    onError: (e) => toast.error('Status not changed', { description: apiError(e) }),
  })
  if (!finding) return null
  const url = consoleUrl(finding)
  const resolved = finding.status === 'RESOLVED' || finding.status === 'ACCEPTED'

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTab('overview') }}>
      <SheetContent
        width={620}
        title={finding.title}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{finding.rule_id}</span><span aria-hidden>·</span>{SERVICE_NAMES[finding.service] || finding.service}{finding.region && finding.region !== 'global' && <><span aria-hidden>·</span>{finding.region}</>}</span>}
        headerExtra={<div className="mt-3 flex flex-wrap items-center gap-2"><SeverityBadge severity={finding.severity} /><StatusBadge status={finding.status} /><Badge size="md" className="num">Risk {finding.risk_score}</Badge></div>}
        footer={canTriage.allowed && !demo ? (
          resolved ? (
            <Button onClick={() => setStatus.mutate('OPEN')} loading={setStatus.isPending}><Undo2 /> Reopen</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStatus.mutate('ACCEPTED')} disabled={setStatus.isPending}>Accept risk</Button>
              <Button onClick={() => setStatus.mutate('RESOLVED')} loading={setStatus.isPending}><CheckCircle2 /> Mark resolved</Button>
            </>
          )
        ) : null}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="sticky top-0 z-10 bg-surface px-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="fix">Fix</TabsTrigger>
            <TabsTrigger value="copilot"><Sparkles className="size-3.5 text-accent-text" /> Explain</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="grid gap-6 p-5">
            <Section title="What’s wrong"><p className="text-sm leading-6 text-fg">{finding.description}</p></Section>
            <Section title="Resource">
              <DescriptionList items={[
                ['Name', finding.resource_name],
                ['ID', <ResourceId value={finding.resource_id} consoleUrl={url} />],
                ['Service', SERVICE_NAMES[finding.service] || finding.service],
                ['Region', finding.region || 'global'],
                ['First detected', finding.detected_at ? <span title={dateTime(finding.detected_at)}>{ago(finding.detected_at)}</span> : null],
                finding.assigned_to ? ['Assigned to', finding.assigned_to] : null,
              ]} />
            </Section>
            <Section title="Compliance controls this breaks">
              {controls.isLoading ? <Skeleton className="h-6 w-2/3" /> : broken.length === 0 ? (
                <p className="text-sm text-fg-2">Not mapped to an automated control.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {broken.map(c => (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-fg-3">{c.id}</span>
                      <span className="text-fg">{c.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            {!resolved && (
              <Button variant="primary" className="w-fit" onClick={() => setTab('fix')}><Wrench /> See how to fix</Button>
            )}
          </TabsContent>

          <TabsContent value="fix" className="p-5"><FixPanel finding={finding} demo={demo} /></TabsContent>
          <TabsContent value="copilot" className="p-5"><CopilotPanel finding={finding} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
