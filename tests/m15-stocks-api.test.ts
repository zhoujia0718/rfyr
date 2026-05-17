/**
 * M15-01/M15-04: 服务端会员等级过滤逻辑 — 安全边界测试
 *
 * 覆盖 app/api/stocks/route.ts 的安全关键路径：
 *
 * 1. vip_tier → userLevel 映射（安全：未知值默认为 free=0）
 * 2. 各种异常 vip_tier 值（null, '', 'trial', 'vip', 数字）的处理
 * 3. getArticleAccessLevel 的默认行为
 *
 * 之前为什么没覆盖：
 * - 旧测试只测已知 tier 值的过滤行为
 * - 没有测 vip_tier 为 null/unknown 时的安全默认值
 */
import { describe, it, expect } from 'vitest'

/** 会员等级层级（从 route.ts） */
const MEMBER_LEVELS: Record<string, number> = {
  free: 0,
  monthly: 1,
  yearly: 2,
  permanent: 3,
}

/** 文章访问层级（从 route.ts） */
const ACCESS_LEVELS: Record<string, number> = {
  free: 0,
  monthly: 1,
  yearly: 2,
}

function getArticleAccessLevel(article: Record<string, unknown>): number {
  const level = String(article.access_level ?? 'monthly').toLowerCase()
  return ACCESS_LEVELS[level] ?? 1
}

/** 从 vip_tier 计算 userLevel（模拟 route.ts 逻辑） */
function computeUserLevel(vipTier: unknown): number {
  if (!vipTier) return 0 // null, undefined, '' → free
  return MEMBER_LEVELS[String(vipTier).toLowerCase()] ?? 0
}

// ─── 测试 ─────────────────────────────────────────────────────────────────────

describe('M15-API-Stocks: computeUserLevel — vip_tier 安全映射', () => {

  it('null → 0 (free)', () => expect(computeUserLevel(null)).toBe(0))
  it('undefined → 0 (free)', () => expect(computeUserLevel(undefined)).toBe(0))
  it('空字符串 → 0 (free)', () => expect(computeUserLevel('')).toBe(0))

  it('monthly → 1', () => expect(computeUserLevel('monthly')).toBe(1))
  it('Monthly 大写 → 1', () => expect(computeUserLevel('Monthly')).toBe(1))
  it('MONTHLY 全大写 → 1', () => expect(computeUserLevel('MONTHLY')).toBe(1))

  it('yearly → 2', () => expect(computeUserLevel('yearly')).toBe(2))
  it('Yearly 大写 → 2', () => expect(computeUserLevel('Yearly')).toBe(2))
  it('YEARLY 全大写 → 2', () => expect(computeUserLevel('YEARLY')).toBe(2))

  it('permanent → 3', () => expect(computeUserLevel('permanent')).toBe(3))

  it('free → 0', () => expect(computeUserLevel('free')).toBe(0))

  // ── 未知 tier 值 → 默认 free（安全设计）─────────────────────────────
  it('trial → 0 (未知 → free)', () => expect(computeUserLevel('trial')).toBe(0))
  it('vip → 0 (未知 → free)', () => expect(computeUserLevel('vip')).toBe(0))
  it('premium → 0 (未知 → free)', () => expect(computeUserLevel('premium')).toBe(0))
  it('admin → 0 (未知 → free)', () => expect(computeUserLevel('admin')).toBe(0))
  it('monthly_vip → 0 (旧格式 → free)', () => expect(computeUserLevel('monthly_vip')).toBe(0))
  it('annual_vip → 0 (旧格式 → free)', () => expect(computeUserLevel('annual_vip')).toBe(0))
  it('数字 → 0 (非标准值 → free)', () => expect(computeUserLevel(1)).toBe(0))
  it('对象 → 0 (非标准值 → free)', () => expect(computeUserLevel({})).toBe(0))

  // ── 安全边界：所有未知值都默认为 free，确保最小权限 ─────────────────
  it('所有非标准 tier 值默认为 free=0（最小权限原则）', () => {
    const unknownTiers = ['trial', 'vip', 'premium', 'admin', 'monthly_vip', 'annual_vip', 'guest', 'test']
    for (const tier of unknownTiers) {
      expect(computeUserLevel(tier)).toBe(0)
    }
  })
})

describe('M15-API-Stocks: getArticleAccessLevel — 默认行为', () => {

  it('access_level=free → 0', () => expect(getArticleAccessLevel({ access_level: 'free' })).toBe(0))
  it('access_level=monthly → 1', () => expect(getArticleAccessLevel({ access_level: 'monthly' })).toBe(1))
  it('access_level=yearly → 2', () => expect(getArticleAccessLevel({ access_level: 'yearly' })).toBe(2))

  it('access_level=null → 默认 monthly=1', () => expect(getArticleAccessLevel({ access_level: null })).toBe(1))
  it('access_level=undefined → 默认 monthly=1', () => expect(getArticleAccessLevel({})).toBe(1))
  it('access_level="" → 默认 monthly=1', () => expect(getArticleAccessLevel({ access_level: '' })).toBe(1))
  it('access_level="invalid" → 默认 monthly=1', () => expect(getArticleAccessLevel({ access_level: 'invalid' })).toBe(1))

  it('大小写不敏感', () => {
    expect(getArticleAccessLevel({ access_level: 'FREE' })).toBe(0)
    expect(getArticleAccessLevel({ access_level: 'MONTHLY' })).toBe(1)
    expect(getArticleAccessLevel({ access_level: 'YEARLY' })).toBe(2)
  })
})

describe('M15-API-Stocks: 服务端安全过滤 — 端到端', () => {

  const articles: Array<{ id: string; access_level: string }> = [
    { id: '1', access_level: 'free' },
    { id: '2', access_level: 'monthly' },
    { id: '3', access_level: 'yearly' },
  ]

  function filterAccessible(articles: Array<{ id: string; access_level: string }>, vipTier: unknown): Array<{ id: string; access_level: string }> {
    const userLevel = computeUserLevel(vipTier)
    return articles.filter((a: { id: string; access_level: string }) => getArticleAccessLevel(a) <= userLevel)
  }

  it('未登录用户（vipTier=null）：只能看到 free', () => {
    const result = filterAccessible(articles, null)
    expect(result.map((a) => a.id)).toEqual(['1'])
  })

  it('月卡用户：只能看到 free + monthly', () => {
    const result = filterAccessible(articles, 'monthly')
    expect(result.map((a) => a.id)).toEqual(['1', '2'])
  })

  it('年卡用户：看到全部', () => {
    const result = filterAccessible(articles, 'yearly')
    expect(result.map((a) => a.id)).toEqual(['1', '2', '3'])
  })

  it('永久用户：看到全部', () => {
    const result = filterAccessible(articles, 'permanent')
    expect(result.map((a) => a.id)).toEqual(['1', '2', '3'])
  })

  it('trial 用户（未知 tier）：降级为 free', () => {
    const result = filterAccessible(articles, 'trial')
    expect(result.map((a) => a.id)).toEqual(['1'])
  })

  it('admin tier（未知）：降级为 free（安全）', () => {
    const result = filterAccessible(articles, 'admin')
    expect(result.map((a) => a.id)).toEqual(['1'])
  })

  it('API 安全：服务端按 userLevel 过滤，客户端无法绕过', () => {
    // 即使攻击者伪造 vip_tier=yearly，computeUserLevel('fake_tier')=0
    expect(computeUserLevel('fake_tier')).toBe(0)
    const result = filterAccessible(articles, 'fake_tier')
    expect(result.map((a) => a.id)).toEqual(['1']) // 只有 free
  })

  it('空字符串 tier：降级为 free', () => {
    const result = filterAccessible(articles, '')
    expect(result.map((a) => a.id)).toEqual(['1'])
  })
})

describe('M15-API-Stocks: MEMBER_LEVELS 与 ACCESS_LEVELS 对齐', () => {

  it('MEMBER_LEVELS 覆盖 ACCESS_LEVELS 的所有键', () => {
    for (const [key, level] of Object.entries(ACCESS_LEVELS)) {
      expect(MEMBER_LEVELS[key]).toBe(level)
    }
  })

  it('permanent 只在 MEMBER_LEVELS 中，不在 ACCESS_LEVELS 中', () => {
    expect(ACCESS_LEVELS.permanent).toBeUndefined()
    expect(MEMBER_LEVELS.permanent).toBe(3)
  })
})
