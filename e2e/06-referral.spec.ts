/**
 * E2E Test: Referral System & API
 *
 * Run:
 *   npx playwright test e2e/06-referral.spec.ts
 */

import { test, expect } from '@playwright/test'
import { loginAsGuest, loginAsYearly } from './helpers/auth'

test.describe('Referral Code API (auth enforcement)', () => {

  test('未登录用户：API 返回 401（用 page.request）', async ({ page }) => {
    // page.request uses its own context, no auth → 401
    const response = await page.request.get('http://localhost:3000/api/referral/code')
    expect(response.status()).toBe(401)
  })

  test('游客（已登录）：API 返回 401', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const result = await page.evaluate(async () => {
      const resp = await fetch('/api/referral/code')
      return { status: resp.status }
    })
    console.log(`  Guest API status: ${result.status}`)
    expect(result.status).toBe(401)
  })

  test('年卡会员：笔记列表页正常加载', async ({ page }) => {
    await loginAsYearly(page)
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})
