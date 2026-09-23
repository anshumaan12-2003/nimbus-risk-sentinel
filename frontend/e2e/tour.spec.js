/*
  UI tour: every page, both themes, desktop + phone, against the fake AWS account.
  Not an assertion suite — it writes screenshots for design review:

    npm run ui:tour            # -> test-results/tour/<theme>-<viewport>-<page>.png

  A page that throws or shows the error boundary still fails the run.
*/
import { test, expect } from '@playwright/test'
import { USERS, PASSWORD } from './helpers'

const PAGES = [
  ['overview', '/'], ['findings', '/findings'], ['assets', '/assets'], ['topology', '/topology'],
  ['simulator', '/simulator'], ['workflow', '/workflow'], ['approvals', '/approvals'], ['drift', '/drift'],
  ['compliance', '/compliance'], ['scans', '/scans'], ['iac', '/iac'], ['settings', '/settings'], ['ui', '/ui'],
]
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }
const only = process.env.TOUR_PAGES ? process.env.TOUR_PAGES.split(',') : null
const themes = (process.env.TOUR_THEMES || 'light,dark').split(',')
const viewports = (process.env.TOUR_VIEWPORTS || 'desktop').split(',')

test.describe.configure({ mode: 'serial' })

test('sign-in screen', async ({ page }) => {
  for (const theme of themes) {
    await page.addInitScript(t => { try { localStorage.setItem('nimbus-theme', t) } catch { /* */ } }, theme)
    await page.setViewportSize(VIEWPORTS.desktop)
    await page.goto('/')
    await page.getByLabel('Email').waitFor()
    await page.waitForTimeout(500)             // let the entrance motion settle
    await page.screenshot({ path: `test-results/tour/${theme}-desktop-signin.png` })
  }
})

for (const theme of themes) {
  for (const vp of viewports) {
    test(`${theme} · ${vp}`, async ({ page }) => {
      await page.addInitScript(t => { try { localStorage.setItem('nimbus-theme', t) } catch { /* */ } }, theme)
      await page.setViewportSize(VIEWPORTS[vp])
      await page.goto('/')
      await page.getByLabel('Email').fill(USERS.admin)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.locator('#main').waitFor()
      for (const [name, path] of PAGES) {
        if (only && !only.includes(name)) continue
        await page.goto(path)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(600)           // let entrance motion settle
        await expect(page.locator('[data-error-boundary]'), `${name} crashed`).toHaveCount(0)
        await page.screenshot({ path: `test-results/tour/${theme}-${vp}-${name}.png`, fullPage: true })
        if (name === 'findings') {                 // also capture the detail sheet
          await page.locator('tbody tr').first().click()
          await page.getByRole('dialog').waitFor()
          await page.waitForTimeout(700)
          await page.screenshot({ path: `test-results/tour/${theme}-${vp}-finding-sheet.png` })
          await page.keyboard.press('Escape')
        }
      }
    })
  }
}
