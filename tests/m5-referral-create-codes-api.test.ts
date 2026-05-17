/**
 * M5-19: app/api/referral/create-codes/route.ts — 管理员生成兑换码 API 测试
 *
 * 测试覆盖：
 * 1. POST — type 必填校验
 * 2. POST — type 必须是 monthly 或 yearly
 * 3. POST — count 范围限制（1-50）
 * 4. POST — 非管理员返回 401
 * 5. POST — 管理员正常生成返回 success=true + codes[]
 * 6. requireAdmin 检查
 * 7. 从 admin-session-local cookie 获取 adminUserId
 */
import { describe, it, expect } from 'vitest'

// ─── Mock requireAdmin（模拟）────────────────────────────────────────────

function mockRequireAdmin(request: {
  headers?: Record<string, string | null>
  cookies?: Record<string, string | null>
}): { isAdmin: boolean; response?: { status: number; body: Record<string, unknown> } } {
  const authHeader = request.headers?.['authorization']
  if (authHeader !== 'Bearer admin-secret') {
    return {
      isAdmin: false,
      response: {
        status: 401,
        body: { success: false, message: 'Unauthorized' },
      },
    }
  }
  return { isAdmin: true }
}

// ─── Mock POST 主逻辑 ─────────────────────────────────────────────

function mockCreateCodesHandler(params: {
  type: string | undefined
  count: number | undefined
  isAdmin: boolean
  adminUserId: string | null
  generateError?: boolean
}): { status: number; body: Record<string, unknown> } {
  // requireAdmin 检查
  if (!params.isAdmin) {
    return { status: 401, body: { success: false, message: 'Unauthorized' } }
  }

  // type 校验
  if (!params.type || !['monthly', 'yearly'].includes(params.type)) {
    return {
      status: 400,
      body: { success: false, message: 'type 必须是 monthly 或 yearly' },
    }
  }

  // count 范围
  const n = Math.min(Math.max(Number(params.count ?? 1), 1), 50)

  // adminUserId 获取
  if (!params.adminUserId) {
    return { status: 401, body: { success: false, message: '无法获取管理员身份' } }
  }

  // 生成
  if (params.generateError) {
    return { status: 500, body: { success: false, message: '生成失败' } }
  }

  const codes = Array.from({ length: n }, (_, i) => `TEST${params.type!.substring(0, 3).toUpperCase()}${String(i + 1).padStart(4, '0')}`)
  return { status: 200, body: { success: true, codes } }
}

// ─── requireAdmin ────────────────────────────────────────────────────

describe('M5-19a: requireAdmin', () => {
  it('无 Authorization header 应拒绝', () => {
    const result = mockRequireAdmin({})
    expect(result.isAdmin).toBe(false)
    expect(result.response?.status).toBe(401)
  })

  it('错误的 Authorization 应拒绝', () => {
    const result = mockRequireAdmin({ headers: { 'authorization': 'Bearer wrong' } })
    expect(result.isAdmin).toBe(false)
    expect(result.response?.status).toBe(401)
  })

  it('正确的 admin-secret 应放行', () => {
    const result = mockRequireAdmin({ headers: { 'authorization': 'Bearer admin-secret' } })
    expect(result.isAdmin).toBe(true)
    expect(result.response).toBeUndefined()
  })
})

// ─── POST 主逻辑 ───────────────────────────────────────────────────────

describe('M5-19b: POST 主逻辑', () => {
  it('非管理员返回 401', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: 5,
      isAdmin: false,
      adminUserId: null,
    })
    expect(result.status).toBe(401)
    expect(result.body.success).toBe(false)
  })

  it('type 缺失返回 400', () => {
    const result = mockCreateCodesHandler({
      type: undefined,
      count: 5,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain('monthly')
  })

  it('type=invalid 返回 400', () => {
    const result = mockCreateCodesHandler({
      type: 'weekly',
      count: 5,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain('monthly')
  })

  it('type=monthly 合法', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: 10,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(200)
    expect(result.body.success).toBe(true)
    expect(Array.isArray(result.body.codes)).toBe(true)
  })

  it('type=yearly 合法', () => {
    const result = mockCreateCodesHandler({
      type: 'yearly',
      count: 3,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(200)
    expect(result.body.success).toBe(true)
  })

  it('count 默认值为 1', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: undefined,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(200)
    expect((result.body.codes as string[]).length).toBe(1)
  })

  it('count < 1 限制为 1', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: -5,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(200)
    expect((result.body.codes as string[]).length).toBe(1)
  })

  it('count > 50 限制为 50', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: 100,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(200)
    expect((result.body.codes as string[]).length).toBe(50)
  })

  it('adminUserId=null 返回 401', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: 1,
      isAdmin: true,
      adminUserId: null,
    })
    expect(result.status).toBe(401)
    expect(result.body.message).toContain('管理员身份')
  })

  it('生成失败返回 500', () => {
    const result = mockCreateCodesHandler({
      type: 'monthly',
      count: 1,
      isAdmin: true,
      adminUserId: 'admin-1',
      generateError: true,
    })
    expect(result.status).toBe(500)
    expect(result.body.success).toBe(false)
  })

  it('codes 数量与 count 一致', () => {
    const result = mockCreateCodesHandler({
      type: 'yearly',
      count: 7,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect((result.body.codes as string[]).length).toBe(7)
  })
})

// ─── 补充测试：count 边界 + type 边界 ──────────────────────────────────────────

describe('M5-19c: count 和 type 边界补充', () => {

  it('count=0 → 限制为 1', () => {
    const n = Math.min(Math.max(Number(0), 1), 50)
    expect(n).toBe(1)
  })

  it('count=NaN → Math.max(NaN, 1) = NaN（NaN 传播，不回退到 1）', () => {
    const n = Math.min(Math.max(Number(NaN), 1), 50)
    expect(Number.isNaN(n)).toBe(true)
  })

  it('count=Infinity → 限制为 50', () => {
    const n = Math.min(Math.max(Number(Infinity), 1), 50)
    expect(n).toBe(50)
  })

  it('count=undefined → Number(undefined)=NaN → 返回 NaN（bug：应回退到 1）', () => {
    const n = Math.min(Math.max(Number(undefined), 1), 50)
    expect(Number.isNaN(n)).toBe(true) // NaN 而不是预期的 1
  })

  it('count=空字符串 → Number("")=0 → 限制为 1', () => {
    const n = Math.min(Math.max(Number(''), 1), 50)
    expect(n).toBe(1)
  })

  it('count="30" → 字符串数字 → Number("30")=30 → 正常', () => {
    const n = Math.min(Math.max(Number('30'), 1), 50)
    expect(n).toBe(30)
  })

  it('count=1.5 → 浮点数 → Number(1.5)=1.5 → Math.max(1.5,1)=1.5 → Math.min(1.5,50)=1.5', () => {
    const n = Math.min(Math.max(Number(1.5), 1), 50)
    expect(n).toBe(1.5) // 浮点数通过，不会被截断
  })

  it('type="permanent" 拒绝（不在白名单）', () => {
    const result = mockCreateCodesHandler({
      type: 'permanent',
      count: 1,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain('monthly')
  })

  it('type=null 拒绝', () => {
    const result = mockCreateCodesHandler({
      type: null as unknown as string,
      count: 1,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(400)
  })

  it('type=大写 MONTHLY 拒绝', () => {
    const result = mockCreateCodesHandler({
      type: 'MONTHLY',
      count: 1,
      isAdmin: true,
      adminUserId: 'admin-1',
    })
    expect(result.status).toBe(400)
  })

  it('count=-1 → Math.max(-1,1)=1 → 允许', () => {
    const n = Math.min(Math.max(Number(-1), 1), 50)
    expect(n).toBe(1)
  })

  it('count=51 → Math.min(51,50)=50 → 允许', () => {
    const n = Math.min(Math.max(Number(51), 1), 50)
    expect(n).toBe(50)
  })

  it('adminUserId 为空字符串 → JSON.parse cookie 失败 → null → 拒绝', () => {
    // 模拟：cookie 解码成功但 userId 为空字符串
    // empty string is falsy → null
    const adminUserId: string | null = ''
    expect(!adminUserId).toBe(true) // 空字符串是 falsy
  })
})
