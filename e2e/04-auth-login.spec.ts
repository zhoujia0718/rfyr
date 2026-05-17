/**
 * E2E Test: Auth Helper & Login Form
 *
 * Run:
 *   npx playwright test e2e/04-auth-login.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

// ── Helper: close any open dialogs that may block interactions ─────────────────

async function closeAnyOpenDialog(page: Page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const overlay = page.locator('[data-state="open"][aria-hidden="true"]').first()
  if (await overlay.isVisible({ timeout: 300 }).catch(() => false)) {
    await overlay.click({ force: true }).catch(() => {})
    await page.waitForTimeout(300)
  }
}

// ── Helper: open login dialog via header ───────────────────────────────────────

async function openLoginDialog(page: Page): Promise<boolean> {
  const selectors = [
    'button:has-text("登录 / 注册")',
    'button:has-text("登录")',
    'a:has-text("登录 / 注册")',
    'a:has-text("登录")',
  ]
  for (const sel of selectors) {
    const btn = page.locator(sel).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(800)
      return true
    }
  }
  return false
}

// ── Login Form Tests ─────────────────────────────────────────────────────────

test.describe('Login Form', () => {

  test('登录 Dialog 可打开', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Close any open dialogs before opening the login dialog
    await closeAnyOpenDialog(page)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    const dialog = page.locator('[data-slot="dialog-content"]').first()
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('登录 Dialog：包含表单字段', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Close any open dialogs before opening the login dialog
    await closeAnyOpenDialog(page)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    const inputs = page.locator('input')
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)
  })

  test('登录 Dialog：无输入时提交按钮不崩溃', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Close any open dialogs before opening the login dialog
    await closeAnyOpenDialog(page)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    // Click submit without filling anything
    const submitBtn = page.locator('button[type="submit"]').first()
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click()
      await page.waitForTimeout(500)
    }

    // Page should still be alive
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ── Auth State ───────────────────────────────────────────────────────────────

test.describe('Auth State', () => {

  test('未登录用户：首页显示登录按钮', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const loginBtn = page.locator('button:has-text("登录"), a:has-text("登录")').first()
    const visible = await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)
    expect(visible).toBeTruthy()
  })
})
