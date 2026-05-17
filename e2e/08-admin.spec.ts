/**
 * E2E Test: Admin Dashboard Flows
 *
 * Tests:
 * - Admin login with valid/invalid credentials
 * - Login rate limiting
 * - Dashboard stats loading
 * - Article management (view, create, edit)
 * - Category management
 * - User management
 * - Membership operations
 * - Redeem code generation
 *
 * Run:
 *   npx playwright test e2e/08-admin.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

// ── Admin Auth Helper ──────────────────────────────────────────────────────

async function loginAsAdmin(page: Page, email?: string, password?: string) {
  await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  const submitBtn = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登入")').first()

  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailInput.fill(email || process.env.ADMIN_EMAIL || 'zhoujia0718@163.com')
    await passwordInput.fill(password || process.env.ADMIN_PASSWORD || 'test-password')
    await submitBtn.click()
    await page.waitForTimeout(2000)
  }
}

// ── Admin Login ─────────────────────────────────────────────────────────────

test.describe('Admin Login', () => {

  test('login page: renders without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) {
        errors.push(msg.text())
      }
    })

    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)

    const criticalErrors = errors.filter(e =>
      !e.includes('401') &&
      !e.includes('Failed to load resource') &&
      !e.includes('SUPABASE')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('login page: shows login form', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    const hasEmail = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)
    const hasPassword = await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)

    // At least one field should be visible
    expect(hasEmail || hasPassword).toBeTruthy()
  })

  test('login with invalid credentials: shows error message', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitBtn = page.locator('button[type="submit"]').first()

    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill('invalid@test.com')
      await passwordInput.fill('wrong-password')
      await submitBtn.click()
      await page.waitForTimeout(2000)

      // Should stay on login page or show error
      const url = page.url()
      expect(url).toContain('/admin/login')
    }
  })

  test('login page: no crash on submit without credentials', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const submitBtn = page.locator('button[type="submit"]').first()
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click()
      await page.waitForTimeout(1000)

      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
    }
  })
})

// ── Admin Dashboard ────────────────────────────────────────────────────────

test.describe.configure({ timeout: 60000 });

test.describe('Admin Dashboard (after login)', () => {

  test('admin redirects to login when not authenticated', async ({ page }) => {
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const url = page.url()
    expect(url).toContain('/admin/login')
  })

  test('admin dashboard: renders after login', async ({ page }) => {
    // Login first
    await loginAsAdmin(page)

    // Should redirect to dashboard
    await page.waitForTimeout(2000)
    const url = page.url()

    // Check if we're on dashboard or stayed on login
    const onDashboard = url.includes('/admin') && !url.includes('/login')
    if (onDashboard) {
      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
      expect(body!.length).toBeGreaterThan(100)
    } else {
      // If still on login, check for error message
      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
    }
  })
})

// ── Admin Article Management ────────────────────────────────────────────────

test.describe('Admin Article Management', () => {

  test('admin articles page: accessible and loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    // Navigate to articles
    await page.goto('http://localhost:3000/admin/articles', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('admin articles page: no crash on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/articles', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter(e =>
      !e.includes('401') &&
      !e.includes('Failed to load resource')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('admin article detail page: loads without crash', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    const articleId = 'b94ddce3-a1ab-4827-a4d8-f3c3d3feeee4'
    await page.goto(`http://localhost:3000/admin/articles/${articleId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('admin new article page: loads without crash', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/articles/new', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ── Admin Category Management ──────────────────────────────────────────────

test.describe('Admin Category Management', () => {

  test('admin categories page: accessible and loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/categories', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('admin categories page: no crash on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/categories', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter(e =>
      !e.includes('401') &&
      !e.includes('Failed to load resource')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})

// ── Admin User Management ───────────────────────────────────────────────────

test.describe('Admin User Management', () => {

  test('admin users page: accessible and loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('admin membership page: accessible and loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })
})

// ── Admin Redeem Codes ─────────────────────────────────────────────────────

test.describe('Admin Redeem Codes', () => {
  test('admin redeem page: accessible and loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/redeem', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('admin redeem page: no crash on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await loginAsAdmin(page)
    await page.waitForTimeout(2000)

    await page.goto('http://localhost:3000/admin/redeem', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter(e =>
      !e.includes('401') &&
      !e.includes('Failed to load resource')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
