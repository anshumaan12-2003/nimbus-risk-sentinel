/*
  Browser tests against the REAL app + REAL API, on a fake AWS account (moto) — no AWS calls.
  Playwright starts both servers itself:
    npx playwright test                 # all
    npx playwright test --project=visual --update-snapshots   # refresh baselines after an intended UI change

  Projects:
    visual-*  screenshot comparisons (desktop + phone). Run first, on untouched seed data.
    flows     behaviour: sign-in per role, four-eyes approval, live scan grid, phone navigation.

  Baselines are OS-specific (fonts/antialiasing). CI generates and checks them in the official
  Playwright Linux image (.github/workflows/ci.yml) so everyone compares against the same pixels.
*/
import { defineConfig, devices } from '@playwright/test'

const API_PORT = process.env.E2E_API_PORT || '8765'
const WEB_PORT = process.env.E2E_WEB_PORT || '4174'
const PY = process.env.NIMBUS_PYTHON || 'python'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,                      // one shared fake account; flows mutate it
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
    screenshot: 'only-on-failure',
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  projects: [
    { name: 'visual-desktop', testMatch: /visual\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'visual-mobile', testMatch: /visual\.spec/, use: { ...devices['Pixel 7'] } },
    { name: 'flows', testMatch: /flows\.spec/, dependencies: ['visual-desktop', 'visual-mobile'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `${PY} tests/dev_server_fake_aws.py`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { PORT: API_PORT, DATABASE_URL: 'sqlite:///./e2e_fake_aws.db', FAKE_LATENCY: '0.6' },
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`, VITE_API_URL: '', VITE_DATA_MODE: 'live' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
