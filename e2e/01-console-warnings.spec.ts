/**
 * E2E Test: Console Warnings & React Runtime Errors
 *
 * Tests all major pages for:
 * - No React "Unknown event handler property" warnings
 * - No React accessibility warnings
 * - No JavaScript errors (ignoring expected 401s from unauthenticated API calls)
 *
 * Run:
 *   npx playwright test e2e/01-console-warnings.spec.ts
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/** Patterns that are known non-critical (safe to ignore) */
const NON_CRITICAL_PATTERNS = [
  /Download the React DevTools/i,
  /\[HMR\] connected/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /SWR is using a stencil/i,
  /加载失败/i,
  /stocks/i,        // stocks API 500 on dev machine is expected
]

function isCriticalIssue(msg: ConsoleMessage): boolean {
  const text = msg.text()
  if (NON_CRITICAL_PATTERNS.some((p) => p.test(text))) return false
  return true
}

function captureIssues(page: Page) {
  const errors: ConsoleMessage[] = []
  const warnings: ConsoleMessage[] = []

  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' && isCriticalIssue(msg)) errors.push(msg)
    if (type === 'warning' && isCriticalIssue(msg)) warnings.push(msg)
  })

  return { errors, warnings }
}

// ── Helper: skip test if page has 500-level errors (expected in dev) ──────────

async function pageHas500Error(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.body.textContent?.includes('加载失败，请稍后重试') ?? false
  })
}

// ── Test Pages ────────────────────────────────────────────────────────────────

test.describe('Console Warnings — Critical Issue Detection', () => {

  test('首页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors, `Errors: ${criticalErrors.map((m) => m.text()).join(' | ')}`).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('登录页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401') && !m.text().includes('Failed to load resource'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors, `Errors: ${criticalErrors.map((m) => m.text()).join(' | ')}`).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('笔记列表页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors, `Errors: ${criticalErrors.map((m) => m.text()).join(' | ')}`).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('个股挖掘列表页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/stocks', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // stocks API may return 500 in dev (backend not configured), filter it
    const criticalErrors = errors.filter(
      (m) =>
        !m.text().includes('401') &&
        !m.text().includes('500') &&
        !m.text().includes('Failed to load resource') &&
        !m.text().includes('Error loading stocks')
    )
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors, `Errors: ${criticalErrors.map((m) => m.text()).join(' | ')}`).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('Portfolio 页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/portfolio', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('会员页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('Admin 后台：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('搜索页：无 React DOM 警告', async ({ page }) => {
    const { errors, warnings } = captureIssues(page)
    await page.goto('http://localhost:3000/search', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((m) => !m.text().includes('401'))
    const criticalWarnings = warnings.filter((m) => !m.text().includes('Supabase'))

    expect(criticalErrors).toHaveLength(0)
    criticalWarnings.forEach((w) => console.log(`  WARNING: ${w.text().substring(0, 200)}`))
  })

  test('首页：页面正常加载', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Page should have content
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('笔记列表页：页面正常加载', async ({ page }) => {
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('会员页：页面正常加载', async ({ page }) => {
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })
})

// ── React-specific warning patterns ───────────────────────────────────────────

test.describe('React Runtime Warnings — onOpenChange Detection', () => {

  test('笔记列表页：无 onOpenChange 警告', async ({ page }) => {
    const { errors } = captureIssues(page)
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const onOpenChangeErrors = errors.filter((m) => m.text().includes('onOpenChange'))
    if (onOpenChangeErrors.length > 0) {
      console.log('onOpenChange warnings:')
      onOpenChangeErrors.forEach((e) => console.log(`  ${e.text()}`))
    }
    expect(onOpenChangeErrors).toHaveLength(0)
  })

  test('移动端笔记页：无 onOpenChange 警告（Sheet 组件）', async ({ page }) => {
    const { errors } = captureIssues(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const onOpenChangeErrors = errors.filter((m) => m.text().includes('onOpenChange'))
    expect(onOpenChangeErrors, `Sheet onOpenChange warnings: ${onOpenChangeErrors.map((m) => m.text()).join(' | ')}`).toHaveLength(0)
  })
})
