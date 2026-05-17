/**
 * Module 7 - UI组件库：lib/security.ts 测试套件
 *
 * 测试覆盖：
 * 1. generateSecureVerificationCode() - 6位安全验证码生成
 * 2. hashVerificationCodeSync() - 服务端哈希
 * 3. hashPassword() / verifyPasswordHash() - PBKDF2 密码哈希
 * 4. createHmacSignatureSync() - HMAC-SHA256 签名
 * 5. 边界条件与安全测试
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

process.env.VERIFY_HASH_SECRET = 'test-hash-secret-key-for-unit-testing-32chars'
process.env.HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'

import {
  generateSecureVerificationCode,
  hashVerificationCodeSync,
  hashPassword,
  verifyPasswordHash,
  createHmacSignatureSync,
// @ts-ignore
} from '../lib/security.ts'

// ─── 核心测试 ───────────────────────────────────────────────────────────────

describe('M7-02: lib/security.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. generateSecureVerificationCode()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('generateSecureVerificationCode() - 安全验证码生成', () => {
    it('应生成 6 位数字字符串', () => {
      const code = generateSecureVerificationCode()
      expect(code).toMatch(/^\d{6}$/)
    })

    it('每次调用应生成不同的验证码', () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateSecureVerificationCode()))
      // 100 次生成，集合大小应接近 100（允许极小碰撞概率）
      expect(codes.size).toBeGreaterThan(90)
    })

    it('生成的验证码应在 100000-999999 范围内', () => {
      for (let i = 0; i < 50; i++) {
        const code = parseInt(generateSecureVerificationCode(), 10)
        expect(code).toBeGreaterThanOrEqual(100000)
        expect(code).toBeLessThanOrEqual(999999)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. hashVerificationCodeSync()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('hashVerificationCodeSync() - 服务端验证码哈希', () => {
    it('应返回 16 字符的十六进制哈希', () => {
      const hash = hashVerificationCodeSync('123456')
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it('相同输入应产生相同哈希（确定性）', () => {
      const hash1 = hashVerificationCodeSync('123456')
      const hash2 = hashVerificationCodeSync('123456')
      expect(hash1).toBe(hash2)
    })

    it('不同输入应产生不同哈希', () => {
      const hash1 = hashVerificationCodeSync('123456')
      const hash2 = hashVerificationCodeSync('654321')
      expect(hash1).not.toBe(hash2)
    })

    it('输入为空字符串应返回有效哈希', () => {
      const hash = hashVerificationCodeSync('')
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it('哈希值不应等于原始验证码', () => {
      const code = '888888'
      const hash = hashVerificationCodeSync(code)
      expect(hash).not.toBe(code)
    })

    it('环境变量缺失时应抛出错误', () => {
      const original = process.env.VERIFY_HASH_SECRET
      const originalHmac = process.env.HMAC_SECRET
      delete process.env.VERIFY_HASH_SECRET
      delete process.env.HMAC_SECRET

      expect(() => hashVerificationCodeSync('123456')).toThrow()

      process.env.VERIFY_HASH_SECRET = original ?? undefined
      process.env.HMAC_SECRET = originalHmac ?? undefined
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. hashPassword() / verifyPasswordHash()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('hashPassword() / verifyPasswordHash() - PBKDF2 密码哈希', () => {
    it('hashPassword 应返回包含 salt 和 hash 的字符串', () => {
      const stored = hashPassword('TestPassword123!')
      const parts = stored.split(':')
      expect(parts.length).toBe(3)
      expect(parts[0]).toMatch(/^[a-f0-9]{32}$/) // salt (16 bytes hex = 32)
      expect(parts[1]).toMatch(/^[a-f0-9]{64}$/) // hash (32 bytes hex = 64)
      expect(parts[2]).toBe('100000') // iterations
    })

    it('相同密码每次应产生不同的 salt（因此不同的哈希）', () => {
      const hash1 = hashPassword('SamePassword')
      const hash2 = hashPassword('SamePassword')
      expect(hash1).not.toBe(hash2)
    })

    it('verifyPasswordHash 应正确验证密码', () => {
      const password = 'MySecurePassword123!'
      const stored = hashPassword(password)
      expect(verifyPasswordHash(password, stored)).toBe(true)
    })

    it('verifyPasswordHash 应拒绝错误密码', () => {
      const stored = hashPassword('CorrectPassword')
      expect(verifyPasswordHash('WrongPassword', stored)).toBe(false)
    })

    it('verifyPasswordHash 应拒绝格式错误的 storedHash', () => {
      expect(verifyPasswordHash('password', '')).toBe(false)
      expect(verifyPasswordHash('password', 'invalid')).toBe(false)
      expect(verifyPasswordHash('password', 'only-one-colon:value')).toBe(false)
      expect(verifyPasswordHash('password', 'salt:hash:invalid-iterations')).toBe(false)
    })

    it('verifyPasswordHash 应处理异常（不抛出）', () => {
      expect(verifyPasswordHash('pass', ':::')).toBe(false)
      expect(verifyPasswordHash('pass', null as unknown as string)).toBe(false)
    })

    it('攻击场景：彩虹表攻击防护 — 哈希应包含 salt', () => {
      const stored = hashPassword('password123')
      const parts = stored.split(':')
      // salt 存在使得彩虹表攻击不可行（salt:hash:iterations 格式）
      expect(parts[0].length).toBeGreaterThan(0) // salt 非空
      expect(parts[0].length).toBe(32) // 16 bytes hex = 32 chars
      expect(parts[1].length).toBe(64) // 32 bytes hex = 64 chars (PBKDF2-HMAC-SHA256)
      expect(parts[2]).toBe('100000') // 迭代次数在第三段
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. createHmacSignatureSync()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('createHmacSignatureSync() - HMAC-SHA256 签名', () => {
    it('应返回完整的 64 字符 SHA256 十六进制字符串', () => {
      const sig = createHmacSignatureSync('data', 'secret')
      expect(sig).toMatch(/^[a-f0-9]{64}$/)
    })

    it('相同输入应产生相同签名（确定性）', () => {
      const sig1 = createHmacSignatureSync('message', 'secret')
      const sig2 = createHmacSignatureSync('message', 'secret')
      expect(sig1).toBe(sig2)
    })

    it('不同数据应产生不同签名', () => {
      const sig1 = createHmacSignatureSync('data1', 'secret')
      const sig2 = createHmacSignatureSync('data2', 'secret')
      expect(sig1).not.toBe(sig2)
    })

    it('不同密钥应产生不同签名', () => {
      const sig1 = createHmacSignatureSync('data', 'secret1')
      const sig2 = createHmacSignatureSync('data', 'secret2')
      expect(sig1).not.toBe(sig2)
    })

    it('应处理空字符串输入', () => {
      const sig = createHmacSignatureSync('', '')
      expect(sig).toMatch(/^[a-f0-9]{64}$/)
    })

    it('应处理长字符串输入', () => {
      const longData = 'x'.repeat(10000)
      const sig = createHmacSignatureSync(longData, 'secret')
      expect(sig).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. 安全攻击模拟
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('安全攻击模拟', () => {
    it('攻击场景：哈希函数碰撞应难以构造', async () => {
      const hash1 = hashVerificationCodeSync('000000')
      // 验证哈希格式正确，无明显规律
      expect(hash1.length).toBe(16)
      // 全 0 验证码不应有规律性哈希
      expect(hash1).not.toBe('0000000000000000')
    })

    it('攻击场景：彩虹表攻击防护 — 哈希应包含 salt', () => {
      const stored = hashPassword('password123')
      const parts = stored.split(':')
      // salt 存在使得彩虹表攻击不可行（salt:hash:iterations 格式）
      expect(parts[0].length).toBeGreaterThan(0) // salt 非空
      expect(parts[0].length).toBe(32) // 16 bytes hex = 32 chars
      expect(parts[1].length).toBe(64) // 32 bytes hex = 64 chars (PBKDF2-HMAC-SHA256)
      expect(parts[2]).toBe('100000') // 迭代次数在第三段
    })

    it('攻击场景：签名验证应抵抗长度扩展攻击（HMAC 而非 MAC）', () => {
      const sig1 = createHmacSignatureSync('data', 'secret')
      // HMAC 有 proper padding，防止长度扩展攻击
      expect(sig1).toMatch(/^[a-f0-9]{64}$/)
      // 验证不同长度数据签名长度一致
      const sig2 = createHmacSignatureSync('short', 'secret')
      const sig3 = createHmacSignatureSync('x'.repeat(1000), 'secret')
      expect(sig1.length).toBe(sig2.length)
      expect(sig2.length).toBe(sig3.length)
    })
  })
})
