/**
 * Module 13 - 数据库架构：lib/reading-settings.ts 测试套件
 *
 * 测试覆盖：
 * 1. DEFAULT_READING_SETTINGS - 默认配置值
 * 2. ReadingSettings 接口结构
 * 3. DEFAULT_READING_SETTINGS 与 reading-settings.ts 常量一致性
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_READING_SETTINGS,
  type ReadingSettings,
// @ts-ignore
} from '../lib/reading-settings.ts'

describe('M13-02: lib/reading-settings.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEFAULT_READING_SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('DEFAULT_READING_SETTINGS - 默认配置', () => {
    it('应包含所有必需字段', () => {
      expect(DEFAULT_READING_SETTINGS).toHaveProperty('guest_read_limit')
      expect(DEFAULT_READING_SETTINGS).toHaveProperty('monthly_daily_limit')
      expect(DEFAULT_READING_SETTINGS).toHaveProperty('referral_bonus_count')
    })

    it('guest_read_limit 应为正整数', () => {
      expect(typeof DEFAULT_READING_SETTINGS.guest_read_limit).toBe('number')
      expect(DEFAULT_READING_SETTINGS.guest_read_limit).toBeGreaterThan(0)
      expect(Number.isInteger(DEFAULT_READING_SETTINGS.guest_read_limit)).toBe(true)
    })

    it('monthly_daily_limit 应为正整数', () => {
      expect(typeof DEFAULT_READING_SETTINGS.monthly_daily_limit).toBe('number')
      expect(DEFAULT_READING_SETTINGS.monthly_daily_limit).toBeGreaterThan(0)
      expect(Number.isInteger(DEFAULT_READING_SETTINGS.monthly_daily_limit)).toBe(true)
    })

    it('referral_bonus_count 应为正整数', () => {
      expect(typeof DEFAULT_READING_SETTINGS.referral_bonus_count).toBe('number')
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count).toBeGreaterThan(0)
      expect(Number.isInteger(DEFAULT_READING_SETTINGS.referral_bonus_count)).toBe(true)
    })

    it('monthly_daily_limit 应大于 guest_read_limit（激励付费）', () => {
      expect(DEFAULT_READING_SETTINGS.monthly_daily_limit)
        .toBeGreaterThan(DEFAULT_READING_SETTINGS.guest_read_limit)
    })

    it('referral_bonus_count 应合理（通常较小）', () => {
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count).toBeLessThan(10)
    })

    it('所有值不应为负数或零', () => {
      expect(DEFAULT_READING_SETTINGS.guest_read_limit).toBeGreaterThanOrEqual(1)
      expect(DEFAULT_READING_SETTINGS.monthly_daily_limit).toBeGreaterThanOrEqual(1)
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count).toBeGreaterThanOrEqual(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ReadingSettings 接口一致性
  // ═══════════════════════════════════════════════════════════════════════════
  describe('ReadingSettings 接口一致性', () => {
    it('默认配置应兼容 ReadingSettings 接口', () => {
      const settings: ReadingSettings = DEFAULT_READING_SETTINGS
      expect(settings.guest_read_limit).toBeDefined()
      expect(settings.monthly_daily_limit).toBeDefined()
      expect(settings.referral_bonus_count).toBeDefined()
    })

    it('类型检查：_cachedAt 为可选字段', () => {
      const settingsWithCache: ReadingSettings = {
        ...DEFAULT_READING_SETTINGS,
        _cachedAt: Date.now(),
      }
      expect(settingsWithCache._cachedAt).toBeGreaterThan(0)

      const settingsWithoutCache: ReadingSettings = {
        ...DEFAULT_READING_SETTINGS,
      }
      expect('_cachedAt' in settingsWithoutCache).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. 与 lib/constants.ts 的一致性
  // ═══════════════════════════════════════════════════════════════════════════
  describe('与 lib/constants.ts 的一致性', () => {
    it('DEFAULT_READING_SETTINGS 应与 constants.ts 中的默认值一致', async () => {
      // @ts-ignore
      const constants = await import('../lib/constants.ts')
      expect(DEFAULT_READING_SETTINGS.guest_read_limit)
        .toBe(constants.DEFAULT_READING_LIMITS.GUEST_READ_LIMIT)
      expect(DEFAULT_READING_SETTINGS.monthly_daily_limit)
        .toBe(constants.DEFAULT_READING_LIMITS.MONTHLY_DAILY_LIMIT)
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count)
        .toBe(constants.DEFAULT_READING_LIMITS.REFERRAL_BONUS_COUNT)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. 业务逻辑合理性
  // ═══════════════════════════════════════════════════════════════════════════
  describe('业务逻辑合理性', () => {
    it('免费用户配额应较小（激励付费）', () => {
      // 通常免费配额不应超过 10 篇
      expect(DEFAULT_READING_SETTINGS.guest_read_limit).toBeLessThan(10)
    })

    it('月卡用户每日配额应明显多于免费用户', () => {
      expect(DEFAULT_READING_SETTINGS.monthly_daily_limit)
        .toBeGreaterThan(DEFAULT_READING_SETTINGS.guest_read_limit * 2)
    })

    it('邀请奖励应合理（每次邀请增加 1-5 篇）', () => {
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count).toBeGreaterThanOrEqual(1)
      expect(DEFAULT_READING_SETTINGS.referral_bonus_count).toBeLessThanOrEqual(5)
    })

    it('邀请奖励 * 邀请人数应能让免费用户获得足够阅读量', () => {
      // 如果邀请 2 人获得奖励，每次奖励 2 篇，则可读 3+4=7 篇
      const effectiveLimit = DEFAULT_READING_SETTINGS.guest_read_limit
        + DEFAULT_READING_SETTINGS.referral_bonus_count * 2
      expect(effectiveLimit).toBeGreaterThan(5)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. 与 QuotaCalculator 默认值的一致性
  // ═══════════════════════════════════════════════════════════════════════════
  describe('与 lib/quota-calculator.ts 的一致性', () => {
    it('DEFAULT_QUOTA 应与 DEFAULT_READING_SETTINGS 一致', async () => {
      // @ts-ignore
      const { DEFAULT_QUOTA } = await import('../lib/quota-calculator.ts')
      expect(DEFAULT_QUOTA.GUEST_READ_LIMIT)
        .toBe(DEFAULT_READING_SETTINGS.guest_read_limit)
      expect(DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT)
        .toBe(DEFAULT_READING_SETTINGS.monthly_daily_limit)
      expect(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)
        .toBe(DEFAULT_READING_SETTINGS.referral_bonus_count)
    })
  })
})
