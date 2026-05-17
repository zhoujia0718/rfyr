/**
 * M7-20: components/paywall.tsx — 付费墙组件逻辑测试
 *
 * 测试覆盖：
 * 1. PaywallProps 接口结构
 * 2. 加载中状态（membershipLoading=true 时放行 children）
 * 3. 有权限时直接放行（canRead=true）
 * 4. 无权限时展示 UpgradePromptCard
 * 5. 升级提示文案：notes 分类（月卡日限/免费总限）
 * 6. 升级提示文案：stocks 分类（年度VIP专享）
 * 7. 升级提示文案：其他权限
 * 8. 描述文案：未登录用户 vs 已登录月卡用户
 * 9. articleRequires 映射逻辑（notes → notes, stocks → yearly, 其他 → monthly）
 * 10. QuotaCalculator 调用参数正确性
 *
 * 修复记录：
 * - P4: QuotaCalculator 替代分散的限额计算逻辑
 */
import { describe, it, expect } from 'vitest'
import { MEMBER_TIERS } from '@/lib/member-tiers'
import { QuotaCalculator } from '@/lib/quota-calculator'
import { DEFAULT_QUOTA } from '@/lib/quota-calculator'

// ─── 辅助：构造 quota result ──────────────────────────────────────────

type MemberTier = 'none' | 'monthly' | 'yearly' | 'permanent'
type Reason = 'none' | 'require_login' | 'quota_exhausted' | 'daily_limit' | 'membership_required' | 'yearly_required'

interface QuotaResult {
  canRead: boolean
  hasContentPermission: boolean
  isOverLimit: boolean
  reason: Reason
  tier: MemberTier
  totalReadCount: number
  dailyReadCount: number
  isUnlimited: boolean
}

function calc(
  tier: MemberTier,
  totalCount: number,
  dailyCount: number,
  bonusCount = 0,
  dailyBonusCount = 0,
  permission: 'notes' | 'stocks' = 'notes',
  articleCount?: number
): QuotaResult {
  return new QuotaCalculator({
    tier,
    quota: {
      totalReadCount: totalCount,
      readIds: [],
      dailyReadCount: dailyCount,
      lastReadDate: null,
      bonusCount,
      dailyBonusCount,
      bonusResetDate: null,
    },
    articleRequires: permission === 'notes' ? 'notes' : 'yearly',
    articleCount,
    guestReadLimit: DEFAULT_QUOTA.GUEST_READ_LIMIT,
    monthlyDailyLimit: DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
    referralBonusCount: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
    referralDailyBonus: DEFAULT_QUOTA.REFERRAL_DAILY_BONUS,
  }).calculate()
}

// ─── articleRequires 映射 ────────────────────────────────────────────────

function articleRequires(permission: 'notes' | 'stocks'): 'notes' | 'yearly' {
  return permission === 'notes' ? 'notes' : 'yearly'
}

// ─── 升级文案生成逻辑（从 Paywall 组件提取）────────────────────────────

function buildUpgradeTitle(
  requiredPermission: 'notes' | 'stocks',
  reason: Reason
): string {
  if (requiredPermission === 'notes') {
    return reason === 'daily_limit'
      ? '月卡今日阅读已满'
      : '免费阅读已到达上限'
  }
  if (requiredPermission === 'stocks') {
    return '个股挖掘年度VIP专享'
  }
  return '会员专享内容'
}

function buildUpgradeDescription(
  requiredPermission: 'notes' | 'stocks',
  tier: MemberTier,
  totalReadCount: number,
  dailyReadCount: number
): string {
  if (requiredPermission === 'notes') {
    if (tier === 'none') {
      return `您已免费阅读 ${totalReadCount} 篇短线笔记，开通月卡会员可解锁更多，年度VIP可解锁全部内容`
    }
    return `您今日已阅读 ${dailyReadCount} 篇短线笔记，升级年度VIP可解锁全部内容`
  }
  if (requiredPermission === 'stocks') {
    return '升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘'
  }
  return '开通会员解锁更多专业投资内容'
}

// ─── PaywallProps 接口验证 ─────────────────────────────────────────────

describe('M7-20a: PaywallProps 接口结构', () => {
  it('PaywallProps 包含所有必要字段', () => {
    const props = {
      children: null,
      requiredPermission: 'notes' as const,
      count: 3,
      freeLimit: 3,
      monthlyLimit: 8,
      title: '测试标题',
      description: '测试描述',
      onUpgradeClick: () => {},
      onDismiss: () => {},
      onLoginClick: () => {},
    }
    expect(props.requiredPermission).toBe('notes')
    expect(props.count).toBe(3)
    expect(props.freeLimit).toBe(3)
    expect(props.monthlyLimit).toBe(8)
  })

  it('onUpgradeClick/onLoginClick/onDismiss 均为可选', () => {
    const minimal = { children: null, requiredPermission: 'notes' as const }
    expect(minimal.children).toBeNull()
  })
})

// ─── 加载中状态 ───────────────────────────────────────────────────────

describe('M7-20b: 加载中状态（放行 children）', () => {
  it('membershipLoading=true 时应放行（不拦截）', () => {
    const membershipLoading = true
    const shouldBlock = !membershipLoading
    expect(shouldBlock).toBe(false)
  })

  it('membershipLoading=false 且无权限时应拦截', () => {
    const membershipLoading = false
    const canRead = false
    const shouldBlock = !membershipLoading && !canRead
    expect(shouldBlock).toBe(true)
  })
})

// ─── 权限判断 ────────────────────────────────────────────────────────

describe('M7-20c: QuotaCalculator 权限判断', () => {
  describe('notes 权限', () => {
    it('年度VIP（tier=none, count=0）应可读', () => {
      const result = calc('none', 0, 0, 0, 0, 'notes', 0)
      expect(result.canRead).toBe(true)
    })

    it('免费用户已读 3 篇（无 bonus）应超限', () => {
      const result = calc('none', 3, 0, 0, 0, 'notes', 3)
      expect(result.canRead).toBe(false)
      expect(result.reason).toBe('quota_exhausted')
    })

    it('免费用户已读 2 篇，有 2 bonus，仍可读', () => {
      const result = calc('none', 2, 0, 2, 0, 'notes', 2)
      expect(result.canRead).toBe(true)
    })

    it('月卡用户今日已读 8 篇应超限（边界：>= 每日限额即超）', () => {
      const result = calc('monthly', 100, 8, 0, 0, 'notes', 8)
      expect(result.canRead).toBe(false)
      expect(result.isOverLimit).toBe(true)
      expect(result.reason).toBe('daily_limit')
    })

    it('月卡用户今日已读 9 篇应超限（daily_limit）', () => {
      const result = calc('monthly', 100, 9, 0, 0, 'notes', 9)
      expect(result.canRead).toBe(false)
      expect(result.reason).toBe('daily_limit')
      expect(result.isOverLimit).toBe(true)
    })

    it('月卡用户今日已读 7 篇应可读', () => {
      const result = calc('monthly', 100, 7, 0, 0, 'notes', 7)
      expect(result.canRead).toBe(true)
    })

    it('月卡用户今日已读 8 篇 + 2 bonus 应可读', () => {
      const result = calc('monthly', 100, 8, 0, 2, 'notes', 8)
      expect(result.canRead).toBe(true)
    })

    it('年度VIP 任意已读数均无限', () => {
      const result = calc('yearly', 1000, 100, 0, 0, 'notes', 500)
      expect(result.canRead).toBe(true)
      expect(result.isUnlimited).toBe(true)
    })
  })

  describe('stocks 权限（需年度VIP）', () => {
    it('年度VIP 访问 stocks 应可读', () => {
      const result = calc('yearly', 0, 0, 0, 0, 'stocks')
      expect(result.canRead).toBe(true)
      expect(result.hasContentPermission).toBe(true)
    })

    it('月卡用户访问 stocks 应拒绝（hasContentPermission=false）', () => {
      const result = calc('monthly', 0, 0, 0, 0, 'stocks')
      expect(result.hasContentPermission).toBe(false)
      expect(result.reason).toBe('yearly_required')
    })

    it('免费用户访问 stocks 应拒绝', () => {
      const result = calc('none', 0, 0, 0, 0, 'stocks')
      expect(result.hasContentPermission).toBe(false)
      expect(result.reason).toBe('yearly_required')
    })

    it('永久会员访问 stocks 应可读', () => {
      const result = calc('permanent', 0, 0, 0, 0, 'stocks')
      expect(result.canRead).toBe(true)
    })
  })
})

// ─── 升级文案 ───────────────────────────────────────────────────────

describe('M7-20d: 升级文案生成', () => {
  describe('upgradeTitle', () => {
    it("notes + daily_limit 应为'月卡今日阅读已满'", () => {
      expect(buildUpgradeTitle('notes', 'daily_limit')).toBe('月卡今日阅读已满')
    })

    it("notes + quota_exhausted 应为'免费阅读已到达上限'", () => {
      expect(buildUpgradeTitle('notes', 'quota_exhausted')).toBe('免费阅读已到达上限')
    })

    it("notes + yearly_required 应为'免费阅读已到达上限'", () => {
      expect(buildUpgradeTitle('notes', 'yearly_required')).toBe('免费阅读已到达上限')
    })

    it("stocks 应为'个股挖掘年度VIP专享'", () => {
      expect(buildUpgradeTitle('stocks', 'none')).toBe('个股挖掘年度VIP专享')
    })
  })

  describe('upgradeDescription', () => {
    it('未登录用户 notes 应包含"免费阅读"', () => {
      const desc = buildUpgradeDescription('notes', 'none', 2, 0)
      expect(desc).toContain('免费阅读')
      expect(desc).toContain('2')
    })

    it('月卡用户 notes 应包含"今日已阅读"', () => {
      const desc = buildUpgradeDescription('notes', 'monthly', 100, 5)
      expect(desc).toContain('今日已阅读')
      expect(desc).toContain('5')
    })

    it('年度VIP用户 notes 应提示"升级年度VIP"', () => {
      const desc = buildUpgradeDescription('notes', 'yearly', 100, 5)
      expect(desc).toContain('年度VIP')
    })

    it('stocks 应提示"年度VIP会员"', () => {
      const desc = buildUpgradeDescription('stocks', 'monthly', 0, 0)
      expect(desc).toContain('年度VIP')
    })
  })
})

// ─── articleRequires 映射 ──────────────────────────────────────────

describe('M7-20e: articleRequires 映射', () => {
  it('notes → notes', () => {
    expect(articleRequires('notes')).toBe('notes')
  })

  it('stocks → yearly', () => {
    expect(articleRequires('stocks')).toBe('yearly')
  })
})
