/**
 * E2E Test: Membership & Navigation
 *
 * Run:
 *   npx playwright test e2e/05-membership.spec.ts
 */

import { test, expect } from '@playwright/test'
import { loginAsYearly } from './helpers/auth'

test.describe('Membership Page', () => {

  test('会员页：页面正常加载', async ({ page }) => {
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('会员页：显示月卡或年卡信息', async ({ page }) => {
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const hasPlan = await page.locator('text=/月卡|年卡|VIP|开通|升级/i').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasPlan).toBeTruthy()
  })

  test('会员页：无崩溃错误', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) {
        errors.push(msg.text())
      }
    })

    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const criticalErrors = errors.filter((e) =>
      !e.includes('401') && !e.includes('Failed to load resource')
    )
    expect(criticalErrors, `Errors: ${criticalErrors.join(', ')}`).toHaveLength(0)
  })

  test('年卡会员：会员页加载正常', async ({ page }) => {
    await loginAsYearly(page) // set BEFORE goto
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })
})

test.describe('Navigation', () => {

  test('首页：页面正常加载', async ({ page }) => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    expect(page.url()).toBe('http://localhost:3000/')
  })

  test('移动端视口：页面响应式渲染', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('平板视口：页面响应式渲染', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})

test.describe('Page Routing', () => {

  test('所有主要页面可访问', async ({ page }) => {
    const pages = [
      'http://localhost:3000/',
      'http://localhost:3000/notes',
      'http://localhost:3000/membership',
      'http://localhost:3000/portfolio',
      'http://localhost:3000/search',
    ]

    for (const url of pages) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
      expect(
        response?.status(),
        `Page ${url} returned ${response?.status()}`
      ).toBeLessThan(500)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
    }
  })

  test('404 页面返回正确状态码', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/nonexistent-xyz-123', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeGreaterThanOrEqual(404)
  })
})
