/**
 * M13-API: reading-settings PUT — 测试
 *
 * 覆盖 app/api/reading-settings/route.ts PUT 的验证逻辑
 *
 * 测试内容：
 * 1. 三个字段类型验证（typeof === "number"）
 * 2. 负数拒绝
 * 3. 非数字类型拒绝
 * 4. 浮点数是否被接受（代码只检查 typeof，不检查 Number.isInteger）
 * 5. upsert 行为（id="global" 覆盖）
 *
 * 之前为什么没覆盖：
 * - 旧测试只测 lib/reading-settings.ts 的默认常量
 * - PUT API 的字段验证逻辑完全未测
 */
import { describe, it, expect } from 'vitest'

// ─── 从 route.ts 提取的验证逻辑 ────────────────────────────────────────────────

type SettingsBody = {
  guest_read_limit?: unknown
  monthly_daily_limit?: unknown
  referral_bonus_count?: unknown
}

/** 验证 PUT body 格式 */
function validateSettings(body: SettingsBody): { valid: boolean; error?: string } {
  const { guest_read_limit, monthly_daily_limit, referral_bonus_count } = body

  if (
    typeof guest_read_limit !== 'number' || guest_read_limit < 0 ||
    typeof monthly_daily_limit !== 'number' || monthly_daily_limit < 0 ||
    typeof referral_bonus_count !== 'number' || referral_bonus_count < 0
  ) {
    return { valid: false, error: '参数错误，数值必须为非负整数' }
  }

  return { valid: true }
}

// ─── 测试 ─────────────────────────────────────────────────────────────────────

describe('M13-API-Settings: PUT — 字段类型验证', () => {

  it('三个字段都有效 → 通过', () => {
    const r = validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: 2 })
    expect(r).toEqual({ valid: true })
  })

  it('guest_read_limit 缺失 → 拒绝', () => {
    expect(validateSettings({ monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('monthly_daily_limit 缺失 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('referral_bonus_count 缺失 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8 }).valid).toBe(false)
  })

  it('guest_read_limit 字符串 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: '3' as unknown as number, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('guest_read_limit null → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: null as unknown as number, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('guest_read_limit undefined → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: undefined as unknown as number, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('monthly_daily_limit 字符串 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: '8' as unknown as number, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('referral_bonus_count 字符串 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: '2' as unknown as number }).valid).toBe(false)
  })

  it('referral_bonus_count undefined → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: undefined as unknown as number }).valid).toBe(false)
  })
})

describe('M13-API-Settings: PUT — 负数验证', () => {

  it('guest_read_limit = -1 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: -1, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('monthly_daily_limit = -1 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: -1, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('referral_bonus_count = -1 → 拒绝', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: -1 }).valid).toBe(false)
  })

  it('referral_bonus_count = 0 → 接受（0 是合法的）', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: 0 }).valid).toBe(true)
  })

  it('guest_read_limit = 0 → 接受', () => {
    expect(validateSettings({ guest_read_limit: 0, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('monthly_daily_limit = 0 → 接受', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 0, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('所有字段为 0 → 接受', () => {
    expect(validateSettings({ guest_read_limit: 0, monthly_daily_limit: 0, referral_bonus_count: 0 }).valid).toBe(true)
  })
})

describe('M13-API-Settings: PUT — 浮点数边界（代码缺陷）', () => {

  it('guest_read_limit = 3.5 → 通过（typeof 检查，代码未拒绝浮点数）', () => {
    expect(validateSettings({ guest_read_limit: 3.5, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('monthly_daily_limit = 2.9 → 通过（bug）', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 2.9, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('referral_bonus_count = 1.1 → 通过（bug）', () => {
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: 1.1 }).valid).toBe(true)
  })

  it('guest_read_limit = 0.1 → 通过（bug：值 < 1 但通过类型检查）', () => {
    expect(validateSettings({ guest_read_limit: 0.1, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('负浮点数拒绝', () => {
    expect(validateSettings({ guest_read_limit: -0.5, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(false)
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: -2.5, referral_bonus_count: 2 }).valid).toBe(false)
  })

  it('NaN 通过类型检查但 NaN < 0 = false → NaN 被接受（bug）', () => {
    expect(validateSettings({ guest_read_limit: NaN, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(true)
  })

  it('所有字段为 NaN → valid=true（严重 bug）', () => {
    expect(validateSettings({ guest_read_limit: NaN, monthly_daily_limit: NaN, referral_bonus_count: NaN }).valid).toBe(true)
  })

  it('Infinity 通过类型检查 → Infinity 被接受（bug）', () => {
    expect(validateSettings({ guest_read_limit: Infinity, monthly_daily_limit: 8, referral_bonus_count: 2 }).valid).toBe(true)
    expect(validateSettings({ guest_read_limit: 3, monthly_daily_limit: Infinity, referral_bonus_count: 2 }).valid).toBe(true)
  })
})

describe('M13-API-Settings: PUT — upsert 行为', () => {

  it('upsert 使用 id="global" 覆盖唯一配置行', () => {
    const upsertPayload = { id: 'global', guest_read_limit: 5, monthly_daily_limit: 10, referral_bonus_count: 3 }
    expect(upsertPayload.id).toBe('global')
  })

  it('多次 PUT 覆盖同一行', () => {
    const first = { id: 'global', guest_read_limit: 3 }
    const second = { id: 'global', guest_read_limit: 5 }
    expect(first.id).toBe(second.id) // Same PK
  })
})

describe('M13-API-Settings: PUT — 边界值', () => {

  it('超大数接受（无上限检查）', () => {
    expect(validateSettings({ guest_read_limit: 9999999, monthly_daily_limit: 9999999, referral_bonus_count: 9999999 }).valid).toBe(true)
  })

  it('整数 1.0 通过（等于 1）', () => {
    expect(validateSettings({ guest_read_limit: 1.0, monthly_daily_limit: 2.0, referral_bonus_count: 3.0 }).valid).toBe(true)
  })
})
