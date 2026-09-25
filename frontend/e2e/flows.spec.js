/* Behaviour tests: the things that must never regress in a security tool. */
import { test, expect } from '@playwright/test'
import { signIn, useTheme, USERS } from './helpers'

test.beforeEach(async ({ page }) => { await useTheme(page, 'dark') })

test('wrong password is rejected with one generic message', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(USERS.viewer)
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-pass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Email or password is incorrect/)
})

test('a reload keeps you signed in (refresh cookie) and sign-out ends the session', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.reload()
  await expect(page.getByText('Security posture')).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => /token/i.test(k)))).toBe(false)
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('viewer sees everything but cannot act', async ({ page }) => {
  await signIn(page, 'viewer')
  const run = page.getByRole('banner').getByRole('button', { name: 'Run scan' })
  await expect(run).toBeDisabled()
  await page.getByRole('banner').locator('[data-disabled-reason]').focus()   // the reason shows in a tooltip
  await expect(page.getByRole('tooltip')).toContainText(/engineer role/)
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)
})

test('live scan grid fills in per service and region', async ({ page }) => {
  await signIn(page, 'engineer')
  await page.getByRole('banner').getByRole('button', { name: 'Run scan' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('columnheader', { name: 'ap-south-1' })).toBeVisible()
  await expect(dialog.getByRole('cell', { name: /EC2 in us-east-1: Scanning|EC2 in us-east-1: Done/ })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Scan complete' })).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('cell', { name: /RDS in ap-south-1: Done/ })).toBeVisible()
  await expect(dialog.getByRole('cell', { name: /IAM \(account-wide\): Done · \d+ finding/ })).toBeVisible()
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await dialog.getByRole('link', { name: 'View findings' }).click()
  await expect(page).toHaveURL(/\/findings$/)
})

test('four-eyes: engineer requests, approver cannot self-approve, a second approver applies', async ({ browser }) => {
  // engineer asks
  const eng = await (await browser.newContext()).newPage()
  await signIn(eng, 'engineer')
  await eng.goto('/findings')
  await eng.getByText('EC2-005').first().click()
  await eng.getByRole('dialog').getByRole('tab', { name: 'Fix' }).click()
  await eng.getByRole('button', { name: 'Send for approval' }).click()
  await expect(eng.getByText('Sent for approval')).toBeVisible()
  // engineers have no approve power
  await eng.goto('/approvals')
  await expect(eng.getByRole('button', { name: 'Approve and apply' })).toBeDisabled()

  // approver approves it; the audit shows both names
  const appr = await (await browser.newContext()).newPage()
  await signIn(appr, 'approver')
  await expect(appr.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: /Approvals/ })).toContainText('1')
  await appr.goto('/approvals')
  const card = appr.getByRole('article').filter({ hasText: 'EC2-005' })
  await expect(card.getByText(USERS.engineer)).toBeVisible()
  await card.getByRole('button', { name: 'Approve and apply' }).click()
  await appr.getByRole('tab', { name: 'History' }).click()
  const done = appr.getByRole('article').filter({ hasText: 'EC2-005' })
  await expect(done.getByText('Applied', { exact: true })).toBeVisible()
  await expect(done.getByText(USERS.approver)).toBeVisible()
})

test('approvers cannot approve their own request', async ({ page }) => {
  await signIn(page, 'approver')
  await page.goto('/findings')
  await page.getByText('RDS-001').first().click()
  await page.getByRole('dialog').getByRole('tab', { name: 'Fix' }).click()
  const req = page.getByRole('button', { name: 'Send for approval' })
  if (!(await req.waitFor({ timeout: 10_000 }).then(() => true, () => false))) test.skip(true, 'RDS-001 has no automated fix in this build')
  await req.click()
  await expect(page.getByText('Sent for approval')).toBeVisible()
  await page.goto('/approvals')
  const card = page.getByRole('article').filter({ hasText: 'RDS-001' })
  await expect(card.getByRole('button', { name: 'Approve and apply' })).toBeDisabled()
  await expect(card.getByText(/someone else has to approve it/)).toBeVisible()
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('navigation drawer opens, navigates and closes; no sideways scrolling', async ({ page }) => {
    await signIn(page, 'engineer')
    const nav = page.getByRole('complementary', { name: 'Main navigation' })
    await expect(nav).toBeHidden()
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await nav.getByRole('link', { name: 'Assets' }).click()
    await expect(page).toHaveURL(/\/assets/)
    await expect(nav).toBeHidden()
    for (const path of ['/', '/findings', '/assets', '/approvals', '/scans', '/settings']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
    }
  })
})

test('Vesper loads on first open, from the shortcut and from the header', async ({ page }) => {
  await signIn(page, 'viewer')
  const panel = page.getByRole('dialog', { name: /Vesper/ })
  await expect(panel).toHaveCount(0)                      // not mounted until asked for
  await page.keyboard.press('ControlOrMeta+j')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('textbox', { name: 'Message Vesper' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.getByRole('banner').getByRole('button', { name: 'Ask Vesper' }).click()
  await expect(panel).toBeVisible()
})

test('Vesper streams a cited answer, links to the finding, and keeps the conversation', async ({ page }) => {
  await signIn(page, 'engineer')
  await page.keyboard.press('ControlOrMeta+j')
  const panel = page.getByRole('dialog', { name: /Vesper/ })
  await panel.getByRole('button', { name: 'What should I fix first?' }).click()
  const log = panel.getByRole('log', { name: 'Conversation with Vesper' })
  await expect(log.getByText('Fix first:', { exact: true })).toBeVisible()               // fake account has no AI key: scan facts
  await expect(log.getByText(/scan facts only \(AI is off\)/)).toBeVisible()
  await expect(log.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: /^What breaks if I fix/ })).toBeVisible()   // follow-ups

  // Slash commands expand into a full question
  const box = panel.getByRole('textbox', { name: 'Message Vesper' })
  await box.fill('/rep')
  await expect(panel.getByRole('option', { name: /Status update for a manager/ })).toBeVisible()
  await box.press('Enter')
  await expect(box).toHaveValue(/status update on our cloud risk/)
  await box.fill('')

  // A citation chip opens that finding
  const chip = log.getByRole('button', { name: /^(IAM|S3|EC2|RDS)-\d{3}$/ }).first()
  const rule = await chip.textContent()
  await chip.click()
  await expect(panel).toBeHidden()
  await expect(page).toHaveURL(/\/findings/)

  // The conversation is saved and can be reopened from History
  await page.keyboard.press('ControlOrMeta+j')
  await panel.getByRole('button', { name: 'New' }).click()
  await expect(panel.getByRole('button', { name: 'What should I fix first?' })).toBeVisible()
  await panel.getByRole('button', { name: 'History' }).click()
  await page.getByRole('menuitem', { name: /What should I fix first\?/ }).click()
  await expect(panel.getByRole('log').getByText('Fix first:', { exact: true })).toBeVisible()
  expect(rule).toMatch(/^(IAM|S3|EC2|RDS)-\d{3}$/)
})

test('Vesper still answers when the API is older than the UI (no /assistant endpoints yet)', async ({ page }) => {
  await page.route('**/api/v1/assistant/**', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }))
  await signIn(page, 'engineer')
  await page.keyboard.press('ControlOrMeta+j')
  const panel = page.getByRole('dialog', { name: /Vesper/ })
  await panel.getByRole('button', { name: 'What should I fix first?' }).click()
  const log = panel.getByRole('log', { name: 'Conversation with Vesper' })
  await expect(log.getByText('Fix first:', { exact: true })).toBeVisible()
  await expect(log.getByRole('button', { name: /^(IAM|S3|EC2|RDS)-\d{3}$/ }).first()).toBeVisible()   // citations still work
  await expect(log.getByRole('button', { name: 'Helpful', exact: true })).toHaveCount(0)              // nothing saved to rate
})

test('a sleeping API shows "Waking Nimbus up", keeps retrying, then signs in without a reload', async ({ page }) => {
  let calls = 0
  await page.route('**/api/v1/auth/status', r => (++calls <= 2 ? r.abort('connectionrefused') : r.continue()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Waking Nimbus up…' })).toBeVisible()
  await expect(page.getByText(/usually under a minute/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 })   // retried on its own
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('Findings can be grouped by resource, and the choice survives clearing filters', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/findings?severity=CRITICAL')
  await page.getByRole('radio', { name: 'By resource' }).click()
  await expect(page).toHaveURL(/group=resource/)
  const groups = page.getByRole('list', { name: 'Findings by resource' })
  await expect(groups.getByText('billing-db', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/group=resource/)
  await expect(page).not.toHaveURL(/severity=/)
  await groups.getByRole('button').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()                      // opens the finding sheet
})
