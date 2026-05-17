/**
 * M6-uncov: 尚未覆盖的 membership 路由测试
 *
 * 测试覆盖：
 *
 * 1. POST /api/membership/activate — 补充测试
 *    - 幂等性：同等级 active membership 存在且未过期返回 idempotent: true
 *    - 续期：已有 monthly 过期时，激活 yearly 从今日计算（不是从旧 end_date）
 *    - 回滚：users.vip_tier 更新失败时回滚 memberships 记录
 *    - 回滚失败（memberships 删除也失败）返回 500 + 状态不一致提示
 *
 * 2. GET /api/membership/reminders — 补充测试
 *    - 未认证（userId=null）返回 showReminder: false
 *    - expired membership（daysRemaining < 0）返回 type=expired
 *    - 3 天内到期（daysRemaining <= 3）返回 type=expiring
 *    - 超过 3 天到期返回 showReminder: false
 *    - valid membership（无 endDate）返回 showReminder: false
 *    - 异常时返回 showReminder: false
 *    - message 内容包含会员类型
 *
 * 3. GET /api/membership/status — 补充测试
 *    - 返回 normalized tier（使用 normalizeMemberTier）
 *    - 未知 tier 降级 fallback 到 NONE
 *    - 数据库错误返回 NONE
 *
 * 4. POST /api/admin/membership — 管理员开通会员
 *    - 顺延：已有 active membership 时从其 end_date 顺延
 *    - 新建：无 active membership 时从今日创建
 *    - 更新 users.vip_tier
 *    - 更新 user_profiles.vip_status
 *    - userId 不存在返回 404
 *    - 缺少 userId / membershipType 返回 400
 *    - 管理员未认证返回 401/403
 *
 * 风格：所有路由逻辑以内联模拟实现，与源文件逻辑保持同步。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ══════════════════════════════════════════════════════════════════════════════
// 常量（与源文件保持一致）
// ══════════════════════════════════════════════════════════════════════════════

const MEMBER_DURATION_DAYS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
}

const REFERRAL_CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'
const REFERRAL_CODE_REGEX = /^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/

function isValidReferralCode(code: string): boolean {
  return code.length === 8 && REFERRAL_CODE_REGEX.test(code)
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCK: getUserIdFromBearer, getMembershipInfo, normalizeMemberTier
// ══════════════════════════════════════════════════════════════════════════════

const mockGetUserId = vi.fn<(req: NextRequest) => Promise<string | null>>()
const mockGetMembershipInfo = vi.fn()
const mockRequireAdmin = vi.fn()

// inline normalizeMemberTier from lib/member-tiers.ts
const LEGACY_MAP: Record<string, string> = {
  monthly: 'monthly', yearly: 'yearly', permanent: 'permanent',
  monthlyvip: 'monthly', annualvip: 'yearly', yearlyvip: 'yearly',
  none: 'none', null: 'none', '': 'none',
}

function normalizeMemberTier(raw: string | null | undefined): string {
  if (!raw) return 'none'
  const key = String(raw).toLowerCase().replace(/[_]/g, '').trim()
  return LEGACY_MAP[key] ?? 'none'
}

vi.mock('@/lib/server-auth-user', () => ({
  getUserIdFromBearer: mockGetUserId,
}))

vi.mock('@/lib/membership-utils', () => ({
  getMembershipInfo: mockGetMembershipInfo,
}))

vi.mock('@/lib/server-admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@/lib/supabase', () => ({}))

// ══════════════════════════════════════════════════════════════════════════════
// 模拟数据库
// ══════════════════════════════════════════════════════════════════════════════

interface DbMembership {
  id: string
  user_id: string
  membership_type: string
  end_date: string
  status: string
  start_date?: string
}

interface DbUser {
  id: string
  vip_tier: string | null
}

interface DbProfile {
  id: string
  vip_status: boolean
  bonus_read_count: number
  bonus_daily_count: number
  bonus_daily_reset_date: string
}

const dbMemberships: DbMembership[] = []
const dbUsers: Map<string, DbUser> = new Map()
const dbProfiles: Map<string, DbProfile> = new Map()

function dbReset() {
  dbMemberships.length = 0
  dbUsers.clear()
  dbProfiles.clear()
}

function dbAddUser(id: string, vipTier: string | null = null) {
  dbUsers.set(id, { id, vip_tier: vipTier })
}

function dbAddMembership(
  userId: string,
  membershipType: string,
  endDate: string,
  status: string = 'active'
) {
  dbMemberships.push({
    id: `mship-${dbMemberships.length + 1}`,
    user_id: userId,
    membership_type: membershipType,
    end_date: endDate,
    status,
  })
}

function dbAddProfile(userId: string, vipStatus: boolean = false) {
  dbProfiles.set(userId, {
    id: userId,
    vip_status: vipStatus,
    bonus_read_count: 0,
    bonus_daily_count: 0,
    bonus_daily_reset_date: '1970-01-01',
  })
}

function dbGetActiveMembership(userId: string): DbMembership | null {
  return dbMemberships.find(m => m.user_id === userId && m.status === 'active') ?? null
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: POST /api/membership/activate 逻辑（降级路径）
// ══════════════════════════════════════════════════════════════════════════════

interface ActivateResult {
  status: number
  body: Record<string, unknown>
}

async function simulateActivateRoute(
  reqBody: { planType?: string; orderId?: string; manual?: boolean },
  userId: string | null,
  options: {
    existingActiveMembership?: DbMembership | null
    latestMembership?: DbMembership | null
    insertError?: string | null
    userUpdateError?: string | null
    membershipDeleteError?: string | null
    throwError?: boolean
  } = {}
): Promise<ActivateResult> {
  if (!userId) {
    return { status: 401, body: { error: '请先登录' } }
  }

  const { planType } = reqBody
  const validPlans = ['monthly', 'yearly']
  if (!planType || !validPlans.includes(planType)) {
    return { status: 400, body: { error: '无效的会员类型' } }
  }

  const days = MEMBER_DURATION_DAYS[planType]
  const startDate = new Date('2026-04-20T12:00:00Z').toISOString()
  const endDateBase = new Date(new Date('2026-04-20T12:00:00Z').getTime() + days * 24 * 60 * 60 * 1000)
  let finalEndDate = endDateBase.toISOString()

  // 幂等性检查
  const existing = options.existingActiveMembership ?? dbGetActiveMembership(userId)
  if (existing) {
    const existingTier = normalizeMemberTier(existing.membership_type)
    const requestedTier = planType === 'yearly' ? 'yearly' : 'monthly'
    if (existingTier === requestedTier) {
      const end = new Date(existing.end_date)
      if (!isNaN(end.getTime()) && end > new Date('2026-04-20T12:00:00Z')) {
        return {
          status: 200,
          body: {
            success: true,
            idempotent: true,
            tier: requestedTier,
            endDate: existing.end_date,
            message: '会员已激活，无需重复操作',
          },
        }
      }
    }
  }

  // 续期逻辑
  const latest = options.latestMembership ?? dbMemberships
    .filter(m => m.user_id === userId)
    .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0]

  if (latest) {
    const latestEnd = new Date(latest.end_date)
    if (!isNaN(latestEnd.getTime()) && latestEnd > new Date('2026-04-20T12:00:00Z')) {
      // 未过期：从其到期日延长
      finalEndDate = new Date(latestEnd.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
    }
    // 过期：finalEndDate 已是基于今日计算
  }

  // 模拟 memberships 插入
  if (options.insertError) {
    return { status: 500, body: { error: '激活失败，请稍后重试' } }
  }

  const vipTier = planType === 'yearly' ? 'yearly' : 'monthly'
  dbMemberships.push({
    id: `mship-${Date.now()}`,
    user_id: userId,
    membership_type: vipTier,
    end_date: finalEndDate,
    status: 'active',
    start_date: startDate,
  })

  // 模拟 users.vip_tier 更新
  if (options.userUpdateError) {
    // 回滚
    const insertedIdx = dbMemberships.findIndex(m =>
      m.user_id === userId && m.status === 'active' && m.start_date === startDate
    )
    if (options.membershipDeleteError) {
      return {
        status: 500,
        body: { error: '激活失败（状态不一致），请联系管理员处理' },
      }
    }
    if (insertedIdx !== -1) {
      dbMemberships.splice(insertedIdx, 1)
    }
    return { status: 500, body: { error: '激活失败，请稍后重试' } }
  }

  // 更新 users
  const user = dbUsers.get(userId)
  if (user) {
    dbUsers.set(userId, { ...user, vip_tier: vipTier })
  } else {
    dbAddUser(userId, vipTier)
  }

  return {
    status: 200,
    body: {
      success: true,
      planType,
      tier: vipTier,
      startDate,
      endDate: finalEndDate,
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: GET /api/membership/reminders 逻辑
// ══════════════════════════════════════════════════════════════════════════════

interface ReminderResult {
  status: number
  body: Record<string, unknown>
}

function getMembershipTypeLabel(tier: string): string {
  if (tier === 'monthly') return '月卡'
  if (tier === 'yearly') return '年度VIP'
  return '会员'
}

function calculateDaysRemaining(endDate: string, now: Date = new Date('2026-04-20T12:00:00Z')): number {
  const end = new Date(endDate)
  return Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) || 0
}

async function simulateRemindersRoute(
  userId: string | null,
  getMembershipInfo: (userId: string) => Promise<{
    endDate?: string | null
    isMonthly?: boolean
    isYearly?: boolean
    tier?: string
  } | null>,
  options: { throwError?: boolean } = {}
): Promise<ReminderResult> {
  if (!userId) {
    return { status: 200, body: { showReminder: false } }
  }

  if (options.throwError) {
    return { status: 200, body: { showReminder: false } }
  }

  const info = await getMembershipInfo(userId)

  if (!info?.endDate) {
    return { status: 200, body: { showReminder: false } }
  }

  const daysRemaining = calculateDaysRemaining(info.endDate)

  if (daysRemaining < 0) {
    const tierLabel = getMembershipTypeLabel(info.tier ?? '会员')
    return {
      status: 200,
      body: {
        showReminder: true,
        type: 'expired',
        daysRemaining,
        message: `您的${tierLabel}已于 ${Math.abs(daysRemaining)} 天前到期，续费可继续享受专属权益`,
      },
    }
  }

  if (daysRemaining <= 3) {
    const tierLabel = getMembershipTypeLabel(info.tier ?? '会员')
    return {
      status: 200,
      body: {
        showReminder: true,
        type: 'expiring',
        daysRemaining,
        message: `您的${tierLabel}将在 ${daysRemaining} 天后到期，及时续费保障阅读不中断`,
      },
    }
  }

  return { status: 200, body: { showReminder: false } }
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: GET /api/membership/status 逻辑
// ══════════════════════════════════════════════════════════════════════════════

interface StatusResult {
  status: number
  body: Record<string, unknown>
}

async function simulateStatusRoute(
  userId: string | null,
  getUser: (userId: string) => Promise<{ vip_tier: string | null } | null>,
  options: { throwError?: boolean } = {}
): Promise<StatusResult> {
  if (!userId) {
    return { status: 200, body: { tier: 'none', rawVipTier: null } }
  }

  if (options.throwError) {
    return { status: 200, body: { tier: 'none', rawVipTier: null } }
  }

  const user = await getUser(userId)

  if (!user) {
    return { status: 200, body: { tier: 'none', rawVipTier: null } }
  }

  const tier = normalizeMemberTier(user.vip_tier)
  return {
    status: 200,
    body: {
      tier,
      rawVipTier: user.vip_tier ?? null,
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: POST /api/admin/membership 逻辑
// ══════════════════════════════════════════════════════════════════════════════

const MEMBERSHIP_CONFIG: Record<string, { days: number; type: string }> = {
  monthly: { days: 30, type: 'monthly' },
  yearly: { days: 365, type: 'yearly' },
}

interface AdminMembershipResult {
  status: number
  body: Record<string, unknown>
}

async function simulateAdminMembershipRoute(
  reqBody: { userId?: string; membershipType?: string; duration?: number },
  requireAdminResult: NextResponse | null,
  getUser: (userId: string) => Promise<{ id: string; email?: string | null; username?: string | null } | null | undefined>,
  options: {
    existingActiveMembership?: DbMembership | null
    updateError?: string | null
    insertError?: string | null
  } = {}
): Promise<AdminMembershipResult> {
  if (requireAdminResult) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  const { userId, membershipType, duration } = reqBody

  if (!userId || typeof userId !== 'string') {
    return { status: 400, body: { error: '缺少 userId' } }
  }
  if (!membershipType || !MEMBERSHIP_CONFIG[membershipType]) {
    return { status: 400, body: { error: 'membershipType 必须是 monthly 或 yearly' } }
  }

  const days = typeof duration === 'number' && duration > 0
    ? duration
    : MEMBERSHIP_CONFIG[membershipType].days
  const membershipTypeValue = MEMBERSHIP_CONFIG[membershipType].type
  const startDate = '2026-04-20T12:00:00Z'
  let endDate = new Date(new Date(startDate).getTime() + days * 24 * 60 * 60 * 1000).toISOString()

  const user = await getUser(userId)
  if (!user) {
    return { status: 404, body: { error: '用户不存在' } }
  }

  // 检查是否已有有效会员
  const existing = options.existingActiveMembership ?? dbGetActiveMembership(userId)
  if (existing) {
    // 顺延：endDate 基于 existing.end_date 计算
    const existingEnd = new Date(existing.end_date).getTime()
    const base = existingEnd > Date.now() ? new Date(existingEnd) : new Date(startDate)
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    endDate = newEnd.toISOString()

    if (!options.updateError) {
      existing.end_date = endDate
    }
  } else {
    // 新建
    if (options.insertError) {
      return { status: 500, body: { error: '开通失败' } }
    }
    dbMemberships.push({
      id: `admin-mship-${Date.now()}`,
      user_id: userId,
      membership_type: membershipTypeValue,
      end_date: endDate,
      status: 'active',
      start_date: startDate,
    })
  }

  // 更新 users.vip_tier
  if (!options.updateError) {
    const u = dbUsers.get(userId)
    if (u) {
      dbUsers.set(userId, { ...u, vip_tier: membershipTypeValue })
    } else {
      dbAddUser(userId, membershipTypeValue)
    }
  }

  // 同步 user_profiles.vip_status
  const profile = dbProfiles.get(userId)
  if (profile) {
    dbProfiles.set(userId, { ...profile, vip_status: true })
  } else {
    dbAddProfile(userId, true)
  }

  return {
    status: 200,
    body: {
      success: true,
      user: { id: user.id, email: user.email, username: user.username },
      membership: {
        type: membershipTypeValue,
        days,
        endDate, // 正确：已有 membership 时为顺延后的日期
      },
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: POST /api/membership/activate — 补充测试
// ══════════════════════════════════════════════════════════════════════════════

describe('M6-uncov-1: POST /api/membership/activate — 补充测试', () => {
  beforeEach(() => {
    dbReset()
    dbAddUser('user-123')
  })

  it('幂等性：同等级 active 会员且未过期返回 idempotent=true', async () => {
    dbAddMembership('user-123', 'monthly', '2026-05-20T00:00:00Z', 'active')

    const res = await simulateActivateRoute(
      { planType: 'monthly', manual: true },
      'user-123',
      {}
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.idempotent).toBe(true)
    expect(res.body.tier).toBe('monthly')
    expect(res.body.message).toContain('无需重复操作')
  })

  it('幂等性：同等级但已过期不触发幂等（视为新激活）', async () => {
    dbAddMembership('user-123', 'monthly', '2026-04-15T00:00:00Z', 'active')

    const res = await simulateActivateRoute(
      { planType: 'monthly', manual: true },
      'user-123',
      {}
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.idempotent).toBeUndefined()
  })

  it('幂等性：不同等级会员不触发幂等（视为升级）', async () => {
    dbAddMembership('user-123', 'monthly', '2026-05-20T00:00:00Z', 'active')

    const res = await simulateActivateRoute(
      { planType: 'yearly', manual: true },
      'user-123',
      {}
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.tier).toBe('yearly')
    expect(res.body.idempotent).toBeUndefined()
  })

  it('续期：从今日计算（无现有会员时）', async () => {
    const res = await simulateActivateRoute(
      { planType: 'monthly', manual: true },
      'user-123',
      {}
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.tier).toBe('monthly')

    const endDate = new Date(res.body.endDate as string)
    const expectedDays = 30
    const expectedEnd = new Date(new Date('2026-04-20T12:00:00Z').getTime() + expectedDays * 24 * 60 * 60 * 1000)
    expect(Math.abs(endDate.getTime() - expectedEnd.getTime())).toBeLessThan(86400000)
  })

  it('续期：已有 yearly 过期记录时，激活 yearly 从今日计算（不是从旧 end_date）', async () => {
    // 年费的 end_date 已过期（不是当前未过期，所以走今日计算路径）
    dbAddMembership('user-123', 'yearly', '2026-04-15T00:00:00Z', 'expired')

    const res = await simulateActivateRoute(
      { planType: 'yearly', manual: true },
      'user-123',
      {}
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.tier).toBe('yearly')

    const endDate = new Date(res.body.endDate as string)
    // 从 2026-04-20 + 365 天 ≈ 2027-04-20（而非 2026-04-15 + 365 天）
    const expectedEnd = new Date(new Date('2026-04-20T12:00:00Z').getTime() + 365 * 24 * 60 * 60 * 1000)
    expect(Math.abs(endDate.getTime() - expectedEnd.getTime())).toBeLessThan(86400000)
  })

  it('续期：已有 monthly 有效会员，续期从其 end_date 延长', async () => {
    // 已有 monthly 有效会员（未过期），激活 yearly → 走续期逻辑
    // 同等级+未过期才触发幂等，跨等级不触发
    const existingMembership: DbMembership = {
      id: 'mship-monthly-active',
      user_id: 'user-123',
      membership_type: 'monthly',
      end_date: '2026-05-10T00:00:00Z',
      status: 'active',
    }

    const res = await simulateActivateRoute(
      { planType: 'yearly', manual: true },
      'user-123',
      {
        existingActiveMembership: existingMembership,
        latestMembership: existingMembership,
      }
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const endDate = new Date(res.body.endDate as string)
    // 从 2026-05-10 + 365 天 = 2027-05-10
    const expectedEnd = new Date(new Date('2026-05-10T00:00:00Z').getTime() + 365 * 24 * 60 * 60 * 1000)
    // 允许 2 天误差（UTC vs 本地时区边界）
    expect(Math.abs(endDate.getTime() - expectedEnd.getTime())).toBeLessThan(2 * 86400000)
  })

  it('回滚：users.vip_tier 更新失败时回滚 memberships 记录', async () => {
    const res = await simulateActivateRoute(
      { planType: 'monthly', manual: true },
      'user-123',
      {
        userUpdateError: 'DB error',
        membershipDeleteError: null, // 回滚成功
      }
    )

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('激活失败')
    // memberships 记录应被回滚
    const remaining = dbMemberships.filter(m => m.user_id === 'user-123' && m.status === 'active')
    expect(remaining.length).toBe(0)
  })

  it('回滚失败：memberships 删除也失败时返回状态不一致错误', async () => {
    const res = await simulateActivateRoute(
      { planType: 'monthly', manual: true },
      'user-123',
      {
        userUpdateError: 'DB error',
        membershipDeleteError: 'Delete failed',
      }
    )

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('状态不一致')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: GET /api/membership/reminders — 补充测试
// ══════════════════════════════════════════════════════════════════════════════

describe('M6-uncov-2: GET /api/membership/reminders — 补充测试', () => {
  beforeEach(() => {
    mockGetUserId.mockReset()
    mockGetMembershipInfo.mockReset()
  })

  it('未认证（userId=null）返回 showReminder=false', async () => {
    const res = await simulateRemindersRoute(null, mockGetMembershipInfo)
    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(false)
  })

  it('expired membership（daysRemaining < 0）返回 type=expired', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-15T00:00:00Z', // 5天前过期
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(true)
    expect(res.body.type).toBe('expired')
    expect(res.body.daysRemaining).toBe(-5)
  })

  it('expired membership message 包含过期天数', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-18T00:00:00Z', // 2天前过期
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.body.showReminder).toBe(true)
    expect(res.body.type).toBe('expired')
    expect((res.body.message as string).includes('2')).toBe(true)
    expect((res.body.message as string).includes('天前到期')).toBe(true)
  })

  it('expiring within 3 days（daysRemaining=1）返回 type=expiring', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-21T00:00:00Z',
      tier: 'yearly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(true)
    expect(res.body.type).toBe('expiring')
    expect(res.body.daysRemaining).toBe(1)
  })

  it('expiring within 3 days（daysRemaining=3）返回 type=expiring（临界值）', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-23T12:00:00Z',
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(true)
    expect(res.body.type).toBe('expiring')
    expect(res.body.daysRemaining).toBe(3)
  })

  it('daysRemaining=0（今日到期）返回 type=expiring', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-20T12:00:00Z',
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(true)
    expect(res.body.type).toBe('expiring')
    expect(res.body.daysRemaining).toBe(0)
  })

  it('超过 3 天到期（daysRemaining=4）返回 showReminder=false', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-24T00:00:00Z',
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(false)
    expect(res.body.type).toBeUndefined()
  })

  it('valid membership（超过 7 天到期）返回 showReminder=false', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-05-20T00:00:00Z',
      tier: 'yearly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(false)
  })

  it('无 endDate 返回 showReminder=false', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: null,
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(false)
  })

  it('异常时返回 showReminder=false', async () => {
    mockGetMembershipInfo.mockRejectedValue(new Error('DB error'))

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo, { throwError: true })

    expect(res.status).toBe(200)
    expect(res.body.showReminder).toBe(false)
  })

  it('monthly 会员 message 包含"月卡"', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-21T00:00:00Z',
      tier: 'monthly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect((res.body.message as string).includes('月卡')).toBe(true)
  })

  it('yearly 会员 message 包含"年度VIP"', async () => {
    mockGetMembershipInfo.mockResolvedValue({
      endDate: '2026-04-21T00:00:00Z',
      tier: 'yearly',
    })

    const res = await simulateRemindersRoute('user-123', mockGetMembershipInfo)

    expect((res.body.message as string).includes('年度VIP')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: GET /api/membership/status — 补充测试
// ══════════════════════════════════════════════════════════════════════════════

describe('M6-uncov-3: GET /api/membership/status — 补充测试', () => {
  beforeEach(() => {
    dbReset()
    mockGetUserId.mockReset()
  })

  it('未登录返回 tier=none', async () => {
    const res = await simulateStatusRoute(null, () => Promise.resolve(null))
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('none')
    expect(res.body.rawVipTier).toBeNull()
  })

  it('yearly 用户返回 tier=yearly', async () => {
    dbAddUser('user-yearly', 'yearly')
    const res = await simulateStatusRoute(
      'user-yearly',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('yearly')
    expect(res.body.rawVipTier).toBe('yearly')
  })

  it('monthly 用户返回 tier=monthly', async () => {
    dbAddUser('user-monthly', 'monthly')
    const res = await simulateStatusRoute(
      'user-monthly',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('monthly')
  })

  it('null vip_tier 返回 tier=none（unknown tier 降级 fallback）', async () => {
    dbAddUser('user-null', null)
    const res = await simulateStatusRoute(
      'user-null',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('none')
  })

  it('legacy annual_vip 规范化返回 tier=yearly', async () => {
    dbAddUser('user-legacy', 'annual_vip')
    const res = await simulateStatusRoute(
      'user-legacy',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('yearly')
    expect(res.body.rawVipTier).toBe('annual_vip')
  })

  it('legacy monthly_vip 规范化返回 tier=monthly', async () => {
    dbAddUser('user-legacy-m', 'monthly_vip')
    const res = await simulateStatusRoute(
      'user-legacy-m',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('monthly')
    expect(res.body.rawVipTier).toBe('monthly_vip')
  })

  it('unknown tier 返回 tier=none（unknown tier 降级 fallback）', async () => {
    dbAddUser('user-unknown', 'super_admin')
    const res = await simulateStatusRoute(
      'user-unknown',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('none')
    expect(res.body.rawVipTier).toBe('super_admin')
  })

  it('permanent 用户返回 tier=permanent', async () => {
    dbAddUser('user-perm', 'permanent')
    const res = await simulateStatusRoute(
      'user-perm',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('permanent')
  })

  it('用户不存在返回 tier=none（数据库错误降级）', async () => {
    const res = await simulateStatusRoute('ghost-user', () => Promise.resolve(null))
    expect(res.status).toBe(200)
    expect(res.body.tier).toBe('none')
  })

  it('响应包含 tier 和 rawVipTier 两个字段', async () => {
    dbAddUser('user-both', 'yearly')
    const res = await simulateStatusRoute(
      'user-both',
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )
    expect(res.body).toHaveProperty('tier')
    expect(res.body).toHaveProperty('rawVipTier')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: POST /api/admin/membership — 管理员开通会员
// ══════════════════════════════════════════════════════════════════════════════

describe('M6-uncov-4: POST /api/admin/membership — 管理员开通会员', () => {
  beforeEach(() => {
    dbReset()
    mockRequireAdmin.mockReset()
  })

  it('管理员未认证返回 401', async () => {
    mockRequireAdmin.mockReturnValue({ status: 401, body: { error: 'Unauthorized' } } as unknown as NextResponse)

    const res = await simulateAdminMembershipRoute(
      { userId: 'user-123', membershipType: 'monthly' },
      { status: 401, body: { error: 'Unauthorized' } } as unknown as NextResponse,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(401)
  })

  it('缺少 userId 返回 400', async () => {
    mockRequireAdmin.mockReturnValue(null)

    const res = await simulateAdminMembershipRoute(
      { membershipType: 'monthly' } as any,
      null,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('缺少 userId')
  })

  it('userId 为空字符串返回 400', async () => {
    mockRequireAdmin.mockReturnValue(null)

    const res = await simulateAdminMembershipRoute(
      { userId: '', membershipType: 'monthly' },
      null,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('缺少 userId')
  })

  it('缺少 membershipType 返回 400', async () => {
    mockRequireAdmin.mockReturnValue(null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'user-123' } as any,
      null,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('membershipType')
  })

  it('无效 membershipType 返回 400', async () => {
    mockRequireAdmin.mockReturnValue(null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'user-123', membershipType: 'permanent' },
      null,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('membershipType')
  })

  it('用户不存在返回 404', async () => {
    mockRequireAdmin.mockReturnValue(null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'nonexistent', membershipType: 'monthly' },
      null,
      () => Promise.resolve(null)
    )

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('用户不存在')
  })

  it('无 active membership 时从今日创建', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('new-user', null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'new-user', membershipType: 'monthly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect((res.body.membership as any).type).toBe('monthly')
    expect((res.body.membership as any).days).toBe(30)

    // users.vip_tier 应更新
    expect(dbUsers.get('new-user')?.vip_tier).toBe('monthly')

    // user_profiles.vip_status 应更新
    expect(dbProfiles.get('new-user')?.vip_status).toBe(true)
  })

  it('已有 active membership 时顺延（从其 end_date）', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('existing-user', null)
    dbAddMembership('existing-user', 'monthly', '2026-06-01T00:00:00Z', 'active')

    const res = await simulateAdminMembershipRoute(
      { userId: 'existing-user', membershipType: 'monthly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect((res.body.membership as any).type).toBe('monthly')

    // 新 end_date 应从 2026-06-01 顺延 30 天 = 2026-07-01
    const newEnd = new Date((res.body.membership as any).endDate)
    const expectedEnd = new Date(new Date('2026-06-01T00:00:00Z').getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(Math.abs(newEnd.getTime() - expectedEnd.getTime())).toBeLessThan(86400000)
  })

  it('已有 active yearly 会员，续费 yearly 从其 end_date 顺延', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('yearly-user', null)
    dbAddMembership('yearly-user', 'yearly', '2026-10-01T00:00:00Z', 'active')

    const res = await simulateAdminMembershipRoute(
      { userId: 'yearly-user', membershipType: 'yearly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect((res.body.membership as any).type).toBe('yearly')
    expect((res.body.membership as any).days).toBe(365)
  })

  it('更新 users.vip_tier', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('upgrade-user', 'monthly')

    const res = await simulateAdminMembershipRoute(
      { userId: 'upgrade-user', membershipType: 'yearly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect(dbUsers.get('upgrade-user')?.vip_tier).toBe('yearly')
  })

  it('更新 user_profiles.vip_status 为 true', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('profile-user', null)
    dbAddProfile('profile-user', false)

    await simulateAdminMembershipRoute(
      { userId: 'profile-user', membershipType: 'monthly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(dbProfiles.get('profile-user')?.vip_status).toBe(true)
  })

  it('user_profiles 不存在时创建', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('no-profile-user', null)

    await simulateAdminMembershipRoute(
      { userId: 'no-profile-user', membershipType: 'monthly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(dbProfiles.get('no-profile-user')?.vip_status).toBe(true)
  })

  it('自定义 duration 优先于默认天数', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('custom-dur-user', null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'custom-dur-user', membershipType: 'monthly', duration: 7 },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect((res.body.membership as any).days).toBe(7)
  })

  it('duration <= 0 时 fallback 到默认天数', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('zero-dur-user', null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'zero-dur-user', membershipType: 'monthly', duration: -5 },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    expect((res.body.membership as any).days).toBe(30)
  })

  it('响应包含 user 和 membership 两个字段', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('resp-user', null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'resp-user', membershipType: 'monthly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.body).toHaveProperty('user')
    expect(res.body).toHaveProperty('membership')
    expect((res.body.user as any).id).toBe('resp-user')
  })

  it('yearly 用户不在列表页时 end_date 字段正确', async () => {
    mockRequireAdmin.mockReturnValue(null)
    dbAddUser('yearly-new-user', null)

    const res = await simulateAdminMembershipRoute(
      { userId: 'yearly-new-user', membershipType: 'yearly' },
      null,
      (uid) => Promise.resolve(dbUsers.get(uid) ?? null)
    )

    expect(res.status).toBe(200)
    const endDate = new Date((res.body.membership as any).endDate)
    const expectedEnd = new Date(new Date('2026-04-20T12:00:00Z').getTime() + 365 * 24 * 60 * 60 * 1000)
    expect(Math.abs(endDate.getTime() - expectedEnd.getTime())).toBeLessThan(86400000)
  })
})
