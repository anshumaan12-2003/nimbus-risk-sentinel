import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Activity, Boxes, CornerDownLeft, Database, FileText, Filter, Globe, Moon, Play, Search, ShieldAlert, Sparkles, Sun,
} from 'lucide-react'
import { NAV, SETTINGS_ITEM } from '@/app/nav'
import { Kbd, SeverityBadge } from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'
import { useFindings, useInventory } from '@/hooks/queries'

function Item({ icon: Icon, children, hint, shortcut, onSelect, value }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default items-center gap-3 rounded-md px-3 text-sm text-fg select-none data-[selected=true]:bg-muted"
    >
      {Icon && <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint}
      {shortcut && <span className="flex gap-0.5">{shortcut.map(k => <Kbd key={k}>{k}</Kbd>)}</span>}
    </Command.Item>
  )
}

function Group({ heading, children }) {
  return (
    <Command.Group
      heading={heading}
      className="px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3"
    >
      {children}
    </Command.Group>
  )
}

export default function CommandPalette() {
  const {
    commandPaletteOpen, closeCommandPalette, openScanModal, toggleAuditDrawer, toggleGlobalCopilot,
    openExecutiveDossier, theme, setTheme, dataSource, setDataSource, triggerRefresh,
  } = useSentinelStore()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  // Only fetch search data once the palette is actually used.
  const findingsQ = useFindings({}, { enabled: commandPaletteOpen })
  const assetsQ = useInventory({ enabled: commandPaletteOpen })

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const s = useSentinelStore.getState()
        s.commandPaletteOpen ? s.closeCommandPalette() : s.openCommandPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (!commandPaletteOpen) setQuery('') }, [commandPaletteOpen])

  const run = (fn) => () => { closeCommandPalette(); fn() }
  const go = (to) => run(() => navigate(to))
  const q = query.trim().toLowerCase()
  const findings = q.length < 2 ? [] : (findingsQ.data || [])
    .filter(f => `${f.rule_id} ${f.title} ${f.resource_name} ${f.resource_id}`.toLowerCase().includes(q)).slice(0, 6)
  const assets = q.length < 2 ? [] : (assetsQ.data?.assets || [])
    .filter(a => `${a.name} ${a.id} ${a.type}`.toLowerCase().includes(q)).slice(0, 6)

  return (
    <DialogPrimitive.Root open={commandPaletteOpen} onOpenChange={(o) => { if (!o) closeCommandPalette() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="anim-pop fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-popover focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <Command label="Search and commands" loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search findings, assets, pages or actions…"
                className="h-13 w-full bg-transparent text-md text-fg placeholder:text-fg-3 focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(440px,60vh)] overflow-y-auto overscroll-contain py-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-fg-2">
                No matches for “{query}”. Try a rule ID like <span className="font-mono">EC2-001</span> or a bucket name.
              </Command.Empty>

              {findings.length > 0 && (
                <Group heading="Findings">
                  {findings.map(f => (
                    <Item key={f.id} value={`finding ${f.rule_id} ${f.title} ${f.resource_id}`} icon={ShieldAlert}
                          onSelect={go(`/findings/${f.id}`)} hint={<SeverityBadge severity={f.severity} size="sm" />}>
                      <span className="mr-2 font-mono text-xs text-fg-3">{f.rule_id}</span>{f.title}
                    </Item>
                  ))}
                </Group>
              )}
              {assets.length > 0 && (
                <Group heading="Assets">
                  {assets.map(a => (
                    <Item key={a.id} value={`asset ${a.name} ${a.id} ${a.type}`} icon={Boxes}
                          onSelect={go(`/assets?q=${encodeURIComponent(a.name)}`)}
                          hint={<span className="font-mono text-2xs text-fg-3">{a.type}</span>}>
                      {a.name}
                    </Item>
                  ))}
                </Group>
              )}

              <Group heading="Actions">
                <Item icon={Play} value="run scan now" onSelect={run(openScanModal)}>Run a scan now</Item>
                <Item icon={Sparkles} value="ask copilot ai" shortcut={['⌘', 'J']} onSelect={run(toggleGlobalCopilot)}>Ask Copilot</Item>
                <Item icon={FileText} value="executive report dossier export" onSelect={run(openExecutiveDossier)}>Executive report</Item>
                <Item icon={Activity} value="activity log audit feed" onSelect={run(toggleAuditDrawer)}>Open activity log</Item>
                <Item icon={theme === 'dark' ? Sun : Moon} value="toggle theme dark light mode"
                      onSelect={run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
                  Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                </Item>
                <Item icon={Database} value="switch demo live data mode"
                      onSelect={run(() => { setDataSource(dataSource === 'demo' ? 'live' : 'demo'); triggerRefresh() })}>
                  {dataSource === 'demo' ? 'Show my real AWS data' : 'Show sample demo data'}
                </Item>
              </Group>

              <Group heading="Quick filters">
                <Item icon={Filter} value="critical findings filter" onSelect={go('/findings?severity=CRITICAL')}>Critical findings</Item>
                <Item icon={Globe} value="internet exposed public assets" onSelect={go('/assets?exposed=1')}>Internet-exposed assets</Item>
                <Item icon={Filter} value="s3 bucket findings" onSelect={go('/findings?service=s3')}>S3 findings</Item>
                <Item icon={Filter} value="iam identity findings" onSelect={go('/findings?service=iam')}>IAM findings</Item>
              </Group>

              <Group heading="Pages">
                {[...NAV.flatMap(g => g.items), SETTINGS_ITEM].map(p => (
                  <Item key={p.to} icon={p.icon} value={`page ${p.label}`} onSelect={go(p.to)}
                        shortcut={p.key ? ['G', p.key === ',' ? ',' : p.key.toUpperCase()] : undefined}>
                    {p.label}
                  </Item>
                ))}
              </Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-xs text-fg-3">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
              <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" /></Kbd> to open</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
