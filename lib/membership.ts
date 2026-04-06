// 会员类型定义
export type MembershipType = 'none' | 'weekly' | 'yearly'

// 会员信息接口
export interface MembershipInfo {
  type: MembershipType
  startDate: string
  endDate: string
  isActive: boolean
}

// 权限配置
export const PERMISSIONS = {
  // 投资日历 - 所有用户可见
  calendar: ['none', 'weekly', 'yearly'],
  // 大佬合集 - 所有用户可见
  masters: ['none', 'weekly', 'yearly'],
  // 短线笔记 - 会员可见
  notes: ['weekly', 'yearly'],
  // 个股挖掘 - 年度会员专属
  stocks: ['yearly'],
  // PDF下载 - 年度会员专属
  pdfDownload: ['yearly'],
  // 会员中心 - 所有用户可见
  membership: ['none', 'weekly', 'yearly'],
} as const

// 检查用户是否有权限访问某个功能
export function hasPermission(
  membershipType: MembershipType,
  permission: keyof typeof PERMISSIONS
): boolean {
  return (PERMISSIONS[permission] as readonly MembershipType[]).includes(membershipType)
}

// 获取会员显示名称
export function getMembershipLabel(type: MembershipType): string {
  const labels: Record<MembershipType, string> = {
    none: '普通用户',
    weekly: '周卡会员',
    yearly: '年度VIP',
  }
  return labels[type]
}

// 检查会员是否有效
export function isMembershipValid(membership: unknown): boolean {
  if (!membership || typeof membership !== 'object') return false
  const m = membership as Record<string, unknown>
  if (typeof m.isActive !== 'boolean' || !m.isActive) return false
  if (typeof m.endDate !== 'string') return false
  return new Date(m.endDate) >= new Date()
}

// 从localStorage获取会员信息
export function getMembershipFromStorage(): MembershipInfo | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem('membership')
  if (!stored) return null
  try {
    return JSON.parse(stored) as MembershipInfo
  } catch {
    return null
  }
}

// 保存会员信息到localStorage
export function saveMembershipToStorage(membership: MembershipInfo): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('membership', JSON.stringify(membership))
}

// 清除会员信息
export function clearMembershipFromStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('membership')
}

// 创建新的会员记录
export function createMembership(
  type: MembershipType,
  durationDays: number
): MembershipInfo {
  const startDate = new Date()
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + durationDays)

  return {
    type,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
  }
}
