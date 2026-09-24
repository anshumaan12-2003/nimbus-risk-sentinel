import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Crosshair, Crown, Download, Globe, Play, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { consoleUrl } from '@/lib/aws'
import {
  Page, PageHeader, Card, Button, Input, Badge, SeverityBadge, StatTile, EmptyState, QueryState, SkeletonRows,
  Sheet, SheetContent, DescriptionList, ResourceId, Switch,
  TimeAgo
} from '@/components/ds'
import { downloadFile, toCsv } from '@/components/ui'
import { useInventory } from '@/hooks/queries'
import { useSentinelStore } from '@/store/sentinelStore'

const TYPE_LABEL = {
  ec2: 'EC2', s3: 'S3', rds: 'RDS', lambda: 'Lambda', dynamodb: 'DynamoDB',
  secret: 'Secrets', iam_role: 'IAM roles', iam_user: 'IAM users',
}
const TYPE_SERVICE = { ec2: 'ec2', s3: 's3', rds: 'rds', iam_role: 'iam', iam_user: 'iam' }
const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }

function AssetSheet({ asset, open, onOpenChange }) {
  if (!asset) return null
  const details = Object.entries(asset.details || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')
  const tags = Object.entries(asset.tags || {})
  const url = TYPE_SERVICE[asset.type] ? consoleUrl({ service: TYPE_SERVICE[asset.type], resource_id: asset.id, resource_name: asset.name, region: asset.region }) : null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width={560}
        title={asset.name}
        description={`${TYPE_LABEL[asset.type] || asset.type} · ${asset.region}`}
        headerExtra={(asset.public || asset.crown) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {asset.public && <Badge tone="critical" size="sm"><Globe className="size-3" /> Internet exposed</Badge>}
            {asset.crown && <Badge tone="medium" size="sm"><Crown className="size-3" /> Crown jewel</Badge>}
          </div>
        )}
      >
        <div className="grid gap-6 p-5">
          <DescriptionList items={[['ID', <ResourceId value={asset.id} consoleUrl={url} />], ['Region', asset.region]]} />

          {details.length > 0 && (
            <section className="grid gap-2.5">
              <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Configuration</h3>
              <DescriptionList items={details.map(([k, v]) => [
                k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()),
                <span className="font-mono text-xs break-all">{Array.isArray(v) ? (v.join(', ') || '—') : String(v)}</span>,
              ])} />
            </section>
          )}

          <section className="grid gap-2.5">
            <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Open findings · {asset.findings.length}</h3>
            {asset.findings.length ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {asset.findings.map(f => (
                  <li key={f.id}>
                    <Link to={`/findings/${f.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2">
                      <SeverityBadge severity={f.severity} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-fg">{f.title}</span>
                      <span className="font-mono text-xs text-fg-3">{f.rule_id}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-2">No open findings on this resource.{asset.type === 'ec2' ? ' Security-group findings are listed under the group ID.' : ''}</p>
            )}
          </section>

          {tags.length > 0 && (
            <section className="grid gap-2.5">
              <h3 className="text-xs font-medium tracking-wide text-fg-3 uppercase">Tags</h3>
              <div className="flex flex-wrap gap-1.5">{tags.map(([k, v]) => <Badge key={k} size="sm"><span className="text-fg-3">{k}</span> {v}</Badge>)}</div>
            </section>
          )}

          <Button asChild className="w-fit"><Link to="/simulator"><Crosshair /> See attack paths</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function Assets() {
  const { dataSource, openScanModal } = useSentinelStore()
  const q = useInventory()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const type = params.get('type') || 'all'
  const exposedOnly = params.get('exposed') === '1'
  const [sort, setSort] = useState('risk')
  const [open, setOpen] = useState(null)
  const [shown, setShown] = useState(null)

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v === null || v === 'all' || v === false || v === '') next.delete(k); else next.set(k, v === true ? '1' : v)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    let a = q.data?.assets || []
    if (type !== 'all') a = a.filter(x => x.type === type)
    if (exposedOnly) a = a.filter(x => x.public)
    if (search) {
      const s = search.toLowerCase()
      a = a.filter(x => x.name.toLowerCase().includes(s) || x.id.toLowerCase().includes(s))
    }
    const risk = x => [x.public ? 0 : 1, SEV_RANK[x.max_severity] ?? 9, x.crown ? 0 : 1]
    return [...a].sort((x, y) => {
      if (sort === 'name') return x.name.localeCompare(y.name)
      const rx = risk(x), ry = risk(y)
      for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] - ry[i]
      return y.findings.length - x.findings.length
    })
  }, [q.data, type, exposedOnly, search, sort])

  if (dataSource === 'demo') {
    return (
      <Page>
        <PageHeader title="Assets" />
        <Card><EmptyState title="Asset inventory needs live data" body="Switch to live data (⌘K → Show my real AWS data) to browse the resources in your AWS account." /></Card>
      </Page>
    )
  }

  const summary = q.data?.summary || {}
  const exportCsv = () => downloadFile(`nimbus-assets-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, [
    { label: 'Name', get: r => r.name }, { label: 'Type', get: r => TYPE_LABEL[r.type] },
    { label: 'Region', get: r => r.region }, { label: 'Internet exposed', get: r => r.public ? 'yes' : 'no' },
    { label: 'Crown jewel', get: r => r.crown ? 'yes' : 'no' }, { label: 'Highest severity', get: r => r.max_severity || '' },
    { label: 'Open findings', get: r => r.findings.length }, { label: 'ARN / ID', get: r => r.id },
  ]))

  return (
    <Page wide>
      <PageHeader
        title="Assets"
        description="Every resource discovered in the latest scan, ranked by exposure. Healthy resources are listed too — attack paths run through them."
        meta={q.data?.collected_at && <><span className="font-mono">AWS {q.data.account_id}</span><span aria-hidden>·</span><span>Collected <TimeAgo value={q.data.collected_at} /></span></>}
        actions={<>
          <Button onClick={exportCsv} disabled={!rows.length}><Download /> Export CSV</Button>
          <Button variant="primary" onClick={openScanModal}><Play /> Rescan</Button>
        </>}
      />

      <QueryState
        query={q}
        loading={<SkeletonRows rows={8} />}
        isEmpty={d => !d?.scan_id}
        empty={<Card><EmptyState title="No inventory yet"
          body="The inventory is captured during a scan: EC2, S3, RDS, Lambda, DynamoDB, Secrets Manager and IAM."
          action={<Button variant="primary" onClick={openScanModal}><Play /> Run first scan</Button>} /></Card>}
      >
        {() => (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Assets discovered" value={summary.total ?? 0} hint="in the latest scan" />
              <StatTile label="Internet exposed" value={summary.public ?? 0} tone={summary.public ? 'critical' : 'low'} hint="reachable without credentials"
                        onClick={() => setParam('exposed', !exposedOnly)} />
              <StatTile label="Crown jewels" value={summary.crown_jewels ?? 0} tone="medium" hint="data worth protecting" />
              <StatTile label="With open findings" value={summary.with_findings ?? 0} tone={summary.with_findings ? 'high' : 'low'} hint="need attention" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Asset type">
                {[['all', 'All', summary.total], ...Object.entries(summary.by_type || {}).map(([t, n]) => [t, TYPE_LABEL[t] || t, n])].map(([t, label, n]) => (
                  <button key={t} type="button" onClick={() => setParam('type', t)} aria-pressed={type === t}
                          className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                            type === t ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg')}>
                    {label}<span className="num opacity-70">{n}</span>
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  <Switch checked={exposedOnly} onCheckedChange={(v) => setParam('exposed', v)} aria-label="Internet exposed only" />
                  Exposed only
                </label>
                <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"
                        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none">
                  <option value="risk">Sort by risk</option>
                  <option value="name">Sort by name</option>
                </select>
                <div className="w-56">
                  <Input icon={Search} value={search} placeholder="Name, ARN or ID" aria-label="Search assets"
                         onChange={e => { setSearch(e.target.value); setParam('q', e.target.value || null) }} />
                </div>
              </div>
            </div>

            <Card className="overflow-hidden">
              {rows.length === 0 ? (
                <EmptyState compact mood="thinking" title="No assets match" body="Clear the filters or search to see everything." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead className="bg-surface-2">
                      <tr className="border-b border-line text-left text-xs font-medium text-fg-3">
                        <th className="h-9 pr-3 pl-5 font-medium">Asset</th>
                        <th className="px-3 font-medium">Type</th>
                        <th className="px-3 font-medium">Region</th>
                        <th className="px-3 font-medium">Exposure</th>
                        <th className="px-3 font-medium">Highest severity</th>
                        <th className="pr-5 pl-3 text-right font-medium">Open findings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(a => (
                        <tr key={a.id} tabIndex={0} onClick={() => { setOpen(a); setShown(a) }}
                            onKeyDown={e => { if (e.key === 'Enter') { setOpen(a); setShown(a) } }}
                            className="group relative cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                          <td className="relative h-14 pr-3 pl-5">
                            {a.max_severity && <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 group-hover:opacity-70', SEV_STRIPE[a.max_severity])} />}
                            <p className="font-medium text-fg">{a.name}</p>
                            <p className="max-w-[360px] truncate font-mono text-xs text-fg-3" title={a.id}>{a.id}</p>
                          </td>
                          <td className="px-3 text-fg-2">{TYPE_LABEL[a.type] || a.type}</td>
                          <td className="px-3 font-mono text-xs text-fg-2">{a.region}</td>
                          <td className="px-3">
                            <div className="flex flex-wrap gap-1.5">
                              {a.public && <Badge tone="critical" size="sm"><Globe className="size-3" /> Public</Badge>}
                              {a.crown && <Badge tone="medium" size="sm"><Crown className="size-3" /> Crown jewel</Badge>}
                              {!a.public && !a.crown && <span className="text-fg-3">Private</span>}
                            </div>
                          </td>
                          <td className="px-3">{a.max_severity ? <SeverityBadge severity={a.max_severity} size="sm" /> : <span className="text-fg-3">—</span>}</td>
                          <td className="num pr-5 pl-3 text-right font-medium text-fg">{a.findings.length || <span className="text-fg-3">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            {rows.length > 0 && <p className="num text-xs text-fg-3">{rows.length} of {summary.total} assets</p>}
          </div>
        )}
      </QueryState>

      <AssetSheet asset={open || shown} open={!!open} onOpenChange={(o) => { if (!o) setOpen(null) }} />
    </Page>
  )
}
