import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import History from 'lucide-react/dist/esm/icons/history'
import Compass from 'lucide-react/dist/esm/icons/compass'
import Shield from 'lucide-react/dist/esm/icons/shield'
import GitCommit from 'lucide-react/dist/esm/icons/git-commit-horizontal'
import GitPullRequest from 'lucide-react/dist/esm/icons/git-pull-request'
import Terminal from 'lucide-react/dist/esm/icons/terminal'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import Crosshair from 'lucide-react/dist/esm/icons/crosshair'
import KanbanSquare from 'lucide-react/dist/esm/icons/kanban-square'
import Boxes from 'lucide-react/dist/esm/icons/boxes'
import Settings from 'lucide-react/dist/esm/icons/settings'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import X from 'lucide-react/dist/esm/icons/x'
import { useSentinelStore } from '../store/sentinelStore'
import { useRemediationRequests, useConfig } from '../hooks/queries'

const NAV_ITEMS = [
  { to: '/',           label: 'Dashboard',         icon: LayoutDashboard, section: 'Core' },
  { to: '/findings',   label: 'Findings',          icon: AlertTriangle,   section: 'Core' },
  { to: '/assets',     label: 'Assets',            icon: Boxes,           section: 'Core' },
  { to: '/workflow',   label: 'Remediation Board', icon: KanbanSquare,    section: 'Core' },
  { to: '/approvals',  label: 'Approvals',         icon: ShieldCheck,     section: 'Core', countKey: 'pending' },
  { to: '/topology',   label: 'Attack Graph',      icon: Compass,         section: 'Threat Intel' },
  { to: '/simulator',  label: 'Attack Simulator',  icon: Crosshair,       section: 'Threat Intel' },
  { to: '/iac',        label: 'IaC Scanner',       icon: GitPullRequest,  section: 'Threat Intel' },
  { to: '/drift',      label: 'Posture Drift',     icon: GitCommit,       section: 'Governance' },
  { to: '/compliance', label: 'Compliance',    icon: Shield,          section: 'Governance' },
  { to: '/scans',      label: 'Scan History',      icon: History,         section: 'Governance' },
  { to: '/settings',   label: 'Settings',          icon: Settings,        section: 'Governance' },
]

export default function Navbar() {
  const { openCommandPalette, navOpen, closeNav } = useSentinelStore()
  const pending = useRemediationRequests('PENDING')
  const cfg = useConfig()
  const counts = { pending: pending.data?.length || 0 }
  const location = useLocation()
  useEffect(() => { closeNav() }, [location.pathname, closeNav])   // phone: navigating closes the drawer
  useEffect(() => {
    if (!navOpen) return
    const esc = (e) => e.key === 'Escape' && closeNav()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [navOpen, closeNav])

  const c = cfg.data
  const schedule = !c ? 'Checking schedule…'
    : c.scheduled_scans ? `Scheduled scan every ${c.scan_interval_minutes} min` : 'Manual scans (no scheduler)'

  return (
    <>
    {navOpen && <div className="sidebar-scrim" onClick={closeNav} aria-hidden="true" />}
    <aside className={`sidebar ${navOpen ? 'is-open' : ''}`} id="app-sidebar" aria-label="Main navigation">
      <button className="header-icon-btn sidebar-close" onClick={closeNav} aria-label="Close navigation"><X size={16} /></button>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Nimbus</div>
          <div className="brand-sub">Risk Sentinel</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {['Core', 'Threat Intel', 'Governance'].map(section => {
          const items = NAV_ITEMS.filter(i => i.section === section)
          return (
            <div key={section} className="nav-section">
              <div className="nav-section-label">{section}</div>
              {items.map(({ to, label, icon: Icon, badge, countKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  data-label={label}
                  aria-label={label}
                >
                  <span className="nav-icon-wrap">
                    <Icon size={14} />
                  </span>
                  <span className="nav-label">{label}</span>
                  {badge && <span className="nav-badge-live">{badge}</span>}
                  {countKey && counts[countKey] > 0 && (
                    <span className="nav-count" aria-label={`${counts[countKey]} waiting`}>{counts[countKey]}</span>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <div
          className="sidebar-cmd-trigger"
          onClick={openCommandPalette}
          title="Press ⌘K to open command search"
        >
          <span className="cmd-label">
            <Terminal size={12} color="var(--brand)" />
            Quick Command
          </span>
          <kbd className="cmd-key">⌘K</kbd>
        </div>

        <div className="sidebar-live-status">
          <span className="live-dot" />
          <span className="live-status-text">{schedule}</span>
        </div>
      </div>
    </aside>
    </>
  )
}
