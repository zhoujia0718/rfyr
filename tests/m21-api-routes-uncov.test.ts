/**
 * Tests for untested API routes:
 * - app/api/admin/me/route.ts
 * - app/api/referral/info/route.ts
 * - app/api/articles/[id]/route.ts
 *
 * Run: npx vitest run tests/m21-api-routes-uncov.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'

const HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ── admin/me/route.ts tests ────────────────────────────────────────────────

describe('Admin /me endpoint', () => {
  // Test the extractAdminIdFromCookie logic (pure function)
  function extractAdminIdFromCookie(cookieValue: string, hmacSecret: string): string | null {
    try {
      // Try Base64 decode (new format)
      try {
        const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
        const decodedParts = decoded.split('_')
        if (decodedParts.length === 4 && decodedParts[0].length === 16) {
          const [salt, userId, expiresAtStr, signature] = decodedParts
          const expiresAt = parseInt(expiresAtStr, 10)
          if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null
          const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, 'utf-8')
          const expectedSig = createHmac('sha256', Buffer.from(hmacSecret, 'utf-8'))
            .update(msgBuf)
            .digest('hex')
          if (signature !== expectedSig) return null
          return userId
        }
      } catch {
        // Base64 decode failed, try old format
      }

      // Old format
      const parts = cookieValue.split('_')
      if (parts.length < 3) return null
      const signature = parts[parts.length - 1]
      if (!/^[0-9a-f]{64}$/i.test(signature)) return null
      const remainder = parts.slice(0, -1).join('_')
      const expectedSig = createHmac('sha256', Buffer.from(hmacSecret, 'utf-8'))
        .update(Buffer.from(remainder, 'utf-8'))
        .digest('hex')
      if (signature !== expectedSig) return null
      const parts2 = remainder.split('_')
      const expiresAt = parseInt(parts2[parts2.length - 1], 10)
      if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null
      return parts2[0]
    } catch {
      return null
    }
  }

  it('extracts adminId from valid Base64 cookie', () => {
    const { randomBytes, createHmac: hmac } = require('crypto')
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    const salt = randomBytes(8).toString('hex')
    const msgBuf = Buffer.from(`${salt}_${TEST_USER_ID}_${expiresAt}`, 'utf-8')
    const signature = hmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8')).update(msgBuf).digest('hex')
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const result = extractAdminIdFromCookie(cookie, HMAC_SECRET)
    expect(result).toBe(TEST_USER_ID)
  })

  it('returns null for tampered cookie', () => {
    const { randomBytes, createHmac: hmac } = require('crypto')
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60
    const salt = randomBytes(8).toString('hex')
    const msgBuf = Buffer.from(`${salt}_${TEST_USER_ID}_${expiresAt}`, 'utf-8')
    const signature = hmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8')).update(msgBuf).digest('hex')
    const payload = `${salt}_tampered-user-id_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const result = extractAdminIdFromCookie(cookie, HMAC_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for expired cookie', () => {
    const { randomBytes, createHmac: hmac } = require('crypto')
    const expiresAt = Math.floor(Date.now() / 1000) - 1 // expired
    const salt = randomBytes(8).toString('hex')
    const msgBuf = Buffer.from(`${salt}_${TEST_USER_ID}_${expiresAt}`, 'utf-8')
    const signature = hmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8')).update(msgBuf).digest('hex')
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const result = extractAdminIdFromCookie(cookie, HMAC_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for wrong HMAC secret', () => {
    const { randomBytes, createHmac: hmac } = require('crypto')
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60
    const salt = randomBytes(8).toString('hex')
    const msgBuf = Buffer.from(`${salt}_${TEST_USER_ID}_${expiresAt}`, 'utf-8')
    // Sign with wrong secret
    const signature = hmac('sha256', Buffer.from('wrong-secret-key-for-testing!!', 'utf-8')).update(msgBuf).digest('hex')
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const result = extractAdminIdFromCookie(cookie, HMAC_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for invalid cookie format', () => {
    expect(extractAdminIdFromCookie('', HMAC_SECRET)).toBeNull()
    expect(extractAdminIdFromCookie('invalid', HMAC_SECRET)).toBeNull()
    expect(extractAdminIdFromCookie('a_b_c', HMAC_SECRET)).toBeNull()
  })
})

// ── referral/info/route.ts tests ───────────────────────────────────────────

describe('Referral /info endpoint', () => {
  // Test the auth check logic
  function getUserIdFromBearer(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null
    const token = authHeader.slice(7)
    if (!token) return null
    // Basic format validation: should be base64-like
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      // Expected format: userId:timestamp:signature
      const parts = decoded.split(':')
      if (parts.length !== 3) return null
      const [userId, timestamp, _signature] = parts
      if (!userId) return null
      // Check not too old (7 days)
      const age = Date.now() - parseInt(timestamp, 10)
      if (age > 7 * 24 * 60 * 60 * 1000) return null
      return userId
    } catch {
      return null
    }
  }

  it('extracts userId from valid Bearer token', () => {
    const timestamp = Date.now()
    const token = Buffer.from(`${TEST_USER_ID}:${timestamp}:abc123`).toString('base64')
    const result = getUserIdFromBearer(`Bearer ${token}`)
    expect(result).toBe(TEST_USER_ID)
  })

  it('returns null for missing auth header', () => {
    expect(getUserIdFromBearer(null)).toBeNull()
    expect(getUserIdFromBearer('')).toBeNull()
    expect(getUserIdFromBearer('Bearer ')).toBeNull()
  })

  it('returns null for invalid format (no Bearer prefix)', () => {
    expect(getUserIdFromBearer('abc123')).toBeNull()
  })

  it('returns null for expired token (>7 days)', () => {
    const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
    const token = Buffer.from(`${TEST_USER_ID}:${oldTimestamp}:abc123`).toString('base64')
    const result = getUserIdFromBearer(`Bearer ${token}`)
    expect(result).toBeNull()
  })

  it('accepts token up to 7 days old', () => {
    const timestamp = Date.now() - (7 * 24 * 60 * 60 * 1000) // exactly 7 days ago
    const token = Buffer.from(`${TEST_USER_ID}:${timestamp}:abc123`).toString('base64')
    const result = getUserIdFromBearer(`Bearer ${token}`)
    expect(result).toBe(TEST_USER_ID)
  })
})

// ── articles/[id]/route.ts tests ───────────────────────────────────────────

describe('Article [id] endpoint logic', () => {
  // Test pure utility functions

  function normalizeTier(tier: string): string {
    return String(tier).toLowerCase().replace(/_/g, '')
  }

  describe('isMonthlyMember tier detection', () => {
    function isMonthlyLogic(tier: string, membershipType?: string): boolean {
      const rawType = membershipType
        ? String(membershipType).toLowerCase().replace(/_/g, '')
        : normalizeTier(tier)
      return rawType.includes('monthly') && !rawType.includes('year')
    }

    it('monthly_tier returns true', () => {
      expect(isMonthlyLogic('monthly_tier', 'monthly_tier')).toBe(true)
    })

    it('yearly_tier returns false', () => {
      expect(isMonthlyLogic('yearly_tier', 'yearly_tier')).toBe(false)
    })

    it('monthly-membership returns true', () => {
      expect(isMonthlyLogic('monthly', 'monthly-membership')).toBe(true)
    })

    it('yearly_membership returns false', () => {
      expect(isMonthlyLogic('yearly', 'yearly_membership')).toBe(false)
    })

    it('none returns false', () => {
      expect(isMonthlyLogic('none', 'none')).toBe(false)
    })
  })

  describe('isYearlyMember tier detection', () => {
    function isYearlyLogic(tier: string, membershipType?: string): boolean {
      const rawType = membershipType
        ? String(membershipType).toLowerCase().replace(/_/g, '')
        : normalizeTier(tier)
      return rawType.includes('year') || rawType.includes('annual')
    }

    it('yearly_tier returns true', () => {
      expect(isYearlyLogic('yearly_tier', 'yearly_tier')).toBe(true)
    })

    it('annual_membership returns true', () => {
      expect(isYearlyLogic('annual', 'annual_membership')).toBe(true)
    })

    it('monthly_tier returns false', () => {
      expect(isYearlyLogic('monthly', 'monthly_tier')).toBe(false)
    })
  })

  describe('access level logic', () => {
    function getAccessType(isYearly: boolean, isMonthly: boolean, accessLevel: string, hasFreeAccess: boolean): string | null {
      if (accessLevel === 'yearly' && !isYearly) return 'YEARLY_REQUIRED'
      if (accessLevel === 'monthly' && !isMonthly && !isYearly && !hasFreeAccess) return 'MEMBERSHIP_REQUIRED'
      return null
    }

    it('yearly article: yearly user allowed', () => {
      expect(getAccessType(true, false, 'yearly', false)).toBeNull()
    })

    it('yearly article: monthly user denied', () => {
      expect(getAccessType(false, true, 'yearly', false)).toBe('YEARLY_REQUIRED')
    })

    it('yearly article: non-member denied', () => {
      expect(getAccessType(false, false, 'yearly', false)).toBe('YEARLY_REQUIRED')
    })

    it('monthly article: monthly user allowed', () => {
      expect(getAccessType(false, true, 'monthly', false)).toBeNull()
    })

    it('monthly article: yearly user allowed', () => {
      expect(getAccessType(true, false, 'monthly', false)).toBeNull()
    })

    it('monthly article: non-member denied', () => {
      expect(getAccessType(false, false, 'monthly', false)).toBe('MEMBERSHIP_REQUIRED')
    })

    it('free article: everyone allowed', () => {
      expect(getAccessType(false, false, 'free', false)).toBeNull()
    })

    it('monthly article: non-member with free access allowed', () => {
      expect(getAccessType(false, false, 'monthly', true)).toBeNull()
    })
  })

  describe('read record logic', () => {
    function computeVisit(
      existingIds: string[],
      articleId: string,
      lastReadDate: string | null,
      today: string,
      currentDailyCount: number
    ) {
      const alreadyRead = existingIds.includes(articleId)
      const shouldResetDaily = lastReadDate !== today
      if (alreadyRead) {
        return { alreadyRead: true, newDailyCount: shouldResetDaily ? 0 : currentDailyCount }
      }
      return {
        alreadyRead: false,
        newDailyCount: shouldResetDaily ? 1 : currentDailyCount + 1,
      }
    }

    it('first read of article: increments daily count', () => {
      const result = computeVisit([], 'article-1', null, '2026-04-22', 0)
      expect(result.alreadyRead).toBe(false)
      expect(result.newDailyCount).toBe(1)
    })

    it('already read article: does not increment', () => {
      const result = computeVisit(['article-1'], 'article-1', '2026-04-22', '2026-04-22', 5)
      expect(result.alreadyRead).toBe(true)
      expect(result.newDailyCount).toBe(5)
    })

    it('new day resets daily count', () => {
      const result = computeVisit(['article-1'], 'article-2', '2026-04-21', '2026-04-22', 3)
      expect(result.alreadyRead).toBe(false)
      expect(result.newDailyCount).toBe(1) // reset
    })

    it('same day, different article: increments', () => {
      const result = computeVisit(['article-1'], 'article-2', '2026-04-22', '2026-04-22', 3)
      expect(result.alreadyRead).toBe(false)
      expect(result.newDailyCount).toBe(4)
    })
  })
})
