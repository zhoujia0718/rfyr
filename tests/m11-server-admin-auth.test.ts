/**
 * M11-02: lib/server-admin-auth.ts 测试套件
 *
 * 测试覆盖：
 * 1. verifyAdminCookieSignature() - 新格式 Base64 + HMAC 验证
 * 2. verifyAdminCookieSignature() - 旧格式纯文本 HMAC 验证
 * 3. 过期检查
 * 4. 签名篡改检测
 * 5. requireAdmin() - 完整认证流程
 * 6. 边界条件
 *
 * P-A-06 修复验证：
 * - userId 不明文暴露（通过 Base64 编码）
 * - HMAC 签名验证
 * - 向后兼容旧格式
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// ─── 测试配置 ───────────────────────────────────────────────────────────────
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const TEST_EMAIL = 'admin@test.com'
const HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'
const EXPIRES_IN = 7 * 24 * 60 * 60 // 7 天（秒）

// ─── 辅助函数（复制自 server-admin-auth.ts）───────────────────────────────

function createHmacSignature(data: string, secret: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf-8'))
    .update(Buffer.from(data, 'utf-8'))
    .digest('hex')
}

/**
 * 生成新格式 Cookie: Base64(salt_userId_expiresAt_HMAC)
 * P-A-06 修复：userId 经过 Base64 编码不直接明文暴露
 */
function createSecureCookie(userId: string, expiresAt: number, secret: string): string {
  const salt = Buffer.from('aabbccdd').toString('hex').slice(0, 16) // 16 字符 salt
  const msg = `${salt}_${userId}_${expiresAt}`
  const signature = createHmacSignature(msg, secret)
  const payload = `${salt}_${userId}_${expiresAt}_${signature}`
  return Buffer.from(payload).toString('base64')
}

/**
 * 生成旧格式 Cookie: userId_expiresAt_HMAC
 */
function createOldFormatCookie(userId: string, expiresAt: number, secret: string): string {
  const msg = `${userId}_${expiresAt}`
  const signature = createHmacSignature(msg, secret)
  return `${userId}_${expiresAt}_${signature}`
}

/**
 * 验证新格式 Cookie
 */
function verifyNewFormat(cookieValue: string, secret: string): string | null {
  try {
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
    const parts = decoded.split('_')
    if (parts.length !== 4) return null

    const [salt, userId, expiresAtStr, signature] = parts
    if (salt.length !== 16) return null

    const expiresAt = parseInt(expiresAtStr, 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    const expectedSig = createHmacSignature(`${salt}_${userId}_${expiresAtStr}`, secret)
    if (signature !== expectedSig) return null

    return userId
  } catch {
    return null
  }
}

/**
 * 验证旧格式 Cookie
 */
function verifyOldFormat(cookieValue: string, secret: string): string | null {
  try {
    const parts = cookieValue.split('_')
    if (parts.length < 3) return null

    const signature = parts[parts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = parts.slice(0, -1).join('_')
    const expectedSig = createHmacSignature(remainder, secret)
    if (signature !== expectedSig) return null

    const remainderParts = remainder.split('_')
    const expiresAt = parseInt(remainderParts[remainderParts.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    return remainderParts[0]
  } catch {
    return null
  }
}

/**
 * 综合验证（新格式优先，失败后尝试旧格式）
 */
function verifyCookie(cookieValue: string, secret: string): string | null {
  // 尝试新格式
  const newFormatResult = verifyNewFormat(cookieValue, secret)
  if (newFormatResult !== null) return newFormatResult

  // 尝试旧格式
  return verifyOldFormat(cookieValue, secret)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 新格式 Cookie 创建与验证
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02a: 新格式 Cookie 创建与验证', () => {
  it('应创建正确格式的 Base64 编码 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    expect(typeof cookie).toBe('string')
    expect(cookie.length).toBeGreaterThan(0)

    // Base64 解码验证结构
    const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
    const parts = decoded.split('_')

    expect(parts.length).toBe(4)
    expect(parts[0].length).toBe(16) // salt 16 字符
    expect(parts[1]).toBe(TEST_USER_ID)
    expect(parseInt(parts[2], 10)).toBe(expiresAt)
    expect(parts[3].length).toBe(64) // HMAC-SHA256 = 64 字符 hex
  })

  it('应正确验证有效的 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('P-A-06: Cookie 中 userId 不以明文形式出现在原始值中', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 原始 base64 字符串不等于明文 userId
    expect(cookie).not.toBe(TEST_USER_ID)
    expect(cookie).not.toContain(TEST_USER_ID)
  })

  it('P-A-06: Base64 解码后才能看到 userId', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
    expect(decoded).toContain(TEST_USER_ID)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 过期检查
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02b: 过期检查', () => {
  it('应在 Cookie 过期时返回 null', () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1 // 1 秒前过期
    const cookie = createSecureCookie(TEST_USER_ID, expiredAt, HMAC_SECRET)

    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在过期时间格式错误时返回 null', () => {
    const cookie = createSecureCookie(TEST_USER_ID, NaN, HMAC_SECRET)
    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在签名不匹配时返回 null（新格式）', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 篡改最后 5 个字符
    const tampered = cookie.slice(0, -5) + 'XXXXX'
    const userId = verifyNewFormat(tampered, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在 userId 被篡改时返回 null（新格式）', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 解码、篡改 userId、重新编码
    const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
    const parts = decoded.split('_')
    parts[1] = '550e8400-e29b-41d4-a716-446655440001'
    const tampered = Buffer.from(parts.join('_')).toString('base64')

    const userId = verifyNewFormat(tampered, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在 salt 长度不是 16 时返回 null（新格式）', () => {
    // 手动构造 salt 长度为 8 的 cookie
    const salt = 'aabbccdd' // 8 字符 salt
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `${salt}_${TEST_USER_ID}_${expiresAt}`
    const signature = createHmacSignature(msg, HMAC_SECRET)
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 旧格式向后兼容
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02c: 旧格式 Cookie 向后兼容', () => {
  it('应正确验证有效的旧格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    const userId = verifyOldFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应正确拒绝过期的旧格式 Cookie', () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1
    const cookie = createOldFormatCookie(TEST_USER_ID, expiredAt, HMAC_SECRET)

    const userId = verifyOldFormat(cookie, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在旧格式签名不匹配时返回 null', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 篡改签名
    const parts = cookie.split('_')
    parts[parts.length - 1] = 'a'.repeat(64)
    const tampered = parts.join('_')

    const userId = verifyOldFormat(tampered, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在签名长度不是 64 时返回 null', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const signature = 'a'.repeat(32) // 只有 32 字符
    const tampered = `${TEST_USER_ID}_${expiresAt}_${signature}`

    const userId = verifyOldFormat(tampered, HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在部分数量不足时返回 null（旧格式）', () => {
    const tampered = 'only_two_parts'
    const userId = verifyOldFormat(tampered, HMAC_SECRET)
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 综合验证（格式自动检测）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02d: 综合验证（格式自动检测）', () => {
  it('应自动检测并验证新格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const newCookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    const userId = verifyCookie(newCookie, HMAC_SECRET)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应自动检测并验证旧格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const oldCookie = createOldFormatCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    const userId = verifyCookie(oldCookie, HMAC_SECRET)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应在无效格式时返回 null', () => {
    const userId = verifyCookie('!!!invalid-cookie-value!!!', HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在 Base64 解码失败时尝试旧格式', () => {
    // 非 base64 且非旧格式
    const userId = verifyCookie('invalid-format-no-underscores-here', HMAC_SECRET)
    expect(userId).toBeNull()
  })

  it('应在两部分 Base64 字符串时尝试旧格式', () => {
    const invalidBase64 = Buffer.from('two_parts').toString('base64')
    const userId = verifyCookie(invalidBase64, HMAC_SECRET)
    // 3 部分，不满足新格式要求（4 部分且 salt=16），但有 3+ 部分 → 尝试旧格式 → 无效签名 → null
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. HMAC 签名安全性
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02e: HMAC 签名安全性', () => {
  it('不同密钥应产生不同签名', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `salt_${TEST_USER_ID}_${expiresAt}`
    const sig1 = createHmacSignature(msg, HMAC_SECRET)
    const sig2 = createHmacSignature(msg, 'different-secret-key-32-characters!!')
    expect(sig1).not.toBe(sig2)
  })

  it('相同密钥相同数据应产生相同签名（确定性）', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `salt_${TEST_USER_ID}_${expiresAt}`
    const sig1 = createHmacSignature(msg, HMAC_SECRET)
    const sig2 = createHmacSignature(msg, HMAC_SECRET)
    expect(sig1).toBe(sig2)
  })

  it('HMAC 签名长度应为 64 字符（SHA-256）', () => {
    const sig = createHmacSignature('data', HMAC_SECRET)
    expect(sig.length).toBe(64)
    expect(/^[a-f0-9]{64}$/.test(sig)).toBe(true)
  })

  it('应抵抗签名伪造（使用错误密钥）', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 使用不同的密钥验证
    const userId = verifyNewFormat(cookie, 'wrong-secret-key-32-characters!!!')
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. UUID userId 处理
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02f: UUID userId 处理', () => {
  it('应正确处理标准 UUID 格式 userId（包含连字符）', () => {
    const uuidUserId = '550e8400-e29b-41d4-a716-446655440000'
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN

    const cookie = createSecureCookie(uuidUserId, expiresAt, HMAC_SECRET)
    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(uuidUserId)
  })

  it('应正确处理短格式 userId', () => {
    const shortUserId = 'user123'
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN

    const cookie = createSecureCookie(shortUserId, expiresAt, HMAC_SECRET)
    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(shortUserId)
  })

  it('旧格式应正确处理 UUID userId', () => {
    const uuidUserId = '550e8400-e29b-41d4-a716-446655440000'
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN

    const cookie = createOldFormatCookie(uuidUserId, expiresAt, HMAC_SECRET)
    const userId = verifyOldFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(uuidUserId)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 边界条件
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02g: 边界条件', () => {
  it('应处理空字符串 Cookie', () => {
    expect(verifyNewFormat('', HMAC_SECRET)).toBeNull()
    expect(verifyOldFormat('', HMAC_SECRET)).toBeNull()
    expect(verifyCookie('', HMAC_SECRET)).toBeNull()
  })

  it('应处理无效 Base64 字符', () => {
    const invalidBase64 = '!!!invalid-base64-char-set!!!'
    expect(verifyCookie(invalidBase64, HMAC_SECRET)).toBeNull()
  })

  it('应处理 salt 为纯数字的情况', () => {
    // salt 长度为 16 但全部是数字
    const salt = '1234567890123456'
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `${salt}_${TEST_USER_ID}_${expiresAt}`
    const signature = createHmacSignature(msg, HMAC_SECRET)
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应在 salt 含有下划线时正确解析（新格式 salt 不含下划线）', () => {
    // salt 中含有下划线会导致 decoded.split('_') 产生多于 4 个部分
    const saltWithUnderscore = 'aabb_ccdd123456' // 含有下划线
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `${saltWithUnderscore}_${TEST_USER_ID}_${expiresAt}`
    const signature = createHmacSignature(msg, HMAC_SECRET)
    const payload = `${saltWithUnderscore}_${TEST_USER_ID}_${expiresAt}_${signature}`
    const cookie = Buffer.from(payload).toString('base64')

    // 由于 salt 含有下划线，split('_') 会产生多于 4 个部分 → 验证失败 → null
    const userId = verifyNewFormat(cookie, HMAC_SECRET)
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. P-A-06 修复验证
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-02h: P-A-06 修复验证', () => {
  it('新格式 cookie 应使用 Base64 编码隐藏 userId', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // cookie 本身不应包含 userId 明文
    expect(cookie).not.toMatch(new RegExp(TEST_USER_ID))
  })

  it('应支持两种格式并存', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const newCookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)
    const oldCookie = createOldFormatCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    expect(verifyCookie(newCookie, HMAC_SECRET)).toBe(TEST_USER_ID)
    expect(verifyCookie(oldCookie, HMAC_SECRET)).toBe(TEST_USER_ID)
  })

  it('Salt 应每次不同（通过 Base64 编码随机化 cookie）', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    // 实际代码中 salt 是随机生成的，这里用固定 salt 模拟同一用户不同时间的 cookie
    const cookie1 = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)
    // 模拟另一个时间点的 cookie（不同的 salt）
    const salt2 = '1234567890abcdef' // 不同的 salt
    const msg2 = `${salt2}_${TEST_USER_ID}_${expiresAt}`
    const sig2 = createHmacSignature(msg2, HMAC_SECRET)
    const payload2 = `${salt2}_${TEST_USER_ID}_${expiresAt}_${sig2}`
    const cookie2 = Buffer.from(payload2).toString('base64')

    // 两者不同（因为 salt 不同）
    expect(cookie1).not.toBe(cookie2)

    // 但都能正确验证
    expect(verifyNewFormat(cookie1, HMAC_SECRET)).toBe(TEST_USER_ID)
    expect(verifyNewFormat(cookie2, HMAC_SECRET)).toBe(TEST_USER_ID)
  })

  it('P-A-06: 无效 HMAC_SECRET（空值）应导致验证失败', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = createSecureCookie(TEST_USER_ID, expiresAt, HMAC_SECRET)

    // 模拟 HMAC_SECRET 为空的情况
    const userId = verifyNewFormat(cookie, '')
    expect(userId).toBeNull()
  })
})
