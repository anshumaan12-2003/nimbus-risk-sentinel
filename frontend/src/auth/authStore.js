import { create } from 'zustand'
import { api, configureAuth } from '../api/nimbus'
import { queryClient } from '../lib/queryClient'
import { can, reasonFor } from './permissions'

const DEMO_USER = { id: 'demo', email: 'demo@nimbus.local', name: 'Demo', role: 'admin', is_active: true }
const isDemo = () => import.meta.env.VITE_DATA_MODE === 'demo'

/*
  status: 'loading' | 'offline' | 'setup' | 'signed-out' | 'signed-in'
  The access token lives only here (memory). Reloading the page gets a new one from the
  httpOnly refresh cookie, so nothing reusable is ever written to localStorage.
*/
export const useAuth = create((set, get) => ({
  status: 'loading',
  user: null,
  token: null,
  info: null,           // /auth/status: password rules, setup token, two-person rule
  notice: null,         // shown on the sign-in screen ("Your session expired")
  _refreshing: null,

  applySession: ({ access_token, user }) => set({ token: access_token, user, status: 'signed-in', notice: null }),

  // Is the API answering yet? Checks quietly (no switch to 'loading'), then signs in as usual if it is.
  // Used while a sleeping free-tier server wakes up.
  probe: async () => {
    try { await api.get('/auth/status', { timeout: 15_000 }) } catch { return false }
    await get().bootstrap()
    return true
  },
  bootstrap: async () => {
    if (isDemo()) return set({ status: 'signed-in', user: DEMO_USER, token: null })
    // Already holding a token (e.g. a test harness signed in first): confirm it instead of refreshing
    if (get().token) {
      try {
        const user = (await api.get('/auth/me')).data
        return set({ user, status: 'signed-in' })
      } catch { set({ token: null }) }
    }
    set({ status: 'loading' })
    try {
      const info = (await api.get('/auth/status')).data
      set({ info })
      if (info.setup_required) return set({ status: 'setup' })
    } catch {
      return set({ status: 'offline' })
    }
    const token = await get().refresh()
    if (!token) set({ status: 'signed-out' })
  },

  // Single-flight: ten parallel 401s cause one refresh call, not ten.
  refresh: () => {
    if (isDemo()) return Promise.resolve(null)
    const inflight = get()._refreshing
    if (inflight) return inflight
    const p = api.post('/auth/refresh')
      .then(({ data }) => { get().applySession(data); return data.access_token })
      .catch(() => null)
      .finally(() => set({ _refreshing: null }))
    set({ _refreshing: p })
    return p
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    get().applySession(data)
    return data.user
  },

  setup: async (body) => {
    const { data } = await api.post('/auth/setup', body)
    get().applySession(data)
    return data.user
  },

  changePassword: async (current_password, new_password) => {
    const { data } = await api.post('/auth/change-password', { current_password, new_password })
    get().applySession(data)
  },

  logout: async (notice = null) => {
    try { await api.post('/auth/logout') } catch { /* signing out locally anyway */ }
    queryClient.clear()   // never show the next person the previous person's cached data
    set({ status: 'signed-out', user: null, token: null, notice })
  },

  expire: () => {
    if (get().status !== 'signed-in' || isDemo()) return
    queryClient.clear()
    set({ status: 'signed-out', user: null, token: null, notice: 'Your session ended. Sign in again to continue.' })
  },
}))

configureAuth({
  getToken: () => useAuth.getState().token,
  refresh: () => useAuth.getState().refresh(),
  onExpired: () => useAuth.getState().expire(),
})

export const useUser = () => useAuth(s => s.user)

/* { allowed, reason } for rendering disabled controls with a tooltip that explains why */
export function useCan(action) {
  const user = useAuth(s => s.user)
  return { allowed: can(user, action), reason: reasonFor(user, action) }
}
