/**
 * ============================================================
 * 会员状态检查工具 — 服务端
 * ============================================================
 *
 * 修复记录：
 * - P2: 使用 lib/member-tiers.ts 中的统一枚举（normalizeMemberTier）
 * - P7: 使用 lib/datetime.ts 中的 isExpired() 统一过期判断
 * - P1: 简化判断逻辑，不依赖混用的 membership_type 和 vip_tier
 */

import { createClient } from '@supabase/supabase-js'
import {
  MemberTier,
  MEMBER_TIERS,
  MEMBER_DURATION_DAYS,
  TIER_LEVEL,
  normalizeMemberTier,
  isValidMemberTier,
  isPaidTier,
  isUnlimitedTier,
} from './member-tiers'
import { isExpired, getDaysRemaining } from './datetime'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
  }
  return supabaseAdmin
}

// ─── 会员信息接口 ──────────────────────────────────────────────────────

export interface MembershipInfo {
  isMonthly: boolean
  isYearly: boolean
  isPermanent: boolean
  isPaidMember: boolean
  isUnlimited: boolean
  tier: MemberTier
  endDate?: string
  daysRemaining?: number
}

// ─── 数据库记录类型 ────────────────────────────────────────────────────

interface MembershipRecord {
  membership_type: string | null
  status: string | null
  end_date: string | null
}

interface UserRecord {
  vip_tier: string | null
}

// ─── 核心：判断会员是否有效 ─────────────────────────────────────────────

/**
 * 判断一条 membership 记录是否有效。
 * 使用统一的 isExpired() 函数处理时区（P7 修复）。
 */
function isMembershipActive(
  membership: MembershipRecord | null,
  expectedTier: MemberTier
): boolean {
  if (!membership) return false

  // 检查是否过期（使用统一时区函数，P7）
  if (isExpired(membership.end_date)) return false

  // 检查 status
  if (membership.status !== 'active') return false

  // 检查类型匹配（使用统一规范化函数，P2）
  const storedTier = normalizeMemberTier(membership.membership_type)
  if (storedTier !== expectedTier) return false

  return true
}

// ─── 获取已查询数据中的最高有效会员等级（不再重复查 DB）─────────────────────

/**
 * 从已获取的 memberships 数组中计算最高有效等级（同步，无 DB 调用）。
 * 优先级：permanent > yearly > monthly
 */
function getHighestMembershipTierFromData(memberships: MembershipRecord[]): MemberTier {
  let highest: MemberTier = MEMBER_TIERS.NONE
  for (const row of memberships) {
    if (isExpired(row.end_date)) continue
    if (row.status !== 'active') continue
    const tier = normalizeMemberTier(row.membership_type)
    if (TIER_LEVEL[tier] > TIER_LEVEL[highest]) {
      highest = tier
    }
  }
  return highest
}

// ─── 主函数：获取会员信息 ────────────────────────────────────────────────

/**
 * 获取用户会员信息。
 *
 * 策略：
 * 1. 从 memberships 表查询最高有效等级（最权威）
 * 2. fallback 到 users.vip_tier（用于修复旧数据不一致问题）
 * 3. 两个来源必须一致，否则返回不信任的数据并记录警告
 *
 * P1 修复：不再假设两个数据源一致，而是取最高等级
 * P2 修复：使用统一枚举，不再混用字符串比较
 */
export async function getMembershipInfo(userId: string): Promise<MembershipInfo> {
  const supabase = getSupabaseAdmin()

  // 并行查询两个数据源
  const [membershipsResult, userResult] = await Promise.all([
    supabase
      .from('memberships')
      .select('membership_type, status, end_date')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase.from('users').select('vip_tier').eq('id', userId).single(),
  ])

  const memberships = (membershipsResult.data ?? []) as MembershipRecord[]
  const user = userResult.data as UserRecord | null

  // 1. 从已查询的 memberships 数据中取最高有效等级（无额外 DB 查询）
  const membershipTier = getHighestMembershipTierFromData(memberships)

  // 2. 从 users.vip_tier 读取（P2：使用统一规范化）
  const vipTier = normalizeMemberTier(user?.vip_tier ?? null)

  // 3. P1 修复：检测数据不一致
  const membershipMatch = membershipTier === vipTier || membershipTier === MEMBER_TIERS.NONE || vipTier === MEMBER_TIERS.NONE
  if (!membershipMatch) {
    // 数据不一致，取较高的等级
    // 记录警告（生产环境可接入告警）
    console.warn(`[Membership] 数据不一致 userId=${userId}: memberships=${membershipTier}, vip_tier=${vipTier}`)
  }

  // 取较高等级作为权威
  const effectiveTier = TIER_LEVEL[membershipTier] >= TIER_LEVEL[vipTier]
    ? membershipTier
    : vipTier

  if (effectiveTier === MEMBER_TIERS.NONE) {
    return {
      isMonthly: false,
      isYearly: false,
      isPermanent: false,
      isPaidMember: false,
      isUnlimited: false,
      tier: MEMBER_TIERS.NONE,
    }
  }

  // 获取到期日
  const latestMembership = memberships
    .filter(m => normalizeMemberTier(m.membership_type) === effectiveTier)
    .sort((a, b) => {
      const aDate = a.end_date ? new Date(a.end_date).getTime() : 0
      const bDate = b.end_date ? new Date(b.end_date).getTime() : 0
      return bDate - aDate
    })[0]

  const endDate =
    latestMembership?.end_date ??
    memberships.find((m) => normalizeMemberTier(m.membership_type) === effectiveTier)?.end_date ??
    undefined

  return {
    isMonthly: effectiveTier === MEMBER_TIERS.MONTHLY,
    isYearly: effectiveTier === MEMBER_TIERS.YEARLY,
    isPermanent: effectiveTier === MEMBER_TIERS.PERMANENT,
    isPaidMember: isPaidTier(effectiveTier),
    isUnlimited: isUnlimitedTier(effectiveTier),
    tier: effectiveTier,
    endDate,
    daysRemaining: endDate ? getDaysRemaining(endDate) : undefined,
  }
}

// ─── 快捷检查函数 ───────────────────────────────────────────────────────

export async function isMonthlyMember(userId: string): Promise<boolean> {
  const info = await getMembershipInfo(userId)
  return info.tier === MEMBER_TIERS.MONTHLY
}

export async function isYearlyMember(userId: string): Promise<boolean> {
  const info = await getMembershipInfo(userId)
  return info.tier === MEMBER_TIERS.YEARLY
}

export async function isPermanentMember(userId: string): Promise<boolean> {
  const info = await getMembershipInfo(userId)
  return info.tier === MEMBER_TIERS.PERMANENT
}

export async function isPaidMember(userId: string): Promise<boolean> {
  const info = await getMembershipInfo(userId)
  return info.isPaidMember
}

export async function hasUnlimitedAccess(userId: string): Promise<boolean> {
  const info = await getMembershipInfo(userId)
  return info.isUnlimited
}

/**
 * 获取用户访问级别（数值）。
 * 0=免费, 1=月卡, 2=年卡, 3=永久
 */
export async function getAccessLevel(userId: string): Promise<number> {
  const info = await getMembershipInfo(userId)
  return TIER_LEVEL[info.tier]
}

/**
 * 检查用户是否有权访问指定级别的内容。
 *
 * @param requiredLevel - 所需最低等级：'free'=0, 'monthly'=1, 'yearly'=2
 */
export async function canAccess(
  userId: string,
  requiredLevel: 'free' | 'monthly' | 'yearly'
): Promise<boolean> {
  const userLevel = await getAccessLevel(userId)
  // 'free' 在 TIER_LEVEL 中对应 'none' (key = 'none')
  const normalizedLevel = requiredLevel === 'free' ? 'none' : requiredLevel
  const required = TIER_LEVEL[normalizedLevel as MemberTier] ?? 0
  return userLevel >= required
}

/**
 * 检查文章是否对用户可见。
 *
 * P2 修复：使用统一 MemberTier，不再混用字符串。
 */
export async function checkArticleAccess(
  userId: string | null,
  articleAccessLevel: 'free' | 'monthly' | 'yearly'
): Promise<{ canAccess: boolean; reason?: string; tier?: MemberTier }> {
  if (!userId) {
    // 游客
    if (articleAccessLevel === 'free') return { canAccess: true }
    return {
      canAccess: false,
      reason: '请先登录后阅读',
      tier: MEMBER_TIERS.NONE,
    }
  }

  const info = await getMembershipInfo(userId)

  // 无限制访问
  if (info.isUnlimited) return { canAccess: true, tier: info.tier }

  // 年卡专属内容
  if (articleAccessLevel === 'yearly') {
    return {
      canAccess: false,
      reason: '此文章为年卡专属内容，请升级为年卡会员',
      tier: info.tier,
    }
  }

  // 月卡可见月卡及以上内容
  if (info.isMonthly || info.isYearly) {
    return { canAccess: true, tier: info.tier }
  }

  // 月卡专属内容
  if (articleAccessLevel === 'monthly') {
    return {
      canAccess: false,
      reason: '此文章需要月卡或年卡会员权限',
      tier: info.tier,
    }
  }

  // 免费内容
  return { canAccess: true, tier: info.tier }
}
