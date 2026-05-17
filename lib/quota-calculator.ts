/**
 * ============================================================
 * 阅读配额集中计算工具 — P4 核心修复
 * ============================================================
 *
 * 背景（P4 问题）：配额计算逻辑分散在 3 个地方：
 *   - Paywall.tsx：effectiveFreeLimit, effectiveMonthlyLimit
 *   - use-reading-limit.ts：maxCount, effectiveDailyLimit
 *   - WechatGuideOverlay.tsx：另一套独立逻辑
 *
 * 解决方案：建立单一 QuotaCalculator 类，所有组件调用此统一 API。
 * 配置存储在 reading_settings 表（fallback 到常量默认值）。
 */

import {
  MemberTier,
  MEMBER_TIERS,
  isPaidTier,
  isUnlimitedTier,
} from './member-tiers'
import { DEFAULT_READING_SETTINGS } from './reading-settings'
import {
  isToday,
  isExpired,
  getDaysRemaining,
} from './datetime'

// ─── 默认配额配置 ─────────────────────────────────────────────────────────

// ─── 默认配额配置（P4 修复：统一引用 reading-settings.ts 的常量）──────────────────

export const DEFAULT_QUOTA = {
  /** 游客/免费用户总阅读上限 */
  GUEST_READ_LIMIT: DEFAULT_READING_SETTINGS.guest_read_limit,
  /** 月卡每日基础阅读上限 */
  MONTHLY_DAILY_LIMIT: DEFAULT_READING_SETTINGS.monthly_daily_limit,
  /** 每次邀请增加的阅读次数（非会员） */
  REFERRAL_BONUS_COUNT: DEFAULT_READING_SETTINGS.referral_bonus_count,
  /** 每月卡每日邀请奖励次数 */
  REFERRAL_DAILY_BONUS: 2,
} as const

// ─── 配额结果接口 ────────────────────────────────────────────────────────

export interface QuotaResult {
  /** 是否有权阅读（= !isOverLimit && hasContentPermission） */
  canRead: boolean
  /** 是否超出内容权限（如 yearly 专属内容） */
  hasContentPermission: boolean
  /** 是否超出配额限制 */
  isOverLimit: boolean
  /** 终身已读篇数 */
  totalReadCount: number
  /** 今日已读篇数 */
  dailyReadCount: number
  /** 终身阅读上限（Infinity=无限制） */
  totalLimit: number
  /** 每日阅读上限（Infinity=无限制） */
  dailyLimit: number
  /** 终身剩余可读次数 */
  totalRemaining: number
  /** 今日剩余可读次数 */
  dailyRemaining: number
  /** 邀请奖励次数（终身） */
  bonusCount: number
  /** 每日邀请奖励次数 */
  dailyBonusCount: number
  /** 配额限制原因（超限/无权限/正常） */
  reason: 'none' | 'require_login' | 'quota_exhausted' | 'daily_limit' | 'membership_required' | 'yearly_required'
  /** 无限制访问（yearly/permanent） */
  isUnlimited: boolean
  /** 会员等级 */
  tier: MemberTier
}

// ─── 用户配额数据（来自数据库）───────────────────────────────────────────

export interface UserQuotaData {
  totalReadCount: number
  readIds: string[]
  dailyReadCount: number
  lastReadDate: string | null
  bonusCount: number
  dailyBonusCount: number
  bonusResetDate: string | null
}

// ─── 配额计算器 ─────────────────────────────────────────────────────────

export class QuotaCalculator {
  private tier: MemberTier
  private quota: UserQuotaData
  private settings: {
    guestReadLimit: number
    monthlyDailyLimit: number
    referralBonusCount: number
    referralDailyBonus: number
  }
  private articleRequires: 'free' | 'monthly' | 'yearly' | 'notes'
  private articleCount: number | undefined
  private freeLimit: number | undefined
  private monthlyLimit: number | undefined

  constructor(options: {
    tier: MemberTier
    quota: UserQuotaData
    articleRequires?: 'free' | 'monthly' | 'yearly' | 'notes'
    articleCount?: number
    freeLimit?: number
    monthlyLimit?: number
    guestReadLimit?: number
    monthlyDailyLimit?: number
    referralBonusCount?: number
    referralDailyBonus?: number
  }) {
    this.tier = options.tier
    this.quota = options.quota
    this.settings = {
      guestReadLimit: options.guestReadLimit ?? DEFAULT_QUOTA.GUEST_READ_LIMIT,
      monthlyDailyLimit: options.monthlyDailyLimit ?? DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
      referralBonusCount: options.referralBonusCount ?? DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      referralDailyBonus: options.referralDailyBonus ?? DEFAULT_QUOTA.REFERRAL_DAILY_BONUS,
    }
    this.articleRequires = options.articleRequires ?? 'free'
    this.articleCount = options.articleCount
    this.freeLimit = options.freeLimit
    this.monthlyLimit = options.monthlyLimit
  }

  /**
   * 执行配额计算。
   * 返回完整的 QuotaResult，所有组件使用此结果判断是否允许阅读。
   */
  calculate(): QuotaResult {
    const unlimited = isUnlimitedTier(this.tier)
    const paid = isPaidTier(this.tier)

    // ── 1. 内容权限检查 ─────────────────────────────────────────────
    let hasContentPermission = true
    let reason: QuotaResult['reason'] = 'none'

    if (this.tier === MEMBER_TIERS.NONE) {
      if (this.articleRequires === 'yearly') {
        hasContentPermission = false
        reason = 'yearly_required'
      } else if (this.articleRequires === 'monthly') {
        hasContentPermission = false
        reason = 'membership_required'
      }
    } else if (this.tier === MEMBER_TIERS.MONTHLY) {
      if (this.articleRequires === 'yearly') {
        hasContentPermission = false
        reason = 'yearly_required'
      }
    }

    // ── 2. 配额计算 ─────────────────────────────────────────────────
    let totalLimit: number
    let dailyLimit: number
    let bonusCount: number
    let dailyBonusCount: number

    if (unlimited) {
      // 年卡/永久：无限制
      totalLimit = Infinity
      dailyLimit = Infinity
      bonusCount = Infinity
      dailyBonusCount = Infinity
    } else if (this.tier === MEMBER_TIERS.MONTHLY) {
      // 月卡：无终身总限制，但有每日限制
      totalLimit = Infinity
      dailyLimit = (this.monthlyLimit ?? this.settings.monthlyDailyLimit) + this.quota.dailyBonusCount
      bonusCount = Infinity
      dailyBonusCount = this.quota.dailyBonusCount
    } else {
      // 免费用户：总限制 = 免费配额 + 邀请奖励
      totalLimit = (this.freeLimit ?? this.settings.guestReadLimit) + this.quota.bonusCount
      dailyLimit = Infinity // 免费用户无每日限制（受总限制约束）
      bonusCount = this.quota.bonusCount
      dailyBonusCount = 0
    }

    const totalReadCount = this.quota.totalReadCount
    const dailyReadCount = this.quota.dailyReadCount

    // ── 3. 超限判断 ─────────────────────────────────────────────────
    let isOverLimit = false

    if (this.articleRequires === 'notes' && this.articleCount !== undefined) {
      // notes 权限：按篇数判断
      if (this.tier === MEMBER_TIERS.NONE) {
        // 免费用户：总篇数 >= 上限
        isOverLimit = this.articleCount >= totalLimit
        if (isOverLimit) reason = 'quota_exhausted'
      } else if (this.tier === MEMBER_TIERS.MONTHLY) {
        // 月卡：今日篇数 >= 每日上限（包括等于的情况）
        isOverLimit = this.articleCount >= dailyLimit
        if (isOverLimit) reason = 'daily_limit'
      }
      // 年卡不超限（totalLimit=Infinity）
    } else {
      // 其它权限（stocks 等）：布尔判断
      isOverLimit = !hasContentPermission
      if (isOverLimit && reason === 'none') reason = 'membership_required'
    }

    // ── 4. 剩余次数 ───────────────────────────────────────────────
    const totalRemaining = totalLimit === Infinity ? Infinity : Math.max(0, totalLimit - totalReadCount)
    const dailyRemaining = dailyLimit === Infinity ? Infinity : Math.max(0, dailyLimit - dailyReadCount)

    // ── 5. 综合判断 ────────────────────────────────────────────────
    const canRead = hasContentPermission && !isOverLimit

    return {
      canRead,
      hasContentPermission,
      isOverLimit,
      totalReadCount,
      dailyReadCount,
      totalLimit,
      dailyLimit,
      totalRemaining,
      dailyRemaining,
      bonusCount,
      dailyBonusCount,
      reason: reason === 'none' && isOverLimit ? 'quota_exhausted' : reason,
      isUnlimited: unlimited,
      tier: this.tier,
    }
  }
}

/**
 * 快捷函数：基于会员等级和配额数据计算配额结果。
 * 推荐所有配额检查场景使用此函数。
 *
 * @example
 *   const result = calculateQuota({
 *     tier: 'monthly',
 *     quota: { totalReadCount: 5, dailyReadCount: 2, ... },
 *     settings: { monthlyDailyLimit: 8 },
 *     articleRequires: 'notes',
 *     articleCount: 3,
 *   })
 *   if (!result.canRead) showPaywall()
 */
export function calculateQuota(options: {
  tier: MemberTier
  quota: UserQuotaData
  articleRequires?: 'free' | 'monthly' | 'yearly' | 'notes'
  articleCount?: number
  freeLimit?: number
  monthlyLimit?: number
  guestReadLimit?: number
  monthlyDailyLimit?: number
  referralBonusCount?: number
  referralDailyBonus?: number
}): QuotaResult {
  return new QuotaCalculator(options).calculate()
}

/**
 * 从配额结果生成 WechatGuideOverlay 的 mode。
 */
export function quotaResultToOverlayMode(
  result: QuotaResult,
  isLoggedIn: boolean
): 'require_login' | 'quota_exhausted' | 'membership_required' | 'daily_limit_exceeded' | 'free_monthly_card' | null {
  if (!isLoggedIn) return 'require_login'
  if (!result.hasContentPermission) {
    return result.reason === 'yearly_required' ? 'membership_required' : 'membership_required'
  }
  if (result.isOverLimit) {
    if (result.reason === 'daily_limit') return 'daily_limit_exceeded'
    return 'quota_exhausted'
  }
  return null
}
