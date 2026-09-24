import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, Bell, FileText, LogOut, Menu as MenuIcon, Monitor, Moon, Play, Settings, ShieldCheck, Sun } from 'lucide-react'
import { pageFor } from '@/app/nav'
import { cn } from '@/lib/cn'
import VesperMark from '@/components/vesper/VesperMark'
import {
  Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger,
  Tooltip, Kbd, Badge,
  AnimatedNumber
} from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import { useEventStore, timeAgo } from '@/store/eventStore'
import { useAuth, useCan } from '@/auth/authStore'
import { ROLE_INFO } from '@/auth/permissions'
import { useActiveScan } from '@/hooks/queries'
import { EVENT_META, toneFor } from '@/components/LiveStream'

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

const TONE_DOT = { critical: 'bg-crit', high: 'bg-high', medium: 'bg-med', low: 'bg-low', brand: 'bg-accent' }

function IconButton({ label, children, ...props }) {
  return (
    <Tooltip content={label} side="bottom">
      <Button variant="ghost" size="icon" aria-label={label} {...props}>{children}</Button>
    </Tooltip>
  )
}

function Notifications() {
  const events = useEventStore(s => s.events).filter(e => e.source !== 'you')
  const [seenTs, setSeenTs] = useState(() => { try { return Number(localStorage.getItem('nimbus-notif-seen') || 0) } catch { return 0 } })
  const navigate = useNavigate()
  const unread = events.filter(e => e.ts > seenTs).length
  const markRead = () => {
    const ts = Date.now(); setSeenTs(ts)
    try { localStorage.setItem('nimbus-notif-seen', String(ts)) } catch { /* private mode */ }
  }
  return (
    <Popover>
      <Tooltip content="Notifications" side="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" />}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-semibold text-fg">Notifications</span>
          <Button variant="link" size="sm" onClick={markRead} disabled={!unread}>Mark all read</Button>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-2">Scan results, new findings and fixes appear here as they happen.</p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto py-1">
            {events.slice(0, 20).map(e => {
              const Icon = EVENT_META[e.type]?.icon || Bell
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => e.link && navigate(e.link)}
                          className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted">
                    <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-fg-2">
                      <Icon className="size-3.5" />
                      <span className={cn('absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-surface', TONE_DOT[toneFor(e)] || 'bg-fg-3')} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', e.ts > seenTs ? 'font-semibold text-fg' : 'text-fg')}>{e.title}</span>
                      {e.detail && <span className="block truncate text-xs text-fg-3">{e.detail}</span>}
                    </span>
                    <span className="num shrink-0 text-2xs text-fg-3">{timeAgo(e.ts)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function AccountMenu() {
  const { user, logout } = useAuth()
  const { themePref, setTheme, openExecutiveDossier } = useSentinelStore()
  const navigate = useNavigate()
  if (!user) return null
  const themes = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label={`Account: ${user.name}, ${user.role}`}
                className="grid size-8 place-items-center rounded-full bg-muted-2 text-xs font-semibold text-fg-2 ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-accent">
          {initials(user.name)}
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
          <p className="truncate text-xs text-fg-3">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge size="sm" tone="accent" className="capitalize">{user.role}</Badge>
            <span className="truncate text-2xs text-fg-3">{ROLE_INFO[user.role]}</span>
          </div>
        </div>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1" role="radiogroup" aria-label="Theme">
          {themes.map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={themePref === value} onClick={() => setTheme(value)}
                    className={cn('flex h-8 items-center justify-center gap-1.5 rounded-md text-xs text-fg-2 hover:bg-muted',
                      themePref === value && 'bg-muted-2 font-medium text-fg')}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>
        <MenuSeparator />
        <MenuItem icon={FileText} onSelect={openExecutiveDossier}>Executive report</MenuItem>
        <MenuItem icon={ShieldCheck} onSelect={() => navigate('/approvals')}>Approvals</MenuItem>
        <MenuItem icon={Settings} shortcut="G ," onSelect={() => navigate('/settings')}>Settings and team</MenuItem>
        <MenuSeparator />
        <MenuItem icon={LogOut} onSelect={() => logout()}>Sign out</MenuItem>
      </MenuContent>
    </Menu>
  )
}

export default function Topbar() {
  const { toggleNav, navOpen, openScanModal, toggleAuditDrawer, toggleVesper } = useSentinelStore()
  const run = useCan('scan:run')
  const active = useActiveScan()
  const location = useLocation()
  const page = pageFor(location.pathname)
  const running = !!active.data
  const pct = active.data?.progress?.percent

  return (
    <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleNav} aria-label="Open navigation"
              aria-expanded={navOpen} aria-controls="app-sidebar">
        <MenuIcon />
      </Button>
      <h1 className="min-w-0 truncate text-md font-semibold text-fg">{page?.label || 'Not found'}</h1>

      <div className="ml-auto flex items-center gap-0.5">
        <Tooltip content={<span className="flex items-center gap-1.5">Ask Vesper <Kbd className="border-transparent bg-fg-2 text-bg">⌘J</Kbd></span>} side="bottom">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" onClick={toggleVesper} aria-label="Ask Vesper">
            <VesperMark size={18} /><span className="hidden sm:inline">Ask Vesper</span>
          </Button>
        </Tooltip>
        <IconButton label="Activity log" onClick={toggleAuditDrawer} className="hidden sm:inline-flex"><Activity /></IconButton>
        <Notifications />
        <span className="mx-1.5 hidden h-5 w-px bg-line sm:block" aria-hidden />
        <Tooltip content={running ? 'Watch the running scan' : run.reason || 'Scan every service and region now'} side="bottom">
          {/* focusable while the button is disabled, so keyboard users can still read why */}
          <span tabIndex={!running && !run.allowed ? 0 : undefined} data-disabled-reason={!running && !run.allowed ? '' : undefined}
                className="rounded-md focus-visible:outline-2 focus-visible:outline-accent">
            <Button
              variant={running ? 'secondary' : 'primary'}
              onClick={openScanModal}
              disabled={!running && !run.allowed}
              aria-label={running ? `Scan running${pct != null ? `, ${pct}%` : ''}` : 'Run scan'}
            >
              {running
                ? <><span className="size-2 animate-pulse rounded-full bg-accent" /><span className="num">Scanning{pct != null ? <> <AnimatedNumber value={pct} suffix="%" /></> : '…'}</span></>
                : <><Play /><span>Run scan</span></>}
            </Button>
          </span>
        </Tooltip>
        <span className="ml-1.5"><AccountMenu /></span>
      </div>
    </header>
  )
}
