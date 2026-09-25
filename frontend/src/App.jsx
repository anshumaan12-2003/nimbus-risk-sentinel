import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from './lib/queryClient'
import { useLiveInvalidation } from './hooks/queries'
import { useShortcuts, SHORTCUT_GROUPS } from './hooks/useShortcuts'
import { useSentinelStore } from './store/sentinelStore'
import { pageFor } from './app/nav'
import Sidebar from './components/shell/Sidebar'
import Topbar from './components/shell/Topbar'
import CommandPalette from './components/CommandPalette'
import LiveScanTerminalModal from './components/LiveScanTerminalModal'
import AuditFeedDrawer from './components/AuditFeedDrawer'
import ExecutiveDossierModal from './components/ExecutiveDossierModal'
import ErrorBoundary from './components/ErrorBoundary'
import AccountHealthBanner from './components/AccountHealthBanner'
import AuthGate from './auth/AuthGate'
import { LiveStreamConnector, LiveToasts } from './components/LiveStream'
import { TooltipProvider, Dialog, DialogContent, Kbd, SkeletonRows } from './components/ds'

/*
  Route-level code splitting: each page is its own chunk, so the first load only
  downloads the overview instead of charts + markdown + every page.
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
const UiKit = lazy(() => import('./pages/UiKit'))
const Vesper = lazy(() => import('./pages/Vesper'))
// Loaded on first open: it brings the markdown renderer, which no page needs on first load.
const VesperPanel = lazy(() => import('./components/vesper/VesperPanel'))

/* ⌘J / Ctrl+J toggles Vesper from anywhere; the panel itself mounts the first time it opens. */
function VesperSlot() {
  const open = useSentinelStore(s => s.vesperOpen)
  const toggle = useSentinelStore(s => s.toggleVesper)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (open) setMounted(true) }, [open])
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); toggle() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  return mounted ? <Suspense fallback={null}><VesperPanel /></Suspense> : null
}

function PageFallback() {
  return <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8"><SkeletonRows rows={6} /></div>
}

function AppRoutes() {
  const location = useLocation()
  // Browser tab title per page (history, bookmarks, screen readers)
  useEffect(() => {
    document.title = `${pageFor(location.pathname)?.label || 'Not found'} · Breachpath`
  }, [location.pathname])
  return (
    <div key={location.pathname.split('/')[1]} className="min-w-0 animate-fade-in">
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageFallback />}>
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
          <Route path="/ui" element={<UiKit />} />
          <Route path="/vesper" element={<Vesper />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </div>
  )
}

/* Hooks that need both the router and the query client, plus the "?" shortcut sheet. */
function GlobalBehaviours() {
  useLiveInvalidation()
  const { helpOpen, setHelpOpen } = useShortcuts()
  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent title="Keyboard shortcuts" description="Press ? anywhere to see this again.">
        <div className="grid gap-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map(g => (
            <div key={g.title} className="grid content-start gap-1.5">
              <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">{g.title}</p>
              {g.items.map(s => (
                <div key={s.label} className="flex items-center justify-between gap-3 text-sm text-fg">
                  <span>{s.label}</span>
                  <span className="flex shrink-0 gap-1">{s.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function App() {
  const { initTheme, theme } = useSentinelStore()
  useEffect(() => { initTheme() }, [initTheme])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthGate>
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-popover">
              Skip to content
            </a>
            <div className="flex min-h-dvh bg-bg">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar />
                <AccountHealthBanner />
                <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
                  <AppRoutes />
                </main>
              </div>
            </div>

            {/* Overlays get their own boundary: a bug in one panel must never blank the whole app. */}
            <ErrorBoundary silent onReset={() => {
              const s = useSentinelStore.getState()
              s.closeScanModal(); s.closeCommandPalette(); s.closeAuditDrawer(); s.closeVesper(); s.closeExecutiveDossier()
            }}>
              <CommandPalette />
              <LiveScanTerminalModal />
              <AuditFeedDrawer />
              <VesperSlot />
              <ExecutiveDossierModal />
              <LiveStreamConnector />
              <LiveToasts />
              <GlobalBehaviours />
            </ErrorBoundary>
          </AuthGate>
          <Toaster
            theme={theme}
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: '!rounded-lg !border-line !bg-surface !text-fg !shadow-popover !font-sans',
                description: '!text-fg-2',
                actionButton: '!bg-fg !text-bg !rounded-md',
              },
            }}
          />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
