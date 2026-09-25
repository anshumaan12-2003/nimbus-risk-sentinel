/*
  Visual regression: the pages people look at most, in both themes, at desktop and phone size.
  A failing test shows a diff image (in playwright-report/) of exactly which pixels changed.
*/
import { test, expect } from '@playwright/test'
import { settled, signIn, useTheme, volatile } from './helpers'

for (const theme of ['dark', 'light']) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => { await useTheme(page, theme) })

    test('sign-in screen', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page).toHaveScreenshot(`signin-${theme}.png`)
    })

    test('approvals (empty) and settings', async ({ page }) => {
      await signIn(page, 'admin')
      await page.goto('/approvals')
      await expect(page.getByText('Nothing waiting for approval')).toBeVisible()
      await settled(page)
      await expect(page).toHaveScreenshot(`approvals-empty-${theme}.png`, { mask: volatile(page) })
      await page.goto('/settings')
      await expect(page.getByRole('button', { name: 'Add person' })).toBeVisible()
      await expect(page.getByText('viewer@breachpath.local')).toBeVisible()
      await settled(page)
      // "Last sign-in" depends on which users earlier tests signed in as, so mask the whole column
      const lastSignIn = page.locator('table').filter({ hasText: 'Last sign-in' }).locator('tbody td:nth-child(3)')
      await expect(page).toHaveScreenshot(`settings-${theme}.png`, { mask: [...volatile(page), lastSignIn] })
    })
  })
}

test('findings list', async ({ page }) => {
  await useTheme(page, 'dark')
  await signIn(page, 'viewer')
  await page.goto('/findings')
  await expect(page.getByText('IAM-002').first()).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('findings-dark.png', { mask: volatile(page) })
})

test('navigation (phone drawer / desktop rail)', async ({ page, isMobile }) => {
  await useTheme(page, 'light')
  await signIn(page, 'engineer')
  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click()
  const nav = page.getByRole('complementary', { name: 'Main navigation' })
  await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()
  await settled(page)
  await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page')
  // Masks scoped to the drawer: changing content on the page behind it must not affect this test
  await expect(nav).toHaveScreenshot('nav-light.png', { mask: volatile(nav) })
})
