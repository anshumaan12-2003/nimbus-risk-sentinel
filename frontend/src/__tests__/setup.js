// jsdom gaps the app relies on
window.matchMedia ||= (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}

/*
  The app now requires sign-in. Sign in once as the seeded admin of the fake-AWS dev server
  (backend/tests/dev_server_fake_aws.py) and hand the session to the auth store, exactly as the
  login form would.
*/
import { beforeAll, beforeEach } from 'vitest'
import { useAuth } from '../auth/authStore'

const API = import.meta.env.VITE_API_URL
let session
beforeAll(async () => {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nimbus.local', password: 'nimbus-demo-password' }),
  })
  if (!r.ok) throw new Error(`test login failed (${r.status}) — is dev_server_fake_aws.py running on ${API}?`)
  session = await r.json()
  globalThis.__NIMBUS_TOKEN__ = session.access_token
})
beforeEach(() => { useAuth.getState().applySession(session) })
