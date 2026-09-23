import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Boxes from 'lucide-react/dist/esm/icons/boxes'
import Crown from 'lucide-react/dist/esm/icons/crown'
import Download from 'lucide-react/dist/esm/icons/download'
import Globe from 'lucide-react/dist/esm/icons/globe'
import Search from 'lucide-react/dist/esm/icons/search'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Crosshair from 'lucide-react/dist/esm/icons/crosshair'
import { useInventory } from '../hooks/queries'
import { useSentinelStore } from '../store/sentinelStore'
import { PageHeader, QueryState, EmptyState, Drawer, SevBadge, Metric, downloadFile, toCsv } from '../components/ui'

const TYPE_LABEL = {
  ec2: 'EC2', s3: 'S3', rds: 'RDS', lambda: 'Lambda', dynamodb: 'DynamoDB',
  secret: 'Secrets', iam_role: 'IAM Roles', iam_user: 'IAM Users',
}
const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export default function Assets() {
  const { dataSource, openScanModal } = useSentinelStore()
  const q = useInventory()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const type = params.get('type') || 'all'
  const exposedOnly = params.get('exposed') === '1'
  const [sort, setSort] = useState('risk')
  const [open, setOpen] = useState(null)

  // filters live in the URL so a filtered view can be bookmarked or shared
  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v === null || v === 'all' || v === false) next.delete(k); else next.set(k, v === true ? '1' : v)
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
      <div className="animate-fade-in">
        <PageHeader icon={Boxes} tag="Inventory" title="Cloud Assets" />
        <EmptyState title="Asset inventory needs live mode" body="Switch to live data in Settings to browse the resources discovered in your AWS account." />
      </div>
    )
  }

  const summary = q.data?.summary || {}
  const exportCsv = () => downloadFile(`nimbus-assets-${Date.now()}.csv`, toCsv(rows, [
    { label: 'Name', get: r => r.name }, { label: 'Type', get: r => TYPE_LABEL[r.type] },
    { label: 'Region', get: r => r.region }, { label: 'Internet exposed', get: r => r.public ? 'yes' : 'no' },
    { label: 'Crown jewel', get: r => r.crown ? 'yes' : 'no' }, { label: 'Highest severity', get: r => r.max_severity || '' },
    { label: 'Open findings', get: r => r.findings.length }, { label: 'ARN / ID', get: r => r.id },
  ]))

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Boxes} tag={q.data?.account_id ? `Account ${q.data.account_id} · ${q.data.regions?.join(', ')}` : 'Inventory'}
        title="Cloud Assets"
        subtitle="Every resource discovered in the latest scan, ranked by exposure. Healthy resources are listed too, because attack paths run through them."
        actions={<>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openScanModal}><Zap size={14} /> Rescan</button>
        </>}
      />

      <QueryState
        query={q} rows={8}
        isEmpty={d => !d?.scan_id}
        empty={<EmptyState icon={Boxes} title="No inventory yet"
          body="The inventory is captured during a scan. Run one to discover EC2, S3, RDS, Lambda, DynamoDB, Secrets Manager and IAM."
          action={<button className="btn btn-primary" onClick={openScanModal}><Zap size={14} /> Run first scan</button>} />}
      >
        {() => (
          <>
            <div className="grid-4 ui-gap">
              <Metric label="Assets discovered" value={summary.total ?? 0} hint={`Collected ${new Date(q.data.collected_at).toLocaleString()}`} />
              <Metric label="Internet exposed" value={summary.public ?? 0} tone={summary.public ? 'critical' : 'low'} hint="Reachable without credentials" />
              <Metric label="Crown jewels" value={summary.crown_jewels ?? 0} hint="Data stores worth protecting" />
              <Metric label="With open findings" value={summary.with_findings ?? 0} tone={summary.with_findings ? 'high' : 'low'} />
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="ui-toolbar">
                <div className="ui-chip-row" role="tablist" aria-label="Asset type">
                  <button className={`filter-chip ${type === 'all' ? 'active' : ''}`} onClick={() => setParam('type', 'all')}>
                    All <span className="ui-count">{summary.total}</span>
                  </button>
                  {Object.entries(summary.by_type || {}).map(([t, n]) => (
                    <button key={t} className={`filter-chip ${type === t ? 'active' : ''}`} onClick={() => setParam('type', t)}>
                      {TYPE_LABEL[t] || t} <span className="ui-count">{n}</span>
                    </button>
                  ))}
                </div>
                <div className="ui-chip-row">
                  <label className="ui-toggle">
                    <input type="checkbox" checked={exposedOnly} onChange={e => setParam('exposed', e.target.checked)} />
                    Exposed only
                  </label>
                  <select className="ui-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                    <option value="risk">Sort: risk</option>
                    <option value="name">Sort: name</option>
                  </select>
                  <div className="search-input-wrap" style={{ width: 240 }}>
                    <Search size={14} className="search-icon" />
                    <input type="text" placeholder="Name, ARN or ID…" value={search}
                           onChange={e => { setSearch(e.target.value); setParam('q', e.target.value || null) }} />
                  </div>
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr><th>Asset</th><th>Type</th><th>Region</th><th>Exposure</th><th>Highest severity</th><th>Open findings</th></tr>
                  </thead>
                  <tbody>
                    {rows.map(a => (
                      <tr key={a.id} className="ui-row-link" tabIndex={0} onClick={() => setOpen(a)}
                          onKeyDown={e => e.key === 'Enter' && setOpen(a)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{a.name}</div>
                          <div className="font-mono ui-subtle ui-truncate" title={a.id}>{a.id}</div>
                        </td>
                        <td>{TYPE_LABEL[a.type] || a.type}</td>
                        <td className="font-mono" style={{ fontSize: 12 }}>{a.region}</td>
                        <td>
                          <div className="ui-chip-row">
                            {a.public && <span className="badge-pill badge-critical"><Globe size={11} /> Public</span>}
                            {a.crown && <span className="badge-pill ui-badge-crown"><Crown size={11} /> Crown jewel</span>}
                            {!a.public && !a.crown && <span className="ui-subtle">Private</span>}
                          </div>
                        </td>
                        <td><SevBadge severity={a.max_severity} /></td>
                        <td className="font-mono">{a.findings.length || '—'}</td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={6}><EmptyState title="No assets match" body="Clear the filters or search to see everything." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </QueryState>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name || ''}>
        {open && <AssetDetail asset={open} />}
      </Drawer>
    </div>
  )
}

function AssetDetail({ asset }) {
  const details = Object.entries(asset.details || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')
  const tags = Object.entries(asset.tags || {})
  return (
    <div className="ui-detail">
      <section>
        <div className="ui-detail-label">Identifier</div>
        <code className="ui-code">{asset.id}</code>
      </section>
      <section className="ui-chip-row">
        <span className="badge-pill ui-badge-muted">{TYPE_LABEL[asset.type]}</span>
        <span className="badge-pill ui-badge-muted">{asset.region}</span>
        {asset.public && <span className="badge-pill badge-critical">Internet exposed</span>}
        {asset.crown && <span className="badge-pill ui-badge-crown">Crown jewel</span>}
      </section>

      {details.length > 0 && (
        <section>
          <div className="ui-detail-label">Configuration</div>
          <dl className="ui-kv">
            {details.map(([k, v]) => (
              <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd className="font-mono">{Array.isArray(v) ? (v.join(', ') || '—') : String(v)}</dd></div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <div className="ui-detail-label">Open findings ({asset.findings.length})</div>
        {asset.findings.length ? (
          <ul className="ui-list">
            {asset.findings.map(f => (
              <li key={f.id}>
                <SevBadge severity={f.severity} />
                <Link to={`/findings/${f.id}`}><span className="font-mono">{f.rule_id}</span> {f.title}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="ui-subtle">No open findings on this resource.{asset.type === 'ec2' ? ' Security-group findings are listed under the group id.' : ''}</p>}
      </section>

      {tags.length > 0 && (
        <section>
          <div className="ui-detail-label">Tags</div>
          <div className="ui-chip-row">{tags.map(([k, v]) => <span key={k} className="badge-pill ui-badge-muted">{k}: {v}</span>)}</div>
        </section>
      )}

      <section>
        <Link className="btn btn-ghost btn-sm" to="/simulator"><Crosshair size={12} /> See attack paths</Link>
      </section>
    </div>
  )
}
