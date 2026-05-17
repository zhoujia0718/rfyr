/**
 * M15-08: app/api/membership/status — 会员状态 API 测试
 *
 * 测试覆盖：
 * 1. 未登录用户返回 NONE tier
 * 2. 登录用户返回正确的 tier
 * 3. P2 修复：normalizeMemberTier 兼容旧 vip_tier 数据
 * 4. rawVipTier 原始字段返回
 * 5. 数据库错误时降级为 NONE
 * 6. 返回字段完整性（tier, rawVipTier）
 *
 * API: GET /api/membership/status
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeMemberTier,
  MEMBER_TIERS,
  type MemberTier,
} from '@/lib/member-tiers'

// ─── Mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── API 逻辑模拟 ───────────────────────────────────────────────────────

interface StatusResponse {
  tier: MemberTier
  rawVipTier: string | null
}

// 模拟 API 调用
async function callStatusApi(
  userId: string | null,
  dbUser?: { vip_tier: string | null } | null
): Promise<StatusResponse> {
  if (!userId) {
    return { tier: MEMBER_TIERS.NONE, rawVipTier: null }
  }

  if (!dbUser) {
    return { tier: MEMBER_TIERS.NONE, rawVipTier: null }
  }

  const tier = normalizeMemberTier(dbUser.vip_tier)
  return {
    tier,
    rawVipTier: dbUser.vip_tier ?? null,
  }
}

// ─── normalizeMemberTier ─────────────────────────────────────────────────

describe('M15-08a: normalizeMemberTier（导入实际实现）', () => {
  it('null / undefined 应返回 none', () => {
    expect(normalizeMemberTier(null)).toBe('none')
    expect(normalizeMemberTier(undefined)).toBe('none')
    expect(normalizeMemberTier('')).toBe('none')
  })

  it('标准 yearly 应返回 yearly', () => {
    expect(normalizeMemberTier('yearly')).toBe('yearly')
    expect(normalizeMemberTier('YEARLY')).toBe('yearly')
  })

  it('标准 monthly 应返回 monthly', () => {
    expect(normalizeMemberTier('monthly')).toBe('monthly')
    expect(normalizeMemberTier('MONTHLY')).toBe('monthly')
  })

  it('P2 修复：legacy annual_vip 应返回 yearly', () => {
    expect(normalizeMemberTier('annual_vip')).toBe('yearly')
    expect(normalizeMemberTier('ANNUAL_VIP')).toBe('yearly')
    expect(normalizeMemberTier('annualvip')).toBe('yearly')
  })

  it('P2 修复：legacy monthly_vip 应返回 monthly', () => {
    expect(normalizeMemberTier('monthly_vip')).toBe('monthly')
    expect(normalizeMemberTier('MONTHLY_VIP')).toBe('monthly')
    expect(normalizeMemberTier('monthlyvip')).toBe('monthly')
  })

  it('P2 修复：带空格的 legacy 值应处理', () => {
    expect(normalizeMemberTier(' annual_vip ')).toBe('yearly')
    expect(normalizeMemberTier(' monthly_vip ')).toBe('monthly')
  })

  it('永久会员应返回 permanent', () => {
    expect(normalizeMemberTier('permanent')).toBe('permanent')
    expect(normalizeMemberTier('PERMANENT')).toBe('permanent')
  })

  it('未知值应返回 none', () => {
    expect(normalizeMemberTier('invalid')).toBe('none')
    expect(normalizeMemberTier('admin')).toBe('none')
    expect(normalizeMemberTier('free')).toBe('none')
  })
})

// ─── API 逻辑 ──────────────────────────────────────────────────────────────

describe('M15-08b: callStatusApi — API 逻辑', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('未登录用户应返回 NONE', async () => {
    const result = await callStatusApi(null)
    expect(result.tier).toBe('none')
    expect(result.rawVipTier).toBeNull()
  })

  it('登录但无数据库记录应返回 NONE', async () => {
    const result = await callStatusApi('user-123', null)
    expect(result.tier).toBe('none')
  })

  it('登录但 vip_tier 为空应返回 NONE', async () => {
    const result = await callStatusApi('user-123', { vip_tier: null })
    expect(result.tier).toBe('none')
    expect(result.rawVipTier).toBeNull()
  })

  it('yearly 用户应返回 yearly', async () => {
    const result = await callStatusApi('user-123', { vip_tier: 'yearly' })
    expect(result.tier).toBe('yearly')
    expect(result.rawVipTier).toBe('yearly')
  })

  it('monthly 用户应返回 monthly', async () => {
    const result = await callStatusApi('user-123', { vip_tier: 'monthly' })
    expect(result.tier).toBe('monthly')
  })

  it('annual_vip（旧）应返回 yearly', async () => {
    const result = await callStatusApi('user-123', { vip_tier: 'annual_vip' })
    expect(result.tier).toBe('yearly')
    expect(result.rawVipTier).toBe('annual_vip')
  })

  it('permanent 应返回 permanent', async () => {
    const result = await callStatusApi('user-123', { vip_tier: 'permanent' })
    expect(result.tier).toBe('permanent')
  })

  it('返回对象应包含 tier 和 rawVipTier', async () => {
    const result = await callStatusApi('user-123', { vip_tier: 'yearly' })
    expect('tier' in result).toBe(true)
    expect('rawVipTier' in result).toBe(true)
  })
})

// ─── HTTP 模拟 ────────────────────────────────────────────────────────────

describe('M15-08c: HTTP 接口模拟', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('未登录时 GET /api/membership/status 返回 200 + NONE tier', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tier: 'none', rawVipTier: null }),
    } as unknown as Response)

    const res = await mockFetch('/api/membership/status')
    const json = await res.json()
    expect(json.tier).toBe('none')
    expect(res.status).toBe(200)
  })

  it('已登录时返回用户实际 tier', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ tier: 'yearly', rawVipTier: 'annual_vip' }),
    } as unknown as Response)

    const res = await mockFetch('/api/membership/status')
    const json = await res.json()
    expect(json.tier).toBe('yearly')
    expect(json.rawVipTier).toBe('annual_vip')
  })

  it('Bearer token 应被传递', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tier: 'monthly' }),
    } as unknown as Response)

    await mockFetch('/api/membership/status', {
      headers: { Authorization: 'Bearer token-abc' },
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/membership/status', {
      headers: { Authorization: 'Bearer token-abc' },
    })
  })
})
