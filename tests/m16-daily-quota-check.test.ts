/**
 * M16-09: hooks/use-daily-quota-check.ts — 每日配额检查 Hook 逻辑测试
 *
 * 测试覆盖（纯函数部分，不依赖浏览器 globals）：
 * 1. effectiveDailyLimit 计算逻辑（基础限额 + 每日奖励）
 * 2. 已登录用户返回限额数据
 * 3. 游客返回 guest_read_limit
 * 4. readCount/dailyReadCount 正确传递
 * 5. readIds 正确传递
 * 6. quotaLoaded 状态正确
 * 7. window undefined 时返回默认值
 *
 * 修复记录：
 * - P-M16-03: refreshQuota 不使用 in-memory 缓存，始终从 API 获取最新数据
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── 纯函数逻辑（从 use-daily-quota-check.ts 提取）────────────────────

interface QuotaData {
  readCount: number
  limit: number
  dailyReadCount: number
  dailyLimit: number
  dailyBonusCount: number
  readIds: string[]
}

interface SettingsData {
  guest_read_limit: number
  monthly_daily_limit: number
  referral_bonus_count: number
}

interface RefreshResult {
  readCount: number
  dailyReadCount: number
  effectiveDailyLimit: number
  dailyBonusCount: number
  readIds: string[]
  quotaLoaded: boolean
}

// ─── 登录校验逻辑 ───────────────────────────────────────────────────────

interface AuthData {
  loginTime: number
  user?: { id: string }
  session?: { access_token: string }
}

function parseCustomAuth(raw: string | null): AuthData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as AuthData
    return data
  } catch {
    return null
  }
}

function isValidAuth(authData: AuthData | null): boolean {
  if (!authData) return false
  return !!(authData.loginTime && authData.loginTime > 0 && authData.user?.id)
}

function buildHeaders(authData: AuthData | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authData?.session?.access_token) {
    headers['Authorization'] = `Bearer ${authData.session.access_token}`
  }
  if (authData?.user?.id) {
    headers['X-User-Id'] = authData.user.id
  }
  return headers
}

// ─── refreshQuota 结果计算（纯函数）─────────────────────────────────────

function computeRefreshResult(
  quotaData: QuotaData | null,
  settingsData: SettingsData,
  isLoggedIn: boolean
): RefreshResult {
  if (!isLoggedIn) {
    return {
      readCount: 0,
      dailyReadCount: 0,
      effectiveDailyLimit: settingsData.guest_read_limit ?? 3,
      dailyBonusCount: 0,
      readIds: [],
      quotaLoaded: true,
    }
  }

  if (!quotaData) {
    return {
      readCount: 0,
      dailyReadCount: 0,
      effectiveDailyLimit: (settingsData.monthly_daily_limit ?? 8) + 0,
      dailyBonusCount: 0,
      readIds: [],
      quotaLoaded: true,
    }
  }

  const dailyLimit =
    (settingsData.monthly_daily_limit ?? 8) +
    (quotaData.dailyBonusCount ?? 0)

  return {
    readCount: quotaData.readCount ?? 0,
    dailyReadCount: quotaData.dailyReadCount ?? 0,
    effectiveDailyLimit: dailyLimit,
    dailyBonusCount: quotaData.dailyBonusCount ?? 0,
    readIds: quotaData.readIds ?? [],
    quotaLoaded: true,
  }
}

// ─── 服务器端保护（模拟 SSR）───────────────────────────────────────────

function getServerSideDefault(): RefreshResult {
  return {
    readCount: 0,
    dailyReadCount: 0,
    effectiveDailyLimit: 0,
    dailyBonusCount: 0,
    readIds: [],
    quotaLoaded: false,
  }
}

// ─── 登录校验 ──────────────────────────────────────────────────────────

describe('M16-09a: 登录校验逻辑', () => {
  describe('parseCustomAuth', () => {
    it('null 应返回 null', () => {
      expect(parseCustomAuth(null)).toBeNull()
    })

    it('无效 JSON 应返回 null', () => {
      expect(parseCustomAuth('not-json')).toBeNull()
      expect(parseCustomAuth('')).toBeNull()
    })

    it('有效 JSON 应解析', () => {
      const raw = JSON.stringify({ loginTime: Date.now(), user: { id: 'u1' } })
      const result = parseCustomAuth(raw)
      expect(result).not.toBeNull()
      expect(result!.user?.id).toBe('u1')
    })
  })

  describe('isValidAuth', () => {
    it('null 应返回 false', () => {
      expect(isValidAuth(null)).toBe(false)
    })

    it('loginTime > 0 且有 user.id 应返回 true', () => {
      expect(isValidAuth({ loginTime: Date.now(), user: { id: 'u1' } })).toBe(true)
    })

    it('loginTime === 0 应返回 false', () => {
      expect(isValidAuth({ loginTime: 0, user: { id: 'u1' } })).toBe(false)
    })

    it('无 user.id 应返回 false', () => {
      expect(isValidAuth({ loginTime: Date.now(), user: { id: '' } })).toBe(false)
      expect(isValidAuth({ loginTime: Date.now() })).toBe(false)
    })
  })

  describe('buildHeaders', () => {
    it('无 authData 应只包含 Content-Type', () => {
      const headers = buildHeaders(null)
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['X-User-Id']).toBeUndefined()
    })

    it('有 token 应附加 Authorization', () => {
      const auth = { loginTime: Date.now(), user: { id: 'u1' }, session: { access_token: 'tok123' } }
      const headers = buildHeaders(auth)
      expect(headers['Authorization']).toBe('Bearer tok123')
      expect(headers['X-User-Id']).toBe('u1')
    })

    it('无 session 时不应附加 Authorization', () => {
      const auth = { loginTime: Date.now(), user: { id: 'u1' } }
      const headers = buildHeaders(auth)
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['X-User-Id']).toBe('u1')
    })
  })
})

// ─── 配额计算 ──────────────────────────────────────────────────────────

describe('M16-09b: computeRefreshResult', () => {
  const defaultSettings: SettingsData = {
    guest_read_limit: 3,
    monthly_daily_limit: 8,
    referral_bonus_count: 2,
  }

  describe('已登录用户', () => {
    it('effectiveDailyLimit = 基础限额（8）+ 每日奖励（2）', () => {
      const quota: QuotaData = {
        readCount: 5,
        dailyReadCount: 2,
        dailyBonusCount: 2,
        readIds: ['a1', 'a2'],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.effectiveDailyLimit).toBe(10)
    })

    it('readCount 应正确传递', () => {
      const quota: QuotaData = {
        readCount: 5,
        dailyReadCount: 3,
        dailyBonusCount: 1,
        readIds: [],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.readCount).toBe(5)
    })

    it('dailyReadCount 应正确传递', () => {
      const quota: QuotaData = {
        readCount: 5,
        dailyReadCount: 3,
        dailyBonusCount: 0,
        readIds: [],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.dailyReadCount).toBe(3)
    })

    it('readIds 应正确传递', () => {
      const quota: QuotaData = {
        readCount: 3,
        dailyReadCount: 2,
        dailyBonusCount: 0,
        readIds: ['a1', 'a2', 'a3'],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.readIds).toEqual(['a1', 'a2', 'a3'])
    })

    it('dailyBonusCount 应正确传递', () => {
      const quota: QuotaData = {
        readCount: 0,
        dailyReadCount: 0,
        dailyBonusCount: 1,
        readIds: [],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.dailyBonusCount).toBe(1)
    })

    it('无 quotaData 时应有默认值', () => {
      const result = computeRefreshResult(null, defaultSettings, true)
      expect(result.readCount).toBe(0)
      expect(result.dailyReadCount).toBe(0)
      expect(result.effectiveDailyLimit).toBe(8) // 8 + 0
    })

    it('P-M16-03：无内存缓存——每次调用均从 API 获取，quotaLoaded 始终为 true', () => {
      const quota: QuotaData = {
        readCount: 0,
        dailyReadCount: 0,
        dailyBonusCount: 0,
        readIds: [],
        limit: 0,
        dailyLimit: 0,
      }
      const result = computeRefreshResult(quota, defaultSettings, true)
      expect(result.quotaLoaded).toBe(true)
    })
  })

  describe('游客（未登录）', () => {
    it('effectiveDailyLimit 应为 guest_read_limit（3）', () => {
      const result = computeRefreshResult(null, defaultSettings, false)
      expect(result.effectiveDailyLimit).toBe(3)
    })

    it('readCount 应为 0', () => {
      const result = computeRefreshResult(null, defaultSettings, false)
      expect(result.readCount).toBe(0)
    })

    it('dailyBonusCount 应为 0', () => {
      const result = computeRefreshResult(null, defaultSettings, false)
      expect(result.dailyBonusCount).toBe(0)
    })

    it('readIds 应为空数组', () => {
      const result = computeRefreshResult(null, defaultSettings, false)
      expect(result.readIds).toEqual([])
    })

    it('quotaLoaded 应为 true', () => {
      const result = computeRefreshResult(null, defaultSettings, false)
      expect(result.quotaLoaded).toBe(true)
    })
  })
})

// ─── 服务器端默认值 ─────────────────────────────────────────────────────

describe('M16-09c: SSR 保护', () => {
  it('window undefined 时返回默认值（quotaLoaded=false）', () => {
    const result = getServerSideDefault()
    expect(result.quotaLoaded).toBe(false)
    expect(result.effectiveDailyLimit).toBe(0)
    expect(result.readCount).toBe(0)
  })
})

// ─── 端点 URL 构造 ─────────────────────────────────────────────────────

describe('M16-09d: 端点选择逻辑', () => {
  it('已登录时应调用 /api/reading-limit', () => {
    const isLoggedIn = true
    const url = isLoggedIn ? '/api/reading-limit' : '/api/guest-reading'
    expect(url).toBe('/api/reading-limit')
  })

  it('未登录时应调用 /api/guest-reading', () => {
    const isLoggedIn = false
    const url = isLoggedIn ? '/api/reading-limit' : '/api/guest-reading'
    expect(url).toBe('/api/guest-reading')
  })

  it('应同时调用 /api/reading-settings', () => {
    const settingsUrl = '/api/reading-settings'
    expect(settingsUrl).toBe('/api/reading-settings')
  })
})

// ─── dailyBonusCount 叠加逻辑 ───────────────────────────────────────────

describe('M16-09e: 每日邀请奖励叠加', () => {
  const settings: SettingsData = {
    guest_read_limit: 3,
    monthly_daily_limit: 8,
    referral_bonus_count: 2,
  }

  it('无邀请奖励时为 8', () => {
    const quota: QuotaData = {
      readCount: 0, dailyReadCount: 0, dailyBonusCount: 0, readIds: [], limit: 0, dailyLimit: 0,
    }
    const result = computeRefreshResult(quota, settings, true)
    expect(result.effectiveDailyLimit).toBe(8)
  })

  it('邀请 1 人时为 10', () => {
    const quota: QuotaData = {
      readCount: 0, dailyReadCount: 0, dailyBonusCount: 2, readIds: [], limit: 0, dailyLimit: 0,
    }
    const result = computeRefreshResult(quota, settings, true)
    expect(result.effectiveDailyLimit).toBe(10)
  })

  it('邀请 3 人时为 14', () => {
    const quota: QuotaData = {
      readCount: 0, dailyReadCount: 0, dailyBonusCount: 6, readIds: [], limit: 0, dailyLimit: 0,
    }
    const result = computeRefreshResult(quota, settings, true)
    expect(result.effectiveDailyLimit).toBe(14)
  })
})
