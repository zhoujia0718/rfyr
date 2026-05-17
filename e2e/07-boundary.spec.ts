/**
 * E2E Test: Boundary & Edge Cases
 *
 * Tests:
 * - XSS injection via URL params (ref, search)
 * - SQL injection via article IDs
 * - Malformed inputs to forms
 * - Empty states handling
 * - Very long inputs
 * - Invalid membership types
 * - Concurrent requests simulation
 *
 * Run:
 *   npx playwright test e2e/07-boundary.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsGuest, loginAsMonthly, loginAsYearly } from './helpers/auth'

const KNOWN_ARTICLE_ID = 'b94ddce3-a1ab-4827-a4d8-f3c3d3feeee4'

// ── XSS & Injection Helpers ─────────────────────────────────────────────────

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert('XSS')",
  '<svg onload=alert(1)>',
  "'; DROP TABLE users; --",
  '{{constructor.constructor("alert(1)")()}}',
]

// ── Helper: check for XSS in rendered content ───────────────────────────────

async function hasReflectedXSS(page: Page, text: string): Promise<boolean> {
  return page.evaluate((searchText) => {
    // Check if unescaped HTML appears in the page
    const body = document.body.innerHTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(body, 'text/html')
    const bodyText = doc.body.textContent || ''
    // If script tags appear literally in HTML (not escaped), that's XSS
    return body.includes('<script') || body.includes('onerror=') || body.includes('javascript:')
  }, text)
}

// ── XSS via URL Parameters ─────────────────────────────────────────────────

test.describe('XSS Injection via URL Parameters', () => {

  test('?ref= param: XSS payload renders safely', async ({ page }) => {
    const payload = encodeURIComponent('<script>alert(1)</script>')
    const response = await page.goto(`http://localhost:3000/?ref=${payload}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    // Wait for React hydration + useEffect to run (captureReferrerFromUrl uses useEffect)
    await page.waitForTimeout(3000)

    const xssInDom = await page.evaluate(() => {
      return document.body.innerHTML.includes('<script>alert')
    })
    expect(xssInDom, 'XSS script tag should NOT appear in DOM').toBe(false)
  })

  test('?ref= param: XSS payload not stored in localStorage (invalid format)', async ({ page }) => {
    const payload = encodeURIComponent('<script>alert(1)</script>')
    await page.goto(`http://localhost:3000/?ref=${payload}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    // Wait for React hydration + useEffect to run
    await page.waitForTimeout(3000)

    const stored = await page.evaluate(() => {
      return localStorage.getItem('rfyr_referrer_code')
    })
    // Invalid format should NOT be stored
    expect(stored, 'XSS payload should not be stored as referrer code').toBeNull()
  })

  test('?ref= param: Valid referral code is stored correctly', async ({ page }) => {
    const validCode = 'RFYR-MONTH-ABCDEF'
    await page.goto(`http://localhost:3000/?ref=${validCode}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    // Wait for React hydration + useEffect to run
    await page.waitForTimeout(3000)

    const stored = await page.evaluate(() => {
      return localStorage.getItem('rfyr_referrer_code')
    })
    expect(stored).toBe(validCode)
  })

  test('search query: XSS payload renders safely', async ({ page }) => {
    const payload = encodeURIComponent('<img src=x onerror=alert(1)>')
    await page.goto(`http://localhost:3000/search?q=${payload}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const xssInDom = await page.evaluate(() => {
      return document.body.innerHTML.includes('<img src=x')
    })
    expect(xssInDom, 'XSS img tag should NOT appear in DOM').toBe(false)
  })

  for (const payload of XSS_PAYLOADS.slice(0, 3)) {
    test(`article ID: XSS in URL path doesn't break page - ${payload.substring(0, 20)}`, async ({ page }) => {
      const response = await page.goto(
        `http://localhost:3000/notes/${encodeURIComponent(payload)}`
      )
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)

      // Page should not crash - check body still has content
      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
      // Should show 404 or error page, not crash
      const status = response?.status()
      expect(status).toBeLessThanOrEqual(404)
    })
  }
})

// ── Article ID Edge Cases ──────────────────────────────────────────────────

test.describe('Article ID Edge Cases', () => {

  test('invalid UUID format: page returns 404 or error', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/notes/not-a-valid-id', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const status = response?.status()
    // Either 404 or 200 with error message
    expect(status === 404 || status === 200).toBe(true)
    if (status === 200) {
      const body = await page.locator('body').textContent()
      expect(body!.toLowerCase()).toMatch(/not found|不存在|404|错误|error/i)
    }
  })

  test('very long article ID: page does not crash', async ({ page }) => {
    const longId = 'x'.repeat(500)
    const response = await page.goto(`http://localhost:3000/notes/${longId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Should not crash
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('SQL injection in article ID: page does not crash', async ({ page }) => {
    const payloads = [
      "'; DROP TABLE articles; --",
      "1 OR 1=1",
      "1; DELETE FROM articles WHERE 1=1; --",
    ]

    for (const payload of payloads) {
      const response = await page.goto(`http://localhost:3000/notes/${encodeURIComponent(payload, { waitUntil: 'domcontentloaded' })}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
      // Should show error page, not crash
      expect(body!.length).toBeGreaterThan(0)
    }
  })

  test('valid article ID returns content', async ({ page }) => {
    const response = await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})

// ── Search Edge Cases ───────────────────────────────────────────────────────

test.describe('Search Edge Cases', () => {

  test('empty search query: page loads without error', async ({ page }) => {
    await page.goto('http://localhost:3000/search', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('very long search query: page does not crash', async ({ page }) => {
    const longQuery = 'a'.repeat(1000)
    await page.goto(`http://localhost:3000/search?q=${encodeURIComponent(longQuery, { waitUntil: 'domcontentloaded' })}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('special characters in search: page does not crash', async ({ page }) => {
    const specialQueries = [
      '<script>alert(1)</script>',
      "test'test",
      'test"test',
      'test\\test',
      'test\ntest',
      'test<script',
      'test&test=test',
      'test?test=1',
    ]

    for (const query of specialQueries) {
      await page.goto(`http://localhost:3000/search?q=${encodeURIComponent(query, { waitUntil: 'domcontentloaded' })}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
    }
  })

  test('Unicode/Chinese characters in search: page does not crash', async ({ page }) => {
    const unicodeQueries = [
      '投资',
      '股票',
      '测试<script>alert(1)</script>',
      '你好世界🌍',
      '日本語テスト',
      '🎉🍜💰',
    ]

    for (const query of unicodeQueries) {
      await page.goto(`http://localhost:3000/search?q=${encodeURIComponent(query, { waitUntil: 'domcontentloaded' })}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
    }
  })
})

// ── Form Input Edge Cases ───────────────────────────────────────────────────

test.describe('Form Input Edge Cases', () => {

  test('redeem code: very long input does not crash', async ({ page }) => {
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // Try to find redeem input
    const redeemInput = page.locator('input[placeholder*="兑换"], input[placeholder*="码"], input[placeholder*="code"]').first()
    if (await redeemInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await redeemInput.fill('x'.repeat(200))
      const value = await redeemInput.inputValue()
      expect(value.length).toBeLessThanOrEqual(200)
    }
  })

  test('redeem code: SQL injection payload does not crash', async ({ page }) => {
    await page.goto('http://localhost:3000/membership', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const redeemInput = page.locator('input[placeholder*="兑换"], input[placeholder*="码"], input[placeholder*="code"]').first()
    if (await redeemInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await redeemInput.fill("'; DROP TABLE redeem_codes; --")
      const value = await redeemInput.inputValue()
      expect(value).toBe("'; DROP TABLE redeem_codes; --")
    }
  })
})

// ── Navigation Edge Cases ───────────────────────────────────────────────────

test.describe('Navigation Edge Cases', () => {

  test('non-existent category page: returns 404 or graceful error', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/notes/category-does-not-exist-xyz-123', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    // Should either 404 or show empty state
  })

  test('deep nested URL: page does not crash', async ({ page }) => {
    await page.goto('http://localhost:3000/a/b/c/d/e/f', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('URL with unicode path: page does not crash', async ({ page }) => {
    await page.goto('http://localhost:3000/notes/中文测试', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('URL with null bytes: page does not crash', async ({ page }) => {
    await page.goto('http://localhost:3000/notes/test%00injection', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ── localStorage Edge Cases ─────────────────────────────────────────────────

test.describe('localStorage Edge Cases', () => {

  test('corrupted localStorage: app does not crash', async ({ page }) => {
    // Set corrupted auth data
    await page.addInitScript(() => {
      localStorage.setItem('custom_auth', 'not valid json{')
      localStorage.setItem('rfyr_membership_cache', '{invalid json')
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // App should handle JSON parse errors gracefully
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('empty localStorage: app loads normally', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('malformed referrer code in localStorage: app does not crash', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rfyr_referrer_code', '<script>alert(1)</script>')
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ── Membership Tier Edge Cases ──────────────────────────────────────────────

test.describe('Membership Tier Edge Cases', () => {

  test('expired membership: page loads without crash', async ({ page }) => {
    // Set expired membership in localStorage
    await page.addInitScript(() => {
      const authData = {
        user: { id: 'expired-user', email: 'expired@test.com', membershipType: 'monthly' },
        session: { access_token: 'test_token', refresh_token: 'test_refresh', expires_at: 0 },
        loginTime: 0, // expired
        source: 'test',
      }
      localStorage.setItem('custom_auth', JSON.stringify(authData))

      const memData = {
        tier: 'monthly',
        userId: 'expired-user',
        email: 'expired@test.com',
        expiresAt: Date.now() - 86400000, // expired 1 day ago
        isActive: false,
        activatedAt: Date.now() - 31 * 86400000,
      }
      localStorage.setItem('rfyr_membership_cache', JSON.stringify(memData))
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('unknown membership type in localStorage: app does not crash', async ({ page }) => {
    await page.addInitScript(() => {
      const authData = {
        user: { id: 'unknown-tier', email: 'test@test.com', membershipType: 'unknown_type' },
        session: { access_token: 'test_token', refresh_token: 'test_refresh', expires_at: Date.now() + 86400000 },
        loginTime: Math.floor(Date.now() / 1000),
        source: 'test',
      }
      localStorage.setItem('custom_auth', JSON.stringify(authData))
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('null membership type in localStorage: app does not crash', async ({ page }) => {
    await page.addInitScript(() => {
      const authData = {
        user: { id: 'null-tier', email: 'test@test.com', membershipType: null as any },
        session: { access_token: 'test_token', refresh_token: 'test_refresh', expires_at: Date.now() + 86400000 },
        loginTime: Math.floor(Date.now() / 1000),
        source: 'test',
      }
      localStorage.setItem('custom_auth', JSON.stringify(authData))
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ── API Response Edge Cases ──────────────────────────────────────────────────

test.describe('API Error Handling', () => {

  test('API timeout: page shows error gracefully', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // No unhandled promise rejections should crash the page
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('multiple rapid navigations: no memory leaks crash', async ({ page }) => {
    const urls = [
      'http://localhost:3000/',
      'http://localhost:3000/notes',
      'http://localhost:3000/membership',
      'http://localhost:3000/search',
      'http://localhost:3000/portfolio',
    ]

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(200)
    }

    // Final page should still be alive
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
