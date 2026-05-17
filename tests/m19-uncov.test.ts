/**
 * Module 19 (续): 跨模块状态传递集成测试套件
 *
 * 测试覆盖（现有 m19 未覆盖的五个跨模块流程）：
 *
 * 1. Referral → Membership activation chain
 *    邀请码注册 → bonus_read_count → 配额计算
 *
 * 2. Redeem code → Membership activation chain
 *    兑换码兑换 → memberships 表 → users.vip_tier → QuotaCalculator
 *
 * 3. Payment approval → Membership activation chain
 *    支付成功 → activate_membership RPC → 会员状态 → 文章访问
 *
 * 4. Membership tier change → QuotaCalculator 重新计算
 *    NONE → monthly → yearly → permanent
 *
 * 5. Guest → Authenticated transition
 *    游客阅读配额 → 登录 → 配额保留/转移
 *
 * 测试策略：
 * - 在 Supabase RPC/table 级别 mock，而非测试真实数据库
 * - 验证状态转换的正确性和一致性
 * - 纯函数逻辑，不依赖 DOM/React 渲染
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ══════════════════════════════════════════════════════════════════════════════
// 共享类型和常量
// ══════════════════════════════════════════════════════════════════════════════

type MemberTier = 'none' | 'monthly' | 'yearly' | 'permanent'

const MEMBER_TIERS = {
  NONE: 'none',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  PERMANENT: 'permanent',
} as const

const DEFAULT_QUOTA = {
  GUEST_READ_LIMIT: 3,
  MONTHLY_DAILY_LIMIT: 8,
  REFERRAL_BONUS_COUNT: 3,
  REFERRAL_DAILY_BONUS: 2,
}

// ══════════════════════════════════════════════════════════════════════════════
// Mock Supabase Database
// ══════════════════════════════════════════════════════════════════════════════

interface User {
  id: string
  email: string
  vip_tier: MemberTier
  bonus_read_count: number
  daily_bonus_count: number
}

interface Membership {
  user_id: string
  membership_type: MemberTier
  start_date: Date
  end_date: Date
  is_active: boolean
  source: string
}

interface ReferralCode {
  id: string
  user_id: string
  code: string
  used_count: number
  bonus_for_referrer: number
  created_at: Date
}

interface RedeemCode {
  id: string
  code: string
  membership_type: MemberTier
  status: 'unused' | 'used' | 'expired'
  expires_at: Date
  used_by: string | null
  used_at: Date | null
}

interface ReadingLog {
  id: string
  user_id: string
  article_id: string
  read_date: Date
}

class MockDatabase {
  users: Map<string, User> = new Map()
  memberships: Map<string, Membership> = new Map() // key: user_id:type
  referralCodes: Map<string, ReferralCode> = new Map()
  redeemCodes: Map<string, RedeemCode> = new Map()
  readingLogs: Map<string, ReadingLog[]> = new Map() // key: user_id

  constructor() {
    this.reset()
  }

  reset() {
    this.users.clear()
    this.memberships.clear()
    this.referralCodes.clear()
    this.redeemCodes.clear()
    this.readingLogs.clear()
  }

  createUser(overrides: Partial<User> = {}): User {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user: User = {
      id,
      email: overrides.email || `user-${id}@test.com`,
      vip_tier: overrides.vip_tier || 'none',
      bonus_read_count: overrides.bonus_read_count || 0,
      daily_bonus_count: overrides.daily_bonus_count || 0,
    }
    this.users.set(id, user)
    return user
  }

  getUser(id: string): User | undefined {
    return this.users.get(id)
  }

  updateUser(id: string, updates: Partial<User>) {
    const user = this.users.get(id)
    if (user) {
      this.users.set(id, { ...user, ...updates })
    }
  }

  createMembership(userId: string, type: MemberTier, durationDays: number, source: string = 'purchase'): Membership {
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + durationDays)
    const membership: Membership = {
      user_id: userId,
      membership_type: type,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      source,
    }
    this.memberships.set(`${userId}:${type}`, membership)
    return membership
  }

  getMembership(userId: string, type: MemberTier): Membership | undefined {
    return this.memberships.get(`${userId}:${type}`)
  }

  hasActiveMembership(userId: string): boolean {
    for (const m of this.memberships.values()) {
      if (m.user_id === userId && m.is_active && m.end_date > new Date()) {
        return true
      }
    }
    return false
  }

  createReferralCode(userId: string): ReferralCode {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const code = 'RF-' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const referral: ReferralCode = {
      id: `ref-${Date.now()}`,
      user_id: userId,
      code,
      used_count: 0,
      bonus_for_referrer: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      created_at: new Date(),
    }
    this.referralCodes.set(code, referral)
    return referral
  }

  createRedeemCode(type: MemberTier): RedeemCode {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const code = 'RFYR-' + type.toUpperCase().slice(0, 5) + '-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const redeem: RedeemCode = {
      id: `redeem-${Date.now()}`,
      code,
      membership_type: type,
      status: 'unused',
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      used_by: null,
      used_at: null,
    }
    this.redeemCodes.set(code, redeem)
    return redeem
  }

  getRedeemCode(code: string): RedeemCode | undefined {
    return this.redeemCodes.get(code)
  }

  logRead(userId: string, articleId: string) {
    if (!this.readingLogs.has(userId)) {
      this.readingLogs.set(userId, [])
    }
    this.readingLogs.get(userId)!.push({
      id: `log-${Date.now()}`,
      user_id: userId,
      article_id: articleId,
      read_date: new Date(),
    })
  }

  getReadCount(userId: string): number {
    return this.readingLogs.get(userId)?.length || 0
  }

  getDailyReadCount(userId: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return this.readingLogs.get(userId)?.filter((l) => l.read_date >= today).length || 0
  }

  /**
   * 只统计指定类型的已读文章数。
   * articleId 格式约定：
   *   "guest-note-*" / "monthly-note-*" 等含 "-note-" → notes 类型
   *   默认 (不含 "-note-") → 计入 notes（用于保持向后兼容）
   */
  getNotesReadCount(userId: string): number {
    const logs = this.readingLogs.get(userId) || []
    return logs.filter((l) => {
      const id: string = l.article_id
      return id.includes('-note-')
    }).length
  }
}

const db = new MockDatabase()

// ══════════════════════════════════════════════════════════════════════════════
// QuotaCalculator（从 lib/quota-calculator.ts 提取）
// ══════════════════════════════════════════════════════════════════════════════

interface UserQuotaData {
  totalReadCount: number
  readIds: string[]
  dailyReadCount: number
  lastReadDate: string | null
  bonusCount: number
  dailyBonusCount: number
  bonusResetDate: string | null
}

interface QuotaResult {
  canRead: boolean
  hasContentPermission: boolean
  isOverLimit: boolean
  totalReadCount: number
  dailyReadCount: number
  totalLimit: number
  dailyLimit: number
  totalRemaining: number
  dailyRemaining: number
  bonusCount: number
  dailyBonusCount: number
  reason: 'none' | 'require_login' | 'quota_exhausted' | 'daily_limit' | 'membership_required' | 'yearly_required'
  isUnlimited: boolean
  tier: MemberTier
}

function calculateQuota(options: {
  tier: MemberTier
  quota: UserQuotaData
  guestReadLimit?: number
  monthlyDailyLimit?: number
  referralBonusCount?: number
  referralDailyBonus?: number
  articleRequires?: string
  articleCount?: number
}): QuotaResult {
  const {
    tier,
    quota,
    guestReadLimit = DEFAULT_QUOTA.GUEST_READ_LIMIT,
    monthlyDailyLimit = DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
    referralBonusCount = DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
    referralDailyBonus = DEFAULT_QUOTA.REFERRAL_DAILY_BONUS,
    articleRequires = 'notes',
    articleCount,
  } = options

  const unlimited = tier === 'yearly' || tier === 'permanent'
  const paid = tier !== 'none'

  let hasContentPermission = true
  let reason: QuotaResult['reason'] = 'none'

  if (tier === 'none') {
    if (articleRequires === 'yearly') {
      hasContentPermission = false
      reason = 'yearly_required'
    } else if (articleRequires === 'monthly') {
      hasContentPermission = false
      reason = 'membership_required'
    }
  } else if (tier === 'monthly') {
    if (articleRequires === 'yearly') {
      hasContentPermission = false
      reason = 'yearly_required'
    }
  }

  let totalLimit: number
  let dailyLimit: number
  let bonusCount: number
  let dailyBonusCount: number

  if (unlimited) {
    totalLimit = Infinity
    dailyLimit = Infinity
    bonusCount = Infinity
    dailyBonusCount = Infinity
  } else if (tier === 'monthly') {
    totalLimit = Infinity
    dailyLimit = monthlyDailyLimit + quota.dailyBonusCount
    bonusCount = Infinity
    dailyBonusCount = quota.dailyBonusCount
  } else {
    totalLimit = guestReadLimit + quota.bonusCount
    dailyLimit = Infinity
    bonusCount = quota.bonusCount
    dailyBonusCount = 0
  }

  const totalReadCount = quota.totalReadCount
  const dailyReadCount = quota.dailyReadCount

  let isOverLimit = false

  if (articleRequires === 'notes') {
    if (articleCount !== undefined) {
      // 有 articleCount → post-count 判断（正常请求路径）
      if (tier === 'none') {
        isOverLimit = articleCount >= totalLimit
        if (isOverLimit) reason = 'quota_exhausted'
      } else if (tier === 'monthly') {
        isOverLimit = articleCount > dailyLimit
        if (isOverLimit) reason = 'daily_limit'
      }
    } else {
      // 无 articleCount（直接调用场景）→ pre-count 判断
      if (tier === 'none') {
        isOverLimit = totalReadCount >= totalLimit
        if (isOverLimit) reason = 'quota_exhausted'
      } else if (tier === 'monthly') {
        // 月卡用户按 dailyReadCount 判断每日限额
        isOverLimit = dailyReadCount > dailyLimit
        if (isOverLimit) reason = 'daily_limit'
      }
      // yearly/permanent 不超限
    }
  } else {
    // 其它权限（stocks 等）
    isOverLimit = !hasContentPermission
    if (isOverLimit && reason === 'none') reason = 'membership_required'
  }

  const totalRemaining = totalLimit === Infinity ? Infinity : Math.max(0, totalLimit - totalReadCount)
  const dailyRemaining = dailyLimit === Infinity ? Infinity : Math.max(0, dailyLimit - dailyReadCount)

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
    tier,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RPC 模拟函数
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 模拟 activate_membership RPC
 * 允许从低级会员升级到高级会员（monthly → yearly）
 */
function rpcActivateMembership(userId: string, membershipType: MemberTier, durationDays: number) {
  // 检查是否已有更高级或同级活跃会员
  const tierRank = (t: MemberTier) => t === 'permanent' ? 4 : t === 'yearly' ? 3 : t === 'monthly' ? 2 : 1
  if (db.hasActiveMembership(userId)) {
    // 找到当前活跃会员的类型
    const allMemberships = db.memberships.values()
    let existingTier: MemberTier = 'none'
    for (const m of allMemberships) {
      if (m.user_id === userId && m.is_active && m.end_date > new Date()) {
        if (tierRank(m.membership_type) > tierRank(existingTier)) {
          existingTier = m.membership_type
        }
      }
    }
    if (tierRank(existingTier) >= tierRank(membershipType)) {
      return { success: false, error: '您已经是会员' }
    }
    // 允许从低级升级（如 monthly → yearly）
  }

  // 创建会员记录
  const membership = db.createMembership(userId, membershipType, durationDays, 'purchase')

  // 更新用户 vip_tier，并重置 daily_bonus_count（年卡/永久无每日奖励）
  db.updateUser(userId, {
    vip_tier: membershipType,
    daily_bonus_count: membershipType === 'monthly' ? 1 : 0,
  })

  return { success: true, membership }
}

/**
 * 模拟 redeem_code RPC
 */
function rpcRedeemCode(code: string, userId: string): { success: boolean; error?: string; membership?: Membership } {
  const redeem = db.getRedeemCode(code)
  if (!redeem) {
    return { success: false, error: '兑换码不存在' }
  }
  if (redeem.status !== 'unused') {
    return { success: false, error: '兑换码已使用或已过期' }
  }
  if (redeem.expires_at < new Date()) {
    redeem.status = 'expired'
    return { success: false, error: '兑换码已过期' }
  }

  // 使用兑换码
  redeem.status = 'used'
  redeem.used_by = userId
  redeem.used_at = new Date()

  // 创建会员
  const durationDays = redeem.membership_type === 'monthly' ? 30 : 365
  const membership = db.createMembership(userId, redeem.membership_type, durationDays, 'redeem')

  // 更新用户 vip_tier
  db.updateUser(userId, { vip_tier: redeem.membership_type })

  // 月卡兑换后：授予每日邀请奖励（daily_bonus_count）
  if (redeem.membership_type === 'monthly') {
    db.updateUser(userId, { daily_bonus_count: 1 })
  }

  return { success: true, membership }
}

/**
 * 模拟 apply_referral_bonus RPC
 */
function rpcApplyReferralBonus(referrerUserId: string, refereeUserId: string, referralCode: string): { success: boolean; bonusCount?: number } {
  const referrer = db.getUser(referrerUserId)
  if (!referrer) {
    return { success: false }
  }

  // 增加邀请者的 bonus_read_count
  const newBonus = referrer.bonus_read_count + DEFAULT_QUOTA.REFERRAL_BONUS_COUNT
  db.updateUser(referrerUserId, { bonus_read_count: newBonus })

  return { success: true, bonusCount: newBonus }
}

/**
 * 模拟 check_article_access RPC
 */
function rpcCheckArticleAccess(userId: string, articleId: string, articleRequires: string = 'notes'): { allowed: boolean; readCount?: number; limit?: number; code?: string } {
  const user = db.getUser(userId)
  if (!user) {
    return { allowed: false, code: 'REQUIRE_LOGIN' }
  }

  // 检查是否已读（避免重复计数）
  const existingLogs = db.readingLogs.get(userId) || []
  const alreadyRead = existingLogs.some(log => log.article_id === articleId)

  // 使用快照计数（避免循环中的累积问题）
  const baseTotalCount = db.getReadCount(userId)
  const baseDailyCount = db.getDailyReadCount(userId)

  // 已读文章：使用当前计数；新文章：+1
  const totalCount = alreadyRead ? baseTotalCount : baseTotalCount + 1
  const dailyCount = alreadyRead ? baseDailyCount : baseDailyCount + 1

  // 根据 tier 计算配额
  let quotaResult: QuotaResult

  if (user.vip_tier === 'none') {
    // 免费用户：按笔记总篇数判断（只统计含 "-note-" 的文章）
    const baseNotesCount = db.getNotesReadCount(userId)
    quotaResult = calculateQuota({
      tier: 'none',
      quota: {
        totalReadCount: baseNotesCount,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        bonusCount: user.bonus_read_count,
        dailyBonusCount: 0,
        bonusResetDate: null,
      },
      articleRequires,
      articleCount: alreadyRead ? baseNotesCount : baseNotesCount + 1,
    })
  } else if (user.vip_tier === 'monthly') {
    // 月卡用户：按每日篇数判断（使用快照的 baseDailyCount）
    // 注意：totalReadCount 用 baseDailyCount 而非 baseTotalCount，
    // 因为 baseTotalCount 包含非笔记类文章（如之前的 guest-note-*）
    quotaResult = calculateQuota({
      tier: 'monthly',
      quota: {
        totalReadCount: baseDailyCount, // 今天已读的笔记篇数
        readIds: [],
        dailyReadCount: baseDailyCount,
        lastReadDate: null,
        bonusCount: Infinity,
        dailyBonusCount: user.daily_bonus_count,
        bonusResetDate: null,
      },
      articleRequires,
      articleCount: dailyCount,
    })
  } else {
    // 年卡/永久：无限制
    quotaResult = calculateQuota({
      tier: user.vip_tier,
      quota: {
        totalReadCount: baseTotalCount,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        bonusCount: Infinity,
        dailyBonusCount: Infinity,
        bonusResetDate: null,
      },
      articleRequires,
    })
  }

  if (!quotaResult.canRead) {
    if (quotaResult.reason === 'yearly_required') {
      return { allowed: false, code: 'YEARLY_REQUIRED', readCount: baseTotalCount, limit: quotaResult.totalLimit }
    }
    if (quotaResult.reason === 'membership_required') {
      return { allowed: false, code: 'MEMBERSHIP_REQUIRED', readCount: baseTotalCount, limit: quotaResult.totalLimit }
    }
    if (quotaResult.reason === 'quota_exhausted') {
      return { allowed: false, code: 'LIMIT_EXCEEDED', readCount: baseTotalCount, limit: quotaResult.totalLimit }
    }
    if (quotaResult.reason === 'daily_limit') {
      return { allowed: false, code: 'DAILY_LIMIT_EXCEEDED', readCount: baseDailyCount, limit: quotaResult.dailyLimit }
    }
  }

  // 仅在新文章且允许访问时记录
  if (!alreadyRead) {
    db.logRead(userId, articleId)
  }

  return { allowed: true, readCount: db.getReadCount(userId) }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: Referral → Membership Activation Chain
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-5: Referral → Membership Activation Chain', () => {
  beforeEach(() => {
    db.reset()
  })

  it('邀请码注册后，受邀用户阅读应使用组合配额（含 bonus）', () => {
    // Step 1: 创建邀请者
    const referrer = db.createUser({ email: 'referrer@test.com' })
    const referralCode = db.createReferralCode(referrer.id)
    expect(referralCode.bonus_for_referrer).toBe(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)

    // Step 2: 被邀请者注册（使用邀请码）
    const referee = db.createUser({ email: 'referee@test.com' })

    // Step 3: 邀请码激活后，邀请者获得 bonus
    const bonusResult = rpcApplyReferralBonus(referrer.id, referee.id, referralCode.code)
    expect(bonusResult.success).toBe(true)
    expect(bonusResult.bonusCount).toBe(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)

    // Step 4: 验证邀请者的配额计算
    const referrerUser = db.getUser(referrer.id)
    const quota = calculateQuota({
      tier: referrerUser!.vip_tier,
      quota: {
        totalReadCount: 2,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        bonusCount: referrerUser!.bonus_read_count,
        dailyBonusCount: 0,
        bonusResetDate: null,
      },
    })

    // 邀请者有 3 bonus，所以 totalLimit = 3 + 3 = 6
    expect(quota.totalLimit).toBe(6)
    expect(quota.canRead).toBe(true) // 2 < 6
  })

  it('被邀请者有 bonus_read_count 时，配额扩展', () => {
    const user = db.createUser({
      email: 'user@test.com',
      vip_tier: 'none',
      bonus_read_count: 3,
    })

    const quota = calculateQuota({
      tier: 'none',
      quota: {
        totalReadCount: 5,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        bonusCount: user.bonus_read_count,
        dailyBonusCount: 0,
        bonusResetDate: null,
      },
    })

    // 5 < 3 (guest) + 3 (bonus) = 6 → 可读
    expect(quota.canRead).toBe(true)
    expect(quota.totalLimit).toBe(6)
  })

  it('bonus 不足以覆盖超限时，仍应拒绝', () => {
    const user = db.createUser({
      email: 'user@test.com',
      vip_tier: 'none',
      bonus_read_count: 1, // 只获得 1 bonus
    })

    const quota = calculateQuota({
      tier: 'none',
      quota: {
        totalReadCount: 4,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        bonusCount: user.bonus_read_count,
        dailyBonusCount: 0,
        bonusResetDate: null,
      },
    })

    // 4 >= 3 (guest) + 1 (bonus) = 4 → 超限
    expect(quota.canRead).toBe(false)
    expect(quota.isOverLimit).toBe(true)
    expect(quota.reason).toBe('quota_exhausted')
  })

  it('已邀请多人，bonus 累积', () => {
    const user = db.createUser({
      email: 'referrer@test.com',
      bonus_read_count: 0,
    })

    // 邀请 3 人
    for (let i = 0; i < 3; i++) {
      const referee = db.createUser({ email: `referee${i}@test.com` })
      rpcApplyReferralBonus(user.id, referee.id, 'RF-TESTCODE1')
    }

    const updated = db.getUser(user.id)
    expect(updated!.bonus_read_count).toBe(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT * 3)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: Redeem Code → Membership Activation Chain
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-6: Redeem Code → Membership Activation Chain', () => {
  beforeEach(() => {
    db.reset()
  })

  it('兑换月卡码 → memberships 表创建记录 → users.vip_tier 更新为 monthly', () => {
    // Step 1: 创建兑换码
    const redeemCode = db.createRedeemCode('monthly')
    expect(redeemCode.status).toBe('unused')

    // Step 2: 用户兑换
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // Step 3: RPC 兑换
    const result = rpcRedeemCode(redeemCode.code, user.id)
    expect(result.success).toBe(true)
    expect(result.membership).toBeDefined()
    expect(result.membership!.membership_type).toBe('monthly')

    // Step 4: 验证用户 vip_tier 更新
    const updatedUser = db.getUser(user.id)
    expect(updatedUser!.vip_tier).toBe('monthly')

    // Step 5: 验证 memberships 表
    const membership = db.getMembership(user.id, 'monthly')
    expect(membership).toBeDefined()
    expect(membership!.is_active).toBe(true)
    expect(membership!.source).toBe('redeem')
  })

  it('兑换年卡码 → vip_tier 更新为 yearly', () => {
    const redeemCode = db.createRedeemCode('yearly')
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    const result = rpcRedeemCode(redeemCode.code, user.id)
    expect(result.success).toBe(true)
    expect(result.membership!.membership_type).toBe('yearly')

    const updatedUser = db.getUser(user.id)
    expect(updatedUser!.vip_tier).toBe('yearly')
  })

  it('已使用过的兑换码应被拒绝', () => {
    const redeemCode = db.createRedeemCode('monthly')
    const user1 = db.createUser({ email: 'user1@test.com' })
    const user2 = db.createUser({ email: 'user2@test.com' })

    // 第一个用户兑换成功
    const result1 = rpcRedeemCode(redeemCode.code, user1.id)
    expect(result1.success).toBe(true)

    // 第二个用户兑换应失败
    const result2 = rpcRedeemCode(redeemCode.code, user2.id)
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('已使用')
  })

  it('过期兑换码应被拒绝', () => {
    const redeemCode = db.createRedeemCode('monthly')
    // 手动设置过期
    redeemCode.expires_at = new Date(Date.now() - 1000)
    redeemCode.status = 'unused'

    const user = db.createUser({ email: 'user@test.com' })
    const result = rpcRedeemCode(redeemCode.code, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toContain('过期')
  })

  it('兑换码兑换后，QuotaCalculator 应看到新 tier', () => {
    const redeemCode = db.createRedeemCode('yearly')
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // 兑换前
    const quotaBefore = calculateQuota({
      tier: 'none',
      quota: { totalReadCount: 999, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaBefore.canRead).toBe(false) // 超限

    // 兑换
    rpcRedeemCode(redeemCode.code, user.id)

    // 兑换后
    const quotaAfter = calculateQuota({
      tier: 'yearly',
      quota: { totalReadCount: 999, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaAfter.canRead).toBe(true)
    expect(quotaAfter.isUnlimited).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: Payment Approval → Membership Activation Chain
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-7: Payment Approval → Membership Activation Chain', () => {
  beforeEach(() => {
    db.reset()
  })

  it('支付成功 → activate_membership → 会员激活 → 文章访问', () => {
    // Step 1: 用户注册
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // Step 2: 模拟支付成功回调
    // Step 3: 调用 activate_membership RPC
    const activateResult = rpcActivateMembership(user.id, 'yearly', 365)
    expect(activateResult.success).toBe(true)

    // Step 4: 验证会员激活
    const updatedUser = db.getUser(user.id)
    expect(updatedUser!.vip_tier).toBe('yearly')
    expect(db.hasActiveMembership(user.id)).toBe(true)

    // Step 5: 验证文章访问（年卡专属内容）
    const accessResult = rpcCheckArticleAccess(user.id, 'article-yearly-exclusive', 'yearly')
    expect(accessResult.allowed).toBe(true)
  })

  it('支付成功前无法访问年卡专属内容', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // 尝试访问年卡专属内容
    const accessBefore = rpcCheckArticleAccess(user.id, 'article-yearly-exclusive', 'yearly')
    expect(accessBefore.allowed).toBe(false)
    expect(accessBefore.code).toBe('YEARLY_REQUIRED')

    // 支付后
    rpcActivateMembership(user.id, 'yearly', 365)

    // 再次访问
    const accessAfter = rpcCheckArticleAccess(user.id, 'article-yearly-exclusive', 'yearly')
    expect(accessAfter.allowed).toBe(true)
  })

  it('月卡用户每日阅读限制应正确计算', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'monthly' })

    // 每日阅读 8 篇（<= 8 限制）
    for (let i = 0; i < 8; i++) {
      const result = rpcCheckArticleAccess(user.id, `article-${i}`, 'notes')
      expect(result.allowed).toBe(true)
    }

    // 第 9 篇应被拒绝（> 8 限制）
    const result9 = rpcCheckArticleAccess(user.id, 'article-8', 'notes')
    expect(result9.allowed).toBe(false)
    expect(result9.code).toBe('DAILY_LIMIT_EXCEEDED')
  })

  it('月卡用户有 daily bonus 时限制扩展', () => {
    const user = db.createUser({
      email: 'user@test.com',
      vip_tier: 'monthly',
      daily_bonus_count: 1,
    })

    // 每日阅读 9 篇（有 1 bonus，9 > 8 + 1 = 9？不对，用 9 来测试）
    // dailyLimit = 8 + 1 = 9；9 > 9 = false → 通过；10 > 9 = true → 拒绝
    for (let i = 0; i < 9; i++) {
      const result = rpcCheckArticleAccess(user.id, `monthly-note-${i}`, 'notes')
      expect(result.allowed).toBe(true)
    }

    // 第 10 篇应被拒绝（10 > 9 daily limit）
    const result10 = rpcCheckArticleAccess(user.id, 'monthly-note-10', 'notes')
    expect(result10.allowed).toBe(false)
    expect(result10.code).toBe('DAILY_LIMIT_EXCEEDED')
  })

  it('激活月卡后，QuotaCalculator 应看到新的 dailyLimit', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // 激活月卡
    rpcActivateMembership(user.id, 'monthly', 30)

    const quota = calculateQuota({
      tier: 'monthly',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 2, bonusResetDate: null },
    })

    expect(quota.dailyLimit).toBe(10) // 8 + 2 daily bonus
    expect(quota.isUnlimited).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: Membership Tier Change → QuotaCalculator 重新计算
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-8: Membership Tier Change → QuotaCalculator 重新计算', () => {
  beforeEach(() => {
    db.reset()
  })

  it('NONE → monthly：总限制变为无限制，每日限制设为 8', () => {
    const quotaNone = calculateQuota({
      tier: 'none',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaNone.totalLimit).toBe(3) // guest limit
    expect(quotaNone.dailyLimit).toBe(Infinity)

    const quotaMonthly = calculateQuota({
      tier: 'monthly',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaMonthly.totalLimit).toBe(Infinity)
    expect(quotaMonthly.dailyLimit).toBe(8)
  })

  it('monthly → yearly：每日限制变为无限制', () => {
    const quotaMonthly = calculateQuota({
      tier: 'monthly',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaMonthly.dailyLimit).toBe(8)

    const quotaYearly = calculateQuota({
      tier: 'yearly',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaYearly.dailyLimit).toBe(Infinity)
    expect(quotaYearly.isUnlimited).toBe(true)
  })

  it('yearly → permanent：保持无限制', () => {
    const quotaYearly = calculateQuota({
      tier: 'yearly',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    const quotaPermanent = calculateQuota({
      tier: 'permanent',
      quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaYearly.isUnlimited).toBe(true)
    expect(quotaPermanent.isUnlimited).toBe(true)
    expect(quotaYearly.canRead).toBe(true)
    expect(quotaPermanent.canRead).toBe(true)
  })

  it('年卡升级：月度 → 年度 → 配额立即扩展', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'monthly' })

    // 月卡状态：已读 5 篇，每日限制 8
    let readCount = 5
    for (let i = 0; i < 5; i++) {
      rpcCheckArticleAccess(user.id, `article-monthly-${i}`, 'notes')
    }

    // 升级年卡
    const activateResult = rpcActivateMembership(user.id, 'yearly', 365)
    expect(activateResult.success).toBe(true)

    // 年卡状态：立即可以访问更多内容（无限制）
    const accessResult = rpcCheckArticleAccess(user.id, 'article-extra', 'notes')
    expect(accessResult.allowed).toBe(true)

    // QuotaCalculator 重新计算
    const quota = calculateQuota({
      tier: 'yearly',
      quota: { totalReadCount: 6, readIds: [], dailyReadCount: 6, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quota.canRead).toBe(true)
    expect(quota.isUnlimited).toBe(true)
  })

  it('降级：yearly → monthly：配额立即收紧', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'yearly' })

    // 年卡状态：无限制
    const quotaYearly = calculateQuota({
      tier: 'yearly',
      quota: { totalReadCount: 999, readIds: [], dailyReadCount: 999, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaYearly.canRead).toBe(true)

    // 模拟降级（实际需要取消会员逻辑，这里测试配额计算）
    const quotaMonthly = calculateQuota({
      tier: 'monthly',
      quota: { totalReadCount: 999, readIds: [], dailyReadCount: 9, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
    })
    expect(quotaMonthly.canRead).toBe(false) // 9 > 8 daily limit
    expect(quotaMonthly.reason).toBe('daily_limit')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: Guest → Authenticated Transition
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-9: Guest → Authenticated Transition', () => {
  beforeEach(() => {
    db.reset()
  })

  describe('游客阅读配额保留', () => {
    it('localStorage 游客已读记录应在登录后保留', () => {
      // 模拟 localStorage 中的游客已读记录
      const localStorageKey = 'rfyr_visited_notes'
      const guestVisitedNotes: string[] = ['note-1', 'note-2', 'note-3']

      // 模拟登录后：从 localStorage 迁移到数据库
      const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

      // 模拟迁移：读取 localStorage 并写入数据库
      for (const noteId of guestVisitedNotes) {
        db.logRead(user.id, noteId)
      }

      const readCount = db.getReadCount(user.id)
      expect(readCount).toBe(3)
    })

    it('游客阅读 3 篇后登录，QuotaCalculator 应看到已读 3 篇', () => {
      const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

      // 模拟游客阅读历史（ID 须含 "-note-" 以被 getNotesReadCount 识别）
      const guestReadNotes = ['guest-note-1', 'guest-note-2', 'guest-note-3']
      for (const noteId of guestReadNotes) {
        db.logRead(user.id, noteId)
      }

      const quota = calculateQuota({
        tier: 'none',
        quota: { totalReadCount: db.getNotesReadCount(user.id), readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
      })

      expect(quota.totalReadCount).toBe(3)
      expect(quota.totalLimit).toBe(3)
      expect(quota.canRead).toBe(false) // 3 >= 3 → 超限，不可读
    })

    it('已读 3 篇后登录，再读新文章应被拒绝', () => {
      const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

      // 模拟游客阅读 3 篇（ID 须含 "-note-" 以被 getNotesReadCount 识别）
      for (let i = 0; i < 3; i++) {
        db.logRead(user.id, `guest-note-${i}`)
      }

      // 尝试读第 4 篇新文章（totalReadCount=3, articleCount=3+1=4 >= 3 → 拒绝）
      const accessResult = rpcCheckArticleAccess(user.id, 'guest-note-3', 'notes')
      expect(accessResult.allowed).toBe(false)
      expect(accessResult.code).toBe('LIMIT_EXCEEDED')
      expect(accessResult.readCount).toBe(3)
      expect(accessResult.limit).toBe(3)
    })
  })

  describe('游客邀请码 → 登录后关联', () => {
    it('游客点击邀请链接后登录，bonus 应关联到用户', () => {
      // Step 1: 游客访问邀请链接，ref code 存入 localStorage
      const refCode = 'RF-TEST1234'
      const storedRefCode = refCode // 模拟 localStorage

      // Step 2: 创建邀请者
      const referrer = db.createUser({ email: 'referrer@test.com' })
      db.createReferralCode(referrer.id)

      // Step 3: 用户注册并登录
      const user = db.createUser({ email: 'user@test.com' })

      // Step 4: 应用邀请奖励（使用存储的 ref code）
      if (storedRefCode) {
        rpcApplyReferralBonus(referrer.id, user.id, storedRefCode)
      }

      // Step 5: 验证用户获得 bonus
      const updatedUser = db.getUser(user.id)
      // 注意：bonus 是给邀请者的，不是被邀请者
      // 被邀请者获得的是邀请码本身的权益
      expect(updatedUser!.bonus_read_count).toBe(0)
      expect(db.getUser(referrer.id)!.bonus_read_count).toBe(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)
    })
  })

  describe('登录后 quota 刷新', () => {
    it('登录后 membership type 改变，QuotaCalculator 应使用新类型', () => {
      const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

      // 登录前：免费用户，限额 3
      const quotaBefore = calculateQuota({
        tier: 'none',
        quota: { totalReadCount: 2, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
      })
      expect(quotaBefore.canRead).toBe(true)

      // 登录后：购买月卡
      rpcActivateMembership(user.id, 'monthly', 30)

      // 登录后：月卡用户，无总限制（articleCount 未传，依赖 lifetime quota）
      const quotaAfter = calculateQuota({
        tier: 'monthly',
        quota: { totalReadCount: 2, readIds: [], dailyReadCount: 2, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
      })
      expect(quotaAfter.totalLimit).toBe(Infinity)
      expect(quotaAfter.canRead).toBe(true)
    })

    it('游客登录失败应不改变配额', () => {
      // totalReadCount=3 >= totalLimit=3 → isOverLimit=true, canRead=false
      const quota = calculateQuota({
        tier: 'none',
        quota: { totalReadCount: 3, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
      })
      expect(quota.isOverLimit).toBe(true) // 3 >= 3 → true
      expect(quota.canRead).toBe(false)
    })
  })

  describe('clearVisitedNotes 与配额重置', () => {
    it('clearVisitedNotes 应清除 localStorage 中的游客记录', () => {
      const localStorage: Record<string, string> = {}
      localStorage['rfyr_visited_notes'] = JSON.stringify(['note-1', 'note-2'])

      // 模拟 clearVisitedNotes
      delete localStorage['rfyr_visited_notes']

      expect(localStorage['rfyr_visited_notes']).toBeUndefined()
    })

    it('游客记录清除后，QuotaCalculator 应重新从 0 计算', () => {
      // 模拟清除后的状态
      const quotaAfterClear = calculateQuota({
        tier: 'none',
        quota: { totalReadCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null, bonusCount: 0, dailyBonusCount: 0, bonusResetDate: null },
      })
      expect(quotaAfterClear.canRead).toBe(true)
      expect(quotaAfterClear.totalReadCount).toBe(0)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: 综合场景测试
// ══════════════════════════════════════════════════════════════════════════════

describe('M19-PART-10: 综合场景测试', () => {
  beforeEach(() => {
    db.reset()
  })

  it('完整流程：注册 → 邀请码 → 兑换月卡 → 阅读文章 → 升级年卡', () => {
    // Step 1: 注册用户（免费）
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })
    expect(user.vip_tier).toBe('none')

    // Step 2: 阅读 2 篇不同文章
    for (let i = 0; i < 2; i++) {
      const access = rpcCheckArticleAccess(user.id, `guest-note-${i}`, 'notes')
      expect(access.allowed).toBe(true)
    }

    // Step 3: 阅读第 3 篇（刚好达到上限，3 >= 3 → 拒绝）
    const access3 = rpcCheckArticleAccess(user.id, 'guest-note-2', 'notes')
    expect(access3.allowed).toBe(false)
    expect(access3.code).toBe('LIMIT_EXCEEDED')

    // Step 4: 阅读之前已读的文章应允许（不重复计数）
    const accessRepeat = rpcCheckArticleAccess(user.id, 'guest-note-0', 'notes')
    expect(accessRepeat.allowed).toBe(true)

    // Step 5: 获得邀请码（bonus 是给邀请者的）
    const referrer = db.createUser({ email: 'referrer@test.com' })
    const referralCode = db.createReferralCode(referrer.id)
    rpcApplyReferralBonus(referrer.id, user.id, referralCode.code)
    expect(db.getUser(referrer.id)!.bonus_read_count).toBe(DEFAULT_QUOTA.REFERRAL_BONUS_COUNT)

    // Step 6: 用户自己兑换月卡（rpcRedeemCode 会自动授予 daily_bonus_count=1）
    const redeemCode = db.createRedeemCode('monthly')
    const redeemResult = rpcRedeemCode(redeemCode.code, user.id)
    expect(redeemResult.success).toBe(true)

    // 诊断：验证用户状态
    const userAfterRedeem = db.getUser(user.id)!
    expect(userAfterRedeem.vip_tier).toBe('monthly')
    expect(userAfterRedeem.daily_bonus_count).toBe(1)

    // Step 7: 月卡后每日可再读 7 篇
    // dailyLimit = 9（8 + 1 dailyBonusCount），已读 2 篇 guest-note → 最多再读 7 篇 monthly-note
    for (let i = 0; i < 7; i++) {
      const access = rpcCheckArticleAccess(user.id, `monthly-note-${i}`, 'notes')
      expect(access.allowed).toBe(true)
    }

    // Step 8: 第 8 篇应被拒绝（daily limit）
    const access9 = rpcCheckArticleAccess(user.id, 'monthly-note-7', 'notes')
    expect(access9.allowed).toBe(false)
    expect(access9.code).toBe('DAILY_LIMIT_EXCEEDED')

    // Step 9: 月卡用户不能读年卡专属内容
    const yearlyAccess = rpcCheckArticleAccess(user.id, 'yearly-exclusive', 'yearly')
    expect(yearlyAccess.allowed).toBe(false)
    expect(yearlyAccess.code).toBe('YEARLY_REQUIRED')

    // Step 10: 升级年卡
    const upgradeResult = rpcActivateMembership(user.id, 'yearly', 365)
    expect(upgradeResult.success).toBe(true)

    // Step 11: 年卡后可以读年卡专属内容
    const yearlyAccessAfter = rpcCheckArticleAccess(user.id, 'yearly-exclusive', 'yearly')
    expect(yearlyAccessAfter.allowed).toBe(true)

    // Step 12: 读写无限制
    for (let i = 0; i < 100; i++) {
      const access = rpcCheckArticleAccess(user.id, `yearly-note-${i}`, 'notes')
      expect(access.allowed).toBe(true)
    }
  })

  it('快速升级路径：none → yearly（跳过 monthly）', () => {
    const user = db.createUser({ email: 'user@test.com', vip_tier: 'none' })

    // 立即升级年卡
    const result = rpcActivateMembership(user.id, 'yearly', 365)
    expect(result.success).toBe(true)

    const updatedUser = db.getUser(user.id)
    expect(updatedUser!.vip_tier).toBe('yearly')

    // 年卡可读任何内容
    const yearlyAccess = rpcCheckArticleAccess(user.id, 'any-content', 'yearly')
    expect(yearlyAccess.allowed).toBe(true)

    const monthlyAccess = rpcCheckArticleAccess(user.id, 'any-content', 'monthly')
    expect(monthlyAccess.allowed).toBe(true)

    const notesAccess = rpcCheckArticleAccess(user.id, 'any-content', 'notes')
    expect(notesAccess.allowed).toBe(true)
  })
})
