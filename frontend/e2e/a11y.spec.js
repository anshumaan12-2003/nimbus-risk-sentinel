/*
  Accessibility: axe-core (the engine behind Lighthouse) on every page, in both themes.
  Fails on "serious" or "critical" WCAG 2.1 A/AA violations — e.g. unreadable contrast,
  unlabeled controls, broken ARIA.
*/
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn, useTheme } from './helpers'

const PAGES = ['/', '/vesper', '/findings', '/assets', '/topology', '/simulator', '/workflow', '/approvals', '/drift',
  '/compliance', '/scans', '/iac', '/settings']

for (const theme of ['light', 'dark']) {
  test(`no serious accessibility violations · ${theme}`, async ({ page }) => {
    test.setTimeout(120_000)
    await useTheme(page, theme)
    const problems = []
    await page.goto('/')
    await page.getByLabel('Email').waitFor()
    await page.waitForTimeout(400)
    const signin = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    problems.push(...signin.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ page: 'sign-in', v })))
    await signIn(page, 'admin')
    for (const path of PAGES) {
      await page.goto(path)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(500)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.react-flow__minimap').analyze()
      problems.push(...r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ page: path, v })))
    }
    const report = problems.map(({ page, v }) => `${page}  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\n').slice(1, 2).join('')).join('\n    ')}`).join('\n')
    expect(problems.length, `\n${report}`).toBe(0)
  })
}
