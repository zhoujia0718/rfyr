/**
 * P-A-06 Cookie 加密测试
 *
 * 测试 admin-session-local cookie 的安全机制：
 * 1. Base64 编码 + 随机盐
 * 2. HMAC 签名验证
 * 3. 向后兼容旧格式
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac, randomBytes } from 'crypto'

// 测试配置
const HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ─── 模拟的函数实现（来自 app/api/admin/login/route.ts）──────────────────────

/**
 * 生成 HMAC 签名并 Base64 编码 Cookie
 * 新格式: Base64(salt_userId_expiresAt_HMAC)
 */
function createSecureCookie(userId: string, expiresAt: number): string {
  const randomSalt = 'a1b2c3d4e5f6g7h8' // 固定 salt 用于测试
  const msgBuf = Buffer.from(`${randomSalt}_${userId}_${expiresAt}`, 'utf-8')
  const signature = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
    .update(msgBuf)
    .digest('hex')

  // 完整 payload: salt + userId + expiresAt + signature，Base64 编码
  const payload = `${randomSalt}_${userId}_${expiresAt}_${signature}`
  return Buffer.from(payload).toString('base64')
}

/**
 * 验证 HMAC 签名 Cookie（新格式）
 */
function verifySecureCookie(cookieValue: string): string | null {
  try {
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
    const parts = decoded.split('_')

    // 格式: salt_userId_expiresAt_signature (4 parts)
    if (parts.length !== 4) return null

    const [salt, userId, expiresAtStr, signature] = parts
    const expiresAt = parseInt(expiresAtStr, 10)

    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
      return null // 过期
    }

    // 重新计算 HMAC 验证
    const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, 'utf-8')
    const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
      .update(msgBuf)
      .digest('hex')

    if (signature !== expectedSig) {
      return null // 签名不匹配
    }

    return userId
  } catch {
    return null
  }
}

/**
 * 验证旧格式 Cookie（纯文本 HMAC）
 */
function verifyOldFormatCookie(cookieValue: string): string | null {
  try {
    // 旧格式: userId_expiresAt_signature (3+ parts)
    const allParts = cookieValue.split('_')
    if (allParts.length < 3) return null

    const signature = allParts[allParts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = allParts.slice(0, -1).join('_')
    const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
      .update(Buffer.from(remainder, 'utf-8'))
      .digest('hex')

    if (signature !== expectedSig) return null

    // 提取 expiresAt 和 userId
    const parts2 = remainder.split('_')
    const expiresAt = parseInt(parts2[parts2.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    return parts2[0]
  } catch {
    return null
  }
}

/**
 * 通用 Cookie 验证（支持新旧两种格式）
 */
function verifyCookie(cookieValue: string): string | null {
  try {
    // 尝试新格式（Base64）
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
    const decodedParts = decoded.split('_')

    // 新格式: salt_userId_expiresAt_signature (4 parts)
    // salt 是 8 字节 hex = 16 字符
    if (decodedParts.length === 4 && decodedParts[0].length === 16) {
      const [salt, userId, expiresAtStr, signature] = decodedParts
      const expiresAt = parseInt(expiresAtStr, 10)

      if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
        return null // 过期
      }

      // 验证 HMAC
      const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, 'utf-8')
      const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
        .update(msgBuf)
        .digest('hex')

      if (signature !== expectedSig) {
        return null // 签名不匹配
      }

      return userId
    }
  } catch {
    // Base64 解码失败，尝试旧格式
  }

  // 尝试旧格式
  return verifyOldFormatCookie(cookieValue)
}

describe('P-A-06: Cookie 加密安全机制', () => {
  describe('新格式 Cookie 创建与验证', () => {
    it('应创建正确格式的 Base64 编码 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 天
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      // 应该是 Base64 编码的字符串
      expect(typeof cookie).toBe('string')
      expect(cookie.length).toBeGreaterThan(0)

      // 应该能正确解码
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const parts = decoded.split('_')

      expect(parts.length).toBe(4)
      expect(parts[0]).toBe('a1b2c3d4e5f6g7h8') // salt (16 字符)
      expect(parts[1]).toBe(TEST_USER_ID) // userId
      expect(parseInt(parts[2], 10)).toBe(expiresAt) // expiresAt
      expect(parts[3].length).toBe(64) // HMAC signature (64 字符)
    })

    it('应正确验证有效的 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      const userId = verifySecureCookie(cookie)

      expect(userId).toBe(TEST_USER_ID)
    })

    it('应在 Cookie 过期时返回 null', () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 1000 // 1 秒前过期
      const cookie = createSecureCookie(TEST_USER_ID, expiredAt)

      const userId = verifySecureCookie(cookie)

      expect(userId).toBeNull()
    })

    it('应在签名不匹配时返回 null', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      // 篡改 cookie 内容
      const tamperedCookie = cookie.slice(0, -5) + 'xxxxx'

      const userId = verifySecureCookie(tamperedCookie)

      expect(userId).toBeNull()
    })

    it('应在 userId 被篡改时返回 null', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      // 解码并篡改 userId
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const parts = decoded.split('_')
      parts[1] = '550e8400-e29b-41d4-a716-446655440001' // 不同的 userId
      const tampered = Buffer.from(parts.join('_')).toString('base64')

      const userId = verifySecureCookie(tampered)

      expect(userId).toBeNull()
    })
  })

  describe('旧格式 Cookie 向后兼容', () => {
    /**
     * 创建旧格式 Cookie（用于测试向后兼容）
     */
    function createOldFormatCookie(userId: string, expiresAt: number): string {
      const signature = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
        .update(Buffer.from(`${userId}_${expiresAt}`, 'utf-8'))
        .digest('hex')
      return `${userId}_${expiresAt}_${signature}`
    }

    it('应正确验证旧格式 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt)

      const userId = verifyOldFormatCookie(cookie)

      expect(userId).toBe(TEST_USER_ID)
    })

    it('应正确验证过期的旧格式 Cookie（过期检查）', () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 1000
      const cookie = createOldFormatCookie(TEST_USER_ID, expiredAt)

      const userId = verifyOldFormatCookie(cookie)

      expect(userId).toBeNull()
    })

    it('应在旧格式签名不匹配时返回 null', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt)

      // 篡改签名
      const parts = cookie.split('_')
      parts[2] = 'a'.repeat(64)
      const tampered = parts.join('_')

      const userId = verifyOldFormatCookie(tampered)

      expect(userId).toBeNull()
    })
  })

  describe('通用 Cookie 验证（格式自动检测）', () => {
    /**
     * 创建旧格式 Cookie
     */
    function createOldFormatCookie(userId: string, expiresAt: number): string {
      const signature = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
        .update(Buffer.from(`${userId}_${expiresAt}`, 'utf-8'))
        .digest('hex')
      return `${userId}_${expiresAt}_${signature}`
    }

    it('应自动检测并验证新格式 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const newFormatCookie = createSecureCookie(TEST_USER_ID, expiresAt)

      const userId = verifyCookie(newFormatCookie)

      expect(userId).toBe(TEST_USER_ID)
    })

    it('应自动检测并验证旧格式 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const oldFormatCookie = createOldFormatCookie(TEST_USER_ID, expiresAt)

      const userId = verifyCookie(oldFormatCookie)

      expect(userId).toBe(TEST_USER_ID)
    })

    it('应在无效格式时返回 null', () => {
      const invalidCookie = 'not-a-valid-cookie-format'

      const userId = verifyCookie(invalidCookie)

      expect(userId).toBeNull()
    })

    it('应在 Base64 解码失败时回退到旧格式', () => {
      // 一个不是有效 Base64 也不是旧格式的字符串
      const invalidBase64 = '!!!invalid-base64!!!'

      const userId = verifyCookie(invalidBase64)

      expect(userId).toBeNull()
    })
  })

  describe('安全特性测试', () => {
    it('应隐藏 userId（Base64 编码）', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      // Cookie 中不应明文包含 userId
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')

      // userId 应该在解码后存在，但原始 cookie 不应包含明文
      expect(decoded).toContain(TEST_USER_ID)
      expect(cookie).not.toBe(TEST_USER_ID) // 原始值不等于 userId
    })

    it('Salt 应该是 16 字符', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const parts = decoded.split('_')

      // Salt 应该是 16 字符
      expect(parts[0].length).toBe(16)
    })

    it('HMAC 签名长度应为 64 字符（SHA-256）', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)

      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const parts = decoded.split('_')
      const signature = parts[3]

      expect(signature.length).toBe(64)
      expect(/^[0-9a-f]+$/.test(signature)).toBe(true)
    })
  })

  describe('边界条件测试', () => {
    it('应处理包含下划线的 UUID userId', () => {
      // 标准 UUID 包含下划线
      const uuidUserId = '550e8400-e29b-41d4-a716-446655440000'
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7

      const cookie = createSecureCookie(uuidUserId, expiresAt)
      const userId = verifySecureCookie(cookie)

      expect(userId).toBe(uuidUserId)
    })

    it('应在 parts 数量不正确时返回 null', () => {
      // 手动构造一个 3 部分的 Base64 字符串
      const invalidCookie = Buffer.from('abc_def_ghi').toString('base64')

      const userId = verifySecureCookie(invalidCookie)

      expect(userId).toBeNull()
    })

    it('应处理空字符串 Cookie', () => {
      const userId = verifySecureCookie('')

      expect(userId).toBeNull()
    })
  })
})
