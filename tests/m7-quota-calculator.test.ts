/**
 * Module 7 - UI组件库：lib/quota-calculator.ts 测试套件
 *
 * 测试覆盖：
 * 1. DEFAULT_QUOTA - 默认配额常量
 * 2. QuotaCalculator - 配额计算器
 *    - 免费用户配额计算
 *    - 月卡用户配额计算
 *    - 年卡/永久会员无限制
 * 3. calculateQuota() - 快捷函数
 * 4. quotaResultToOverlayMode() - 覆盖层模式转换
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import * as quotaCalc from '../lib/quota-calculator.ts'
const { DEFAULT_QUOTA, QuotaCalculator, calculateQuota, quotaResultToOverlayMode } = quotaCalc
type UserQuotaData = quotaCalc.UserQuotaData
type QuotaResult = quotaCalc.QuotaResult
// @ts-ignore
import * as memberTiers from '../lib/member-tiers.ts'
const { MEMBER_TIERS } = memberTiers

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

function makeQuota(overrides: Partial<UserQuotaData> = {}): UserQuotaData {
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

function calc(
  tier: 'none' | 'monthly' | 'yearly' | 'permanent',
  overrides: Partial<UserQuotaData> = {},
  options: Record<string, unknown> = {}
): QuotaResult {
  return calculateQuota({
    tier,
    quota: makeQuota(overrides),
    ...options,
  } as Parameters<typeof calculateQuota>[0])
}

// ─── 测试 ───────────────────────────────────────────────────────────────────

describe('M7-12: lib/quota-calculator.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. DEFAULT_QUOTA
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('DEFAULT_QUOTA - 默认配额常量', () => {
    it('GUEST_READ_LIMIT 应为正数', () => {
      expect(DEFAULT_QUOTA.GUEST_READ_LIMIT).toBeGreaterThan(0)
    })

    it('MONTHLY_DAILY_LIMIT 应为正数', () => {
      expect(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT).toBeGreaterThan(0)
    })

    it('REFERRAL_BONUS_COUNT 应为正数', () => {
      expect(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT).toBeGreaterThan(0)
    })

    it('REFERRAL_DAILY_BONUS 应为正数', () => {
      expect(DEFAULT_QUOTA.REFERRAL_DAILY_BONUS).toBeGreaterThan(0)
    })

    it('GUEST_READ_LIMIT 应小于 MONTHLY_DAILY_LIMIT', () => {
      expect(DEFAULT_QUOTA.GUEST_READ_LIMIT).toBeLessThan(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. 免费用户配额计算
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('免费用户配额计算', () => {
    it('新用户 canRead 应为 true', () => {
      const result = calc('none')
      expect(result.canRead).toBe(true)
      expect(result.isOverLimit).toBe(false)
    })

    it('免费用户有终身限制', () => {
      const result = calc('none')
      expect(result.totalLimit).not.toBe(Infinity)
    })

    it('免费用户无每日限制（dailyLimit = Infinity）', () => {
      const result = calc('none')
      expect(result.dailyLimit).toBe(Infinity)
    })

    it('阅读后剩余次数应正确减少', () => {
      const result = calc('none', { totalReadCount: 1 })
      expect(result.totalRemaining).toBe(DEFAULT_QUOTA.GUEST_READ_LIMIT - 1)
    })

    it('达到上限后 canRead 应为 false', () => {
      const result = calc('none', {
        totalReadCount: DEFAULT_QUOTA.GUEST_READ_LIMIT,
        bonusCount: 0,
      }, {
        articleRequires: 'notes',
        articleCount: 3, // 读满3篇，配额耗尽
      })
      expect(result.canRead).toBe(false)
      expect(result.isOverLimit).toBe(true)
    })

    it('邀请奖励应叠加到总限额', () => {
      const result = calc('none', {
        bonusCount: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      })
      expect(result.totalLimit).toBe(DEFAULT_QUOTA.GUEST_READ_LIMIT + DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)
    })

    it('isUnlimited 应为 false', () => {
      const result = calc('none')
      expect(result.isUnlimited).toBe(false)
    })

    it('tier 应为 none', () => {
      const result = calc('none')
      expect(result.tier).toBe('none')
    })

    it('yearly_required 内容应拒绝免费用户', () => {
      const result = calc('none', {}, { articleRequires: 'yearly' })
      expect(result.canRead).toBe(false)
      expect(result.hasContentPermission).toBe(false)
      expect(result.reason).toBe('yearly_required')
    })

    it('monthly_required 内容应拒绝免费用户', () => {
      const result = calc('none', {}, { articleRequires: 'monthly' })
      expect(result.canRead).toBe(false)
      expect(result.hasContentPermission).toBe(false)
      expect(result.reason).toBe('membership_required')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. 月卡用户配额计算
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('月卡用户配额计算', () => {
    it('月卡用户 canRead 应为 true', () => {
      const result = calc('monthly')
      expect(result.canRead).toBe(true)
    })

    it('月卡无终身限制（totalLimit = Infinity）', () => {
      const result = calc('monthly')
      expect(result.totalLimit).toBe(Infinity)
    })

    it('月卡有每日限制', () => {
      const result = calc('monthly')
      expect(result.dailyLimit).not.toBe(Infinity)
      expect(result.dailyLimit).toBe(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT)
    })

    it('超出每日限制后 canRead 应为 false', () => {
      const result = calc('monthly', {
        dailyReadCount: DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
      }, {
        articleRequires: 'notes',
        articleCount: 9, // 8+1 篇，超过每日8篇上限（dailyLimit=8, 9>8 → isOverLimit）
      })
      expect(result.canRead).toBe(false)
      expect(result.reason).toBe('daily_limit')
    })

    it('邀请奖励应叠加到每日限额', () => {
      const result = calc('monthly', {
        dailyBonusCount: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      })
      expect(result.dailyLimit).toBe(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT + DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)
    })

    it('yearly_required 内容应拒绝月卡用户', () => {
      const result = calc('monthly', {}, { articleRequires: 'yearly' })
      expect(result.canRead).toBe(false)
      expect(result.hasContentPermission).toBe(false)
      expect(result.reason).toBe('yearly_required')
    })

    it('isUnlimited 应为 false', () => {
      const result = calc('monthly')
      expect(result.isUnlimited).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. 年卡/永久会员
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('年卡/永久会员无限制', () => {
    it('年卡用户 canRead 应为 true', () => {
      const result = calc('yearly')
      expect(result.canRead).toBe(true)
    })

    it('永久会员 canRead 应为 true', () => {
      const result = calc('permanent')
      expect(result.canRead).toBe(true)
    })

    it('年卡 totalLimit = Infinity', () => {
      const result = calc('yearly')
      expect(result.totalLimit).toBe(Infinity)
    })

    it('永久会员 totalLimit = Infinity', () => {
      const result = calc('permanent')
      expect(result.totalLimit).toBe(Infinity)
    })

    it('年卡 dailyLimit = Infinity', () => {
      const result = calc('yearly')
      expect(result.dailyLimit).toBe(Infinity)
    })

    it('永久会员 dailyLimit = Infinity', () => {
      const result = calc('permanent')
      expect(result.dailyLimit).toBe(Infinity)
    })

    it('年卡 isUnlimited = true', () => {
      const result = calc('yearly')
      expect(result.isUnlimited).toBe(true)
    })

    it('永久会员 isUnlimited = true', () => {
      const result = calc('permanent')
      expect(result.isUnlimited).toBe(true)
    })

    it('年卡用户剩余次数 = Infinity', () => {
      const result = calc('yearly', { totalReadCount: 9999 })
      expect(result.totalRemaining).toBe(Infinity)
    })

    it('年卡用户阅读大量文章不应超限', () => {
      const result = calc('yearly', { totalReadCount: 1000, dailyReadCount: 1000 })
      expect(result.canRead).toBe(true)
      expect(result.isOverLimit).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. quotaResultToOverlayMode()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('quotaResultToOverlayMode() - 覆盖层模式转换', () => {
    it('未登录应返回 require_login', () => {
      const result = calc('none')
      expect(quotaResultToOverlayMode(result, false)).toBe('require_login')
    })

    it('免费用户配额耗尽应返回 quota_exhausted', () => {
      const result = calc('none', {
        totalReadCount: DEFAULT_QUOTA.GUEST_READ_LIMIT,
      }, {
        articleRequires: 'notes',
        articleCount: 3, // 达到3篇上限
      })
      expect(quotaResultToOverlayMode(result, true)).toBe('quota_exhausted')
    })

    it('年卡专属内容应返回 membership_required', () => {
      const result = calc('monthly', {}, { articleRequires: 'yearly' })
      expect(quotaResultToOverlayMode(result, true)).toBe('membership_required')
    })

    it('月卡超每日限额应返回 daily_limit_exceeded', () => {
      const result = calc('monthly', {
        dailyReadCount: DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
      }, {
        articleRequires: 'notes',
        articleCount: 9, // 超过每日8篇上限
      })
      expect(quotaResultToOverlayMode(result, true)).toBe('daily_limit_exceeded')
    })

    it('正常状态应返回 null', () => {
      const result = calc('yearly')
      expect(quotaResultToOverlayMode(result, true)).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. 边界条件测试
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('边界条件测试', () => {
    it('免费用户 totalRemaining 不应为负数', () => {
      const result = calc('none', {
        totalReadCount: DEFAULT_QUOTA.GUEST_READ_LIMIT + 10,
      })
      expect(result.totalRemaining).toBe(0)
    })

    it('自定义 guestReadLimit 应覆盖默认值', () => {
      const result = calculateQuota({
        tier: 'none',
        quota: makeQuota({ totalReadCount: 4 }),
        guestReadLimit: 5,
      })
      expect(result.totalRemaining).toBe(1)
    })

    it('自定义 monthlyDailyLimit 应覆盖默认值', () => {
      const result = calculateQuota({
        tier: 'monthly',
        quota: makeQuota({ dailyReadCount: 10 }),
        monthlyDailyLimit: 15,
      })
      expect(result.dailyLimit).toBe(15)
    })

    it('新用户（无配额数据）应能正常计算', () => {
      const result = calc('none', {
        totalReadCount: 0,
        dailyReadCount: 0,
        bonusCount: 0,
        dailyBonusCount: 0,
      })
      expect(result.canRead).toBe(true)
    })
  })
})
