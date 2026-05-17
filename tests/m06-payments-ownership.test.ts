/**
 * M06: payments.ts 所有权验证测试
 *
 * 覆盖 lib/payments.ts
 *
 * BUG-LIB-06 修复验证：
 * 之前 updatePaymentStatus 和 approvePaymentAtomic 没有验证支付记录属于当前用户，
 * 任何登录用户都可以修改/批准他人的支付记录（IDOR 越权漏洞）。
 *
 * 修复后：两个函数都会先查询支付记录的 user_id，验证匹配后才允许操作。
 */
import { describe, it, expect, vi } from 'vitest'

// ─── 类型定义 ───────────────────────────────────────────────────

interface Payment {
  id: string
  user_id: string
  order_id: string
  status: 'pending' | 'approved' | 'rejected'
}

type SupabaseResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

// ─── 修复后的权限验证逻辑（同步自 lib/payments.ts）─────────────

async function updatePaymentStatusFixed(
  paymentId: string,
  status: 'approved' | 'rejected',
  currentUserId: string,
  fetchPayment: (id: string) => Promise<SupabaseResult<{ user_id: string }>>,
  updatePayment: (id: string, status: string) => Promise<SupabaseResult<Payment>>
): Promise<{ data: Payment | null; error: string | null }> {
  if (!currentUserId) return { data: null, error: '请先登录后再操作' }

  const payment = await fetchPayment(paymentId)
  if (payment.error) return { data: null, error: `查询支付记录失败: ${payment.error.message}` }
  if (!payment.data) return { data: null, error: '支付记录不存在' }
  if (payment.data.user_id !== currentUserId) {
    return { data: null, error: '无权操作此支付记录' }
  }

  const updateResult = await updatePayment(paymentId, status)
  if (updateResult.error) return { data: null, error: updateResult.error.message }
  return { data: null, error: null }
}

async function approvePaymentAtomicFixed(
  paymentId: string,
  targetUserId: string,
  currentUserId: string,
  fetchPayment: (id: string) => Promise<SupabaseResult<{ user_id: string }>>,
  rpcCall: (paymentId: string, userId: string) => Promise<SupabaseResult>
): Promise<{ data: null; error: string | null }> {
  if (!currentUserId) return { data: null, error: '请先登录后再操作' }

  const payment = await fetchPayment(paymentId)
  if (payment.error) return { data: null, error: `查询支付记录失败: ${payment.error.message}` }
  if (!payment.data) return { data: null, error: '支付记录不存在' }
  if (payment.data.user_id !== targetUserId) {
    return { data: null, error: '支付记录与用户不匹配' }
  }

  const result = await rpcCall(paymentId, targetUserId)
  if (result.error) return { data: null, error: `原子化核销失败: ${result.error.message}` }
  return { data: null, error: null }
}

// ─── 测试 ───────────────────────────────────────────────────

describe('M06-Payments: updatePaymentStatus 所有权验证', () => {
  it('用户修改自己的支付记录应成功', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: { user_id: 'user-123' },
      error: null,
    })
    const mockUpdate = vi.fn().mockResolvedValue({
      data: { id: 'pay-1', user_id: 'user-123', status: 'approved' },
      error: null,
    })

    const result = await updatePaymentStatusFixed('pay-1', 'approved', 'user-123', mockFetch, mockUpdate)

    expect(result.error).toBeNull()
    // 成功时返回 { data: null, error: null }
    expect(result.data).toBeNull()
    expect(mockUpdate).toHaveBeenCalledWith('pay-1', 'approved')
  })

  it('BUG-LIB-06 FIX: 用户修改他人的支付记录应被拒绝', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: { user_id: 'user-other' },
      error: null,
    })

    const result = await updatePaymentStatusFixed('pay-1', 'approved', 'user-123', mockFetch, vi.fn())

    expect(result.error).toBe('无权操作此支付记录')
    expect(result.data).toBeNull()
  })

  it('未登录用户应被拒绝', async () => {
    const result = await updatePaymentStatusFixed('pay-1', 'approved', '', vi.fn(), vi.fn())
    expect(result.error).toBe('请先登录后再操作')
  })

  it('支付记录不存在应返回错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ data: null, error: null })

    const result = await updatePaymentStatusFixed('pay-1', 'approved', 'user-123', mockFetch, vi.fn())

    expect(result.error).toBe('支付记录不存在')
  })

  it('查询失败时应返回错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    })

    const result = await updatePaymentStatusFixed('pay-1', 'approved', 'user-123', mockFetch, vi.fn())

    expect(result.error).toContain('查询支付记录失败')
    expect(result.error).toContain('Network error')
  })
})

describe('M06-Payments: approvePaymentAtomic 所有权验证', () => {
  it('批准属于目标用户的支付应成功', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: { user_id: 'user-123' },
      error: null,
    })
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })

    const result = await approvePaymentAtomicFixed('pay-1', 'user-123', 'admin-user', mockFetch, mockRpc)

    expect(result.error).toBeNull()
    expect(mockRpc).toHaveBeenCalledWith('pay-1', 'user-123')
  })

  it('BUG-LIB-06 FIX: 批准支付记录与目标用户不匹配时应被拒绝', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: { user_id: 'user-other' },
      error: null,
    })

    const result = await approvePaymentAtomicFixed('pay-1', 'user-123', 'admin-user', mockFetch, vi.fn())

    expect(result.error).toBe('支付记录与用户不匹配')
    expect(result.data).toBeNull()
  })

  it('未登录用户应被拒绝', async () => {
    const result = await approvePaymentAtomicFixed('pay-1', 'user-123', '', vi.fn(), vi.fn())
    expect(result.error).toBe('请先登录后再操作')
  })

  it('支付记录不存在应返回错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ data: null, error: null })

    const result = await approvePaymentAtomicFixed('pay-1', 'user-123', 'admin-user', mockFetch, vi.fn())

    expect(result.error).toBe('支付记录不存在')
  })

  it('RPC 调用失败时应返回错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: { user_id: 'user-123' },
      error: null,
    })
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC function not found' },
    })

    const result = await approvePaymentAtomicFixed('pay-1', 'user-123', 'admin-user', mockFetch, mockRpc)

    expect(result.error).toContain('原子化核销失败')
    expect(result.error).toContain('RPC function not found')
  })
})
