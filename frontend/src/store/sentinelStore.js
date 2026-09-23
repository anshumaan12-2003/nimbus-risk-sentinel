import { create } from 'zustand'
import { MOCK_ENVIRONMENTS, MOCK_FINDINGS, MOCK_STATS, MOCK_LATEST_SCAN } from '../data/mockData'
import { listFindings, getFindingStats, getLatestScan } from '../api/nimbus'

export const useSentinelStore = create((set, get) => ({
  // Environment
  currentEnv: MOCK_ENVIRONMENTS[0],
  setEnv: (env) => set({ currentEnv: env }),

  // Theme: 'light' or 'dark' with system sync
  theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  initTheme: () => {
    const saved = localStorage.getItem('nimbus-theme')
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initialTheme = saved || (systemDark ? 'dark' : 'light')
    set({ theme: initialTheme })
    document.documentElement.setAttribute('data-theme', initialTheme)
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    set({ theme: next })
    localStorage.setItem('nimbus-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  },
  setTheme: (theme) => {
    set({ theme })
    localStorage.setItem('nimbus-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  },

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

  // Global AI Copilot Assistant
  globalCopilotOpen: false,
  openGlobalCopilot: () => set({ globalCopilotOpen: true }),
  closeGlobalCopilot: () => set({ globalCopilotOpen: false }),
  toggleGlobalCopilot: () => set((state) => ({ globalCopilotOpen: !state.globalCopilotOpen })),

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
