import Search from 'lucide-react/dist/esm/icons/search'
import Moon from 'lucide-react/dist/esm/icons/moon'
import Sun from 'lucide-react/dist/esm/icons/sun'
import Cloud from 'lucide-react/dist/esm/icons/cloud'
import Radio from 'lucide-react/dist/esm/icons/radio'
import FileText from 'lucide-react/dist/esm/icons/file-text'
import Zap from 'lucide-react/dist/esm/icons/zap'
import Menu from 'lucide-react/dist/esm/icons/menu'
import { useSentinelStore } from '../store/sentinelStore'
import UserMenu from './UserMenu'
import { useCan } from '../auth/authStore'
import { LiveStatusPill } from './LiveStream'
import NotificationCenter from './NotificationCenter'
import { usePreflight, useActiveScan } from '../hooks/queries'
import { Link } from 'react-router-dom'

export default function TopHeader() {
  const {
    theme, toggleTheme,
    openCommandPalette,
    openScanModal,
    toggleAuditDrawer,
    openExecutiveDossier,
    dataSource,
    toggleNav, navOpen,
  } = useSentinelStore()
  const run = useCan('scan:run')
  const pre = usePreflight()
  const active = useActiveScan()
  const p = pre.data
  // Real account + auth status instead of a hard-coded account number
  const env = dataSource === 'demo'
    ? { label: 'Demo data', region: 'sample', state: 'demo', title: 'Showing built-in sample data' }
    : !p ? { label: pre.isError ? 'API offline' : 'Connecting…', region: '', state: pre.isError ? 'down' : 'pending', title: '' }
    : !p.connected ? { label: 'AWS not connected', region: '', state: 'down', title: p.error || p.hint }
    : { label: `AWS · ${p.account_id}`, region: p.regions?.join(', '), state: p.ready ? 'ok' : 'warn',
        title: p.ready ? `Connected as ${p.principal_arn}` : `${p.checks.filter(c => !c.ok).length} permission checks failing — see Settings` }

  const pct = active.data?.progress?.percent
  const scanTitle = active.data ? 'A scan is running — click to watch it' : run.reason || 'Run a full security scan'

  return (
    <header className="top-header">
      <button className="header-icon-btn header-menu-btn" onClick={toggleNav} aria-label="Open navigation"
              aria-expanded={navOpen} aria-controls="app-sidebar">
        <Menu size={17} />
      </button>
      {/* Environment pill */}
      <Link to="/settings" className={`header-env-pill ui-env-${env.state}`} title={env.title}>
        <span className="header-env-indicator" />
        <Cloud size={12} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
        <span className="header-env-label">{env.label}</span>
        {env.region && <span className="header-env-region">{env.region}</span>}
      </Link>
      <LiveStatusPill />

      {/* Search bar */}
      <div className="header-search" onClick={openCommandPalette} role="button" title="Press ⌘K">
        <Search size={13} className="header-search-icon" />
        <span className="header-search-text">Search findings, resources, CIS rules…</span>
        <kbd className="header-search-kbd">⌘K</kbd>
      </div>

      {/* Actions */}
      <div className="header-actions">
        {/* Dossier */}
        <button
          className="header-text-btn"
          onClick={openExecutiveDossier}
          title="Generate Executive CISO Dossier"
        >
          <FileText size={13} />
          Dossier
        </button>

        <NotificationCenter />

        {/* Telemetry feed */}
        <button
          className="header-icon-btn"
          onClick={toggleAuditDrawer}
          title="Live Cloud Audit Telemetry Feed"
        >
          <Radio size={15} />
          <span className="header-notif-dot" />
        </button>

        {/* Theme */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} mode`}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Fleet Scan CTA */}
        {/* Anyone can watch a running scan; starting one needs the engineer role */}
        <button
          className="header-primary-btn"
          onClick={openScanModal}
          disabled={!active.data && !run.allowed}
          title={scanTitle}
          aria-label={active.data ? `Scan running${pct != null ? `, ${pct}%` : ''}` : 'Run scan'}
        >
          <Zap size={13} className={active.data ? 'spin' : ''} />
          <span className="header-scan-label">
            {active.data ? <>Scanning{pct != null && <span className="header-scan-pct"> {pct}%</span>}</> : 'Run Scan'}
          </span>
        </button>

        <UserMenu />
      </div>
    </header>
  )
}
