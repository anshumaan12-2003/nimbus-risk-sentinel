/*
  README images, taken against the fake AWS account (never your real one):

    npm run docs:screenshots     # -> docs/readme/*.png + docs/readme/.frames/ (scan GIF frames)
    python3 ../docs/readme/build_images.py

  Not an assertion suite; runs only when README_SHOTS=1 (see playwright.config.js).
*/
import { test, expect } from '@playwright/test'
import { signIn, useTheme, USERS, PASSWORD } from './helpers'

const OUT = '../docs/readme'
const settle = page => page.waitForLoadState('networkidle').catch(() => {}).then(() => page.waitForTimeout(900))

async function shot(page, name, path) {
  if (path) await page.goto(path)
  await settle(page)
  await expect(page.locator('[data-error-boundary]')).toHaveCount(0)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test.describe.configure({ mode: 'serial' })

for (const theme of ['dark', 'light']) {
  test(`hero · ${theme}`, async ({ page }) => {
    await useTheme(page, theme)
    await signIn(page, 'admin')
    await shot(page, `overview-${theme}`, '/')
  })
}

test('pages · dark', async ({ page }) => {
  await useTheme(page, 'dark')
  await signIn(page, 'admin')
  await page.goto('/findings')
  await page.getByText('EC2-005').first().click()
  await page.getByRole('dialog').waitFor()
  await shot(page, 'finding-sheet')
  await page.keyboard.press('Escape')
  await shot(page, 'attack-paths', '/topology')
  await shot(page, 'simulator', '/simulator')
  await shot(page, 'assets', '/assets')
  await shot(page, 'compliance', '/compliance')
})

test('four-eyes approval · dark', async ({ browser }) => {
  const eng = await (await browser.newContext()).newPage()
  await useTheme(eng, 'dark')
  await signIn(eng, 'engineer')
  await eng.goto('/findings')
  await eng.getByText('EC2-005').first().click()
  await eng.getByRole('dialog').getByRole('tab', { name: 'Fix' }).click()
  await eng.getByRole('button', { name: 'Send for approval' }).click()
  await expect(eng.getByText('Sent for approval')).toBeVisible()

  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
  await useTheme(admin, 'dark')
  await signIn(admin, 'admin')
  await shot(admin, 'approvals', '/approvals')
})

test('phone', async ({ browser }) => {
  for (const theme of ['dark', 'light']) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
    await useTheme(page, theme)
    await page.goto('/')
    await page.getByLabel('Email').fill(USERS.admin)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.locator('#main').waitFor()
    if (theme === 'dark') { await shot(page, 'phone-overview-dark', '/'); continue }
    await shot(page, 'phone-findings-light', '/findings')
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await shot(page, 'phone-nav-light')
  }
})

// Last: it adds a scan to the fake account. Frames become docs/readme/live-scan.gif (build_images.py).
test('live scan frames · dark', async ({ page }) => {
  await useTheme(page, 'dark')
  await signIn(page, 'admin')
  await settle(page)
  await page.getByRole('banner').getByRole('button', { name: 'Run scan' }).click()
  const dialog = page.getByRole('dialog')
  const done = dialog.getByRole('heading', { name: 'Scan complete' })
  let i = 0, tail = 0
  while (tail < 8 && i < 200) {
    await page.screenshot({ path: `${OUT}/.frames/scan-${String(i++).padStart(3, '0')}.png`, scale: 'css' })
    if (await done.isVisible()) tail++
    await page.waitForTimeout(250)
  }
  expect(tail).toBe(8)
})
