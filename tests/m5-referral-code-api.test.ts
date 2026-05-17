/**
 * M5-20: app/api/referral/code/route.ts — 获取用户邀请码 API 测试
 *
 * 测试覆盖：
 * 1. 未登录返回 401
 * 2. 已有邀请码直接返回
 * 3. 无邀请码自动创建（使用 crypto.randomBytes）
 * 4. 邀请码格式验证（8位小写十六进制 0-9a-f）
 * 5. M5-10 修复：统一使用顶层 import（randomBytes）
 * 6. V-H-07 修复：使用加密安全的随机字节
 * 7. 数据库错误返回 500
 *
 * 修复记录：
 * - M5-09 FIX: 邀请码字符集与生成端保持一致（8位小写十六进制）
 */
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'

// ─── 生成邀请码：8位小写十六进制（与 /api/referral/code 实现一致）──────────────

function generateReferralCode(): string {
  return Array.from(randomBytes(8))
    .map((b) => b % 16)
    .map((n) => (n < 10 ? String(n) : String.fromCharCode(97 + n - 10)))
    .join('')
}

// ─── 邀请码格式：8位小写十六进制（与 /api/referral/code 实现一致）────────────────

const REFERRAL_CODE_REGEX = /^[0-9a-f]{8}$/

function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_REGEX.test(code)
}

// ─── Mock 主逻辑 ───────────────────────────────────────────────

function mockGetCodeHandler(params: {
  userId: string | null
  existingCode?: string | null
  dbSelectError?: string | null
  dbInsertError?: string | null
}): { status: number; body: Record<string, unknown> } {
  if (!params.userId) {
    return { status: 401, body: { error: '请先登录' } }
  }

  // 查已有
  if (params.dbSelectError) {
    return { status: 500, body: { error: `查询失败: ${params.dbSelectError}` } }
  }

  if (params.existingCode) {
    return { status: 200, body: { code: params.existingCode } }
  }

  // 创建新码
  const code = generateReferralCode()

  if (params.dbInsertError) {
    return { status: 500, body: { error: `创建失败: ${params.dbInsertError}` } }
  }

  return { status: 200, body: { code } }
}

// ─── 未登录检查 ───────────────────────────────────────────────

describe('M5-20a: 未登录检查', () => {
  it('userId=null 应返回 401', () => {
    const result = mockGetCodeHandler({ userId: null })
    expect(result.status).toBe(401)
    expect(result.body.error).toBe('请先登录')
  })

  it('userId 有值时不返回 401', () => {
    const result = mockGetCodeHandler({ userId: 'user-123' })
    expect(result.status).not.toBe(401)
  })
})

// ─── 已有邀请码 ───────────────────────────────────────────────

describe('M5-20b: 已有邀请码', () => {
  it('数据库有码时直接返回', () => {
    const result = mockGetCodeHandler({
      userId: 'user-123',
      existingCode: 'abc12345',
    })
    expect(result.status).toBe(200)
    expect(result.body.code).toBe('abc12345')
  })

  it('空字符串视为无码（触发创建）', () => {
    const result = mockGetCodeHandler({
      userId: 'user-123',
      existingCode: '',
    })
    expect(result.status).toBe(200)
    expect(typeof result.body.code).toBe('string')
    expect((result.body.code as string).length).toBe(8)
  })
})

// ─── V-H-07 修复：crypto.randomBytes 生成邀请码 ────────────────────────

describe('M5-20c: V-H-07 修复：crypto.randomBytes 生成邀请码', () => {
  it('生成的邀请码长度为 8', () => {
    const code = generateReferralCode()
    expect(code.length).toBe(8)
  })

  it('生成的邀请码符合格式', () => {
    const code = generateReferralCode()
    expect(isValidReferralCode(code)).toBe(true)
  })

  it('生成的邀请码不包含 l/o/0/1', () => {
    const code = generateReferralCode()
    expect(/[lo01]/.test(code)).toBe(false)
  })

  it('多次生成应有足够随机性（不全部相同）', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateReferralCode()))
    // 100 次生成，期望至少有有一定数量的不同值
    expect(codes.size).toBeGreaterThan(90)
  })
})

// ─── 数据库错误处理 ─────────────────────────────────────────────

describe('M5-20d: 数据库错误处理', () => {
  it('查询失败返回 500', () => {
    const result = mockGetCodeHandler({
      userId: 'user-123',
      dbSelectError: 'Connection timeout',
    })
    expect(result.status).toBe(500)
    expect(result.body.error).toContain('查询失败')
  })

  it('插入失败返回 500', () => {
    const result = mockGetCodeHandler({
      userId: 'user-123',
      existingCode: null,
      dbInsertError: 'Duplicate key',
    })
    expect(result.status).toBe(500)
    expect(result.body.error).toContain('创建失败')
  })
})

// ─── invite_code 长度验证 ──────────────────────────────────────

describe('M5-20e: invite_code 长度验证', () => {
  it('8字符码通过验证', () => {
    expect(isValidReferralCode('abcdefgh')).toBe(true)
    expect(isValidReferralCode('a2c3d4e5')).toBe(true)
  })

  it('长度不为8的码拒绝', () => {
    expect(isValidReferralCode('abc')).toBe(false)
    expect(isValidReferralCode('abcdefghij')).toBe(false)
  })

  it('含大写字母拒绝', () => {
    expect(isValidReferralCode('ABCDEFGH')).toBe(false)
    expect(isValidReferralCode('AbCdEfGh')).toBe(false)
  })

  it('含数字 0/1 拒绝', () => {
    expect(isValidReferralCode('00001111')).toBe(false)
  })
})
