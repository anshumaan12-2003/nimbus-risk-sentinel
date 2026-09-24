import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Monitor, Moon, RefreshCw, Sun, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Page, PageHeader, Card, Button, Badge, Input, Kbd, SkeletonRows, ErrorState, Segmented, ResourceId,
} from '@/components/ds'
import { usePreflight, useConfig } from '../hooks/queries'
import { getPreflight, testSlackWebhook, apiError } from '../api/nimbus'
import { qk } from '../lib/queryClient'
import { useSentinelStore } from '../store/sentinelStore'
import { SHORTCUT_GROUPS } from '../hooks/useShortcuts'
import { AccountSection, TeamSection } from '../components/TeamSettings'
import { useCan } from '../auth/authStore'

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-md font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
        </header>
        <div className="p-5">{children}</div>
      </Card>
    </section>
  )
}

function Rows({ items }) {
  return (
    <dl className="divide-y divide-line">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt className="text-sm text-fg-2">{k}</dt>
          <dd className="min-w-0 text-sm text-fg">{v ?? <span className="text-fg-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

const On = ({ on, yes = 'On', no = 'Off' }) => <Badge size="sm" tone={on ? 'low' : 'neutral'} dot>{on ? yes : no}</Badge>

export default function Settings() {
  const { dataSource, setDataSource, themePref, setTheme, triggerRefresh } = useSentinelStore()
  const qc = useQueryClient()
  const pre = usePreflight()
  const cfg = useConfig()
  const isAdmin = useCan('users:manage')
  const [rechecking, setRechecking] = useState(false)
  const [slackUrl, setSlackUrl] = useState('')
  const [slackBusy, setSlackBusy] = useState(false)
  const live = dataSource !== 'demo'

  const recheck = async () => {
    setRechecking(true)
    try { qc.setQueryData(qk.preflight, await getPreflight(true)) }
    catch (e) { qc.setQueryData(qk.preflight, { connected: false, error: apiError(e) }) }
    finally { setRechecking(false) }
  }
  const testSlack = async () => {
    setSlackBusy(true)
    try { const r = await testSlackWebhook(slackUrl || undefined); toast.success('Test message sent', { description: r.message }) }
    catch (e) { toast.error('Slack test failed', { description: apiError(e) }) }
    finally { setSlackBusy(false) }
  }
  const switchMode = (m) => { setDataSource(m); qc.invalidateQueries(); triggerRefresh() }
  const c = cfg.data || {}
  const p = pre.data
  const failing = (p?.checks || []).filter(x => !x.ok)

  const nav = [
    live && ['account', 'Your account'], live && ['team', 'Team'], ['aws', 'AWS connection'], ['scanning', 'Scanning'],
    ['remediation', 'Remediation'], ['copilot', 'Vesper'], ['notifications', 'Notifications'], ['appearance', 'Appearance'], ['shortcuts', 'Keyboard shortcuts'],
  ].filter(Boolean)

  return (
    <Page>
      <PageHeader title="Settings" description="Server settings are read-only here on purpose: credentials and write access live in backend/.env, never in the browser." />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 grid gap-0.5">
            {nav.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="block rounded-md px-2.5 py-1.5 text-sm text-fg-2 hover:bg-muted hover:text-fg">{label}</a></li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-6">
          {live && <Section id="account" title="Your account"><AccountSection /></Section>}
          {live && <Section id="team" title="Team"><TeamSection /></Section>}

          <Section id="aws" title="AWS connection" description="What Nimbus can see, checked against the same AWS APIs the scanners call.">
            {!live ? <p className="text-sm text-fg-2">Demo mode — not connected to AWS.</p>
              : pre.isLoading ? <SkeletonRows rows={3} />
              : pre.isError ? <ErrorState error={pre.error} onRetry={pre.refetch} compact />
              : (
                <div className="grid gap-4">
                  <Rows items={[
                    ['Status', p.connected
                      ? (p.ready ? <On on yes="Connected · every check passes" /> : <Badge size="sm" tone="high" dot>Connected · {failing.length} denied</Badge>)
                      : <Badge size="sm" tone="critical" dot>Not connected</Badge>],
                    p.connected && ['Account', <span className="font-mono text-xs">{p.account_id}</span>],
                    p.connected && ['Signed in as', <ResourceId value={p.principal_arn} />],
                    p.connected && ['Credentials', p.auth_mode],
                    p.connected && ['Regions', <span className="font-mono text-xs">{p.regions?.join(', ')}</span>],
                    !p.connected && ['Error', <span className="font-mono text-xs break-words text-crit-text">{p.error || p.hint}</span>],
                  ]} />
                  {p.checks?.length > 0 && (
                    <details className="group rounded-md border border-line" open={failing.length > 0}>
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg">
                        Permission checks <span className="num font-normal text-fg-3">· {p.checks.length - failing.length} of {p.checks.length} allowed</span>
                      </summary>
                      <div className="overflow-x-auto border-t border-line">
                        <table className="w-full text-sm">
                          <tbody>{p.checks.map((x, i) => (
                            <tr key={i} className="border-b border-line last:border-0">
                              <td className="w-8 py-2 pl-3">{x.ok ? <CheckCircle2 className="size-4 text-low-text" /> : <XCircle className="size-4 text-crit-text" />}</td>
                              <td className="px-2 text-fg">{x.service}</td>
                              <td className="px-2 font-mono text-xs text-fg-2">{x.call}</td>
                              <td className="px-2 font-mono text-xs text-fg-3">{x.region}</td>
                              <td className={cn('px-3 text-right font-mono text-xs', x.ok ? 'text-fg-3' : 'text-crit-text')}>{x.ok ? 'allowed' : x.error}</td>
                            </tr>))}
                          </tbody>
                        </table>
                      </div>
                      {p.hint && <p className="border-t border-line px-3 py-2 text-xs text-fg-2">{p.hint}</p>}
                    </details>
                  )}
                  <Button className="w-fit" onClick={recheck} loading={rechecking}>{!rechecking && <RefreshCw />} Re-check connection</Button>
                </div>
              )}
          </Section>

          <Section id="scanning" title="Scanning" description="Change these in backend/.env, then restart the API.">
            {cfg.isLoading ? <SkeletonRows rows={4} /> : cfg.isError ? <ErrorState error={cfg.error} onRetry={cfg.refetch} compact /> : (
              <Rows items={[
                ['Regions', <span className="font-mono text-xs">{c.regions?.join(', ')}</span>],
                ['Home region', <span className="font-mono text-xs">{c.default_region}</span>],
                ['Schedule', c.scheduled_scans ? `Every ${c.scan_interval_minutes} minutes` : 'Manual only'],
                ['Runs in', c.scan_executor === 'celery' ? 'Celery worker' : 'The API process'],
                ['Live updates', c.events_backend],
                ['Crown-jewel tags', <span className="font-mono text-xs">{c.crown_jewel_tag_keys?.join(', ')}</span>],
                ['Crown-jewel name hints', <span className="font-mono text-xs">{c.crown_jewel_name_hints?.join(', ')}</span>],
              ]} />
            )}
          </Section>

          <Section id="remediation" title="Remediation" description="Writes to AWS stay off unless explicitly enabled on the server.">
            {cfg.data && <Rows items={[
              ['Apply fixes', <On on={c.remediation_enabled} yes="Allowed" no="Preview only" />],
              ['Write role', c.remediation_role_arn ? <ResourceId value={c.remediation_role_arn} /> : <span className="text-med-text">Same identity as the scanner — use a separate role in production</span>],
            ]} />}
          </Section>

          <Section id="copilot" title="Vesper (assistant)">
            {cfg.data && <Rows items={[
              ['Provider', c.ai_provider],
              ['Model', <span className="font-mono text-xs">{c.ai_model}</span>],
              ['API key', <On on={c.ai_configured} yes="Configured" no="Missing — explanations use scanner text only" />],
            ]} />}
          </Section>

          <Section id="notifications" title="Notifications" description="Slack alerts fire for new critical findings.">
            <div className="grid gap-4">
              {cfg.data && <Rows items={[['Slack', <On on={c.slack_enabled} />]]} />}
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[240px] flex-1"><Input value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/… (blank = server default)" aria-label="Slack webhook URL" /></div>
                <Button onClick={testSlack} loading={slackBusy} disabled={!isAdmin.allowed} title={isAdmin.reason || undefined}>Send test message</Button>
              </div>
              {!isAdmin.allowed && <p className="text-xs text-fg-3">{isAdmin.reason}</p>}
            </div>
          </Section>

          <Section id="appearance" title="Appearance" description="Saved in this browser.">
            <Rows items={[
              ['Theme', (
                <Segmented label="Theme" value={themePref} onValueChange={setTheme} options={[
                  { value: 'system', label: 'System', icon: Monitor }, { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon },
                ]} />
              )],
              ['Data', (
                <Segmented label="Data" value={dataSource} onValueChange={switchMode}
                           options={[{ value: 'live', label: 'My AWS account' }, { value: 'demo', label: 'Sample data' }]} />
              )],
            ]} />
          </Section>

          <Section id="shortcuts" title="Keyboard shortcuts" description="Press ? anywhere to see these.">
            <div className="grid gap-6 sm:grid-cols-2">
              {SHORTCUT_GROUPS.map(g => (
                <div key={g.title} className="grid content-start gap-2">
                  <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">{g.title}</p>
                  {g.items.map(s => (
                    <div key={s.label} className="flex items-center justify-between gap-3 text-sm text-fg">
                      <span>{s.label}</span><span className="flex gap-1">{s.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </Page>
  )
}
