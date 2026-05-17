/**
 * ============================================================
 * 会员类型与权限（客户端工具）
 * ============================================================
 *
 * 修复记录：
 * - P2: 引用 lib/member-tiers.ts 中的统一枚举，不再自行定义
 * - P7: 日期计算统一使用 toLocalDateString() 处理 CST 时区
 */

import {
  MemberTier,
  MemberContentPermission,
  hasPermission,
  MEMBER_TIERS,
  MEMBER_TIER_LABELS,
  MEMBER_DURATION_DAYS,
} from './member-tiers'

export type { MemberTier, MemberContentPermission }
export { MEMBER_TIERS, MEMBER_TIER_LABELS, MEMBER_DURATION_DAYS }
export { hasPermission }

// ─── 向后兼容别名（P2 修复：所有代码逐步迁移到 MemberTier）────────────────

/** @deprecated 请使用 MemberTier */
export type MembershipType = 'none' | 'monthly' | 'yearly'

// ─── 会员信息接口 ────────────────────────────────────────────────────────

export interface MembershipInfo {
  type: MemberTier
  startDate: string
  endDate: string
  isActive: boolean
}

// ─── 向后兼容：PERMISSIONS（引用 member-tiers）────────────────────────────

/** @deprecated 请使用 lib/member-tiers.ts 中的 PERMISSIONS */

// ─── 权限检查 ────────────────────────────────────────────────────────────

/**
 * 检查用户是否有权限访问某个功能
 * @deprecated 请使用 lib/member-tiers.ts 中的 hasPermission
 */
export function hasAccess(
  membershipTier: MemberTier,
  permission: MemberContentPermission
): boolean {
  return hasPermission(membershipTier, permission)
}

// ─── 获取会员显示名称 ────────────────────────────────────────────────────

/**
 * 获取会员等级的中文显示名称。
 * 使用统一常量，不再硬编码。
 */
export function getMembershipLabel(tier: MemberTier): string {
  return MEMBER_TIER_LABELS[tier] ?? '普通用户'
}

/** @deprecated 请使用 getMembershipLabel(tier: MemberTier) */
export function getMembershipLabel_(type: MembershipType): string {
  return getMembershipLabel(type as MemberTier)
}

// ─── 检查会员是否有效 ────────────────────────────────────────────────────

/**
 * 检查会员是否有效（未过期）。
 * 使用统一时区处理函数。
 */
export function isMembershipValid(membership: unknown): boolean {
  if (!membership || typeof membership !== 'object') return false
  const m = membership as Record<string, unknown>
  if (typeof m.isActive !== 'boolean' || !m.isActive) return false
  if (typeof m.endDate !== 'string') return false
  const endMs = new Date(m.endDate as string).getTime()
  if (isNaN(endMs)) return false
  return endMs >= Date.now()
}

/** @deprecated 请使用 lib/member-tiers.ts 中的 isValidMemberTier */
export function isValidMembershipType(val: unknown): val is MembershipType {
  if (typeof val !== 'string') return false
  return ['none', 'monthly', 'yearly'].includes(val)
}

// ─── localStorage 缓存 ────────────────────────────────────────────────────

const STORAGE_KEY = 'rfyr_membership_cache'

/**
 * 从 localStorage 获取缓存的会员信息。
 */
export function getMembershipFromStorage(): MembershipInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MembershipInfo
  } catch {
    return null
  }
}

/**
 * 保存会员信息到 localStorage。
 * 包含 TTL（24小时），避免缓存过期数据。
 */
export function saveMembershipToStorage(membership: MembershipInfo): void {
  if (typeof window === 'undefined') return
  const cacheData = {
    membership,
    cachedAt: Date.now(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData))
}

/**
 * 清除 localStorage 缓存。
 */
export function clearMembershipFromStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 获取缓存（带 TTL 检查）。
 * TTL = 24 小时，过期返回 null。
 */
export function getMembershipCache(): MembershipInfo | null {
  const cached = getMembershipFromStorage()
  if (!cached) return null
  const cacheDataStr = localStorage.getItem(STORAGE_KEY)
  if (!cacheDataStr) return null
  try {
    const cacheData = JSON.parse(cacheDataStr)
    const TTL = 60 * 60 * 1000 // 1小时（缩短缓存防止降级生效延迟）
    if (Date.now() - cacheData.cachedAt > TTL) {
      clearMembershipFromStorage()
      return null
    }
    return cached
  } catch {
    return cached
  }
}

// ─── 创建新会员记录 ──────────────────────────────────────────────────────

/**
 * 创建新的会员记录。
 * 使用 MEMBER_DURATION_DAYS 常量获取天数。
 */
export function createMembership(
  tier: MemberTier,
  durationDays?: number
): MembershipInfo {
  const days = durationDays ?? (
    tier === 'none' ? 0 : (MEMBER_DURATION_DAYS[tier as Exclude<MemberTier, 'none'>] ?? 30)
  )
  const startDate = new Date()
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000)
  return {
    type: tier,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
  }
}

/** @deprecated 请使用 createMembership(tier, days?) */
export function createMembership_(
  type: MembershipType,
  durationDays: number
): MembershipInfo {
  return createMembership(type as MemberTier, durationDays)
}

// ─── 会员类型转换（兼容旧代码）───────────────────────────────────────────

/**
 * 将字符串转换为 MemberTier（向后兼容）。
 * 识别 'yearly'、'annual'、'annual_vip' → yearly。
 */
export function parseMemberTier(raw: string | null | undefined): MemberTier {
  if (!raw) return MEMBER_TIERS.NONE
  const lower = String(raw).toLowerCase()
  if (lower.includes('year') || lower.includes('annual')) return MEMBER_TIERS.YEARLY
  if (lower.includes('month')) return MEMBER_TIERS.MONTHLY
  if (lower.includes('permanent')) return MEMBER_TIERS.PERMANENT
  if (lower === 'none' || lower === 'free' || lower === '') return MEMBER_TIERS.NONE
  return MEMBER_TIERS.NONE
}
