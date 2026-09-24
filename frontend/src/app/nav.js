import {
  LayoutDashboard, ShieldAlert, Boxes, Waypoints, Crosshair, GitCompareArrows, History,
  ShieldCheck, KanbanSquare, FileCode2, ClipboardCheck, Settings,
} from 'lucide-react'

/*
  One map of the app: sidebar groups, top-bar titles, command palette and "g x" shortcuts all read it.
  Groups follow the job someone is doing, not the internal module: watch → dig in → fix → prove.
*/
export const NAV = [
  {
    group: 'Monitor',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, key: 'd' },
      { to: '/findings', label: 'Findings', icon: ShieldAlert, key: 'f' },
      { to: '/assets', label: 'Assets', icon: Boxes, key: 'a' },
    ],
  },
  {
    group: 'Investigate',
    items: [
      { to: '/topology', label: 'Attack paths', icon: Waypoints, key: 't' },
      { to: '/simulator', label: 'Breach simulator', icon: Crosshair, key: 's' },
      { to: '/drift', label: 'Changes', icon: GitCompareArrows, key: 'r' },
      { to: '/scans', label: 'Scan history', icon: History, key: 'h' },
    ],
  },
  {
    group: 'Fix',
    items: [
      { to: '/approvals', label: 'Approvals', icon: ShieldCheck, key: 'p', countKey: 'pending' },
      { to: '/workflow', label: 'Remediation', icon: KanbanSquare, key: 'w' },
      { to: '/iac', label: 'IaC scanner', icon: FileCode2 },
    ],
  },
  {
    group: 'Govern',
    items: [
      { to: '/compliance', label: 'Compliance', icon: ClipboardCheck, key: 'c' },
    ],
  },
]

export const SETTINGS_ITEM = { to: '/settings', label: 'Settings', icon: Settings, key: ',' }

// Pages outside the sidebar still need a title (top bar, browser tab) and a name for Vesper's page context.
export const ALL_PAGES = [...NAV.flatMap(g => g.items), SETTINGS_ITEM, { to: '/ui', label: 'Design system' }, { to: '/vesper', label: 'Vesper' }]

export function pageFor(pathname) {
  const base = '/' + (pathname.split('/')[1] || '')
  return ALL_PAGES.find(p => p.to === base) || null
}
