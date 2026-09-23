import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useLiveInvalidation } from './hooks/queries'
import { useShortcuts, SHORTCUTS } from './hooks/useShortcuts'
import { useSentinelStore } from './store/sentinelStore'
import Navbar from './components/Navbar'
import TopHeader from './components/TopHeader'
import CommandPalette from './components/CommandPalette'
import LiveScanTerminalModal from './components/LiveScanTerminalModal'
import AuditFeedDrawer from './components/AuditFeedDrawer'
import GlobalAICopilotDrawer from './components/GlobalAICopilotDrawer'
import ExecutiveDossierModal from './components/ExecutiveDossierModal'
import ErrorBoundary from './components/ErrorBoundary'
import TableResizer from './components/TableResizer'
import AccountHealthBanner from './components/AccountHealthBanner'
import AuthGate from './auth/AuthGate'
import { LiveStreamConnector, LiveToasts } from './components/LiveStream'
import { Drawer, Skeleton } from './components/ui'

/*
  Route-level code splitting: each page is its own chunk, so the first load only
  downloads the dashboard instead of recharts + markdown + every page (~1 MB before).
*/
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Findings = lazy(() => import('./pages/Findings'))
const Assets = lazy(() => import('./pages/Assets'))
const Topology = lazy(() => import('./pages/Topology'))
const AttackSimulator = lazy(() => import('./pages/AttackSimulator'))
const Workflow = lazy(() => import('./pages/Workflow'))
const DriftTimeline = lazy(() => import('./pages/DriftTimeline'))
const Compliance = lazy(() => import('./pages/Compliance'))
const ScanHistory = lazy(() => import('./pages/ScanHistory'))
const IacScanner = lazy(() => import('./pages/IacScanner'))
const Settings = lazy(() => import('./pages/Settings'))
const Approvals = lazy(() => import('./pages/Approvals'))
const NotFound = lazy(() => import('./pages/NotFound'))

const TITLES = {
  '/': 'Dashboard', '/findings': 'Findings', '/assets': 'Assets', '/topology': 'Attack Graph',
  '/simulator': 'Attack Simulator', '/workflow': 'Remediation Board', '/drift': 'Posture Drift',
  '/compliance': 'Compliance', '/scans': 'Scan History', '/iac': 'IaC Scanner', '/settings': 'Settings',
  '/approvals': 'Approvals',
}

function AnimatedRoutes() {
  const location = useLocation()
  // Browser tab title per page (history, bookmarks, screen readers)
  useEffect(() => {
    const base = '/' + location.pathname.split('/')[1]
    document.title = `${TITLES[base] || 'Not found'} · Nimbus Risk Sentinel`
  }, [location.pathname])
  return (
    <div key={location.pathname.split('/')[1]} className="page-transition">
      <Suspense fallback={<div className="ui-page-loading"><Skeleton rows={6} height={22} /></div>}>
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/findings" element={<Findings />} />
          <Route path="/findings/:findingId" element={<Findings />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/simulator" element={<AttackSimulator />} />
          <Route path="/workflow" element={<Workflow />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/drift" element={<DriftTimeline />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/scans" element={<ScanHistory />} />
          <Route path="/iac" element={<IacScanner />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  )
}

/* Hooks that need both the router and the query client */
function GlobalBehaviours() {
  useLiveInvalidation()
  const { helpOpen, setHelpOpen } = useShortcuts()
  return (
    <Drawer open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" width={420}>
      <dl className="ui-settings-list">
        {SHORTCUTS.map(s => (
          <div key={s.keys} className="ui-settings-row"><dt><kbd className="ui-kbd">{s.keys}</kbd></dt><dd>{s.label}</dd></div>
        ))}
      </dl>
    </Drawer>
  )
}

export default function App() {
  const { initTheme } = useSentinelStore()
  useEffect(() => { initTheme() }, [initTheme])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
        <a href="#main" className="ui-skip-link">Skip to content</a>
        <div className="app-layout">
          <Navbar />
          <div className="app-main-viewport">
            <TopHeader />
            <AccountHealthBanner />
            <main id="main" className="main-content" tabIndex={-1}>
              <ErrorBoundary>
                <AnimatedRoutes />
              </ErrorBoundary>
            </main>
          </div>

          <CommandPalette />
          <LiveScanTerminalModal />
          <AuditFeedDrawer />
          <GlobalAICopilotDrawer />
          <ExecutiveDossierModal />
          <TableResizer />
          <LiveStreamConnector />
          <LiveToasts />
          <GlobalBehaviours />
        </div>
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
