/**
 * E2E Test Helper: Authentication utilities
 *
 * CRITICAL: The app's MembershipProvider calls API on mount and may clear
 * localStorage if auth is invalid. To set auth state properly:
 *
 *   BEFORE: loginAsGuest(page) → goto(url) → reload()
 *   AFTER:  await page.addInitScript() to set localStorage BEFORE first navigation
 *
 * This ensures React hydrates with correct auth state.
 */

import type { Page } from '@playwright/test'

/** Auth session data structure */
export interface AuthSession {
  userId: string
  email: string
  membershipType: 'none' | 'monthly' | 'yearly'
  loginTime: number
}

/** Add an init script that sets localStorage BEFORE any navigation.
 * This is the ONLY reliable way to set auth before React hydration.
 */
async function addAuthInitScript(
  page: Page,
  options: {
    userId?: string
    email?: string
    membershipType?: 'none' | 'monthly' | 'yearly'
    loginTime?: number
  } = {}
) {
  const {
    userId = 'test-user-' + Date.now(),
    email = 'test@example.com',
    membershipType = 'none',
    loginTime = Math.floor(Date.now() / 1000),
  } = options

  await page.addInitScript(
    ({ userId, email, loginTime, membershipType }) => {
      const authData = {
        user: { id: userId, email, membershipType },
        session: {
          access_token: `test_token_${Date.now()}`,
          refresh_token: `test_refresh_${Date.now()}`,
          expires_at: loginTime + 7 * 24 * 60 * 60,
        },
        loginTime,
        source: 'test',
      }
      localStorage.setItem('custom_auth', JSON.stringify(authData))
      // Also set membership cache so provider doesn't call API
      try {
        const memData = {
          tier: membershipType,
          userId,
          email,
          expiresAt: (loginTime + 30 * 24 * 60 * 60) * 1000,
          isActive: membershipType !== 'none',
          activatedAt: Date.now(),
        }
        localStorage.setItem('rfyr_membership_cache', JSON.stringify(memData))
      } catch {}
    },
    { userId, email, loginTime, membershipType }
  )
}

/** Clear auth state via init script */
async function addClearAuthInitScript(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('custom_auth')
    localStorage.removeItem('rfyr_membership_cache')
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Simulate guest (no membership) - MUST call before goto */
export async function loginAsGuest(page: Page, userId = 'test-guest-' + Date.now()) {
  await addAuthInitScript(page, {
    userId,
    email: 'guest@example.com',
    membershipType: 'none',
    loginTime: Math.floor(Date.now() / 1000),
  })
}

/** Simulate monthly member - MUST call before goto */
export async function loginAsMonthly(page: Page, userId = 'test-monthly-' + Date.now()) {
  await addAuthInitScript(page, {
    userId,
    email: 'monthly@example.com',
    membershipType: 'monthly',
    loginTime: Math.floor(Date.now() / 1000),
  })
}

/** Simulate yearly VIP - MUST call before goto */
export async function loginAsYearly(page: Page, userId = 'test-yearly-' + Date.now()) {
  await addAuthInitScript(page, {
    userId,
    email: 'yearly@example.com',
    membershipType: 'yearly',
    loginTime: Math.floor(Date.now() / 1000),
  })
}

/** Clear auth - MUST call before goto */
export async function clearAuthSession(page: Page) {
  await addClearAuthInitScript(page)
}

/** Check if currently logged in */
export async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('custom_auth')
      if (!raw) return false
      const data = JSON.parse(raw)
      return !!(data.loginTime && data.loginTime > 0 && data.user?.id)
    } catch {
      return false
    }
  })
}

/** Get auth token from localStorage (for API tests) */
export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('custom_auth')
      if (!raw) return null
      const data = JSON.parse(raw)
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  })
}

/**
 * Navigate and set auth state (RECOMMENDED pattern).
 * Sets localStorage BEFORE navigation so React hydrates correctly.
 */
export async function gotoWithAuth(
  page: Page,
  url: string,
  membership: 'guest' | 'monthly' | 'yearly' = 'guest'
) {
  if (membership === 'monthly') {
    await loginAsMonthly(page)
  } else if (membership === 'yearly') {
    await loginAsYearly(page)
  } else {
    await loginAsGuest(page)
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}
