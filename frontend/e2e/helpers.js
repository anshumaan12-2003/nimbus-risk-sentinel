import { expect } from '@playwright/test'

export const PASSWORD = 'nimbus-demo-password'
export const USERS = {
  admin: 'admin@nimbus.local', approver: 'approver@nimbus.local',
  engineer: 'engineer@nimbus.local', viewer: 'viewer@nimbus.local',
}

export async function useTheme(page, theme) {
  await page.addInitScript(t => { try { localStorage.setItem('nimbus-theme', t) } catch { /* */ } }, theme)
}

export async function signIn(page, role) {
  await page.goto('/')
  await page.getByLabel('Email').fill(USERS[role])
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Security posture')).toBeVisible()
}

/* Things that legitimately differ between runs: random AWS ids from the fake account, timestamps,
   relative times, live counters, charts. Masked (drawn as solid boxes) in screenshots. */
export const volatile = (page) => [
  page.locator('time, .font-mono, code, .num, [data-sonner-toaster]'),
  page.locator('.recharts-wrapper, .react-flow, canvas'),
  page.locator('#app-sidebar a[href="/settings"] + button, #app-sidebar a[href="/settings"]:first-of-type'),
]
