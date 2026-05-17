/**
 * Unit Tests: QuotaCalculator — Core Logic
 *
 * Tests all quota calculation scenarios:
 * - Guest (none) user reading limits
 * - Monthly member daily limits
 * - Yearly member unlimited access
 * - Referral bonus counting
 * - Article-level permission checks
 * - Edge cases (boundary values)
 *
 * Run:
 *   npx vitest run tests/quota-calculator.test.ts
 */

import { describe, it, expect } from 'vitest'
import { QuotaCalculator, calculateQuota, quotaResultToOverlayMode, DEFAULT_QUOTA } from '@/lib/quota-calculator'

// ── Test Helpers ─────────────────────────────────────────────────────────────

function makeQuota(overrides: Partial<{
  totalReadCount: number
  dailyReadCount: number
  bonusCount: number
  dailyBonusCount: number
  lastReadDate: string | null
  readIds: string[]
  bonusResetDate: string | null
}> = {}) {
  return {
    totalReadCount: 0,
    readIds: [],
    dailyReadCount: 0,
    lastReadDate: null,
    bonusCount: 0,
    dailyBonusCount: 0,
    bonusResetDate: null,
    ...overrides,
  }
}

const GUEST = 'none'
const MONTHLY = 'monthly'
const YEARLY = 'yearly'
const PERMANENT = 'permanent'

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('QuotaCalculator — Guest (none) User', () => {

  it('0 篇已读时 canRead=true', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 0 }),
      articleRequires: 'notes',
      articleCount: 0,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(true)
    expect(result.reason).toBe('none')
    expect(result.totalLimit).toBe(3)
  })

  it('已读 2 篇（未超限）canRead=true', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 2 }),
      articleRequires: 'notes',
      articleCount: 2,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(true)
    expect(result.reason).toBe('none')
  })

  it('已读 3 篇（达到上限）canRead=false', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 3 }),
      articleRequires: 'notes',
      articleCount: 3,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('quota_exhausted')
  })

  it('已读 5 篇（超限）canRead=false', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 5 }),
      articleRequires: 'notes',
      articleCount: 5,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('quota_exhausted')
  })

  it('邀请奖励增加免费配额', () => {
    // 默认 3 篇 + 2 篇邀请奖励 = 5 篇
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 4, bonusCount: 2 }),
      articleRequires: 'notes',
      articleCount: 4,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(true)
    expect(result.totalLimit).toBe(5) // 3 + 2
    expect(result.totalRemaining).toBe(1)
  })

  it('邀请奖励耗尽后超限', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 5, bonusCount: 2 }),
      articleRequires: 'notes',
      articleCount: 5,
      guestReadLimit: 3,
    })
    expect(result.canRead).toBe(false)
    expect(result.totalLimit).toBe(5)
    expect(result.totalRemaining).toBe(0)
  })

  it('访问 yearly 专属内容：canRead=false', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 0 }),
      articleRequires: 'yearly',
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('yearly_required')
  })

  it('访问 monthly 内容：canRead=false（未登录）', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 0 }),
      articleRequires: 'monthly',
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('membership_required')
  })

  it('totalRemaining 计算正确', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 1, bonusCount: 1 }),
      articleRequires: 'notes',
      articleCount: 1,
      guestReadLimit: 3,
    })
    expect(result.totalRemaining).toBe(3) // 4 - 1
    expect(result.totalLimit).toBe(4)
  })
})

describe('QuotaCalculator — Monthly Member', () => {

  it('0 篇已读时 canRead=true', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 0 }),
      articleRequires: 'notes',
      articleCount: 0,
      monthlyDailyLimit: 8,
    })
    expect(result.canRead).toBe(true)
    expect(result.reason).toBe('none')
    expect(result.dailyLimit).toBe(8)
  })

  it('已读 7 篇（未超每日限额）canRead=true', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 7 }),
      articleRequires: 'notes',
      articleCount: 7,
      monthlyDailyLimit: 8,
    })
    expect(result.canRead).toBe(true)
    expect(result.reason).toBe('none')
  })

  it('已读 8 篇（达到每日限额）canRead=false', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 8 }),
      articleRequires: 'notes',
      articleCount: 8,
      monthlyDailyLimit: 8,
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('daily_limit')
  })

  it('已读 9 篇（超每日限额）canRead=false', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 9 }),
      articleRequires: 'notes',
      articleCount: 9,
      monthlyDailyLimit: 8,
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('daily_limit')
  })

  it('访问 yearly 专属内容：canRead=false', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 0 }),
      articleRequires: 'yearly',
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('yearly_required')
  })

  it('月卡无终身总限制', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ totalReadCount: 100 }),
      articleRequires: 'notes',
      articleCount: 100,
      monthlyDailyLimit: 8,
    })
    expect(result.totalLimit).toBe(Infinity)
    expect(result.totalRemaining).toBe(Infinity)
  })

  it('每日邀请奖励计入当日限额', () => {
    // 8 + 2 邀请奖励 = 10 篇
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 9, dailyBonusCount: 2 }),
      articleRequires: 'notes',
      articleCount: 9,
      monthlyDailyLimit: 8,
    })
    expect(result.canRead).toBe(true)
    expect(result.dailyLimit).toBe(10) // 8 + 2
    expect(result.dailyRemaining).toBe(1)
  })
})

describe('QuotaCalculator — Yearly VIP Member', () => {

  it('任何内容 canRead=true（无限制）', () => {
    const result = calculateQuota({
      tier: YEARLY,
      quota: makeQuota({ totalReadCount: 1000, dailyReadCount: 100 }),
      articleRequires: 'yearly',
    })
    expect(result.canRead).toBe(true)
    expect(result.isUnlimited).toBe(true)
    expect(result.totalLimit).toBe(Infinity)
    expect(result.dailyLimit).toBe(Infinity)
    expect(result.reason).toBe('none')
  })

  it('访问 monthly 内容 canRead=true', () => {
    const result = calculateQuota({
      tier: YEARLY,
      quota: makeQuota({ totalReadCount: 100 }),
      articleRequires: 'monthly',
    })
    expect(result.canRead).toBe(true)
  })

  it('isUnlimited = true', () => {
    const result = calculateQuota({
      tier: YEARLY,
      quota: makeQuota({}),
      articleRequires: 'notes',
      articleCount: 0,
    })
    expect(result.isUnlimited).toBe(true)
  })
})

describe('QuotaCalculator — Boundary Conditions', () => {

  it('articleCount=undefined 时不做篇数检查', () => {
    // Should fall back to hasContentPermission check
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 10 }),
      articleRequires: 'monthly',
      // articleCount NOT provided
    })
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('membership_required')
  })

  it('articleRequires=free 时免费用户可访问', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 0 }),
      articleRequires: 'free',
    })
    expect(result.canRead).toBe(true)
    expect(result.reason).toBe('none')
  })

  it('DEFAULT_QUOTA 常量正确', () => {
    expect(DEFAULT_QUOTA.GUEST_READ_LIMIT).toBe(3)
    expect(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT).toBe(8)
    expect(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT).toBe(2)
    expect(DEFAULT_QUOTA.REFERRAL_DAILY_BONUS).toBe(2)
  })

  it('永久会员视为无限制', () => {
    const result = calculateQuota({
      tier: PERMANENT,
      quota: makeQuota({ totalReadCount: 9999 }),
      articleRequires: 'yearly',
    })
    expect(result.canRead).toBe(true)
    expect(result.isUnlimited).toBe(true)
    expect(result.totalLimit).toBe(Infinity)
  })
})

describe('quotaResultToOverlayMode', () => {

  it('未登录用户 → require_login', () => {
    const result = calculateQuota({ tier: GUEST, quota: makeQuota() })
    expect(quotaResultToOverlayMode(result, false)).toBe('require_login')
  })

  it('年卡专属内容（已登录）→ membership_required', () => {
    const result = calculateQuota({ tier: MONTHLY, quota: makeQuota(), articleRequires: 'yearly' })
    expect(quotaResultToOverlayMode(result, true)).toBe('membership_required')
  })

  it('每日限额超限 → daily_limit_exceeded', () => {
    const result = calculateQuota({
      tier: MONTHLY,
      quota: makeQuota({ dailyReadCount: 10 }),
      articleRequires: 'notes',
      articleCount: 10,
      monthlyDailyLimit: 8,
    })
    expect(quotaResultToOverlayMode(result, true)).toBe('daily_limit_exceeded')
  })

  it('免费额度耗尽 → quota_exhausted', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 5 }),
      articleRequires: 'notes',
      articleCount: 5,
      guestReadLimit: 3,
    })
    expect(quotaResultToOverlayMode(result, true)).toBe('quota_exhausted')
  })

  it('正常状态 → null', () => {
    const result = calculateQuota({
      tier: GUEST,
      quota: makeQuota({ totalReadCount: 1 }),
      articleRequires: 'notes',
      articleCount: 1,
      guestReadLimit: 3,
    })
    expect(quotaResultToOverlayMode(result, true)).toBe(null)
  })
})
