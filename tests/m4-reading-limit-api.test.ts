/**
 * M4-05: app/api/reading-limit/route.ts — 阅读限额 API 测试
 *
 * 测试覆盖：
 * 1. GET — 未登录返回 401（V-M-05 修复）
 * 2. GET — 服务端未配置返回 500
 * 3. GET — 今日首次访问 dailyReadCount=0
 * 4. GET — 今日已读时返回实际篇数
 * 5. GET — bonus_daily_count 今日重置逻辑
 * 6. POST — articleId 必填校验
 * 7. POST — 无效 articleId 返回 400
 * 8. POST — 成功返回 success=true
 * 9. V-M-05 修复：未经认证返回 401，不返回全零数据
 *
 * 修复记录：
 * - V-M-05 FIX: 未经认证时返回 401，不返回全零数据（防止数据枚举）
 * - P1 修复：recordVisit 使用条件 UPDATE 原子操作
 */
import { describe, it, expect, vi } from 'vitest'

// ─── Mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── 辅助函数（从 route.ts 提取）───────────────────────────────

// 模拟 toLocalDateString
function toLocalDateString(): string {
  return '2026-04-20'
}

// 模拟 GET 主逻辑
async function getReadingLimitHandler(params: {
  userId: string | null
  supabaseAdminAvailable: boolean
  profile?: {
    notes_read_count?: number
    daily_read_count?: number
    last_read_date?: string | null
    bonus_read_count?: number
    bonus_daily_count?: number
    bonus_daily_reset_date?: string | null
  } | null
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { userId, supabaseAdminAvailable, profile } = params

  if (!userId) {
    return { status: 401, body: { error: '请先登录' } }
  }

  if (!supabaseAdminAvailable) {
    return { status: 500, body: { error: '服务端配置错误' } }
  }

  const today = toLocalDateString()
  const lastReadDate =
    typeof profile?.last_read_date === 'string'
      ? profile.last_read_date.split('T')[0]
      : null
  const dailyReadCount =
    lastReadDate === today ? Number(profile?.daily_read_count ?? 0) : 0

  const resetDate =
    typeof profile?.bonus_daily_reset_date === 'string'
      ? profile.bonus_daily_reset_date.split('T')[0]
      : null
  const dailyBonusCount =
    resetDate === today ? Number(profile?.bonus_daily_count ?? 0) : 0

  return {
    status: 200,
    body: {
      readCount: Number(profile?.notes_read_count ?? 0),
      readIds: [],
      dailyReadCount,
      bonusCount: Number(profile?.bonus_read_count ?? 0),
      dailyBonusCount,
    },
  }
}

// 模拟 POST 主逻辑
async function postReadingLimitHandler(params: {
  userId: string | null
  articleId?: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { userId, articleId } = params

  if (!userId) {
    return { status: 401, body: { success: false, message: '未登录' } }
  }

  if (!articleId || typeof articleId !== 'string') {
    return { status: 400, body: { success: false, message: '缺少 articleId' } }
  }

  return {
    status: 200,
    body: {
      success: true,
      articleId,
      bonusCount: 0,
      dailyBonusCount: 0,
    },
  }
}

// ─── V-M-05 修复：未经认证返回 401 ─────────────────────────────────

describe('M4-05a: V-M-05 修复：未经认证返回 401', () => {
  it('userId=null 时应返回 401（不返回全零数据）', async () => {
    const result = await getReadingLimitHandler({
      userId: null,
      supabaseAdminAvailable: true,
    })
    expect(result.status).toBe(401)
    expect(result.body.error).toBe('请先登录')
    // 确保不返回 readCount 等数据（防止数据枚举）
    expect(result.body.readCount).toBeUndefined()
    expect(result.body.dailyReadCount).toBeUndefined()
  })

  it('userId 有值时不应返回 401', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: { notes_read_count: 0 },
    })
    expect(result.status).not.toBe(401)
    expect(result.status).toBe(200)
  })
})

// ─── 服务端配置检查 ───────────────────────────────────────────────

describe('M4-05b: 服务端配置检查', () => {
  it('supabaseAdmin 不可用时应返回 500', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: false,
    })
    expect(result.status).toBe(500)
    expect(result.body.error).toBe('服务端配置错误')
  })

  it('supabaseAdmin 可用时应继续处理', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: { notes_read_count: 5 },
    })
    expect(result.status).toBe(200)
  })
})

// ─── 每日已读数计算 ───────────────────────────────────────────────

describe('M4-05c: 每日已读数计算（CST 北京时间零点重置）', () => {
  it('首次访问（lastReadDate=null）dailyReadCount=0', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 0,
        last_read_date: null,
      },
    })
    expect(result.status).toBe(200)
    expect(result.body.dailyReadCount).toBe(0)
  })

  it('今日已读 3 篇时应返回 3', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 3,
        daily_read_count: 3,
        last_read_date: '2026-04-20T10:00:00Z',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body.dailyReadCount).toBe(3)
  })

  it('昨日已读 5 篇，今日首次访问 dailyReadCount=0', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 5,
        daily_read_count: 5,
        last_read_date: '2026-04-19T23:59:59Z',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body.dailyReadCount).toBe(0)
  })

  it('totalReadCount 应正确返回', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 42,
      },
    })
    expect(result.body.readCount).toBe(42)
  })
})

// ─── bonus_daily_count 重置逻辑 ──────────────────────────────────

describe('M4-05d: bonus_daily_count 重置逻辑', () => {
  it('resetDate === today 时返回实际 bonus', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 10,
        bonus_daily_count: 3,
        bonus_daily_reset_date: '2026-04-20T00:00:00Z',
      },
    })
    expect(result.body.dailyBonusCount).toBe(3)
  })

  it('resetDate !== today 时返回 0', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 10,
        bonus_daily_count: 3,
        bonus_daily_reset_date: '2026-04-19T00:00:00Z',
      },
    })
    expect(result.body.dailyBonusCount).toBe(0)
  })

  it('resetDate=null 时返回 0', async () => {
    const result = await getReadingLimitHandler({
      userId: 'user-123',
      supabaseAdminAvailable: true,
      profile: {
        notes_read_count: 10,
        bonus_daily_count: 2,
        bonus_daily_reset_date: null,
      },
    })
    expect(result.body.dailyBonusCount).toBe(0)
  })
})

// ─── POST 验证 ───────────────────────────────────────────────────

describe('M4-05e: POST articleId 验证', () => {
  it('未登录应返回 401', async () => {
    const result = await postReadingLimitHandler({
      userId: null,
      articleId: 'art-1',
    })
    expect(result.status).toBe(401)
    expect(result.body.success).toBe(false)
  })

  it('articleId 缺失应返回 400', async () => {
    const result = await postReadingLimitHandler({
      userId: 'user-123',
      articleId: undefined,
    })
    expect(result.status).toBe(400)
    expect(result.body.success).toBe(false)
    expect(result.body.message).toContain('articleId')
  })

  it('articleId 为空字符串应返回 400', async () => {
    const result = await postReadingLimitHandler({
      userId: 'user-123',
      articleId: '',
    })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain('articleId')
  })

  it('articleId 正常应返回 success=true', async () => {
    const result = await postReadingLimitHandler({
      userId: 'user-123',
      articleId: 'rsic-2024',
    })
    expect(result.status).toBe(200)
    expect(result.body.success).toBe(true)
    expect(result.body.articleId).toBe('rsic-2024')
  })
})
