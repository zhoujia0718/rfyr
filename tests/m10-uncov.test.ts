/**
 * M10-Uncov: app/api/debug/email/route.ts — 未覆盖的集成测试
 *
 * 覆盖范围（超出纯单元测试 m10-email.test.ts）：
 * - POST /api/debug/email 非生产模式 → 直接调用
 * - POST /api/debug/email 生产模式无 EMAIL_DEBUG_SECRET → 403/404
 * - POST /api/debug/email 生产模式有正确 secret → 成功
 * - POST /api/debug/email 无效 email → 400
 * - POST /api/debug/email 底层 Supabase 错误 → 返回错误详情，无 stack 泄露
 *
 * 模块：app/api/debug/email/route.ts
 * 依赖：@/app/actions/auth (debugSendConfirmationEmail)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── 辅助 ──────────────────────────────────────────────────────────────────

function mockRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://example.com/api/debug/email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

// ─── 模块 mock ──────────────────────────────────────────────────────────────

vi.mock('@/app/actions/auth', () => ({
  debugSendConfirmationEmail: vi.fn(),
}))

// ─── 测试分组 ────────────────────────────────────────────────────────────────

describe('M10-Uncov: POST /api/debug/email — 生产模式访问控制', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('生产模式无 EMAIL_DEBUG_SECRET → 404', async () => {
        ;(process.env as Record<string, string>).NODE_ENV = 'production'
    delete process.env.EMAIL_DEBUG_SECRET

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'test@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('生产模式 secret 不匹配 → 404', async () => {
        ;(process.env as Record<string, string>).NODE_ENV = 'production'
    process.env.EMAIL_DEBUG_SECRET = 'correct-secret'

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest(
      { email: 'test@example.com' },
      { 'x-debug-secret': 'wrong-secret' },
    )

    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('生产模式 secret 正确 → 继续处理', async () => {
        ;(process.env as Record<string, string>).NODE_ENV = 'production'
    process.env.EMAIL_DEBUG_SECRET = 'correct-secret'

    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    vi.mocked(debugSendConfirmationEmail).mockResolvedValueOnce({
      success: true,
      hint: 'done',
    })

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest(
      { email: 'test@example.com' },
      { 'x-debug-secret': 'correct-secret' },
    )

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(vi.mocked(debugSendConfirmationEmail)).toHaveBeenCalledWith(
      'test@example.com',
    )
  })
})

describe('M10-Uncov: POST /api/debug/email — 非生产模式直接访问', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('development 模式无需 secret，直接处理请求', async () => {
        ;(process.env as Record<string, string>).NODE_ENV = 'development'
    delete process.env.EMAIL_DEBUG_SECRET

    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    vi.mocked(debugSendConfirmationEmail).mockResolvedValueOnce({
      success: true,
      hint: 'done',
    })

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'dev@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(vi.mocked(debugSendConfirmationEmail)).toHaveBeenCalledWith(
      'dev@example.com',
    )
  })
})

describe('M10-Uncov: POST /api/debug/email — 参数校验', () => {
  beforeEach(() => {
    // 非生产模式，不需要 secret
        ;(process.env as Record<string, string>).NODE_ENV = 'development'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('缺少 email 字段 → 400', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({})

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.message).toMatch(/email/)
  })

  it('email 为空字符串 → 400', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: '' })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('email 为 null → 400', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: null })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('email 为数字（非字符串）→ 400', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 12345 })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('有效 email 格式 → 继续调用底层函数', async () => {
    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    vi.mocked(debugSendConfirmationEmail).mockResolvedValueOnce({
      success: true,
      message: 'done',
    })

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'valid@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(vi.mocked(debugSendConfirmationEmail)).toHaveBeenCalled()
  })
})

describe('M10-Uncov: POST /api/debug/email — Supabase 错误处理（无 stack 泄露）', () => {
  beforeEach(() => {
        ;(process.env as Record<string, string>).NODE_ENV = 'development'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('debugSendConfirmationEmail 抛出错误 → 返回 500 + 错误信息，无 stack', async () => {
    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    vi.mocked(debugSendConfirmationEmail).mockRejectedValueOnce(
      new Error('Database connection failed'),
    )

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'test@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.message).toBe('Database connection failed')
    // 确认 JSON 中没有 stack 字段
    expect(json).not.toHaveProperty('stack')
  })

  it('debugSendConfirmationEmail 返回失败结果 → 直接透传，不加 stack', async () => {
    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    vi.mocked(debugSendConfirmationEmail).mockResolvedValueOnce({
      success: false,
      message: 'Email already exists',
      status: 400,
      code: 'duplicate',
    })

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'duplicate@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(200) // 底层函数本身返回 200，这里的行为是透传
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.message).toBe('Email already exists')
    expect(json.status).toBe(400)
    expect(json.code).toBe('duplicate')
  })

  it('debugSendConfirmationEmail 返回错误但无 message 字段 → 使用默认文案', async () => {
    const { debugSendConfirmationEmail } = await import('@/app/actions/auth')
    const err = new Error()
    err.message = ''
    vi.mocked(debugSendConfirmationEmail).mockRejectedValueOnce(err)

    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/debug/email/route')
    const req = mockRequest({ email: 'test@example.com' })

    const res = await POST(req)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.message).toBe('未知错误')
  })
})
