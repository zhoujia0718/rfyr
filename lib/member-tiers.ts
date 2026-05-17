/**
 * ============================================================
 * 会员类型统一枚举 — 全系统单一真实来源
 * ============================================================
 *
 * 背景：系统历史上存在 5 种会员类型的命名方式（P2 问题）：
 *   - 'monthly' / 'yearly'         ← lib/membership.ts (客户端，标准)
 *   - 'monthly_vip' / 'annual_vip' ← admin/operations (旧遗留)
 *   - 'free' / 'monthly' / 'yearly' / 'permanent' ← api-types.ts
 *   - 'none'                        ← users.vip_tier 空值表示
 *   - 'monthly' / 'yearly'         ← memberships.membership_type
 *
 * 解决方案：定义 MEMBER_TIERS 为全系统唯一真实来源。
 * 所有代码必须使用以下标准值：
 *   'none'      — 免费用户
 *   'monthly'   — 月卡会员（30天）
 *   'yearly'    — 年度会员（365天）
 *   'permanent' — 永久会员
 *
 * 数据库存储规范：
 *   users.vip_tier           → 'none' | 'monthly' | 'yearly' | 'permanent'
 *   memberships.membership_type → 'monthly' | 'yearly' | 'permanent'
 *
 * 重要：旧数据中的 'monthly_vip' / 'annual_vip' 应通过迁移脚本
 * 批量清洗为 'monthly' / 'yearly'。
 */

// ─── 枚举定义 ────────────────────────────────────────────────────────────────

/** 会员等级 — 全系统唯一真实来源 */
export const MEMBER_TIERS = {
  NONE: 'none',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  PERMANENT: 'permanent',
} as const

export type MemberTier = (typeof MEMBER_TIERS)[keyof typeof MEMBER_TIERS]

/** 所有付费等级（不含 free） */
export const PAID_TIERS = [MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT] as const

/** 有效会员等级数组（用于 hasPermission 等函数） */
export const VALID_TIERS = Object.values(MEMBER_TIERS)

/** 等级数值映射（用于数值比较，如 canAccess >= required） */
export const TIER_LEVEL: Record<MemberTier, number> = {
  none: 0,
  monthly: 1,
  yearly: 2,
  permanent: 3,
}

// ─── 与旧命名系统的兼容映射 ────────────────────────────────────────────────

/** memberships 表中旧命名 → 新命名的映射（用于读取时兼容） */
export const LEGACY_MEMBERSHIP_TYPE_MAP: Record<string, MemberTier> = {
  // 新标准命名（直接映射）
  monthly: MEMBER_TIERS.MONTHLY,
  yearly: MEMBER_TIERS.YEARLY,
  permanent: MEMBER_TIERS.PERMANENT,
  // 旧遗留命名（兼容映射，统一小写 key）
  monthlyvip: MEMBER_TIERS.MONTHLY,
  annualvip: MEMBER_TIERS.YEARLY,
  yearlyvip: MEMBER_TIERS.YEARLY,
  // 忽略值
  none: MEMBER_TIERS.NONE,
  null: MEMBER_TIERS.NONE,
  '': MEMBER_TIERS.NONE,
}

/**
 * 将任意会员类型字符串规范化为标准 MemberTier。
 * 用于：数据库读取时、API 参数校验时。
 */
export function normalizeMemberTier(raw: string | null | undefined): MemberTier {
  if (!raw) return MEMBER_TIERS.NONE
  const key = String(raw).toLowerCase().replace(/[_]/g, '').trim()
  return LEGACY_MEMBERSHIP_TYPE_MAP[key] ?? MEMBER_TIERS.NONE
}

/**
 * 检查字符串是否为有效的 MemberTier。
 * 用于：参数校验、类型守卫。
 */
export function isValidMemberTier(val: unknown): val is MemberTier {
  return typeof val === 'string' && VALID_TIERS.includes(val as MemberTier)
}

/**
 * 检查会员等级是否付费（monthly 及以上）。
 */
export function isPaidTier(tier: MemberTier): boolean {
  return tier !== MEMBER_TIERS.NONE
}

/**
 * 检查会员等级是否有无限访问权限（yearly 及以上）。
 */
export function isUnlimitedTier(tier: MemberTier): boolean {
  return tier === MEMBER_TIERS.YEARLY || tier === MEMBER_TIERS.PERMANENT
}

// ─── 会员时长配置 ─────────────────────────────────────────────────────────

export const MEMBER_DURATION_DAYS: Record<Exclude<MemberTier, 'none'>, number> = {
  monthly: 30,
  yearly: 365,
  permanent: 365 * 100, // 永久 ≈ 100 年
}

// ─── UI 显示标签 ──────────────────────────────────────────────────────────

export const MEMBER_TIER_LABELS: Record<MemberTier, string> = {
  none: '普通用户',
  monthly: '月卡会员',
  yearly: '年度VIP',
  permanent: '永久会员',
}

// ─── 数据库表字段规范 ────────────────────────────────────────────────────

/**
 * 数据库存储时的会员类型值。
 * 注意：users.vip_tier 用 'none'，memberships.membership_type 不存 'none'。
 */
export type DbMembershipType = 'monthly' | 'yearly' | 'permanent'

export const DB_MEMBERSHIP_TYPES: DbMembershipType[] = ['monthly', 'yearly', 'permanent']

/**
 * 将 MemberTier 转换为数据库 memberships 表的 membership_type 值。
 * 'none' 不会写入 memberships 表。
 */
export function toDbMembershipType(tier: MemberTier): DbMembershipType | null {
  if (tier === MEMBER_TIERS.NONE) return null
  if (tier === MEMBER_TIERS.MONTHLY) return 'monthly'
  if (tier === MEMBER_TIERS.YEARLY) return 'yearly'
  if (tier === MEMBER_TIERS.PERMANENT) return 'permanent'
  return null
}

/**
 * 将数据库 membership_type 值转换为 MemberTier。
 * 自动处理旧命名（monthly_vip → monthly, annual_vip → yearly）。
 */
export function fromDbMembershipType(dbType: string | null | undefined): MemberTier {
  return normalizeMemberTier(dbType ?? null)
}

// ─── Permission 配置（引用统一枚举）─────────────────────────────────────

export const PERMISSIONS = {
  calendar: [MEMBER_TIERS.NONE, MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
  masters: [MEMBER_TIERS.NONE, MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
  notes: [MEMBER_TIERS.NONE, MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
  stocks: [MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
  // 书籍页面所有人均可访问；下载权限由 /api/books/download 在服务端控制
  books: [MEMBER_TIERS.NONE, MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
  membership: [MEMBER_TIERS.NONE, MEMBER_TIERS.MONTHLY, MEMBER_TIERS.YEARLY, MEMBER_TIERS.PERMANENT],
} as const

export type MemberContentPermission = Exclude<keyof typeof PERMISSIONS, 'membership'>

/**
 * 检查会员是否有权访问指定功能。
 * 使用统一枚举，不再依赖字符串数组匹配。
 */
export function hasPermission(tier: MemberTier, permission: keyof typeof PERMISSIONS): boolean {
  return (PERMISSIONS[permission] as readonly MemberTier[]).includes(tier)
}
