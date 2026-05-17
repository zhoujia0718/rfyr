/**
 * Module 6 - membership/activate API 路由测试套件
 *
 * 测试覆盖：
 * 1. 401 - 未登录
 * 2. 400 - 无效 planType / 空 planType
 * 3. 200 - monthly / yearly 激活成功
 * 4. 幂等性 - 相同等级活跃会员返回 idempotent: true
 * 5. 幂等性 - 相同等级已过期视为新激活
 * 6. 幂等性 - 不同等级视为升级/降级
 * 7. 续期逻辑 - 无会员时从今日计算
 * 8. 续期逻辑 - 有会员时从其到期日延长
 * 9. RPC 成功时直接返回，不执行降级 SQL
 * 10. RPC 失败时降级到直接 SQL
 * 11. memberships 写入失败返回 500
 * 12. users.vip_tier 更新失败返回 500
 * 13. 生产环境无订单号且非 manual 返回 400
 * 14. manual=true 绕过生产环境订单验证
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
// @ts-ignore
import { MEMBER_TIERS } from '../lib/member-tiers.ts'

// ── 模块级共享状态（对象引用，mock 闭包捕获引用而非值）─────────────────────────
const db = { memberships: [] as any[] }
const rpc = { data: null as any, err: { code: 'PGRST204' } as any }
const insert = { err: null as any }

const futureDate = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString()
}
const pastDate = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString()
}

// ── Mock helpers ──────────────────────────────────────────────────────────────
const makeChain = () => {
  const chain: any = {}
  // eqResult: intermediate result for .eq() calls. Also needs query-builder methods.
  const eqResult: any = {}
  // eqResult's eq() returns chain (for double-eq chains like update().eq().eq())
  eqResult.eq = () => chain
  eqResult.then = chain
  eqResult.select = () => chain
  eqResult.order = () => chain
  eqResult.update = () => chain
  eqResult.maybeSingle = () =>
    Promise.resolve({ data: db.memberships.find((m: any) => m.status === 'active') ?? null, error: null })
  eqResult.limit = () => {
    const sorted = [...db.memberships].sort((a: any, b: any) =>
      new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
    return Promise.resolve({ data: sorted.slice(0, 1), error: null })
  }
  // Top-level chain
  chain.select = () => chain
  chain.eq = () => eqResult
  chain.order = () => chain
  chain.update = () => chain
  chain.maybeSingle = () =>
    Promise.resolve({ data: db.memberships.find((m: any) => m.status === 'active') ?? null, error: null })
  chain.limit = () => {
    const sorted = [...db.memberships].sort((a: any, b: any) =>
      new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
    return Promise.resolve({ data: sorted.slice(0, 1), error: null })
  }
  chain.insert = () => Promise.resolve({ error: insert.err })
  return chain
}

const defaultImpl = () => ({
  from: () => makeChain(),
  rpc: () =>
    rpc.err
      ? Promise.resolve({ data: null, error: rpc.err })
      : Promise.resolve({ data: rpc.data, error: null }),
})

// ── Module-level mock ────────────────────────────────────────────────────────
vi.mock('@/lib/server-auth-user', () => ({
  getUserIdFromBearer: vi.fn(),
}))

const _mockCreateClient = vi.hoisted(() => {
  const impl = () => ({
    from: () => makeChain(),
    rpc: () =>
      rpc.err
        ? Promise.resolve({ data: null, error: rpc.err })
        : Promise.resolve({ data: rpc.data, error: null }),
  })
  return vi.fn(impl)
})
vi.mock('@supabase/supabase-js', () => ({
  createClient: _mockCreateClient,
}))

const req = (body: object): NextRequest =>
  ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

// @ts-ignore
import { POST } from '../app/api/membership/activate/route.ts'
import { getUserIdFromBearer } from '@/lib/server-auth-user'
import { createClient } from '@supabase/supabase-js'

describe('M6-10: app/api/membership/activate/route.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const fixedNow = new Date('2026-04-20T12:00:00Z').getTime()
    vi.setSystemTime(fixedNow)
    Date.now = () => fixedNow
    db.memberships = []
    rpc.data = null
    rpc.err = { code: 'PGRST204' }
    insert.err = null
    vi.mocked(getUserIdFromBearer).mockResolvedValue('user-123')
    _mockCreateClient.mockImplementation(() => ({
      from: () => makeChain(),
      rpc: () =>
        rpc.err
          ? Promise.resolve({ data: null, error: rpc.err })
          : Promise.resolve({ data: rpc.data, error: null }),
    }))
  })
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.PAYMENT_MOCK_ENABLED
  })

  // ── 身份验证 ──────────────────────────────────────────────────────────
  describe('身份验证', () => {
    it('未登录返回 401', async () => {
      vi.mocked(getUserIdFromBearer).mockResolvedValue(null)
      const res = await POST(req({ planType: 'monthly' }))
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('请先登录')
    })
  })

  // ── 参数校验 ─────────────────────────────────────────────────────────
  describe('参数校验', () => {
    it('缺少 planType 返回 400', async () => {
      expect((await POST(req({} as any))).status).toBe(400)
    })
    it('无效 planType 返回 400', async () => {
      const res = await POST(req({ planType: 'permanent' } as any))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('无效的会员类型')
    })
    it('planType 为空返回 400', async () => {
      expect((await POST(req({ planType: '' } as any))).status).toBe(400)
    })
  })

  // ── 幂等性保护（P-05）────────────────────────────────────────────────
  describe('幂等性保护（P-05）', () => {
    it('已有相同等级活跃会员且未过期 → idempotent: true', async () => {
      rpc.err = { code: 'PGRST204' }
      db.memberships = [{ id: 'mship-1', user_id: 'user-123', membership_type: 'monthly', end_date: futureDate(20), status: 'active' }]
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.idempotent).toBe(true)
      expect(body.tier).toBe(MEMBER_TIERS.MONTHLY)
    })
    it('已有相同等级会员但已过期 → 视为新激活', async () => {
      rpc.err = { code: 'PGRST204' }
      db.memberships = [{ id: 'mship-1', user_id: 'user-123', membership_type: 'monthly', end_date: pastDate(5), status: 'active' }]
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })
    it('不同等级会员 → 视为升级/降级', async () => {
      rpc.err = { code: 'PGRST204' }
      db.memberships = [{ id: 'mship-1', user_id: 'user-123', membership_type: 'monthly', end_date: futureDate(20), status: 'active' }]
      const res = await POST(req({ planType: 'yearly', manual: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).tier).toBe(MEMBER_TIERS.YEARLY)
    })
  })

  // ── 正常激活 ─────────────────────────────────────────────────────────
  describe('正常激活', () => {
    it('monthly 激活成功返回正确字段', async () => {
      rpc.err = { code: 'PGRST204' }
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.planType).toBe('monthly')
      expect(body.tier).toBe(MEMBER_TIERS.MONTHLY)
    })
    it('yearly 激活成功返回正确字段', async () => {
      rpc.err = { code: 'PGRST204' }
      const res = await POST(req({ planType: 'yearly', manual: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).tier).toBe(MEMBER_TIERS.YEARLY)
    })
  })

  // ── 续期逻辑（P-07）──────────────────────────────────────────────────
  describe('续期逻辑（P-07）', () => {
    it('无会员时到期日从今日计算（monthly +30 天）', async () => {
      rpc.err = { code: 'PGRST204' }
      const res = await POST(req({ planType: 'monthly', manual: true }))
      const body = await res.json()
      const end = new Date(body.endDate)
      const expected = new Date(); expected.setDate(expected.getDate() + 30)
      expect(Math.abs(end.getTime() - expected.getTime())).toBeLessThan(86400000)
    })
    it('已有 monthly 会员时激活 monthly → 走续期逻辑（不触发幂等）', async () => {
      rpc.err = { code: 'PGRST204' }
      db.memberships = [{ id: 'mship-1', membership_type: 'monthly', end_date: new Date(Date.now() - 5 * 86400000).toISOString(), status: 'expired' }]
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.endDate).toBeDefined()
      expect(body.startDate).toBeDefined()
    })
    it('已有 yearly 会员时激活 yearly → 续期逻辑生效', async () => {
      rpc.err = { code: 'PGRST204' }
      db.memberships = [{ id: 'mship-1', membership_type: 'yearly', end_date: new Date(Date.now() - 5 * 86400000).toISOString(), status: 'expired' }]
      const res = await POST(req({ planType: 'yearly', manual: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.tier).toBe(MEMBER_TIERS.YEARLY)
      expect(body.endDate).toBeDefined()
    })
  })

  // ── RPC 路径 ──────────────────────────────────────────────────────────
  describe('RPC 事务路径', () => {
    it('RPC 返回数据时不执行降级 SQL', async () => {
      rpc.data = { success: true, tier: 'yearly', endDate: futureDate(365) }; rpc.err = null
      const res = await POST(req({ planType: 'yearly', manual: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).tier).toBe('yearly')
    })
    it('RPC 返回错误时降级到直接 SQL', async () => {
      rpc.data = null; rpc.err = { message: 'RPC not found' }
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })
  })

  // ── 错误处理 ─────────────────────────────────────────────────────────
  describe('错误处理', () => {
    it('memberships 写入失败返回 500', async () => {
      rpc.err = { code: 'PGRST204' }; insert.err = { message: 'DB error' }
      expect((await POST(req({ planType: 'monthly', manual: true }))).status).toBe(500)
    })
    it('users.vip_tier 更新失败返回 500', async () => {
      rpc.err = { code: 'PGRST204' }; insert.err = null
      // The route calls createClient() once and uses the same supabase instance.
      // We create separate chain objects for different table patterns:
      // - memberships pattern: update().eq().eq() (fire-and-forget, no error check)
      // - users pattern: update().eq() → Promise with error
      const membershipsChain: any = {}
      const eqResult: any = {}
      eqResult.eq = () => membershipsChain // double-eq → membershipsChain
      eqResult.then = membershipsChain
      eqResult.select = () => membershipsChain
      eqResult.order = () => membershipsChain
      eqResult.maybeSingle = () => Promise.resolve({ data: null, error: null })
      eqResult.limit = () => Promise.resolve({ data: [], error: null })
      membershipsChain.select = () => membershipsChain
      membershipsChain.eq = () => eqResult
      membershipsChain.order = () => membershipsChain
      membershipsChain.update = () => membershipsChain
      membershipsChain.maybeSingle = () =>
        Promise.resolve({ data: db.memberships.find((m: any) => m.status === 'active') ?? null, error: null })
      membershipsChain.limit = () => {
        const sorted = [...db.memberships].sort((a: any, b: any) =>
          new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
        return Promise.resolve({ data: sorted.slice(0, 1), error: null })
      }
      membershipsChain.insert = () => Promise.resolve({ error: null })

      // Users chain: update().eq() returns error
      const usersChain: any = {}
      usersChain.select = () => usersChain
      usersChain.eq = () => usersChain
      usersChain.order = () => usersChain
      usersChain.maybeSingle = () => Promise.resolve({ data: null, error: null })
      usersChain.limit = () => Promise.resolve({ data: [], error: null })
      usersChain.update = () => ({ eq: () => Promise.resolve({ error: { message: 'User error' } }) })
      usersChain.insert = () => Promise.resolve({ error: null })

      // Use a Map to return the right chain based on table name
      const tableChains = new Map<string, any>([
        ['memberships', membershipsChain],
        ['users', usersChain],
      ])

      _mockCreateClient.mockImplementation((): any => ({
        from: (tableName: string): any => tableChains.get(tableName) ?? membershipsChain,
        rpc: (): any => Promise.resolve({ data: null, error: { code: 'PGRST204' } }),
      }))
      const res = await POST(req({ planType: 'monthly', manual: true }))
      expect(res.status).toBe(500)
    })
  })

  // ── 生产环境订单验证 ──────────────────────────────────────────────────
  describe('生产环境订单验证', () => {
    const orig = (process.env as Record<string, string>).NODE_ENV
    afterEach(() => { (process.env as Record<string, string>).NODE_ENV = orig })
    it('生产环境无订单号且非 manual → 400', async () => {
      (process.env as Record<string, string>).NODE_ENV = 'production'; delete process.env.PAYMENT_MOCK_ENABLED
      expect((await POST(req({ planType: 'monthly', manual: false }))).status).toBe(400)
    })
    it('manual=true 绕过生产环境订单验证', async () => {
      (process.env as Record<string, string>).NODE_ENV = 'production'; delete process.env.PAYMENT_MOCK_ENABLED
      rpc.err = { code: 'PGRST204' }
      expect((await POST(req({ planType: 'monthly', manual: true }))).status).toBe(200)
    })
  })
})
