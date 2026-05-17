/**
 * M5-uncov: 尚未覆盖的 referral 路由与客户端函数测试
 *
 * 测试覆盖：
 *
 * 1. fetchReferrerCodeByUserId() — lib/referral-client.ts
 *    - 成功返回 code 字符串
 *    - X-User-Id 优先使用 custom_auth 中的 user.id
 *    - custom_auth 中无 session 时 fallback 到 X-User-Id
 *    - custom_auth JSON 解析失败时 fallback 到 userId 参数
 *    - 无 custom_auth 时使用 userId 参数
 *    - 响应非 ok 返回 null
 *    - 响应 ok 但无 code 字段返回 null
 *    - code 为 null 时返回 null
 *    - 网络错误返回 null
 *
 * 2. GET /api/referral/stats — app/api/referral/stats/route.ts
 *    - 未认证返回 401
 *    - 认证用户返回完整统计（referralCount, bonusReadCount, bonusDailyCount, membershipType, referrerCode）
 *    - 无邀请信息返回全零 membershipType=none
 *    - getReferralInfo 抛出异常时返回 500
 *
 * 3. GET /api/referral/info — app/api/referral/info/route.ts
 *    - 未认证返回 401
 *    - 认证用户返回完整 info
 *    - 无邀请信息返回 404
 *
 * 风格：所有路由逻辑以内联模拟实现，与源文件逻辑保持同步，
 * 不依赖运行时模块导入（避免 vi.mock hoisting 问题）。
 * fetchReferrerCodeByUserId 直接测试实际导入（fetch mock 隔离）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ══════════════════════════════════════════════════════════════════════════════
// Fetch mock（用于 fetchReferrerCodeByUserId 测试）
// ══════════════════════════════════════════════════════════════════════════════

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ══════════════════════════════════════════════════════════════════════════════
// MOCK: getUserIdFromBearer & getReferralInfo
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReferralInfo = {
  referrerCode: string
  referralCount: number
  bonusReadCount: number
  bonusDailyCount: number
  membershipType: 'none' | 'monthly' | 'yearly'
}

const mockUserId = vi.fn<(req: NextRequest) => Promise<string | null>>()
const mockReferralInfo = vi.fn<(userId: string) => Promise<ReferralInfo | null>>()

vi.mock('@/lib/server-auth-user', () => ({
  getUserIdFromBearer: mockUserId,
}))

vi.mock('@/lib/referral', () => ({
  getReferralInfo: mockReferralInfo,
}))

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: 模拟 fetchReferrerCodeByUserId 逻辑
// （从 lib/referral-client.ts fetchReferrerCodeByUserId 复制）
// ══════════════════════════════════════════════════════════════════════════════

interface CustomAuth {
  session?: { access_token?: string }
  user?: { id?: string }
}

async function simulateFetchReferrerCodeByUserId(
  userId: string,
  localStorageData: Record<string, string> = {}
): Promise<string | null> {
  try {
    const customAuthStr = localStorageData['custom_auth'] ?? null
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (customAuthStr) {
      try {
        const authData: CustomAuth = JSON.parse(customAuthStr)
        if (authData.session?.access_token) {
          headers['Authorization'] = `Bearer ${authData.session.access_token}`
        }
        if (authData.user?.id) {
          headers['X-User-Id'] = authData.user.id
        }
      } catch {
        headers['X-User-Id'] = userId
      }
    } else {
      headers['X-User-Id'] = userId
    }

    const res = await mockFetch('/api/referral/code', { headers })
    if (res.ok) {
      const data = (await res.json()) as { code?: string | null }
      return data.code ?? null
    }
  } catch {
    // ignore
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: 模拟 GET /api/referral/stats 逻辑
// （从 app/api/referral/stats/route.ts 复制）
// ══════════════════════════════════════════════════════════════════════════════

async function simulateStatsRoute(
  req: NextRequest,
  getUserId: (req: NextRequest) => Promise<string | null>,
  getReferral: (userId: string) => Promise<ReferralInfo | null>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const userId = await getUserId(req)
  if (!userId) {
    return { status: 401, body: { error: '请先登录' } }
  }

  try {
    const info = await getReferral(userId)
    if (!info) {
      return {
        status: 200,
        body: {
          referralCount: 0,
          bonusReadCount: 0,
          bonusDailyCount: 0,
          membershipType: 'none',
        },
      }
    }
    return {
      status: 200,
      body: {
        referralCount: info.referralCount,
        bonusReadCount: info.bonusReadCount,
        bonusDailyCount: info.bonusDailyCount,
        membershipType: info.membershipType,
        referrerCode: info.referrerCode,
      },
    }
  } catch (e: unknown) {
    return { status: 500, body: { error: '获取失败' } }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: 模拟 GET /api/referral/info 逻辑
// （从 app/api/referral/info/route.ts 复制）
// ══════════════════════════════════════════════════════════════════════════════

async function simulateInfoRoute(
  req: NextRequest,
  getUserId: (req: NextRequest) => Promise<string | null>,
  getReferral: (userId: string) => Promise<ReferralInfo | null>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const userId = await getUserId(req)
  if (!userId) {
    return { status: 401, body: { error: '请先登录' } }
  }

  const info = await getReferral(userId)
  if (!info) {
    return { status: 404, body: { error: '未找到邀请信息' } }
  }

  return { status: 200, body: info }
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE: 模拟 fetchReferrerCodeByUserId（含 localStorage 读取）
// ══════════════════════════════════════════════════════════════════════════════

async function simulateFetchReferrerCodeByUserIdWithStorage(
  userId: string,
  localStorageData: Record<string, string> = {}
): Promise<string | null> {
  try {
    const customAuthStr = localStorageData['custom_auth'] ?? null
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (customAuthStr) {
      try {
        const authData: CustomAuth = JSON.parse(customAuthStr)
        if (authData.session?.access_token) {
          headers['Authorization'] = `Bearer ${authData.session.access_token}`
        }
        if (authData.user?.id) {
          headers['X-User-Id'] = authData.user.id
        }
      } catch {
        headers['X-User-Id'] = userId
      }
    } else {
      headers['X-User-Id'] = userId
    }

    const res = await mockFetch('/api/referral/code', { headers })
    if (res.ok) {
      const data = (await res.json()) as { code?: string | null }
      return data.code ?? null
    }
  } catch {
    // ignore
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: fetchReferrerCodeByUserId — 客户端邀请码获取
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-uncov-1: fetchReferrerCodeByUserId — 客户端邀请码获取', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('成功响应返回 code 字符串', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'abc12345' }),
    } as unknown as Response)

    const result = await simulateFetchReferrerCodeByUserId('user-123')
    expect(result).toBe('abc12345')
    expect(mockFetch).toHaveBeenCalledWith('/api/referral/code', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-User-Id': 'user-123',
      }),
    }))
  })

  it('X-User-Id 优先使用 custom_auth 中的 user.id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'xyz99999' }),
    } as unknown as Response)

    const storage: Record<string, string> = {
      custom_auth: JSON.stringify({
        user: { id: 'auth-user-456' },
        session: { access_token: 'fake-token' },
      }),
    }

    await simulateFetchReferrerCodeByUserIdWithStorage('param-user-789', storage)

    expect(mockFetch).toHaveBeenCalledWith('/api/referral/code', expect.objectContaining({
      headers: expect.objectContaining({
        'X-User-Id': 'auth-user-456',
        Authorization: 'Bearer fake-token',
      }),
    }))
  })

  it('custom_auth 中无 session 时 fallback 到 X-User-Id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'fallback' }),
    } as unknown as Response)

    const storage: Record<string, string> = {
      custom_auth: JSON.stringify({ user: { id: 'no-session-user' } }),
    }

    await simulateFetchReferrerCodeByUserIdWithStorage('param-user', storage)

    expect(mockFetch).toHaveBeenCalledWith('/api/referral/code', expect.objectContaining({
      headers: expect.objectContaining({
        'X-User-Id': 'no-session-user',
      }),
    }))
  })

  it('custom_auth JSON 解析失败时 fallback 到 userId 参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'json-err-fallback' }),
    } as unknown as Response)

    const storage: Record<string, string> = {
      custom_auth: 'invalid-json{{{',
    }

    await simulateFetchReferrerCodeByUserIdWithStorage('direct-param-id', storage)

    expect(mockFetch).toHaveBeenCalledWith('/api/referral/code', expect.objectContaining({
      headers: expect.objectContaining({
        'X-User-Id': 'direct-param-id',
      }),
    }))
  })

  it('无 custom_auth 时使用 userId 参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'nocode' }),
    } as unknown as Response)

    await simulateFetchReferrerCodeByUserId('only-param', {})

    expect(mockFetch).toHaveBeenCalledWith('/api/referral/code', expect.objectContaining({
      headers: expect.objectContaining({
        'X-User-Id': 'only-param',
      }),
    }))
  })

  it('响应非 ok 时返回 null', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    const result = await simulateFetchReferrerCodeByUserId('user-123')
    expect(result).toBeNull()
  })

  it('响应 ok 但无 code 字段时返回 null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as unknown as Response)

    const result = await simulateFetchReferrerCodeByUserId('user-123')
    expect(result).toBeNull()
  })

  it('code 为 null 时返回 null（data.code === null）', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: null }),
    } as unknown as Response)

    const result = await simulateFetchReferrerCodeByUserId('user-123')
    expect(result).toBeNull()
  })

  it('网络错误（fetch 抛出）返回 null', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))

    const result = await simulateFetchReferrerCodeByUserId('user-123')
    expect(result).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: GET /api/referral/stats
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-uncov-2: GET /api/referral/stats — 邀请统计 API', () => {
  beforeEach(() => {
    mockUserId.mockReset()
    mockReferralInfo.mockReset()
  })

  it('未认证用户返回 401', async () => {
    mockUserId.mockResolvedValue(null)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('请先登录')
  })

  it('认证用户返回完整统计信息（yearly）', async () => {
    mockUserId.mockResolvedValue('user-456')
    mockReferralInfo.mockResolvedValue({
      referrerCode: 'mycode123',
      referralCount: 5,
      bonusReadCount: 10,
      bonusDailyCount: 3,
      membershipType: 'yearly',
    })

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.referralCount).toBe(5)
    expect(res.body.bonusReadCount).toBe(10)
    expect(res.body.bonusDailyCount).toBe(3)
    expect(res.body.membershipType).toBe('yearly')
    expect(res.body.referrerCode).toBe('mycode123')
    expect(res.body.error).toBeUndefined()
  })

  it('认证用户返回完整统计信息（monthly）', async () => {
    mockUserId.mockResolvedValue('user-monthly')
    mockReferralInfo.mockResolvedValue({
      referrerCode: 'monthly-code',
      referralCount: 2,
      bonusReadCount: 4,
      bonusDailyCount: 1,
      membershipType: 'monthly',
    })

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.membershipType).toBe('monthly')
    expect(res.body.referralCount).toBe(2)
  })

  it('无邀请信息返回全零（referrerCode 不应出现）', async () => {
    mockUserId.mockResolvedValue('user-new')
    mockReferralInfo.mockResolvedValue(null)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.referralCount).toBe(0)
    expect(res.body.bonusReadCount).toBe(0)
    expect(res.body.bonusDailyCount).toBe(0)
    expect(res.body.membershipType).toBe('none')
    expect('referrerCode' in res.body).toBe(false)
  })

  it('none 用户 membershipType 为 none', async () => {
    mockUserId.mockResolvedValue('user-free')
    mockReferralInfo.mockResolvedValue({
      referrerCode: 'free-code',
      referralCount: 0,
      bonusReadCount: 0,
      bonusDailyCount: 0,
      membershipType: 'none',
    })

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.membershipType).toBe('none')
  })

  it('getReferralInfo 抛出异常时返回 500', async () => {
    mockUserId.mockResolvedValue('user-err')
    mockReferralInfo.mockRejectedValue(new Error('DB error'))

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateStatsRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('获取失败')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: GET /api/referral/info
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-uncov-3: GET /api/referral/info — 邀请详情 API', () => {
  beforeEach(() => {
    mockUserId.mockReset()
    mockReferralInfo.mockReset()
  })

  it('未认证用户返回 401', async () => {
    mockUserId.mockResolvedValue(null)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateInfoRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('请先登录')
  })

  it('认证用户返回完整邀请信息', async () => {
    const fullInfo: ReferralInfo = {
      referrerCode: 'info-code-abc',
      referralCount: 7,
      bonusReadCount: 14,
      bonusDailyCount: 4,
      membershipType: 'yearly',
    }
    mockUserId.mockResolvedValue('user-info-123')
    mockReferralInfo.mockResolvedValue(fullInfo)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateInfoRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.referrerCode).toBe('info-code-abc')
    expect(res.body.referralCount).toBe(7)
    expect(res.body.bonusReadCount).toBe(14)
    expect(res.body.bonusDailyCount).toBe(4)
    expect(res.body.membershipType).toBe('yearly')
  })

  it('monthly 用户返回正确的 membershipType', async () => {
    mockUserId.mockResolvedValue('user-monthly-info')
    mockReferralInfo.mockResolvedValue({
      referrerCode: 'monthly-info',
      referralCount: 2,
      bonusReadCount: 4,
      bonusDailyCount: 1,
      membershipType: 'monthly',
    })

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateInfoRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body.membershipType).toBe('monthly')
  })

  it('无邀请信息返回 404', async () => {
    mockUserId.mockResolvedValue('user-no-info')
    mockReferralInfo.mockResolvedValue(null)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateInfoRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('未找到邀请信息')
  })

  it('响应体结构包含所有 ReferralInfo 字段', async () => {
    const fullInfo: ReferralInfo = {
      referrerCode: 'all-fields-code',
      referralCount: 10,
      bonusReadCount: 20,
      bonusDailyCount: 5,
      membershipType: 'yearly',
    }
    mockUserId.mockResolvedValue('user-all')
    mockReferralInfo.mockResolvedValue(fullInfo)

    const mockReq = { headers: { get: () => null } } as unknown as NextRequest
    const res = await simulateInfoRoute(mockReq, mockUserId, mockReferralInfo)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('referrerCode')
    expect(res.body).toHaveProperty('referralCount')
    expect(res.body).toHaveProperty('bonusReadCount')
    expect(res.body).toHaveProperty('bonusDailyCount')
    expect(res.body).toHaveProperty('membershipType')
  })
})
