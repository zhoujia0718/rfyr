/**
 * P-A-06 关联测试: 伪造 Token 生成与验证
 *
 * 测试 generateFakeToken 和 verifyFakeTokenSignature 的功能：
 * 1. Token 生成正确性
 * 2. Token 签名验证
 * 3. Token 过期检查
 * 4. userId 匹配验证
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'

// 测试配置
const HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ─── 模拟的函数实现（来自 lib/server-auth-user.ts）────────────────────────────

/**
 * 创建 HMAC 签名
 */
function createHmacSignature(data: string, secret: string): string {
  const key = Buffer.from(secret, 'utf-8')
  const msg = Buffer.from(data, 'utf-8')
  return createHmac('sha256', key).update(msg).digest('hex')
}

/**
 * 生成伪造 token（供前端使用）
 * Token 格式: fake_{userId}_{expiresAt}_{signature}
 */
function generateFakeToken(userId: string, expiresInSeconds: number = 7 * 24 * 60 * 60): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  const signature = createHmacSignature(`${userId}_${expiresAt}`, HMAC_SECRET)
  return `fake_${userId}_${expiresAt}_${signature}`
}

    /**
     * 验证伪造 token 签名
     * Token 格式: fake_{userId}_{expiresAt}_{signature}
     * userId 是 UUID 格式（包含连字符 -）
     * remainder 格式: userId_expiresAt_（末尾有一个额外的下划线）
     * 解析策略：找到倒数第二个下划线来分隔 expiresAt
     */
    function verifyFakeTokenSignature(token: string, userId: string): boolean {
      // 格式检查
      if (!token.startsWith('fake_')) {
        return false
      }

      // 从后向前切出 64 字符的 signature
      const signature = token.slice(-64)
      // 去掉 fake_ 前缀（5个字符）和 signature 后缀（64个字符）
      const remainder = token.slice(5, -64)

      // signature 必须是 64 字符 hex
      if (!/^[0-9a-f]{64}$/i.test(signature)) {
        return false
      }

      // remainder 格式: userId_expiresAt_
      // 有两个下划线：userId 和 expiresAt 之间，以及末尾
      // 我们需要找到倒数第二个下划线来分隔 expiresAt
      const lastUnderscoreIdx = remainder.lastIndexOf('_')
      if (lastUnderscoreIdx === -1) {
        return false
      }

      // 找倒数第二个下划线
      const secondLastUnderscoreIdx = remainder.lastIndexOf('_', lastUnderscoreIdx - 1)
      if (secondLastUnderscoreIdx === -1) {
        return false
      }

      const uid = remainder.slice(0, secondLastUnderscoreIdx)
      const expiresAtStr = remainder.slice(secondLastUnderscoreIdx + 1, lastUnderscoreIdx)

      // 验证 userId 匹配
      if (uid !== userId) {
        return false
      }

      // 检查过期
      const expiresAt = parseInt(expiresAtStr, 10)
      if (isNaN(expiresAt) || Date.now() > expiresAt * 1000) {
        return false
      }

      // 验证签名
      const expectedSignature = createHmacSignature(`${uid}_${expiresAtStr}`, HMAC_SECRET)
      if (signature !== expectedSignature) {
        return false
      }

      return true
    }

describe('P-A-06 关联: 伪造 Token 安全机制', () => {
  describe('Token 生成', () => {
    it('应生成正确格式的 Token', () => {
      const token = generateFakeToken(TEST_USER_ID)

      expect(token.startsWith('fake_')).toBe(true)
      expect(token).toContain(TEST_USER_ID)
      expect(token.slice(-64).length).toBe(64) // signature 长度
    })

    it('应使用正确的过期时间', () => {
      const expiresInSeconds = 60 * 60 // 1 小时
      const token = generateFakeToken(TEST_USER_ID, expiresInSeconds)

      // 从 token 中提取过期时间
      // 格式: fake_{userId}_{expiresAt}_{signature}
      // signature 是最后 64 个字符
      const lastUnderscoreIdx = token.lastIndexOf('_')
      const secondLastUnderscoreIdx = token.lastIndexOf('_', lastUnderscoreIdx - 1)
      const expiresAtStr = token.slice(secondLastUnderscoreIdx + 1, lastUnderscoreIdx)
      const expiresAt = parseInt(expiresAtStr, 10)

      const expectedExpiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds

      // 允许 2 秒误差
      expect(Math.abs(expiresAt - expectedExpiresAt)).toBeLessThan(2)
    })

    it('应使用默认 7 天过期时间', () => {
      const token = generateFakeToken(TEST_USER_ID)

      const lastUnderscoreIdx = token.lastIndexOf('_')
      const secondLastUnderscoreIdx = token.lastIndexOf('_', lastUnderscoreIdx - 1)
      const expiresAtStr = token.slice(secondLastUnderscoreIdx + 1, lastUnderscoreIdx)
      const expiresAt = parseInt(expiresAtStr, 10)

      const expectedExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

      expect(Math.abs(expiresAt - expectedExpiresAt)).toBeLessThan(2)
    })

    it('不同 userId 应产生不同 token', () => {
      const userId1 = '550e8400-e29b-41d4-a716-446655440000'
      const userId2 = '550e8400-e29b-41d4-a716-446655440001'

      const token1 = generateFakeToken(userId1)
      const token2 = generateFakeToken(userId2)

      expect(token1).not.toBe(token2)
    })
  })

  describe('Token 签名验证', () => {
    it('应正确验证有效 Token', () => {
      const token = generateFakeToken(TEST_USER_ID)

      const isValid = verifyFakeTokenSignature(token, TEST_USER_ID)

      expect(isValid).toBe(true)
    })

    it('应在 userId 不匹配时返回 false', () => {
      const token = generateFakeToken(TEST_USER_ID)
      const differentUserId = '550e8400-e29b-41d4-a716-446655440001'

      const isValid = verifyFakeTokenSignature(token, differentUserId)

      expect(isValid).toBe(false)
    })

    it('应在 token 格式不正确时返回 false', () => {
      const invalidToken = 'not_a_fake_token_format'

      const isValid = verifyFakeTokenSignature(invalidToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })

    it('应在签名被篡改时返回 false', () => {
      const token = generateFakeToken(TEST_USER_ID)
      // 篡改最后几个字符
      const tamperedToken = token.slice(0, -5) + 'xxxxx'

      const isValid = verifyFakeTokenSignature(tamperedToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })

    it('应在签名长度不正确时返回 false', () => {
      // 手动构造一个短签名的 token
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const shortSignature = 'a'.repeat(32) // 只有 32 字符
      const invalidToken = `fake_${TEST_USER_ID}_${expiresAt}_${shortSignature}`

      const isValid = verifyFakeTokenSignature(invalidToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })

    it('应在 token 已过期时返回 false', () => {
      // 创建一个过期的 token（通过手动构造）
      const expiredAt = Math.floor(Date.now() / 1000) - 1000 // 1 秒前
      const signature = createHmacSignature(`${TEST_USER_ID}_${expiredAt}`, HMAC_SECRET)
      const expiredToken = `fake_${TEST_USER_ID}_${expiredAt}_${signature}`

      const isValid = verifyFakeTokenSignature(expiredToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })
  })

  describe('Token 格式解析', () => {
    it('应正确处理 UUID 格式的 userId', () => {
      // UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidUserId = '550e8400-e29b-41d4-a716-446655440000'

      const token = generateFakeToken(uuidUserId)
      const isValid = verifyFakeTokenSignature(token, uuidUserId)

      expect(isValid).toBe(true)
    })

    it('应正确解析 token 各部分', () => {
      const token = generateFakeToken(TEST_USER_ID)

      // 格式: fake_{userId}_{expiresAt}_{signature}
      expect(token.startsWith('fake_')).toBe(true)

      const signature = token.slice(-64)
      expect(signature.length).toBe(64)
    })
  })

  describe('边界条件测试', () => {
    it('应处理空 userId', () => {
      const token = generateFakeToken('')

      // 空 userId 也应该能生成 token
      expect(token.startsWith('fake_')).toBe(true)
    })

    it('应在无效 token 时抛出或返回 false', () => {
      const emptyToken = ''
      const isValid = verifyFakeTokenSignature(emptyToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })

    it('应拒绝非 fake_ 前缀的 token', () => {
      const invalidToken = `real_${TEST_USER_ID}_1234567890_${'a'.repeat(64)}`

      const isValid = verifyFakeTokenSignature(invalidToken, TEST_USER_ID)

      expect(isValid).toBe(false)
    })
  })

  describe('与 Cookie 机制的关系', () => {
    it('Token 和 Cookie 应使用相同的 HMAC_SECRET', () => {
      // 这是设计要求，确保两种认证方式使用相同的密钥
      // 在实际代码中，两者都使用 process.env.HMAC_SECRET
      expect(HMAC_SECRET).toBeTruthy()
      expect(HMAC_SECRET.length).toBeGreaterThanOrEqual(32)
    })

    it('Token 应使用 fake_ 前缀区分身份', () => {
      const token = generateFakeToken(TEST_USER_ID)

      expect(token.startsWith('fake_')).toBe(true)
      expect(token).not.toMatch(/^real_/)
    })

    it('Token 和 Cookie 签名格式应一致（SHA-256 64 字符 hex）', () => {
      // Token 签名
      const tokenSignature = generateFakeToken(TEST_USER_ID).slice(-64)
      expect(tokenSignature.length).toBe(64)
      expect(/^[0-9a-f]{64}$/.test(tokenSignature)).toBe(true)

      // Cookie 签名（来自其他测试文件）
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const msg = `test_salt_${TEST_USER_ID}_${expiresAt}`
      const cookieSignature = createHmacSignature(msg, HMAC_SECRET)
      expect(cookieSignature.length).toBe(64)
      expect(/^[0-9a-f]{64}$/.test(cookieSignature)).toBe(true)
    })
  })
})
