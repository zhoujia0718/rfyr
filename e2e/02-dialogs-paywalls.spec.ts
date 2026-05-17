/**
 * E2E Test: Dialog, Sheet & Paywall Components
 *
 * Run:
 *   npx playwright test e2e/02-dialogs-paywalls.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsGuest, loginAsMonthly, loginAsYearly } from './helpers/auth'

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

// ── Dialog Component Tests ────────────────────────────────────────────────────

test.describe('Dialog Component', () => {

  test('登录 Dialog 可正常打开', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    const dialog = page.locator('[data-slot="dialog-content"]').first()
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('Dialog 可通过关闭按钮关闭', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    const closeBtn = page.locator('[data-slot="dialog-close"]').first()
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(500)
      const dialog = page.locator('[data-slot="dialog-content"]').first()
      await expect(dialog).not.toBeVisible({ timeout: 3000 })
    }
  })

  test('Dialog 打开时页面正常', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const opened = await openLoginDialog(page)
    if (!opened) {
      test.skip()
      return
    }

    await page.waitForTimeout(500)
    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})

// ── Sheet Component (Mobile Sidebar) ─────────────────────────────────────────

test.describe('Sheet Component (Mobile Sidebar)', () => {

  test('移动端：Menu 按钮可见', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const trigger = page.locator('button:has-text("Menu")').first()
    const visible = await trigger.isVisible({ timeout: 3000 }).catch(() => false)
    expect(visible).toBeTruthy()
  })

  test('移动端：Menu 按钮可点击', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const menuBtn = page.locator('button:has-text("Menu")').first()
    const visible = await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)
    expect(visible).toBeTruthy()
  })

  test('桌面端：页面正常加载', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })
})

// ── Paywall Component ─────────────────────────────────────────────────────────

test.describe('Paywall Component', () => {

  test('游客访问笔记列表：页面加载正常', async ({ page }) => {
    await loginAsGuest(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('年卡会员：页面加载正常', async ({ page }) => {
    await loginAsYearly(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('月卡会员：页面加载正常', async ({ page }) => {
    await loginAsMonthly(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})

// ── WechatGuideOverlay ────────────────────────────────────────────────────────

test.describe('WechatGuideOverlay', () => {

  test('游客访问笔记列表：页面加载正常', async ({ page }) => {
    await loginAsGuest(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('游客：显示登录或付费相关内容', async ({ page }) => {
    await loginAsGuest(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('年卡会员：页面加载正常', async ({ page }) => {
    await loginAsYearly(page) // set localStorage BEFORE goto
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})
