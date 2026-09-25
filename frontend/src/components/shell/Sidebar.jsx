import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { NAV, SETTINGS_ITEM } from '@/app/nav'
import { cn } from '@/lib/cn'
import { Kbd, Tooltip } from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import { useEventStore } from '@/store/eventStore'
import { useActiveScan, useConfig, usePreflight, useRemediationRequests, useScans } from '@/hooks/queries'

export function BrandMark({ className }) {
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-md bg-fg text-bg', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7.5-3.6 7.5-9.4V5.2L12 2.5 4.5 5.2v6.4C4.5 17.4 12 21 12 21z" />
        <path d="m8.8 11.8 2.2 2.2 4.2-4.3" />
      </svg>
    </span>
  )
}

/* Which AWS account this console is looking at, and whether it can see it. */
function AccountSwitcher({ collapsed }) {
  const pre = usePreflight()
  const mode = useEventStore(s => s.mode)
  const dataSource = useSentinelStore(s => s.dataSource)
  const p = pre.data
  const state = dataSource === 'demo' ? { dot: 'bg-accent', title: 'Demo data', sub: 'Sample account' }
    : pre.isError ? { dot: 'bg-crit', title: 'API unreachable', sub: 'Start the backend' }
    : !p ? { dot: 'bg-fg-3', title: 'Connecting…', sub: '' }
    : !p.connected ? { dot: 'bg-crit', title: 'AWS not connected', sub: 'Open settings' }
    : { dot: p.ready ? 'bg-low' : 'bg-med', title: `AWS ${p.account_id}`, sub: p.regions?.join(', ') }
  const live = mode === 'live' ? 'Live updates on' : mode === 'simulated' ? 'Live updates unavailable' : 'Connecting to live updates'

  const body = (
    <Link
      to="/settings"
      className={cn(
        'group flex items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 shadow-raised transition-colors hover:border-line-strong',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="relative grid size-5 shrink-0 place-items-center">
        <span className={cn('size-2 rounded-full', state.dot)} />
        {mode === 'live' && p?.connected && <span className={cn('absolute size-2 animate-ping rounded-full opacity-40', state.dot)} />}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="num block truncate text-sm font-medium text-fg">{state.title}</span>
          {state.sub && <span className="block truncate text-xs text-fg-3">{state.sub}</span>}
        </span>
      )}
    </Link>
  )
  return <Tooltip content={`${state.title}${state.sub ? ` · ${state.sub}` : ''} · ${live}`} side="right">{body}</Tooltip>
}

/* Footer: what the scanner is doing right now, or when it runs next. */
function ScanStatus({ collapsed }) {
  const active = useActiveScan()
  const cfg = useConfig()
  const scans = useScans(1)
  const openScanModal = useSentinelStore(s => s.openScanModal)
  const running = active.data
  const pct = running?.progress?.percent ?? 0
  const last = scans.data?.[0]
  const every = cfg.data?.scheduled_scans ? cfg.data.scan_interval_minutes : null

  let label = 'Manual scans only'
  if (running) label = `Scanning · ${pct}%`
  else if (every && last?.started_at) {
    const due = new Date(last.started_at + (last.started_at.endsWith('Z') ? '' : 'Z')).getTime() + every * 60_000
    const mins = Math.max(0, Math.round((due - Date.now()) / 60_000))
    label = mins <= 1 ? 'Next scan starting soon' : `Next scan in ${mins} min`
  } else if (every) label = `Scans every ${every} min`

  if (collapsed) {
    return (
      <Tooltip content={label} side="right">
        <button type="button" onClick={openScanModal} aria-label={label}
                className="mx-auto grid size-8 place-items-center rounded-md text-fg-3 hover:bg-muted">
          <span className={cn('size-2 rounded-full', running ? 'animate-pulse bg-accent' : 'bg-fg-3')} />
        </button>
      </Tooltip>
    )
  }
  return (
    <button type="button" onClick={openScanModal}
            className="grid w-full gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-fg-2 hover:bg-muted">
      <span className="num flex items-center gap-2">
        <span className={cn('size-1.5 rounded-full', running ? 'animate-pulse bg-accent' : 'bg-fg-3')} />
        {label}
      </span>
      {running && (
        <span className="h-1 overflow-hidden rounded-full bg-muted-2">
          <span className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-standard" style={{ width: `${pct}%` }} />
        </span>
      )}
    </button>
  )
}

function NavItem({ item, collapsed, count }) {
  const { to, label, icon: Icon } = item
  const link = (
    <NavLink
      to={to}
      end={to === '/'}
      viewTransition
      className={({ isActive }) => cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors duration-150',
        isActive ? 'bg-muted-2 text-fg' : 'text-fg-2 hover:bg-muted hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-4 shrink-0', isActive ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')} aria-hidden />
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {count > 0 && (
            collapsed
              ? <span className="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-bg" aria-label={`${count} waiting`} />
              : <span className="num rounded-sm bg-accent px-1.5 text-2xs leading-4 font-semibold text-accent-fg" aria-label={`${count} waiting`}>{count}</span>
          )}
        </>
      )}
    </NavLink>
  )
  return collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link
}

export default function Sidebar() {
  const { navOpen, closeNav, navCollapsed, toggleNavCollapsed, openCommandPalette } = useSentinelStore()
  const pending = useRemediationRequests('PENDING')
  const counts = { pending: pending.data?.length || 0 }
  const location = useLocation()
  useEffect(() => { closeNav() }, [location.pathname, closeNav])
  // On phones the drawer is never collapsed.
  const collapsed = navCollapsed && !navOpen

  return (
    <>
      {navOpen && <div className="anim-overlay fixed inset-0 z-40 bg-scrim lg:hidden" data-state="open" onClick={closeNav} aria-hidden />}
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-bg transition-[width,transform,visibility] duration-200 ease-standard',
          'lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:translate-x-0',
          // closed drawer is invisible too, so it can't be tabbed into or read out off-screen
          navOpen ? 'translate-x-0 shadow-popover' : 'max-lg:invisible -translate-x-full',
          collapsed ? 'w-[60px]' : 'w-[248px]',
        )}
      >
        <div className={cn('flex h-13 items-center gap-2.5 px-3.5', collapsed && 'justify-center px-0')}>
          <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Breachpath overview">
            <BrandMark />
            {!collapsed && (
              <span className="grid min-w-0 leading-none">
                <span className="truncate font-display text-md font-bold tracking-[-0.02em] text-fg">Breachpath</span>
                <span className="mt-0.5 truncate font-mono text-[9.5px] tracking-[0.14em] text-fg-3 uppercase">Cloud Recon</span>
              </span>
            )}
          </Link>
          <button type="button" onClick={closeNav} aria-label="Close navigation"
                  className="ml-auto grid size-8 place-items-center rounded-md text-fg-2 hover:bg-muted lg:hidden">
            <X className="size-4" />
          </button>
        </div>

        <div className={cn('grid gap-2 px-3', collapsed && 'px-2.5')}>
          <AccountSwitcher collapsed={collapsed} />
          {collapsed ? (
            <Tooltip content="Search  ⌘K" side="right">
              <button type="button" onClick={openCommandPalette} aria-label="Search"
                      className="grid h-8 place-items-center rounded-md text-fg-2 hover:bg-muted"><Search className="size-4" /></button>
            </Tooltip>
          ) : (
            <button type="button" onClick={openCommandPalette}
                    className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-3 transition-colors hover:bg-muted hover:text-fg-2">
              <Search className="size-4" />
              <span className="flex-1 text-left">Search</span>
              <span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>
          )}
        </div>

        <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="Pages">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mt-3 first:mt-1">
              {collapsed
                ? <div className="mx-2 mb-1.5 h-px bg-line" aria-hidden />
                : <div className="px-2 pb-1 text-2xs font-medium tracking-wide text-fg-3 uppercase">{group}</div>}
              <div className="grid gap-px">
                {items.map(item => (
                  <NavItem key={item.to} item={item} collapsed={collapsed} count={item.countKey ? counts[item.countKey] : 0} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn('grid gap-1 border-t border-line p-3', collapsed && 'px-2.5')}>
          <NavItem item={SETTINGS_ITEM} collapsed={collapsed} />
          <ScanStatus collapsed={collapsed} />
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button type="button" onClick={toggleNavCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={cn('hidden h-8 items-center gap-2.5 rounded-md px-2 text-sm text-fg-3 hover:bg-muted hover:text-fg-2 lg:flex', collapsed && 'justify-center px-0')}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /><span>Collapse</span></>}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  )
}
