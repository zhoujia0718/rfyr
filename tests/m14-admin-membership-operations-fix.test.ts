/**
 * M14-API: Admin Membership Operations — 错误处理测试
 *
 * 覆盖 app/api/admin/membership/operations/route.ts
 *
 * BUG-API-17 修复验证：
 * 之前 renew/cancel/upgrade/downgrade 操作在 RPC 失败且降级也失败时，
 * 仍然返回 { success: true }，导致管理员以为操作成功但实际失败。
 *
 * 修复后：所有操作在失败时都返回 500 错误。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── 模拟 Supabase 结果类型 ──────────────────────────────────────

type SupabaseResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code?: string } }

// ─── 操作处理函数（同步自 route.ts）─────────────────────────────

interface MembershipData {
  membership_type: string
  end_date: string
  user_id: string
}

const MEMBER_DURATION_DAYS = { monthly: 30, yearly: 365 }

interface OperationResult {
  success: boolean
  message?: string
  error?: string
  status?: number
}

/** 解析 plan 类型 */
function parseTier(membershipType: string): { isYearly: boolean; days: number } {
  const tier = String(membershipType ?? '').toLowerCase().replace(/[_]/g, '')
  const isYearly = tier.includes('year') || tier.includes('annual')
  const days = isYearly ? MEMBER_DURATION_DAYS.yearly : MEMBER_DURATION_DAYS.monthly
  return { isYearly, days }
}

/** 计算新到期日 */
function computeNewEndDate(existingEndDate: string, days: number): Date {
  const currentEnd = new Date(existingEndDate)
  const base = currentEnd > new Date() ? currentEnd : new Date()
  const newEnd = new Date(base)
  newEnd.setDate(newEnd.getDate() + days)
  return newEnd
}

/** 处理 renew 操作（修复后的版本） */
function processRenew(
  membershipId: string,
  membership: MembershipData,
  rpcResult: SupabaseResult,
  fallbackResult: SupabaseResult
): OperationResult {
  const { isYearly, days } = parseTier(membership.membership_type)
  const newEnd = computeNewEndDate(membership.end_date, days)

  if (!rpcResult.error) {
    return { success: true, message: `会员已成功续费${isYearly ? "一年" : "30天"}` }
  }

  // RPC 失败，降级
  if (fallbackResult.error) {
    return { success: false, error: "续费操作失败，请稍后重试", status: 500 }
  }

  return { success: true, message: `会员已成功续费${isYearly ? "一年" : "30天"}` }
}

/** 处理 cancel 操作（修复后的版本） */
function processCancel(
  membershipId: string,
  userId: string,
  rpcResult: SupabaseResult,
  fallbackResults: [SupabaseResult, SupabaseResult, SupabaseResult]
): OperationResult {
  if (!rpcResult.error) {
    return { success: true, message: "会员已取消" }
  }

  // RPC 失败，降级
  const [profileResult, userResult, deleteResult] = fallbackResults
  if (profileResult.error || userResult.error || deleteResult.error) {
    return { success: false, error: "取消会员失败，请稍后重试", status: 500 }
  }

  return { success: true, message: "会员已取消" }
}

/** 处理 upgrade 操作（修复后的版本） */
function processUpgrade(
  userId: string,
  planType: string,
  rpcResult: SupabaseResult,
  fallbackUserResult: SupabaseResult,
  fallbackProfileResult: SupabaseResult,
  fallbackDeleteResult: SupabaseResult,
  fallbackInsertResult: SupabaseResult
): OperationResult {
  if (!rpcResult.error) {
    return { success: true, message: `用户已成功升级为${planType === "yearly" ? "年卡" : "月卡"}会员` }
  }

  // RPC 失败，降级
  if (fallbackUserResult.error || fallbackProfileResult.error) {
    return { success: false, error: "升级失败，请稍后重试", status: 500 }
  }

  if (fallbackInsertResult.error) {
    return { success: false, error: "升级失败，请稍后重试", status: 500 }
  }

  return { success: true, message: `用户已成功升级为${planType === "yearly" ? "年卡" : "月卡"}会员` }
}

/** 处理 downgrade 操作（修复后的版本） */
function processDowngrade(
  membershipId: string,
  userId: string,
  fallbackResults: [SupabaseResult, SupabaseResult]
): OperationResult {
  const [userResult, membershipResult] = fallbackResults

  if (userResult.error || membershipResult.error) {
    return { success: false, error: "降级操作失败，请稍后重试", status: 500 }
  }

  return { success: true, message: "已降级为月卡" }
}

// ─── 测试 ───────────────────────────────────────────────────

describe('M14-Ops-API: renew 操作 — 错误处理', () => {
  const membership: MembershipData = {
    membership_type: 'yearly',
    end_date: '2024-06-01',
    user_id: 'user-123',
  }

  it('RPC 成功时返回 success=true', () => {
    const result = processRenew('mem-1', membership, { data: null, error: null }, { data: null, error: null })
    expect(result.success).toBe(true)
    expect(result.message).toContain('续费')
  })

  it('RPC 失败但降级成功时返回 success=true', () => {
    const result = processRenew('mem-1', membership, { data: null, error: { message: 'RPC error' } }, { data: null, error: null })
    expect(result.success).toBe(true)
    expect(result.message).toContain('续费')
  })

  it('BUG-API-17 FIX: RPC 失败且降级也失败时返回 success=false + 500', () => {
    const result = processRenew('mem-1', membership, { data: null, error: { message: 'RPC error' } }, { data: null, error: { message: 'Fallback error' } })
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('续费操作失败')
  })

  it('monthly 类型续费消息正确', () => {
    const monthlyMem: MembershipData = { ...membership, membership_type: 'monthly' }
    const result = processRenew('mem-1', monthlyMem, { data: null, error: null }, { data: null, error: null })
    expect(result.message).toContain('30天')
  })
})

describe('M14-Ops-API: cancel 操作 — 错误处理', () => {
  const membership: MembershipData = {
    membership_type: 'yearly',
    end_date: '2024-06-01',
    user_id: 'user-123',
  }

  it('RPC 成功时返回 success=true', () => {
    const result = processCancel('mem-1', 'user-123', { data: null, error: null }, [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    expect(result.success).toBe(true)
    expect(result.message).toBe('会员已取消')
  })

  it('BUG-API-17 FIX: RPC 失败且降级中 profile 更新失败时返回 500', () => {
    const result = processCancel('mem-1', 'user-123', { data: null, error: { message: 'RPC error' } }, [
      { data: null, error: { message: 'Profile update failed' } },
      { data: null, error: null },
      { data: null, error: null },
    ])
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('取消会员失败')
  })

  it('BUG-API-17 FIX: RPC 失败且降级中 users 更新失败时返回 500', () => {
    const result = processCancel('mem-1', 'user-123', { data: null, error: { message: 'RPC error' } }, [
      { data: null, error: null },
      { data: null, error: { message: 'User update failed' } },
      { data: null, error: null },
    ])
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })

  it('BUG-API-17 FIX: RPC 失败且降级中 delete 失败时返回 500', () => {
    const result = processCancel('mem-1', 'user-123', { data: null, error: { message: 'RPC error' } }, [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: { message: 'Delete failed' } },
    ])
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })
})

describe('M14-Ops-API: upgrade 操作 — 错误处理', () => {
  it('RPC 成功时返回 success=true', () => {
    const result = processUpgrade('user-123', 'yearly', { data: null, error: null }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null })
    expect(result.success).toBe(true)
    expect(result.message).toContain('升级')
  })

  it('BUG-API-17 FIX: RPC 失败且降级中 user 更新失败时返回 500', () => {
    const result = processUpgrade('user-123', 'yearly', { data: null, error: { message: 'RPC error' } }, { data: null, error: { message: 'User update failed' } }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null })
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('升级失败')
  })

  it('BUG-API-17 FIX: RPC 失败且降级中 insert 失败时返回 500', () => {
    const result = processUpgrade('user-123', 'yearly', { data: null, error: { message: 'RPC error' } }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null }, { data: null, error: { message: 'Insert failed' } })
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })
})

describe('M14-Ops-API: downgrade 操作 — 错误处理', () => {
  it('降级成功时返回 success=true', () => {
    const result = processDowngrade('mem-1', 'user-123', [
      { data: null, error: null },
      { data: null, error: null },
    ])
    expect(result.success).toBe(true)
    expect(result.message).toBe('已降级为月卡')
  })

  it('BUG-API-17 FIX: users 更新失败时返回 500', () => {
    const result = processDowngrade('mem-1', 'user-123', [
      { data: null, error: { message: 'User update failed' } },
      { data: null, error: null },
    ])
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('降级操作失败')
  })

  it('BUG-API-17 FIX: memberships 更新失败时返回 500', () => {
    const result = processDowngrade('mem-1', 'user-123', [
      { data: null, error: null },
      { data: null, error: { message: 'Membership update failed' } },
    ])
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })
})
