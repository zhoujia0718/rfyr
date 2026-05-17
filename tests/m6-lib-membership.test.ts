/**
 * Module 6 - lib/membership.ts 测试套件
 *
 * 测试覆盖：
 * 1. createMembership() - 创建会员记录
 * 2. parseMemberTier() - 会员类型解析
 * 3. isMembershipValid() - 会员有效性检查
 * 4. isValidMembershipType() - 类型守卫
 * 5. getMembershipLabel() - 显示名称
 * 6. hasAccess() - 权限检查
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { MEMBER_TIERS } from '../lib/member-tiers.ts'
import {
  createMembership,
  parseMemberTier,
  isMembershipValid,
  isValidMembershipType,
  getMembershipLabel,
  hasAccess,
// @ts-ignore
} from '../lib/membership.ts'

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString()
const pastDate = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString()

describe('M6-01: lib/membership.ts - createMembership()', () => {
  it('应正确创建 monthly 会员记录', () => {
    const info = createMembership(MEMBER_TIERS.MONTHLY)
    expect(info.type).toBe('monthly')
    expect(info.isActive).toBe(true)
    expect(new Date(info.startDate).getTime()).toBeLessThanOrEqual(Date.now())
    expect(new Date(info.endDate).getTime()).toBeGreaterThan(Date.now())
  })

  it('应正确创建 yearly 会员记录（自定义天数）', () => {
    const info = createMembership(MEMBER_TIERS.YEARLY, 365)
    expect(info.type).toBe('yearly')
    const diff = new Date(info.endDate).getTime() - new Date(info.startDate).getTime()
    expect(diff).toBe(365 * 86400000)
  })

  it('应正确创建 permanent 会员记录', () => {
    const info = createMembership(MEMBER_TIERS.PERMANENT)
    expect(info.type).toBe('permanent')
    const diff = new Date(info.endDate).getTime() - new Date(info.startDate).getTime()
    expect(diff).toBe(365 * 100 * 86400000)
  })

  it('无自定义天数时 monthly 应默认 30 天', () => {
    const info = createMembership(MEMBER_TIERS.MONTHLY)
    const diff = new Date(info.endDate).getTime() - new Date(info.startDate).getTime()
    expect(diff).toBe(30 * 86400000)
  })

  it('yearly 默认应 365 天', () => {
    const info = createMembership(MEMBER_TIERS.YEARLY)
    const diff = new Date(info.endDate).getTime() - new Date(info.startDate).getTime()
    expect(diff).toBe(365 * 86400000)
  })
})

describe('M6-02: lib/membership.ts - parseMemberTier()', () => {
  it('应正确识别 yearly 相关字符串', () => {
    expect(parseMemberTier('yearly')).toBe(MEMBER_TIERS.YEARLY)
    expect(parseMemberTier('Yearly')).toBe(MEMBER_TIERS.YEARLY)
    expect(parseMemberTier('YEARLY')).toBe(MEMBER_TIERS.YEARLY)
  })

  it('应正确识别 annual 相关字符串（兼容旧命名）', () => {
    expect(parseMemberTier('annual')).toBe(MEMBER_TIERS.YEARLY)
    expect(parseMemberTier('annual_vip')).toBe(MEMBER_TIERS.YEARLY)
    expect(parseMemberTier('yearly_vip')).toBe(MEMBER_TIERS.YEARLY)
  })

  it('应正确识别 monthly 相关字符串', () => {
    expect(parseMemberTier('monthly')).toBe(MEMBER_TIERS.MONTHLY)
    expect(parseMemberTier('MONTHLY')).toBe(MEMBER_TIERS.MONTHLY)
    expect(parseMemberTier('monthly_vip')).toBe(MEMBER_TIERS.MONTHLY)
  })

  it('应正确识别 permanent', () => {
    expect(parseMemberTier('permanent')).toBe(MEMBER_TIERS.PERMANENT)
    expect(parseMemberTier('Permanent')).toBe(MEMBER_TIERS.PERMANENT)
  })

  it('应正确处理 none / free / 空字符串 / null / undefined', () => {
    expect(parseMemberTier('none')).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier('free')).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier('')).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier(null)).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier(undefined)).toBe(MEMBER_TIERS.NONE)
  })

  it('应将未知值映射为 none', () => {
    expect(parseMemberTier('unknown')).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier('admin')).toBe(MEMBER_TIERS.NONE)
    expect(parseMemberTier('xyz123')).toBe(MEMBER_TIERS.NONE)
  })
})

describe('M6-03: lib/membership.ts - isMembershipValid()', () => {
  it('应在会员未过期时返回 true', () => {
    expect(isMembershipValid({
      type: MEMBER_TIERS.MONTHLY,
      startDate: pastDate(5),
      endDate: futureDate(25),
      isActive: true,
    })).toBe(true)
  })

  it('应在会员已过期时返回 false', () => {
    expect(isMembershipValid({
      type: MEMBER_TIERS.YEARLY,
      startDate: pastDate(370),
      endDate: pastDate(5),
      isActive: true,
    })).toBe(false)
  })

  it('应在 isActive=false 时返回 false', () => {
    expect(isMembershipValid({
      type: 'monthly', startDate: pastDate(5), endDate: futureDate(25), isActive: false,
    })).toBe(false)
  })

  it('应在 endDate 为空字符串或无效时返回 false', () => {
    expect(isMembershipValid({ type: 'monthly', startDate: 'x', endDate: '', isActive: true })).toBe(false)
    expect(isMembershipValid({ type: 'monthly', startDate: 'x', endDate: 'invalid', isActive: true })).toBe(false)
  })

  it('应在 membership 为 null/undefined/非对象时返回 false', () => {
    expect(isMembershipValid(null)).toBe(false)
    expect(isMembershipValid(undefined)).toBe(false)
    expect(isMembershipValid('string' as any)).toBe(false)
    expect(isMembershipValid(123 as any)).toBe(false)
  })
})

describe('M6-04: lib/membership.ts - isValidMembershipType()', () => {
  it('应接受有效类型', () => {
    expect(isValidMembershipType('none')).toBe(true)
    expect(isValidMembershipType('monthly')).toBe(true)
    expect(isValidMembershipType('yearly')).toBe(true)
  })

  it('应拒绝无效类型', () => {
    expect(isValidMembershipType('permanent')).toBe(false)
    expect(isValidMembershipType('annual')).toBe(false)
    expect(isValidMembershipType('free')).toBe(false)
    expect(isValidMembershipType('admin')).toBe(false)
    expect(isValidMembershipType(123 as any)).toBe(false)
    expect(isValidMembershipType(null as any)).toBe(false)
  })
})

describe('M6-05: lib/membership.ts - getMembershipLabel()', () => {
  it('应返回正确的显示标签', () => {
    expect(getMembershipLabel(MEMBER_TIERS.NONE)).toBe('普通用户')
    expect(getMembershipLabel(MEMBER_TIERS.MONTHLY)).toBe('月卡会员')
    expect(getMembershipLabel(MEMBER_TIERS.YEARLY)).toBe('年度VIP')
    expect(getMembershipLabel(MEMBER_TIERS.PERMANENT)).toBe('永久会员')
  })
})

describe('M6-06: lib/membership.ts - hasAccess()', () => {
  it('none 用户可访问 calendar/masters/notes/membership，不可访问 stocks', () => {
    expect(hasAccess(MEMBER_TIERS.NONE, 'calendar')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.NONE, 'masters')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.NONE, 'notes')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.NONE, 'stocks')).toBe(false)
  })

  it('monthly 用户可访问 calendar/masters/notes/membership，不可访问 stocks', () => {
    expect(hasAccess(MEMBER_TIERS.MONTHLY, 'calendar')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.MONTHLY, 'masters')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.MONTHLY, 'notes')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.MONTHLY, 'stocks')).toBe(false)
  })

  it('yearly 用户可访问所有功能', () => {
    expect(hasAccess(MEMBER_TIERS.YEARLY, 'calendar')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.YEARLY, 'masters')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.YEARLY, 'notes')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.YEARLY, 'stocks')).toBe(true)
  })

  it('permanent 用户可访问所有功能', () => {
    expect(hasAccess(MEMBER_TIERS.PERMANENT, 'stocks')).toBe(true)
    expect(hasAccess(MEMBER_TIERS.PERMANENT, 'notes')).toBe(true)
  })
})
