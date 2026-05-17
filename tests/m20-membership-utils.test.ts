/**
 * ============================================================
 * Module 20: Membership Utils — Server-Side Test Suite
 * ============================================================
 *
 * Tests cover:
 *
 * 1. getMembershipInfo      — 获取用户会员信息
 * 2. isMembershipActive     — 判断会员记录是否有效
 * 3. 快捷检查函数
 *    - isMonthlyMember, isYearlyMember, isPermanentMember
 *    - isPaidMember, hasUnlimitedAccess
 *    - getAccessLevel, canAccess
 * 4. checkArticleAccess      — 文章访问权限检查
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MEMBER_TIERS, TIER_LEVEL } from '@/lib/member-tiers'

// ─── Test Constants ───────────────────────────────────────────────────────────

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ─── Mock Supabase ────────────────────────────────────────────────────────────

// Shared mutable state for the mock
let mockMembershipsData: any[] = []
let mockVipTier: string | null = null

const mockSupabaseAdmin = {
  from: vi.fn(),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}))

// ─── Import module ───────────────────────────────────────────────────────────

import {
  getMembershipInfo,
  isMonthlyMember,
  isYearlyMember,
  isPermanentMember,
  isPaidMember,
  hasUnlimitedAccess,
  getAccessLevel,
  canAccess,
  checkArticleAccess,
} from '@/lib/membership-utils'

// ─── Helper to setup mock ─────────────────────────────────────────────────────

function setupMock(memberships: any[], vipTier: string | null) {
  mockMembershipsData = memberships
  mockVipTier = vipTier

  // Filter to only active memberships (mimics the .eq('status', 'active') in the parallel query)
  const activeMemberships = mockMembershipsData.filter((m) => m.status === 'active')

  // Build the chain once for the memberships table
  // Both query patterns use this same chain:
  // Pattern A (getHighestMembershipTier): from→select→eq→eq→order→Promise
  // Pattern B (parallel query):            from→select→eq→eq→Promise
  const orderMock = vi.fn(() => Promise.resolve({ data: activeMemberships, error: null }))
  const eq2Mock = vi.fn(() => {
    // Return a thenable (Promise-like object) that also has .order() attached
    // This allows both patterns to work: await the result OR call .order()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = Promise.resolve({ data: activeMemberships, error: null }) as any
    result.order = orderMock
    return result
  })
  const eq1Mock = vi.fn(() => ({ eq: eq2Mock }))
  const selectMock = vi.fn(() => ({ eq: eq1Mock }))

  // Users chain
  const usersSingleMock = vi.fn(() =>
    Promise.resolve({
      data: mockVipTier ? { vip_tier: mockVipTier } : null,
      error: null,
    })
  )
  const usersEqMock = vi.fn(() => ({ single: usersSingleMock }))
  const usersSelectMock = vi.fn(() => ({ eq: usersEqMock }))

  mockSupabaseAdmin.from.mockImplementation((table: string) => {
    if (table === 'memberships') {
      return { select: selectMock }
    }
    if (table === 'users') {
      return { select: usersSelectMock }
    }
    return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: getMembershipInfo
// ══════════════════════════════════════════════════════════════════════════════

describe('getMembershipInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应返回 NONE tier 当用户无会员记录', async () => {
    setupMock([], null)
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.NONE)
    expect(info.isPaidMember).toBe(false)
    expect(info.isUnlimited).toBe(false)
  })

  it('应正确识别月卡会员', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
    expect(info.isMonthly).toBe(true)
    expect(info.isPaidMember).toBe(true)
    expect(info.isUnlimited).toBe(false)
  })

  it('应正确识别年卡会员', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.YEARLY)
    expect(info.isYearly).toBe(true)
    expect(info.isPaidMember).toBe(true)
    expect(info.isUnlimited).toBe(true)
  })

  it('应正确识别永久会员', async () => {
    const futureDate = new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'permanent', status: 'active', end_date: futureDate }], 'permanent')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.PERMANENT)
    expect(info.isPermanent).toBe(true)
    expect(info.isPaidMember).toBe(true)
    expect(info.isUnlimited).toBe(true)
  })

  it('应正确处理数据不一致情况', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'monthly')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.YEARLY)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('当 memberships 为空但 vip_tier 有效时应使用 vip_tier', async () => {
    setupMock([], 'yearly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.YEARLY)
  })

  it('应返回正确的 endDate', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.endDate).toBe(futureDate)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: isMembershipActive behavior
// ══════════════════════════════════════════════════════════════════════════════

describe('isMembershipActive behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已过期会员：当 vip_tier 有效时使用 vip_tier', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: pastDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
  })

  it('已过期会员且 vip_tier 无效时返回 NONE', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: pastDate }], null)
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.NONE)
  })

  it('status 非 active：当 vip_tier 有效时使用 vip_tier', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'expired', end_date: futureDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
  })

  it('status 非 active 且 vip_tier 无效时返回 NONE', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'expired', end_date: futureDate }], null)
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.NONE)
  })

  it('应支持旧命名兼容性（monthly_vip → monthly）', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly_vip', status: 'active', end_date: futureDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
    expect(info.isMonthly).toBe(true)
  })

  it('应支持旧命名兼容性（annual_vip → yearly）', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'annual_vip', status: 'active', end_date: futureDate }], 'yearly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.YEARLY)
    expect(info.isYearly).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Shortcut check functions
// ══════════════════════════════════════════════════════════════════════════════

describe('Shortcut check functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isMonthlyMember 应正确识别月卡会员', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    expect(await isMonthlyMember(TEST_USER_ID)).toBe(true)
  })

  it('isMonthlyMember 应返回 false 当用户无月卡', async () => {
    setupMock([], null)
    expect(await isMonthlyMember(TEST_USER_ID)).toBe(false)
  })

  it('isYearlyMember 应正确识别年卡会员', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    expect(await isYearlyMember(TEST_USER_ID)).toBe(true)
  })

  it('isYearlyMember 应返回 false 当用户无年卡', async () => {
    setupMock([], null)
    expect(await isYearlyMember(TEST_USER_ID)).toBe(false)
  })

  it('isPermanentMember 应正确识别永久会员', async () => {
    const futureDate = new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'permanent', status: 'active', end_date: futureDate }], 'permanent')
    expect(await isPermanentMember(TEST_USER_ID)).toBe(true)
  })

  it('isPermanentMember 应返回 false 当用户非永久会员', async () => {
    setupMock([], null)
    expect(await isPermanentMember(TEST_USER_ID)).toBe(false)
  })

  it('isPaidMember 应正确识别付费会员', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    expect(await isPaidMember(TEST_USER_ID)).toBe(true)
  })

  it('isPaidMember 应返回 false 当用户无付费会员', async () => {
    setupMock([], null)
    expect(await isPaidMember(TEST_USER_ID)).toBe(false)
  })

  it('hasUnlimitedAccess 应正确识别年卡及以上会员', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    expect(await hasUnlimitedAccess(TEST_USER_ID)).toBe(true)
  })

  it('hasUnlimitedAccess 应返回 false 当用户为月卡会员', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    expect(await hasUnlimitedAccess(TEST_USER_ID)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Access level functions
// ══════════════════════════════════════════════════════════════════════════════

describe('Access level functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAccessLevel 应返回正确的等级数值', async () => {
    setupMock([], 'none')
    expect(await getAccessLevel(TEST_USER_ID)).toBe(0)

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    expect(await getAccessLevel(TEST_USER_ID)).toBe(1)

    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    expect(await getAccessLevel(TEST_USER_ID)).toBe(2)
  })

  it('canAccess 应正确检查年卡会员的访问权限', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    expect(await canAccess(TEST_USER_ID, 'free')).toBe(true)
    expect(await canAccess(TEST_USER_ID, 'monthly')).toBe(true)
    expect(await canAccess(TEST_USER_ID, 'yearly')).toBe(true)
  })

  it('canAccess 应拒绝月卡会员访问年卡专属内容', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    expect(await canAccess(TEST_USER_ID, 'free')).toBe(true)
    expect(await canAccess(TEST_USER_ID, 'monthly')).toBe(true)
    expect(await canAccess(TEST_USER_ID, 'yearly')).toBe(false)
  })

  it('canAccess 应拒绝非会员访问付费内容', async () => {
    setupMock([], null)
    expect(await canAccess(TEST_USER_ID, 'free')).toBe(true)
    expect(await canAccess(TEST_USER_ID, 'monthly')).toBe(false)
    expect(await canAccess(TEST_USER_ID, 'yearly')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: checkArticleAccess
// ══════════════════════════════════════════════════════════════════════════════

describe('checkArticleAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('游客访问免费内容应允许', async () => {
    const result = await checkArticleAccess(null, 'free')
    expect(result.canAccess).toBe(true)
  })

  it('游客访问付费内容应拒绝并提示登录', async () => {
    const result = await checkArticleAccess(null, 'monthly')
    expect(result.canAccess).toBe(false)
    expect(result.reason).toBe('请先登录后阅读')
  })

  it('游客访问年卡专属内容应拒绝', async () => {
    const result = await checkArticleAccess(null, 'yearly')
    expect(result.canAccess).toBe(false)
  })

  it('月卡会员访问月卡内容应允许', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    const result = await checkArticleAccess(TEST_USER_ID, 'monthly')
    expect(result.canAccess).toBe(true)
  })

  it('月卡会员访问年卡专属内容应拒绝', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    const result = await checkArticleAccess(TEST_USER_ID, 'yearly')
    expect(result.canAccess).toBe(false)
  })

  it('年卡会员访问所有内容应允许', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'yearly', status: 'active', end_date: futureDate }], 'yearly')
    const result = await checkArticleAccess(TEST_USER_ID, 'yearly')
    expect(result.canAccess).toBe(true)
  })

  it('永久会员访问所有内容应允许', async () => {
    const futureDate = new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'permanent', status: 'active', end_date: futureDate }], 'permanent')
    const result = await checkArticleAccess(TEST_USER_ID, 'yearly')
    expect(result.canAccess).toBe(true)
  })

  it('应返回正确的 tier 信息', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: futureDate }], 'monthly')
    const result = await checkArticleAccess(TEST_USER_ID, 'free')
    expect(result.tier).toBe(MEMBER_TIERS.MONTHLY)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应处理 null end_date', async () => {
    setupMock([{ membership_type: 'monthly', status: 'active', end_date: null }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
    expect(info.endDate).toBeUndefined()
  })

  it('应处理 null membership_type', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([{ membership_type: null, status: 'active', end_date: futureDate }], 'monthly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.MONTHLY)
  })

  it('应正确处理多个月员记录并返回最高等级', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const futureYearDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    setupMock([
      { membership_type: 'monthly', status: 'active', end_date: futureDate },
      { membership_type: 'yearly', status: 'active', end_date: futureYearDate },
    ], 'yearly')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.YEARLY)
  })

  it('应处理空字符串的 vip_tier', async () => {
    setupMock([], '')
    const info = await getMembershipInfo(TEST_USER_ID)
    expect(info.tier).toBe(MEMBER_TIERS.NONE)
  })
})
