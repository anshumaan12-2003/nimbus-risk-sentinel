import { create } from 'zustand'
import { MOCK_ENVIRONMENTS, MOCK_FINDINGS, MOCK_STATS, MOCK_LATEST_SCAN } from '../data/mockData'
import { listFindings, getFindingStats, getLatestScan } from '../api/nimbus'

const THEME_KEY = 'nimbus-theme'

function readThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

function resolveTheme(pref) {
  if (pref !== 'system') return pref
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(pref, set) {
  const theme = resolveTheme(pref)
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch { /* private mode: preference just isn't remembered */ }
  document.documentElement.setAttribute('data-theme', theme)
  set({ themePref: pref, theme })
}

export const useSentinelStore = create((set, get) => ({
  // Environment
  currentEnv: MOCK_ENVIRONMENTS[0],
  setEnv: (env) => set({ currentEnv: env }),

  // Theme preference: 'system' (default, follows the OS live) | 'light' | 'dark'.
  // `theme` is the resolved value actually on screen. index.html stamps it before first paint.
  themePref: readThemePref(),
  theme: resolveTheme(readThemePref()),
  initTheme: () => {
    applyTheme(get().themePref, set)
    // While following the OS, switch the moment the OS does (e.g. macOS auto dark at sunset).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().themePref === 'system') applyTheme('system', set)
    })
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    applyTheme(next, set)
  },
  setTheme: (pref) => applyTheme(pref, set),

  // Mode: 'live' (direct backend API & AWS) or 'demo'
  // VITE_DATA_MODE=demo for portfolio demos without AWS; default is real data
  dataSource: import.meta.env.VITE_DATA_MODE === 'demo' ? 'demo' : 'live',
  setDataSource: (source) => set({ dataSource: source }),
  refreshDataTrigger: 0,
  triggerRefresh: () => set((state) => ({ refreshDataTrigger: state.refreshDataTrigger + 1 })),

  // Mobile navigation drawer (sidebar is off-canvas below 900px)
  navOpen: false,
  openNav: () => set({ navOpen: true }),
  closeNav: () => set({ navOpen: false }),
  toggleNav: () => set((state) => ({ navOpen: !state.navOpen })),
  // Desktop: sidebar collapsed to an icon rail (remembered per browser)
  navCollapsed: (() => { try { return localStorage.getItem('nimbus-nav-collapsed') === '1' } catch { return false } })(),
  toggleNavCollapsed: () => set((state) => {
    const next = !state.navCollapsed
    try { localStorage.setItem('nimbus-nav-collapsed', next ? '1' : '0') } catch { /* private mode */ }
    return { navCollapsed: next }
  }),

  // Command Palette
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  // Live Scan Terminal Runner Modal
  scanModalOpen: false,
  openScanModal: () => set({ scanModalOpen: true }),
  closeScanModal: () => set({ scanModalOpen: false }),

  // Audit Stream Drawer
  auditDrawerOpen: false,
  openAuditDrawer: () => set({ auditDrawerOpen: true }),
  closeAuditDrawer: () => set({ auditDrawerOpen: false }),
  toggleAuditDrawer: () => set((state) => ({ auditDrawerOpen: !state.auditDrawerOpen })),

  // Vesper, the assistant. vesperDraft pre-fills the composer (e.g. "Ask Vesper about this finding").
  vesperOpen: false,
  vesperDraft: null,
  openVesper: () => set({ vesperOpen: true }),
  closeVesper: () => set({ vesperOpen: false }),
  toggleVesper: () => set((state) => ({ vesperOpen: !state.vesperOpen })),
  askVesper: (question) => set({ vesperOpen: true, vesperDraft: question }),
  takeVesperDraft: () => { const d = get().vesperDraft; if (d) set({ vesperDraft: null }); return d },
  vesperConversationId: null,   // shared by the panel and the full page
  setVesperConversation: (id) => set({ vesperConversationId: id }),

  // Executive Dossier Modal
  executiveDossierOpen: false,
  openExecutiveDossier: () => set({ executiveDossierOpen: true }),
  closeExecutiveDossier: () => set({ executiveDossierOpen: false }),

  // Live Sound effects toggle
  soundEnabled: false,
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  // Cached scan & findings state
  activeFindings: [],
  stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0, risk_score: 0 },
  latestScan: null,
  
  fetchDashboardData: async () => {
    try {
      const [findings, stats, latestScan] = await Promise.all([
        listFindings({ limit: 100 }),
        getFindingStats(),
        getLatestScan()
      ]);
      set({ 
        activeFindings: findings || [], 
        stats: stats || get().stats, 
        latestScan: latestScan || null 
      });
    } catch (error) {
      console.error("Failed to fetch dashboard data from backend:", error);
      // Fallback to mocks if backend is totally down for some reason (optional, but requested real integration)
    }
  },

  updateFindingStatus: (id, newStatus) => {
    set((state) => ({
      activeFindings: state.activeFindings.map((f) =>
        f.id === id ? { ...f, status: newStatus } : f
      ),
      stats: {
        ...state.stats,
        open: newStatus === 'RESOLVED' ? Math.max(0, state.stats.open - 1) : state.stats.open,
        resolved: newStatus === 'RESOLVED' ? state.stats.resolved + 1 : state.stats.resolved,
      }
    }))
  },

  // Scan simulation action
  recordNewScan: (scanData) => {
    set({
      latestScan: scanData,
      stats: {
        ...get().stats,
        risk_score: scanData.risk_score || get().stats.risk_score,
      }
    })
    // Immediately trigger a full dashboard data refresh to get the actual findings
    get().fetchDashboardData();
  }
}))
