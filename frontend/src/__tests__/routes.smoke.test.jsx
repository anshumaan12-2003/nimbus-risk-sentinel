/*
  Smoke test: render the real App on every route against a running API
  (backend/tests/dev_server_fake_aws.py) and assert each page renders real data
  without hitting the error boundary.   API_URL=http://127.0.0.1:8000 npx vitest run
*/
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import App from '../App'

const ROUTES = [
  ['/', /Security posture/i],
  ['/findings', /IAM-00|EC2-00/],
  ['/assets', /prod-customer-data/],
  ['/scans', /Scan History/],
  ['/compliance', /MFA enabled for the root user|Root/i],
  ['/simulator', /api-worker-01/],
  ['/topology', /Attack Vector Topology/i],
  ['/drift', /Drift/i],
  ['/workflow', /Remediation|Board|Backlog/i],
  ['/settings', /123456789012/],
  ['/approvals', /Nothing waiting for approval|Approve and apply/],
  ['/no-such-page', /Page not found/],
]

afterEach(() => cleanup())

describe('every route renders against the live API', () => {
  for (const [path, expected] of ROUTES) {
    it(path, async () => {
      window.history.pushState({}, '', path)
      const errors = []
      const orig = console.error
      console.error = (...a) => { errors.push(a.join(' ')); }
      try {
        render(<App />)
        await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 8000 })
        expect(document.body.textContent).not.toMatch(/Something went wrong|Unexpected Application Error/i)
      } finally {
        console.error = orig
      }
      const fatal = errors.filter(e => /is not a function|Cannot read properties|is not defined|Maximum update depth/.test(e))
      expect(fatal, fatal.join('\n')).toEqual([])
    }, 15000)
  }
})

describe('deep links and interactions', () => {
  it('/findings/:id opens the inspector for that finding', async () => {
    const base = import.meta.env.VITE_API_URL
    const findings = await (await fetch(`${base}/api/v1/findings`, { headers: { Authorization: `Bearer ${globalThis.__NIMBUS_TOKEN__}` } })).json()
    const f = findings.find(x => x.rule_id === 'EC2-001') || findings[0]
    window.history.pushState({}, '', `/findings/${f.id}`)
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(f.title).length).toBeGreaterThan(1), { timeout: 8000 })  // row + inspector
    expect(window.location.pathname).toBe(`/findings/${f.id}`)
  }, 15000)

  it('assets can be filtered to internet-exposed only via URL', async () => {
    window.history.pushState({}, '', '/assets?exposed=1')
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('api-worker-01').length).toBeGreaterThan(0), { timeout: 8000 })
    expect(screen.queryByText('customers')).toBeNull()   // private DynamoDB table filtered out
  }, 15000)
})
