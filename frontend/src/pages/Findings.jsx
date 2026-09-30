import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, CheckCircle2, Download, Search, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SERVICE_NAMES } from '@/lib/aws'
import {
  Page, PageHeader, Card, Button, Input, SeverityBadge, StatusBadge, EmptyState, ErrorState, SkeletonRows,
  Segmented, Kbd, Tooltip,
  TimeAgo
} from '@/components/ds'
import FindingSheet from '@/components/findings/FindingSheet'
import { downloadFile, toCsv } from '@/components/ui'
import { useFindings } from '@/hooks/queries'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useCan } from '@/auth/authStore'
import { useSentinelStore } from '@/store/sentinelStore'
import { apiError, requestRemediation, updateFindingStatus } from '@/api/nimbus'
import { MOCK_FINDINGS } from '@/data/mockData'

const SEV_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 }
const SEV_STRIPE = { CRITICAL: 'bg-crit', HIGH: 'bg-high', MEDIUM: 'bg-med', LOW: 'bg-low' }
const STATUS_VIEWS = {
  open: { label: 'Open', match: (f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS' },
  resolved: { label: 'Resolved', match: (f) => f.status === 'RESOLVED' },
  accepted: { label: 'Accepted', match: (f) => f.status === 'ACCEPTED' },
  all: { label: 'All', match: () => true },
}
const findingKey = (f) => `${f.rule_id}|${f.resource_id}`
const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

function Checkbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} onClick={e => e.stopPropagation()}
           className="size-4 cursor-pointer rounded-xs border-line-strong accent-[var(--accent)]" />
  )
}

function SortHeader({ column, children, align }) {
  const s = column.getIsSorted()
  return (
    <button type="button" onClick={column.getToggleSortingHandler()}
            className={cn('inline-flex items-center gap-1 hover:text-fg', align === 'right' && 'ml-auto')}>
      {children}
      {s === 'asc' ? <ArrowUp className="size-3" /> : s === 'desc' ? <ArrowDown className="size-3" /> : null}
    </button>
  )
}

/* Fixing usually happens one resource at a time, so: each resource with its findings, the resource
   with the riskiest finding first. Same filters and sorting as the list. */
function ResourceGroups({ rows, onOpen, fresh }) {
  const groups = useMemo(() => {
    const m = new Map()
    for (const f of rows) {
      const key = f.resource_id || f.resource_name || f.id
      const g = m.get(key) || { key, name: f.resource_name || f.resource_id, service: f.service, region: f.region, items: [] }
      g.items.push(f); m.set(key, g)
    }
    return [...m.values()].map(g => ({ ...g, top: g.items.reduce((a, f) => (SEV_ORDER[f.severity] ?? 0) > (SEV_ORDER[a.severity] ?? 0) ? f : a).severity,
                                        risk: Math.max(...g.items.map(f => Number(f.risk_score) || 0)) }))
      .sort((a, b) => b.risk - a.risk || b.items.length - a.items.length)
  }, [rows])
  return (
    <ul className="divide-y divide-line" aria-label="Findings by resource">
      {groups.map(g => (
        <li key={g.key} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{g.name}</p>
              <p className="truncate text-xs text-fg-3">{SERVICE_NAMES[g.service] || g.service}{g.region ? ` · ${g.region}` : ''}</p>
            </div>
            <span className="flex items-center gap-2 text-xs text-fg-3">
              <SeverityBadge severity={g.top} size="sm" />
              <span className="num">{g.items.length} {g.items.length === 1 ? 'finding' : 'findings'}</span>
            </span>
          </div>
          <ul className="mt-2 grid gap-0.5">
            {g.items.map(f => (
              <li key={f.id} className={cn(fresh.has(findingKey(f)) && 'animate-arrive')}>
                <button type="button" data-finding-row onClick={() => onOpen(f)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2">
                  <span aria-hidden className={cn('h-5 w-[3px] shrink-0 rounded-full', SEV_STRIPE[f.severity])} />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{f.title}</span>
                  <span className="hidden font-mono text-xs text-fg-3 sm:inline">{f.rule_id}</span>
                  <span className="num w-8 text-right text-sm font-semibold text-fg" title="Risk score">{f.risk_score}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export default function Findings() {
  const [params] = useSearchParams()
  const { findingId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const demo = useSentinelStore(s => s.dataSource) === 'demo'
  const canRequest = useCan('remediation:request')
  const canTriage = useCan('finding:triage')
  const query = useFindings({ limit: 500 })
  const compact = useMediaQuery('(max-width: 767px)')
  const all = demo ? MOCK_FINDINGS : (query.data || [])

  // Filters live in the URL, so any view can be shared or bookmarked.
  const severity = params.get('severity') || ''
  const service = params.get('service') || ''
  const view = params.get('status') && STATUS_VIEWS[params.get('status').toLowerCase()] ? params.get('status').toLowerCase() : 'open'
  const [q, setQ] = useState(params.get('q') || '')
  const byResource = params.get('group') === 'resource'
  // Read the location through a ref so a delayed call (the search debounce) always uses the page
  // you're on *now* — otherwise it could navigate you out of an open finding back to /findings.
  const location = useLocation()
  const locRef = useRef(location)
  locRef.current = location
  const setSearch = (mutate) => {
    const { pathname, search } = locRef.current
    const n = new URLSearchParams(search)
    mutate(n)
    if (n.toString() === new URLSearchParams(search).toString()) return   // nothing changed: don't navigate
    navigate({ pathname, search: n.toString() ? `?${n}` : '' }, { replace: true })
  }
  const setParam = (k, v) => setSearch(n => { v ? n.set(k, v) : n.delete(k) })
  useEffect(() => { const t = setTimeout(() => setParam('q', q.trim()), 250); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const inView = useMemo(() => all.filter(STATUS_VIEWS[view].match), [all, view])

  // Findings that appeared since the last load (after a scan) get a brief highlight. Keyed by rule +
  // resource, not id: every scan stores its findings as new rows, so ids change each time.
  const seen = useRef(null)
  const [fresh, setFresh] = useState(() => new Set())
  useEffect(() => {
    if (!query.data?.length) return
    const keys = query.data.map(findingKey)
    const added = seen.current ? keys.filter(k => !seen.current.has(k)) : []
    seen.current = new Set(keys)
    if (!added.length) return
    setFresh(new Set(added))
    const t = setTimeout(() => setFresh(new Set()), 2600)
    return () => clearTimeout(t)
  }, [query.data])
  const services = useMemo(() => [...new Set(all.map(f => f.service))].sort(), [all])
  const sevCounts = useMemo(() => {
    const c = { '': 0 }
    inView.filter(f => !service || f.service === service).forEach(f => { c[f.severity] = (c[f.severity] || 0) + 1; c[''] += 1 })
    return c
  }, [inView, service])
  const rows = useMemo(() => {
    const needle = (params.get('q') || '').toLowerCase()
    return inView.filter(f =>
      (!severity || f.severity === severity) && (!service || f.service === service) &&
      (!needle || `${f.title} ${f.rule_id} ${f.resource_name} ${f.resource_id}`.toLowerCase().includes(needle)))
      // Fixed order for ties: the table's sort is stable, so equal-risk findings keep this order
      // instead of whatever order the parallel scan happened to save them in.
      .sort((a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1)
        || String(a.rule_id).localeCompare(String(b.rule_id))
        || String(a.resource_name).localeCompare(String(b.resource_name)))
  }, [inView, severity, service, params])

  const [sorting, setSorting] = useState([{ id: 'risk', desc: true }])
  const [selection, setSelection] = useState({})
  const [active, setActive] = useState(0)
  const columns = useMemo(() => [
    {
      id: 'select', size: 40, enableSorting: false,
      header: ({ table }) => <Checkbox label="Select all" checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />,
      cell: ({ row }) => <Checkbox label={`Select ${row.original.title}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    },
    {
      id: 'severity', accessorFn: f => SEV_ORDER[f.severity] ?? 0, size: 110,
      header: ({ column }) => <SortHeader column={column}>Severity</SortHeader>,
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} size="sm" />,
    },
    {
      id: 'title', accessorKey: 'title', enableSorting: false,
      header: () => 'Finding',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.original.title}</p>
          <p className="mt-0.5 font-mono text-xs text-fg-3">{row.original.rule_id}</p>
        </div>
      ),
    },
    {
      id: 'resource', accessorKey: 'resource_name', size: 220,
      header: ({ column }) => <SortHeader column={column}>Resource</SortHeader>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{row.original.resource_name || row.original.resource_id}</p>
          <p className="mt-0.5 truncate text-xs text-fg-3">{SERVICE_NAMES[row.original.service] || row.original.service}{row.original.region && row.original.region !== 'global' ? ` · ${row.original.region}` : ''}</p>
        </div>
      ),
    },
    {
      id: 'status', accessorKey: 'status', size: 120,
      header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
      cell: ({ row }) => <StatusBadge status={row.original.status} size="sm" />,
    },
    {
      id: 'detected', accessorFn: f => f.detected_at || f.created_at || '', size: 130,
      header: ({ column }) => <SortHeader column={column}>Detected</SortHeader>,
      cell: ({ row }) => <TimeAgo value={row.original.detected_at || row.original.created_at} className="whitespace-nowrap text-fg-2" />,
    },
    {
      id: 'risk', accessorFn: f => Number(f.risk_score) || 0, size: 72,
      header: ({ column }) => <div className="flex"><SortHeader column={column} align="right">Risk</SortHeader></div>,
      cell: ({ getValue }) => <span className="num block text-right font-semibold text-fg">{getValue()}</span>,
    },
  ], [])

  const table = useReactTable({
    data: rows, columns, state: { sorting, rowSelection: selection }, getRowId: (f) => String(f.id),
    onSortingChange: setSorting, onRowSelectionChange: setSelection, enableRowSelection: !demo,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  })
  const sorted = table.getRowModel().rows
  const selected = table.getSelectedRowModel().rows.map(r => r.original)

  // Deep link: /findings/:id opens that finding; closing returns to the list URL (keeps filters).
  const open = findingId ? all.find(f => String(f.id) === findingId) : null
  const [lastOpen, setLastOpen] = useState(null)   // keeps content on screen while the sheet animates out
  useEffect(() => { if (open) setLastOpen(open) }, [open])
  const openFinding = (f) => navigate({ pathname: `/findings/${f.id}`, search: params.toString() })
  const closeFinding = () => navigate({ pathname: '/findings', search: params.toString() }, { replace: true })
  // Both this sheet and Vesper are fixed-position right-hand panels at the same spot; stacked, the
  // one underneath still gets hit-tested and can swallow clicks meant for the one on top. A citation
  // in a Vesper answer can open a finding here, so if Vesper reopens afterwards, give it the space.
  const vesperOpen = useSentinelStore(s => s.vesperOpen)
  useEffect(() => { if (vesperOpen && open) closeFinding() }, [vesperOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: j/k move, Enter opens, x selects.
  const listRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (open || e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement)) return
      if (e.key === 'j') { e.preventDefault(); setActive(i => Math.min(sorted.length - 1, i + 1)) }
      else if (e.key === 'k') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
      else if (e.key === 'Enter' && sorted[active]) { e.preventDefault(); openFinding(sorted[active].original) }
      else if (e.key === 'x' && sorted[active]) { e.preventDefault(); sorted[active].toggleSelected() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bind each render: cheap, and always sees the current rows
  useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])
  useEffect(() => { setActive(0) }, [severity, service, view, params])

  const [busy, setBusy] = useState(false)
  async function bulk(kind) {
    setBusy(true)
    let ok = 0; const errors = []
    for (const f of selected) {
      try { kind === 'request' ? await requestRemediation(f.id, 'Bulk request from Findings') : await updateFindingStatus(f.id, 'RESOLVED'); ok++ }
      catch (e) { errors.push(`${f.rule_id}: ${apiError(e)}`) }
    }
    setBusy(false); setSelection({})
    qc.invalidateQueries({ queryKey: ['findings'] }); qc.invalidateQueries({ queryKey: ['remediation'] })
    const verb = kind === 'request' ? 'sent for approval' : 'marked resolved'
    if (errors.length) toast.warning(`${ok} of ${ok + errors.length} ${verb}`, { description: errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : '') })
    else toast.success(`${ok} ${ok === 1 ? 'finding' : 'findings'} ${verb}`)
  }
  const exportCsv = (list) => downloadFile(`nimbus-findings-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(list, [
    { label: 'Rule', get: f => f.rule_id }, { label: 'Severity', get: f => f.severity }, { label: 'Title', get: f => f.title },
    { label: 'Service', get: f => f.service }, { label: 'Region', get: f => f.region }, { label: 'Resource', get: f => f.resource_id },
    { label: 'Risk', get: f => f.risk_score }, { label: 'Status', get: f => f.status },
  ]))

  const filtersOn = severity || service || params.get('q')
  const openCount = all.filter(STATUS_VIEWS.open.match).length

  return (
    <Page wide>
      <PageHeader
        title="Findings"
        description={query.isLoading && !demo ? 'Loading…' : `${openCount} open across ${new Set(all.filter(STATUS_VIEWS.open.match).map(f => f.service)).size} services in the latest scan.`}
        actions={<Button onClick={() => exportCsv(sorted.map(r => r.original))} disabled={!sorted.length}><Download /> Export CSV</Button>}
      />

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Status" value={view} onValueChange={(v) => setParam('status', v === 'open' ? '' : v)}
                   options={Object.entries(STATUS_VIEWS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <Segmented label="Group" value={byResource ? 'resource' : 'none'} onValueChange={(v) => setParam('group', v === 'resource' ? 'resource' : '')}
                   options={[{ value: 'none', label: 'List' }, { value: 'resource', label: 'By resource' }]} />
        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <Input icon={Search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, rule or resource" aria-label="Search findings" />
        </div>
        <select value={service} onChange={e => setParam('service', e.target.value)} aria-label="Service"
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg hover:border-fg-3 focus:border-accent focus:outline-none">
          <option value="">All services</option>
          {services.map(s => <option key={s} value={s}>{SERVICE_NAMES[s] || s}</option>)}
        </select>
        {filtersOn && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(''); setSearch(n => { for (const k of [...n.keys()]) if (k !== 'status' && k !== 'group') n.delete(k) }) }}>
            <X /> Clear filters
          </Button>
        )}
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-fg-3 xl:flex"><Kbd>J</Kbd><Kbd>K</Kbd> move <Kbd>↵</Kbd> open <Kbd>X</Kbd> select</span>
      </div>

      {/* severity chips with counts */}
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Severity">
        {['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
          <button key={s || 'all'} type="button" onClick={() => setParam('severity', s)} aria-pressed={severity === s}
                  className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    severity === s ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg')}>
            {s && <span className={cn('size-1.5 rounded-[2px]', SEV_STRIPE[s])} />}
            {s ? s[0] + s.slice(1).toLowerCase() : 'All severities'}
            <span className="num opacity-70">{sevCounts[s] || 0}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {query.isError && !demo ? <ErrorState error={query.error} onRetry={query.refetch} compact />
          : query.isLoading && !demo ? <div className="p-5"><SkeletonRows rows={8} /></div>
          : sorted.length === 0 ? (
            <EmptyState compact mood={filtersOn || view !== 'open' ? 'thinking' : 'happy'}
                        title={filtersOn ? 'Nothing matches these filters' : view === 'open' ? 'No open findings' : `No ${STATUS_VIEWS[view].label.toLowerCase()} findings`}
                        body={filtersOn ? 'Try another severity or service, or clear the search.' : view === 'open' ? 'Every check Breachpath runs is passing.' : undefined} />
          ) : (
            <>
            {byResource && <ResourceGroups rows={sorted.map(r => r.original)} onOpen={openFinding} fresh={fresh} />}
            {/* Phones: a compact list. Tablets and up: the full sortable table. */}
            {!byResource && compact && <ul className="divide-y divide-line">
              {sorted.map(row => {
                const f = row.original
                return (
                  <li key={row.id} className={cn(fresh.has(findingKey(f)) && 'animate-arrive')}>
                    <button type="button" data-finding-row onClick={() => openFinding(f)} className="relative flex w-full items-start gap-3 px-4 py-3 text-left active:bg-surface-2">
                      <span aria-hidden className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', SEV_STRIPE[f.severity])} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-5 font-medium text-fg">{f.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
                          <SeverityBadge severity={f.severity} size="sm" />
                          <span className="font-mono">{f.rule_id}</span>
                          <span className="truncate">{f.resource_name}</span>
                        </span>
                      </span>
                      <span className="num pt-0.5 text-sm font-semibold text-fg">{f.risk_score}</span>
                    </button>
                  </li>
                )
              })}
            </ul>}
            {!byResource && !compact && <div className="overflow-x-auto" ref={listRef}>
              <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
                <colgroup>{table.getVisibleLeafColumns().map(c => <col key={c.id} style={c.id === 'title' ? undefined : { width: c.getSize() }} />)}</colgroup>
                <thead className="sticky top-0 z-10 bg-surface-2">
                  {table.getHeaderGroups().map(g => (
                    <tr key={g.id} className="border-b border-line">
                      {g.headers.map(h => (
                        <th key={h.id} className="h-9 px-3 text-left text-xs font-medium text-fg-3 first:pl-4 last:pr-5">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={row.id} data-index={i} data-finding-row onClick={() => { setActive(i); openFinding(row.original) }}
                        className={cn('group relative cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-surface-2',
                          fresh.has(findingKey(row.original)) && 'animate-arrive',
                          row.getIsSelected() && 'bg-accent-soft/60 hover:bg-accent-soft', i === active && 'bg-surface-2')}>
                      {row.getVisibleCells().map((cell, ci) => (
                        <td key={cell.id} className={cn('h-14 px-3 align-middle first:pl-4 last:pr-5', ci === 0 && 'relative')}>
                          {ci === 0 && <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full', SEV_STRIPE[row.original.severity], i === active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />}
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
            </>
          )}
      </Card>
      {sorted.length > 0 && <p className="num mt-3 text-xs text-fg-3">{sorted.length} of {all.length} findings</p>}

      {/* bulk action bar */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div role="toolbar" aria-label="Bulk actions"
               className="flex animate-rise-in items-center gap-1 rounded-xl border border-line bg-surface p-1.5 pl-4 shadow-popover">
            <span className="num mr-2 text-sm font-medium text-fg">{selected.length} selected</span>
            <Tooltip content={canRequest.reason}>
              <span><Button size="sm" variant="primary" disabled={!canRequest.allowed || busy} loading={busy} onClick={() => bulk('request')}><ShieldCheck /> Request fixes</Button></span>
            </Tooltip>
            <Tooltip content={canTriage.reason}>
              <span><Button size="sm" disabled={!canTriage.allowed || busy} onClick={() => bulk('resolve')}><CheckCircle2 /> Mark resolved</Button></span>
            </Tooltip>
            <Button size="sm" variant="ghost" onClick={() => exportCsv(selected)}><Download /> Export</Button>
            <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelection({})}><X /></Button>
          </div>
        </div>
      )}

      <FindingSheet finding={open || lastOpen} open={!!open} onOpenChange={(o) => { if (!o) closeFinding() }} />
    </Page>
  )
}
