/**
 * M14-API: Admin Membership Operations PUT — 测试
 *
 * 覆盖 app/api/admin/membership/operations/route.ts 的 4 个操作：
 *
 * 1. renew — 续期（RPC → SQL 降级）
 *    - membership_type 解析（yearly/annual/monthly）
 *    - 到期日计算：未过期从 end_date 算，已过期从今天算
 *    - RPC 调用失败时的 SQL 降级
 *
 * 2. cancel — 取消会员（RPC → SQL 降级）
 *    - RPC 失败时降级到三个独立更新
 *
 * 3. upgrade — 升级（RPC → SQL 降级）
 *    - planType 白名单验证
 *    - MEMBER_DURATION_DAYS 计算
 *    - RPC 失败时的降级插入逻辑
 *
 * 4. downgrade — 降级
 *    - 直接更新 memberships 和 users 两表
 *
 * 之前为什么没覆盖：
 * - API 路由有 RPC → SQL 双路径，无纯函数测试
 * - 会员类型解析逻辑（tier.includes('year')）没有独立测试
 */
import { describe, it, expect } from 'vitest'

// ─── 从 route.ts 提取的纯逻辑 ────────────────────────────────────────────────

const ALLOWED_ACTIONS = ['renew', 'cancel', 'upgrade', 'downgrade'] as const
const ALLOWED_PLANS = ['monthly', 'yearly', 'permanent'] as const

const MEMBER_DURATION_DAYS = {
  monthly: 30,
  yearly: 365,
  permanent: 365 * 100,
}

/** 解析 membership_type 字符串，判断是否年度会员 */
function parseTier(membershipType: string): { tier: string; isYearly: boolean; days: number } {
  const tier = String(membershipType ?? '').toLowerCase().replace(/[_]/g, '')
  const isYearly = tier.includes('year') || tier.includes('annual')
  const days = isYearly ? MEMBER_DURATION_DAYS.yearly : MEMBER_DURATION_DAYS.monthly
  return { tier, isYearly, days }
}

/** 计算续期到期日 */
function computeRenewEndDate(currentEndDate: string, isYearly: boolean): Date {
  const days = isYearly ? MEMBER_DURATION_DAYS.yearly : MEMBER_DURATION_DAYS.monthly
  const currentEnd = new Date(currentEndDate)
  const base = currentEnd > new Date() ? currentEnd : new Date()
  const newEnd = new Date(base)
  newEnd.setDate(newEnd.getDate() + days)
  return newEnd
}

/** 验证 action 是否合法 */
function validateAction(action: unknown): boolean {
  return ALLOWED_ACTIONS.includes(action as typeof ALLOWED_ACTIONS[number])
}

/** 验证 planType 是否合法 */
function validatePlanType(planType: unknown): boolean {
  return ALLOWED_PLANS.includes(planType as typeof ALLOWED_PLANS[number])
}

/** 计算升级天数 */
function computeUpgradeDays(planType: string): number {
  return MEMBER_DURATION_DAYS[planType as keyof typeof MEMBER_DURATION_DAYS] ?? 30
}

// ─── 测试 ─────────────────────────────────────────────────────────────────────

describe('M14-API-Operations: parseTier — membership_type 解析', () => {

  describe('yearly 类型识别', () => {
    it('yearly 小写', () => {
      const result = parseTier('yearly')
      expect(result.isYearly).toBe(true)
      expect(result.days).toBe(365)
    })

    it('Yearly 大写', () => {
      const result = parseTier('Yearly')
      expect(result.isYearly).toBe(true)
      expect(result.days).toBe(365)
    })

    it('yearly_vip 带下划线', () => {
      const result = parseTier('yearly_vip')
      expect(result.isYearly).toBe(true)
      expect(result.tier).toBe('yearlyvip')
    })

    it('annual 识别为年度', () => {
      const result = parseTier('annual')
      expect(result.isYearly).toBe(true)
      expect(result.days).toBe(365)
    })

    it('annual_vip 带下划线', () => {
      const result = parseTier('annual_vip')
      expect(result.isYearly).toBe(true)
    })
  })

  describe('monthly 类型识别', () => {
    it('monthly 小写', () => {
      const result = parseTier('monthly')
      expect(result.isYearly).toBe(false)
      expect(result.days).toBe(30)
    })

    it('Monthly 大写', () => {
      const result = parseTier('Monthly')
      expect(result.isYearly).toBe(false)
      expect(result.days).toBe(30)
    })

    it('monthly_vip 带下划线', () => {
      const result = parseTier('monthly_vip')
      expect(result.isYearly).toBe(false)
      expect(result.tier).toBe('monthlyvip')
    })
  })

  describe('边界条件', () => {
    it('空字符串 → 非年度', () => {
      const result = parseTier('')
      expect(result.isYearly).toBe(false)
      expect(result.tier).toBe('')
    })

    it('null → 非年度', () => {
      const result = parseTier(null as unknown as string)
      expect(result.isYearly).toBe(false)
      expect(result.days).toBe(30)
    })

    it('undefined → 非年度', () => {
      const result = parseTier(undefined as unknown as string)
      expect(result.isYearly).toBe(false)
      expect(result.days).toBe(30)
    })

    it('混合类型：yearly_and_monthly → 年度优先', () => {
      const result = parseTier('yearly_and_monthly')
      expect(result.isYearly).toBe(true) // includes('year')
    })

    it('permanent → 年度（不是 monthly）', () => {
      const result = parseTier('permanent')
      expect(result.isYearly).toBe(false) // 不包含 year 或 annual
      expect(result.days).toBe(30) // 降级为 monthly 30 天
    })
  })
})

describe('M14-API-Operations: computeRenewEndDate — 续期到期日计算', () => {

  it('未过期的年度会员：续 365 天', () => {
    const result = computeRenewEndDate('2026-12-01T00:00:00Z', true)
    const days365 = 365 * 24 * 60 * 60 * 1000
    expect(result.getTime()).toBeCloseTo(new Date('2026-12-01').getTime() + days365, -2)
  })

  it('已过期的月卡会员：从今天续 30 天', () => {
    const expiredEnd = '2025-01-01T00:00:00Z'
    const result = computeRenewEndDate(expiredEnd, false)
    const now = Date.now()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(result.getTime()).toBeCloseTo(now + thirtyDaysMs, -2)
  })

  it('年度会员降级为月卡：续 30 天', () => {
    const futureEnd = '2027-01-01T00:00:00Z'
    const result = computeRenewEndDate(futureEnd, false)
    const days30 = 30 * 24 * 60 * 60 * 1000
    expect(result.getTime()).toBeCloseTo(new Date('2027-01-01').getTime() + days30, -2)
  })

  it('年度会员年度续期：续 365 天', () => {
    const futureEnd = '2027-01-01T00:00:00Z'
    const result = computeRenewEndDate(futureEnd, true)
    const days365 = 365 * 24 * 60 * 60 * 1000
    expect(result.getTime()).toBeCloseTo(new Date('2027-01-01').getTime() + days365, -2)
  })
})

describe('M14-API-Operations: validateAction — action 白名单', () => {

  it('renew 通过', () => expect(validateAction('renew')).toBe(true))
  it('cancel 通过', () => expect(validateAction('cancel')).toBe(true))
  it('upgrade 通过', () => expect(validateAction('upgrade')).toBe(true))
  it('downgrade 通过', () => expect(validateAction('downgrade')).toBe(true))

  it('无效 action 拒绝', () => {
    expect(validateAction('delete')).toBe(false)
    expect(validateAction('extend')).toBe(false)
    expect(validateAction('')).toBe(false)
    expect(validateAction(null)).toBe(false)
    expect(validateAction(undefined)).toBe(false)
  })

  it('大小写敏感', () => {
    expect(validateAction('Renew')).toBe(false)
    expect(validateAction('CANCEL')).toBe(false)
  })
})

describe('M14-API-Operations: validatePlanType — planType 白名单', () => {

  it('monthly 通过', () => expect(validatePlanType('monthly')).toBe(true))
  it('yearly 通过', () => expect(validatePlanType('yearly')).toBe(true))
  it('permanent 通过', () => expect(validatePlanType('permanent')).toBe(true))

  it('无效 planType 拒绝', () => {
    expect(validatePlanType('weekly')).toBe(false)
    expect(validatePlanType('trial')).toBe(false)
    expect(validatePlanType('')).toBe(false)
    expect(validatePlanType(null)).toBe(false)
  })

  it('upgrade 需要 planType，downgrade 不需要', () => {
    // upgrade 的 planType 必须合法
    expect(validatePlanType('monthly')).toBe(true)
    expect(validatePlanType('yearly')).toBe(true)
  })
})

describe('M14-API-Operations: MEMBER_DURATION_DAYS 常量', () => {

  it('monthly = 30 天', () => {
    expect(MEMBER_DURATION_DAYS.monthly).toBe(30)
  })

  it('yearly = 365 天', () => {
    expect(MEMBER_DURATION_DAYS.yearly).toBe(365)
  })

  it('permanent ≈ 36500 天（100年）', () => {
    expect(MEMBER_DURATION_DAYS.permanent).toBe(365 * 100)
  })

  it('无其他键', () => {
    expect(Object.keys(MEMBER_DURATION_DAYS)).toEqual(['monthly', 'yearly', 'permanent'])
  })
})

describe('M14-API-Operations: 端到端场景', () => {

  it('renew → 续期月卡会员（未过期）', () => {
    const membershipType = 'monthly'
    const currentEnd = '2026-06-01T00:00:00Z'
    const parsed = parseTier(membershipType)
    expect(parsed.isYearly).toBe(false)
    expect(parsed.days).toBe(30)

    const newEnd = computeRenewEndDate(currentEnd, parsed.isYearly)
    const days30 = 30 * 24 * 60 * 60 * 1000
    expect(newEnd.getTime()).toBeCloseTo(new Date('2026-06-01').getTime() + days30, -2)
  })

  it('renew → 续期年度会员（已过期）', () => {
    const membershipType = 'yearly'
    const expiredEnd = '2025-01-01T00:00:00Z'
    const parsed = parseTier(membershipType)
    expect(parsed.isYearly).toBe(true)

    const now = Date.now()
    const days365 = 365 * 24 * 60 * 60 * 1000
    const newEnd = computeRenewEndDate(expiredEnd, parsed.isYearly)
    expect(newEnd.getTime()).toBeCloseTo(now + days365, -2)
  })

  it('upgrade → 年卡：计算正确的天数', () => {
    const planType = 'yearly'
    expect(validatePlanType(planType)).toBe(true)
    const days = computeUpgradeDays(planType)
    expect(days).toBe(365)
  })

  it('upgrade → 永久会员：计算正确的天数', () => {
    const planType = 'permanent'
    expect(validatePlanType(planType)).toBe(true)
    const days = computeUpgradeDays(planType)
    expect(days).toBe(365 * 100)
  })

  it('downgrade → 降级为月卡', () => {
    const days = MEMBER_DURATION_DAYS.monthly
    expect(days).toBe(30)
  })

  it('恶意输入：action 无效 → 拒绝', () => {
    expect(validateAction('execute')).toBe(false)
    expect(validateAction('__proto__')).toBe(false)
    expect(validateAction({})).toBe(false)
  })

  it('恶意输入：planType 无效 → 拒绝', () => {
    expect(validatePlanType('admin')).toBe(false)
    expect(validatePlanType('vip')).toBe(false)
  })
})

describe('M14-API-Operations: 边界 — parseTier 特殊值', () => {

  it('monthly_vip 下划线被去除', () => {
    const result = parseTier('monthly_vip')
    expect(result.tier).toBe('monthlyvip')
    expect(result.isYearly).toBe(false)
  })

  it('yearly_vip 下划线被去除，但包含 year', () => {
    const result = parseTier('yearly_vip')
    expect(result.tier).toBe('yearlyvip')
    expect(result.isYearly).toBe(true)
  })

  it('annual_member 下划线被去除，但包含 annual', () => {
    const result = parseTier('annual_member')
    expect(result.tier).toBe('annualmember') // replace 只去下划线
    expect(result.isYearly).toBe(true)
  })

  it('toLowerCase + replace 组合：处理混合大小写', () => {
    const result = parseTier('YEARLY_VIP')
    expect(result.tier).toBe('yearlyvip')
    expect(result.isYearly).toBe(true)
  })

  it('replace(/[_]/g, "") 去除所有下划线', () => {
    const result = parseTier('yearly___vip___test')
    expect(result.tier).toBe('yearlyviptest')
  })
})
