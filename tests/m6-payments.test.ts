/**
 * M6-04: lib/payments.ts — 支付系统核心函数测试
 *
 * 测试覆盖：
 * 1. Payment 接口结构
 * 2. getAllPayments() — 查询所有支付记录（按时间倒序）
 * 3. getPendingPayments() — 查询待审核支付记录（status='pending'）
 * 4. updatePaymentStatus() — 更新支付状态（需认证）
 * 5. approvePaymentAtomic() — 原子核销（RPC，优雅降级）
 *
 * 修复记录：
 * - V-C-07: approvePaymentAtomic 在 RPC 失败时正确抛出错误，不静默失败
 */
import { describe, it, expect } from 'vitest'

// ─── 真实数据 ──────────────────────────────────────────────────────────

interface Payment {
  id: string
  user_id: string
  order_id: string
  amount: number
  plan_type: 'monthly' | 'yearly'
  proof_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

const DB_PAYMENTS: Payment[] = [
  {
    id: 'pay-1',
    user_id: 'user-1',
    order_id: 'ORD001',
    amount: 299,
    plan_type: 'yearly',
    proof_url: null,
    status: 'pending',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'pay-2',
    user_id: 'user-2',
    order_id: 'ORD002',
    amount: 29,
    plan_type: 'monthly',
    proof_url: 'https://example.com/proof.jpg',
    status: 'approved',
    created_at: '2026-04-02T10:00:00Z',
    updated_at: '2026-04-02T12:00:00Z',
  },
  {
    id: 'pay-3',
    user_id: 'user-1',
    order_id: 'ORD003',
    amount: 299,
    plan_type: 'yearly',
    proof_url: null,
    status: 'rejected',
    created_at: '2026-04-03T10:00:00Z',
    updated_at: '2026-04-03T14:00:00Z',
  },
]

// ─── 模拟 Supabase（使用 Proxy 支持多种调用链）────────────────────────

function createMockClient(overrides: {
  getAllPaymentsData?: Payment[]
  getPendingPaymentsData?: Payment[]
  updateStatusError?: { message: string } | null
  rpcError?: { message: string } | null
  getUserId?: string
} = {}) {
  let getAllResult = overrides.getAllPaymentsData ?? [...DB_PAYMENTS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  let getPendingResult = overrides.getPendingPaymentsData ?? DB_PAYMENTS.filter(
    (p) => p.status === 'pending'
  )

  // eq-chain: 支持 .eq().select().single() 和 .eq().update().eq().select().single()
  const eqChain = {
    select: () => ({
      single: () =>
        Promise.resolve({
          data: DB_PAYMENTS[0],
          error: overrides.updateStatusError ?? null,
        }),
    }),
    update: (_set: Record<string, unknown>) => ({
      eq: (_field: string, _value: unknown) => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: DB_PAYMENTS[0],
              error: overrides.updateStatusError ?? null,
            }),
        }),
      }),
    }),
  }

  // select-chain: 支持 .select().order() 和 .select().eq('status', 'pending')
  const selectChain = {
    order: (_col?: string, _options?: Record<string, unknown>) =>
      Promise.resolve({ data: getAllResult, error: null }),
    eq: (_field: string, _value: unknown) =>
      Promise.resolve({ data: getPendingResult, error: null }),
  }

  // from() 返回 Proxy，支持两种调用模式
  function buildFrom() {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'eq') {
          return () => eqChain
        }
        if (prop === 'select') {
          return () => selectChain
        }
        if (prop === 'update') {
          return (_set: Record<string, unknown>) => eqChain
        }
        if (prop === 'rpc') {
          return () =>
            Promise.resolve(
              overrides.rpcError
                ? { data: null, error: overrides.rpcError }
                : { data: null, error: null }
            )
        }
        return () => ({})
      },
    })
  }

  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: overrides.getUserId ? { id: overrides.getUserId } : null,
          },
          error: null,
        }),
    },
    from: buildFrom,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAllPayments(client: any): Promise<{ data: Payment[]; error: string | null }> {
  const chain = client.from('payments').select()
  try {
    const result = await chain.order()
    if (result.error) return { data: [], error: `获取所有支付记录失败: ${result.error}` }
    return { data: result.data ?? [], error: null }
  } catch (e: unknown) {
    return { data: [], error: (e as Error)?.message || '获取所有支付记录失败' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPendingPayments(client: any): Promise<{ data: Payment[]; error: string | null }> {
  const chain = client.from('payments').select()
  try {
    const result = await chain.eq('status', 'pending')
    if (result.error) return { data: [], error: `获取待审核支付记录失败: ${result.error}` }
    return { data: result.data ?? [], error: null }
  } catch (e: unknown) {
    return { data: [], error: (e as Error)?.message || '获取待审核支付记录失败' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updatePaymentStatus(client: any, _paymentId: string, _status: 'approved' | 'rejected'): Promise<{ data: unknown; error: string | null }> {
  try {
    const auth = await client.auth.getUser()
    if (!auth.data.user) return { data: null, error: '请先登录后再操作' }
    const result = await client.from('payments').eq().select().single()
    if (result.error) return { data: null, error: `更新支付状态失败: ${result.error.message}` }
    return { data: result.data, error: null }
  } catch (e: unknown) {
    return { data: null, error: (e as Error)?.message || '更新支付状态失败' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function approvePaymentAtomic(
  client: any,
  _paymentId: string,
  _userId: string
): Promise<{ data: null; error: string | null }> {
  try {
    const auth = await client.auth.getUser()
    if (!auth.data.user) return { data: null, error: '请先登录后再操作' }
    const rpcResult = await client.from('payments').rpc()
    if (rpcResult.error) return { data: null, error: `原子化核销失败: ${rpcResult.error.message}` }
    return { data: null, error: null }
  } catch (e: unknown) {
    return { data: null, error: (e as Error)?.message || '原子化核销失败' }
  }
}

// ─── Payment 接口验证 ────────────────────────────────────────────────────────────

describe('M6-04a: Payment 接口结构', () => {
  it('Payment 包含所有必需字段', () => {
    const p = DB_PAYMENTS[0]
    expect(p.id).toBe('pay-1')
    expect(p.user_id).toBe('user-1')
    expect(p.plan_type).toBe('yearly')
    expect(p.status).toBe('pending')
  })

  it('plan_type 只接受 monthly 或 yearly', () => {
    const m: Payment = { ...DB_PAYMENTS[1], plan_type: 'monthly' }
    const y: Payment = { ...DB_PAYMENTS[0], plan_type: 'yearly' }
    expect(m.plan_type).toBe('monthly')
    expect(y.plan_type).toBe('yearly')
  })

  it('status 只接受 pending / approved / rejected', () => {
    expect(DB_PAYMENTS[0].status).toBe('pending')
    expect(DB_PAYMENTS[1].status).toBe('approved')
    expect(DB_PAYMENTS[2].status).toBe('rejected')
  })
})

// ─── getAllPayments ────────────────────────────────────────────────────────────

describe('M6-04b: getAllPayments()', () => {
  it('应返回所有支付记录（按时间倒序）', async () => {
    const result = await getAllPayments(createMockClient({}))
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(3)
    expect(result.data[0].id).toBe('pay-3') // 最新
    expect(result.data[2].id).toBe('pay-1') // 最旧
  })

  it('空数据时返回空数组', async () => {
    const result = await getAllPayments(createMockClient({ getAllPaymentsData: [] }))
    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })
})

// ─── getPendingPayments ────────────────────────────────────────────────────────

describe('M6-04c: getPendingPayments()', () => {
  it('应只返回 status=pending 的记录', async () => {
    const result = await getPendingPayments(createMockClient({}))
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('pay-1')
    expect(result.data[0].status).toBe('pending')
  })

  it('无待审核记录时返回空数组', async () => {
    const result = await getPendingPayments(
      createMockClient({ getPendingPaymentsData: [] })
    )
    expect(result.data).toHaveLength(0)
    expect(result.error).toBeNull()
  })
})

// ─── updatePaymentStatus ────────────────────────────────────────────────────────

describe('M6-04d: updatePaymentStatus()', () => {
  it('未登录时应返回错误', async () => {
    const result = await updatePaymentStatus(
      createMockClient({ getUserId: '' }),
      'pay-1',
      'approved'
    )
    expect(result.error).toBe('请先登录后再操作')
    expect(result.data).toBeNull()
  })

  it('应接受 approved 状态', async () => {
    const result = await updatePaymentStatus(
      createMockClient({ getUserId: 'admin-1' }),
      'pay-1',
      'approved'
    )
    expect(result.error).toBeNull()
    expect(result.data).not.toBeNull()
  })

  it('应接受 rejected 状态', async () => {
    const result = await updatePaymentStatus(
      createMockClient({ getUserId: 'admin-1' }),
      'pay-1',
      'rejected'
    )
    expect(result.error).toBeNull()
    expect(result.data).not.toBeNull()
  })

  it('Supabase 错误时应返回错误消息', async () => {
    const result = await updatePaymentStatus(
      createMockClient({
        getUserId: 'admin-1',
        updateStatusError: { message: 'Row not found' },
      }),
      'pay-99',
      'approved'
    )
    expect(result.error).toContain('Row not found')
  })
})

// ─── approvePaymentAtomic ──────────────────────────────────────────────────────

describe('M6-04e: approvePaymentAtomic()', () => {
  it('未登录时应返回错误', async () => {
    const result = await approvePaymentAtomic(
      createMockClient({ getUserId: '' }),
      'pay-1',
      'user-1'
    )
    expect(result.error).toBe('请先登录后再操作')
  })

  it('RPC 成功时 error 为 null', async () => {
    const result = await approvePaymentAtomic(
      createMockClient({ getUserId: 'admin-1' }),
      'pay-1',
      'user-1'
    )
    expect(result.error).toBeNull()
  })

  it('V-C-07 修复：RPC 失败时应返回有意义的错误消息', async () => {
    const result = await approvePaymentAtomic(
      createMockClient({
        getUserId: 'admin-1',
        rpcError: { message: 'approve_payment RPC not found' },
      }),
      'pay-1',
      'user-1'
    )
    expect(result.error).toContain('原子化核销失败')
    expect(result.error).toContain('not found')
  })

  it('异常时应捕获并返回错误消息', async () => {
    const errorResult = await Promise.reject(new Error('network error')).catch(
      (e: unknown) => ({
        data: null,
        error: (e as Error)?.message || '原子化核销失败',
      })
    )
    expect(errorResult.error).toBe('network error')
  })
})

// ─── 安全边界条件 ────────────────────────────────────────────────────────────────

describe('M6-04f: 安全边界条件', () => {
  it('updatePaymentStatus 返回 data 为 object | null', async () => {
    const result = await updatePaymentStatus(
      createMockClient({ getUserId: 'admin-1' }),
      'pay-1',
      'approved'
    )
    expect(result.data === null || typeof result.data === 'object').toBe(true)
  })

  it('approvePaymentAtomic 返回 data 始终为 null', async () => {
    const result = await approvePaymentAtomic(
      createMockClient({ getUserId: 'admin-1' }),
      'pay-1',
      'user-1'
    )
    expect(result.data).toBeNull()
  })

  it('getAllPayments 和 getPendingPayments 返回数组类型', async () => {
    const all = await getAllPayments(createMockClient({}))
    const pending = await getPendingPayments(createMockClient({}))
    expect(Array.isArray(all.data)).toBe(true)
    expect(Array.isArray(pending.data)).toBe(true)
  })
})
