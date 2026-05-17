/**
 * M16-08: lib/quota-calculator.ts — 配额计算器核心逻辑测试
 *
 * 测试覆盖：
 * 1. QuotaCalculator 构造函数默认值
 * 2. QuotaCalculator.calculate() — 年卡/永久用户（无限）
 * 3. QuotaCalculator.calculate() — 月卡用户（每日限额 + 邀请奖励）
 * 4. QuotaCalculator.calculate() — 免费用户（总限额 + 邀请奖励）
 * 5. 内容权限检查（yearly_required / membership_required）
 * 6. 每日限额超限（daily_limit）
 * 7. 配额耗尽（quota_exhausted）
 * 8. isUnlimited 判断
 * 9. calculateQuota 快捷函数
 * 10. quotaResultToOverlayMode 转换函数
 *
 * 修复记录：
 * - P4：配额计算逻辑从分散改为集中
 */
import { describe, it, expect } from 'vitest'

// ─── 导入配额计算器（使用 vitest 的真实导入）────────────────────────────

import {
  QuotaCalculator,
  calculateQuota,
  quotaResultToOverlayMode,
  DEFAULT_QUOTA,
  type QuotaResult,
  type UserQuotaData,
} from '@/lib/quota-calculator'

import { MEMBER_TIERS, type MemberTier } from '@/lib/member-tiers'

// ─── 默认配额验证 ────────────────────────────────────────────────────────

describe('M16-08a: DEFAULT_QUOTA 常量', () => {
  it('GUEST_READ_LIMIT 应为 3', () => {
    expect(DEFAULT_QUOTA.GUEST_READ_LIMIT).toBe(3)
  })

  it('MONTHLY_DAILY_LIMIT 应为 8', () => {
    expect(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT).toBe(8)
  })

  it('REFERRAL_BONUS_COUNT 应为 2', () => {
    expect(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT).toBe(2)
  })

  it('REFERRAL_DAILY_BONUS 应为 2', () => {
    expect(DEFAULT_QUOTA.REFERRAL_DAILY_BONUS).toBe(2)
  })
})

// ─── 年卡/永久用户（无限）──────────────────────────────────────────────

describe('M16-08b: 年度VIP / 永久用户（无限访问）', () => {
  const createQuota = (): UserQuotaData => ({
    totalReadCount: 100,
    readIds: [],
    dailyReadCount: 10,
    lastReadDate: null,
    bonusCount: 0,
    dailyBonusCount: 0,
    bonusResetDate: null,
  })

  it('年卡用户 isUnlimited 应为 true', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.YEARLY,
      quota: createQuota(),
    })
    expect(result.isUnlimited).toBe(true)
  })

  it('永久用户 isUnlimited 应为 true', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.PERMANENT,
      quota: createQuota(),
    })
    expect(result.isUnlimited).toBe(true)
  })

  it('年卡 canRead 应为 true（无限）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.YEARLY,
      quota: createQuota(),
    })
    expect(result.canRead).toBe(true)
  })

  it('totalLimit 应为 Infinity', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.YEARLY,
      quota: createQuota(),
    })
    expect(result.totalLimit).toBe(Infinity)
    expect(result.dailyLimit).toBe(Infinity)
  })

  it('年卡用户在 yearly 专属内容上 canRead 应为 true', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.YEARLY,
      quota: createQuota(),
      articleRequires: 'yearly',
    })
    expect(result.canRead).toBe(true)
    expect(result.hasContentPermission).toBe(true)
  })
})

// ─── 月卡用户 ──────────────────────────────────────────────────────────

describe('M16-08c: 月卡用户', () => {
  const createQuota = (dailyCount: number): UserQuotaData => ({
    totalReadCount: 50,
    readIds: [],
    dailyReadCount: dailyCount,
    lastReadDate: null,
    bonusCount: 0,
    dailyBonusCount: 2,
    bonusResetDate: null,
  })

  it('月卡 totalLimit 为 Infinity（无总限制）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(0),
    })
    expect(result.totalLimit).toBe(Infinity)
  })

  it('月卡 dailyLimit = 基础限额（8）+ 每日邀请奖励（2）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(0),
    })
    expect(result.dailyLimit).toBe(10) // 8 + 2
  })

  it('月卡今日已读 3 篇，剩余 7 篇', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(3),
    })
    expect(result.dailyRemaining).toBe(7)
    expect(result.canRead).toBe(true)
  })

  it('月卡今日已读 11 篇（notes 权限），超限（> dailyLimit）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(11),
      articleRequires: 'notes',
      articleCount: 11, // dailyLimit=10，11 > 10 → 超限
    })
    expect(result.isOverLimit).toBe(true)
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('daily_limit')
  })

  it('月卡访问 yearly 专属内容应拒绝', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(0),
      articleRequires: 'yearly',
    })
    expect(result.hasContentPermission).toBe(false)
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('yearly_required')
  })

  it('月卡访问 monthly 内容应允许', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: createQuota(0),
      articleRequires: 'monthly',
    })
    expect(result.hasContentPermission).toBe(true)
    expect(result.canRead).toBe(true)
  })
})

// ─── 免费用户 ───────────────────────────────────────────────────────────

describe('M16-08d: 免费用户（游客）', () => {
  const createQuota = (totalCount: number, bonus: number): UserQuotaData => ({
    totalReadCount: totalCount,
    readIds: [],
    dailyReadCount: totalCount,
    lastReadDate: null,
    bonusCount: bonus,
    dailyBonusCount: 0,
    bonusResetDate: null,
  })

  it('免费用户无每日限制（受总限制约束）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(0, 0),
    })
    expect(result.dailyLimit).toBe(Infinity)
  })

  it('免费用户 totalLimit = 基础限额（3）+ 邀请奖励', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(0, 2),
    })
    expect(result.totalLimit).toBe(5) // 3 + 2
  })

  it('免费用户已读 2 篇，剩余 1 篇', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(2, 0),
    })
    expect(result.totalRemaining).toBe(1)
    expect(result.canRead).toBe(true)
  })

  it('免费用户已读 3 篇且无奖励（notes 权限），超限', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(3, 0),
      articleRequires: 'notes',
      articleCount: 3,
    })
    expect(result.isOverLimit).toBe(true)
    expect(result.canRead).toBe(false)
    expect(result.reason).toBe('quota_exhausted')
  })

  it('免费用户访问 yearly 专属内容应拒绝（需登录）', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(0, 0),
      articleRequires: 'yearly',
    })
    expect(result.hasContentPermission).toBe(false)
    expect(result.reason).toBe('yearly_required')
  })

  it('免费用户访问 monthly 专属内容应引导注册', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: createQuota(0, 0),
      articleRequires: 'monthly',
    })
    expect(result.hasContentPermission).toBe(false)
    expect(result.reason).toBe('membership_required')
  })
})

// ─── 内容权限检查 ────────────────────────────────────────────────────────

describe('M16-08e: 内容权限层次', () => {
  const quota: UserQuotaData = {
    totalReadCount: 0,
    readIds: [],
    dailyReadCount: 0,
    lastReadDate: null,
    bonusCount: 0,
    dailyBonusCount: 0,
    bonusResetDate: null,
  }

  it('yearly 专属内容：年卡可读，月卡不可读，普通不可读', () => {
    const yearly = calculateQuota({ tier: MEMBER_TIERS.YEARLY, quota, articleRequires: 'yearly' })
    const monthly = calculateQuota({ tier: MEMBER_TIERS.MONTHLY, quota, articleRequires: 'yearly' })
    const free = calculateQuota({ tier: MEMBER_TIERS.NONE, quota, articleRequires: 'yearly' })

    expect(yearly.canRead).toBe(true)
    expect(monthly.canRead).toBe(false)
    expect(free.canRead).toBe(false)
  })

  it('monthly 专属内容：月卡和年卡可读，普通不可读', () => {
    const monthly = calculateQuota({ tier: MEMBER_TIERS.MONTHLY, quota, articleRequires: 'monthly' })
    const yearly = calculateQuota({ tier: MEMBER_TIERS.YEARLY, quota, articleRequires: 'monthly' })
    const free = calculateQuota({ tier: MEMBER_TIERS.NONE, quota, articleRequires: 'monthly' })

    expect(monthly.canRead).toBe(true)
    expect(yearly.canRead).toBe(true)
    expect(free.canRead).toBe(false)
  })

  it('free 内容：所有等级均可读', () => {
    const yearly = calculateQuota({ tier: MEMBER_TIERS.YEARLY, quota, articleRequires: 'free' })
    const monthly = calculateQuota({ tier: MEMBER_TIERS.MONTHLY, quota, articleRequires: 'free' })
    const free = calculateQuota({ tier: MEMBER_TIERS.NONE, quota, articleRequires: 'free' })

    expect(yearly.canRead).toBe(true)
    expect(monthly.canRead).toBe(true)
    expect(free.canRead).toBe(true)
  })
})

// ─── calculateQuota 快捷函数 ────────────────────────────────────────────

describe('M16-08f: calculateQuota 快捷函数', () => {
  const quota: UserQuotaData = {
    totalReadCount: 5,
    readIds: [],
    dailyReadCount: 3,
    lastReadDate: null,
    bonusCount: 2,
    dailyBonusCount: 1,
    bonusResetDate: null,
  }

  it('应返回完整的 QuotaResult', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota,
    })

    expect('canRead' in result).toBe(true)
    expect('hasContentPermission' in result).toBe(true)
    expect('isOverLimit' in result).toBe(true)
    expect('totalReadCount' in result).toBe(true)
    expect('dailyReadCount' in result).toBe(true)
    expect('totalLimit' in result).toBe(true)
    expect('dailyLimit' in result).toBe(true)
    expect('totalRemaining' in result).toBe(true)
    expect('dailyRemaining' in result).toBe(true)
    expect('bonusCount' in result).toBe(true)
    expect('dailyBonusCount' in result).toBe(true)
    expect('reason' in result).toBe(true)
    expect('isUnlimited' in result).toBe(true)
    expect('tier' in result).toBe(true)
  })

  it('未登录时 reason 应为 membership_required', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota,
      articleRequires: 'monthly',
    })
    expect(result.reason).toBe('membership_required')
  })
})

// ─── quotaResultToOverlayMode ───────────────────────────────────────────

describe('M16-08g: quotaResultToOverlayMode', () => {
  it('未登录应返回 require_login', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: {
        totalReadCount: 0, readIds: [], dailyReadCount: 0,
        lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null,
      },
    })
    expect(quotaResultToOverlayMode(result, false)).toBe('require_login')
  })

  it('无权限（yearly 内容被月卡访问）应返回 membership_required', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: {
        totalReadCount: 0, readIds: [], dailyReadCount: 0,
        lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null,
      },
      articleRequires: 'yearly',
    })
    expect(quotaResultToOverlayMode(result, true)).toBe('membership_required')
  })

  it('配额耗尽（notes 权限）应返回 quota_exhausted', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.NONE,
      quota: {
        totalReadCount: 10, readIds: [], dailyReadCount: 10,
        lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null,
      },
      articleRequires: 'notes',
      articleCount: 10, // 免费用户总限额为 3（+0 bonus），已读 10 篇 >= 3
    })
    expect(quotaResultToOverlayMode(result, true)).toBe('quota_exhausted')
  })

  it('P-M16-03：月卡每日超限（articleCount > dailyLimit）应返回 daily_limit_exceeded', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.MONTHLY,
      quota: {
        totalReadCount: 100, readIds: [], dailyReadCount: 20,
        lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null,
      },
      articleRequires: 'notes',
      articleCount: 21, // 超过每日限额 20 > 8+0
    })
    expect(result.reason).toBe('daily_limit')
    expect(quotaResultToOverlayMode(result, true)).toBe('daily_limit_exceeded')
  })

  it('正常访问应返回 null', () => {
    const result = calculateQuota({
      tier: MEMBER_TIERS.YEARLY,
      quota: {
        totalReadCount: 0, readIds: [], dailyReadCount: 0,
        lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null,
      },
    })
    expect(quotaResultToOverlayMode(result, true)).toBeNull()
  })
})
