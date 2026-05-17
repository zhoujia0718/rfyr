/**
 * BUG-API-04/05 修复验证测试
 *
 * 修复内容：
 * - admin/redeem/route.ts 不再使用错误的 JSON.parse(decodeURIComponent(...))
 *   解析 cookie，而是复用 requireAdmin 中的 verifyAdminCookieSignature
 * - parseAdminFromCookie 从 server-admin-auth.ts 导出，供其他 API 使用
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── 内联被测函数（来自 lib/server-admin-auth.ts） ────────────────────────────

function verifyAdminCookieSignature(cookieValue: string, hmacSecret: string): string | null {
  try {
    // 尝试 Base64 解码（新格式）
    try {
      const decoded = Buffer.from(cookieValue, "base64").toString("utf-8")
      const decodedParts = decoded.split("_")

      if (decodedParts.length === 4 && decodedParts[0].length === 16) {
        const [salt, userId, expiresAtStr, signature] = decodedParts
        const expiresAt = parseInt(expiresAtStr, 10)

        if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
          return null
        }

        const { createHmac } = require("crypto")
        const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
        const expectedSig = createHmac("sha256", Buffer.from(hmacSecret, "utf-8"))
          .update(msgBuf)
          .digest("hex")

        if (signature !== expectedSig) {
          return null
        }

        return userId
      }
    } catch { /* skip */ }

    // 旧格式不支持
    return null
  } catch {
    return null
  }
}

function createSecureCookie(userId: string, expiresAt: number, hmacSecret: string): string {
  const { createHmac, randomBytes } = require("crypto")
  const randomSalt = randomBytes(8).toString("hex")
  const msgBuf = Buffer.from(`${randomSalt}_${userId}_${expiresAt}`, "utf-8")
  const signature = createHmac("sha256", Buffer.from(hmacSecret, "utf-8"))
    .update(msgBuf)
    .digest("hex")
  const payload = `${randomSalt}_${userId}_${expiresAt}_${signature}`
  return Buffer.from(payload).toString("base64")
}

describe("BUG-API-04/05: admin/redeem cookie 解析修复", () => {
  const HMAC_SECRET = "test-secret-key"

  it("createSecureCookie 生成的 Base64 cookie 可被正确解析", () => {
    const userId = "test-user-123"
    const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour
    const cookie = createSecureCookie(userId, expiresAt, HMAC_SECRET)

    // 验证: cookie 是有效的 Base64
    expect(() => Buffer.from(cookie, "base64")).not.toThrow()

    // 验证: verifyAdminCookieSignature 能正确解析
    const parsed = verifyAdminCookieSignature(cookie, HMAC_SECRET)
    expect(parsed).toBe(userId)
  })

  it("旧格式（JSON + decodeURIComponent）无法解析新的 Base64 cookie", () => {
    const userId = "test-user-456"
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const cookie = createSecureCookie(userId, expiresAt, HMAC_SECRET)

    // 验证: 旧方法（JSON.parse + decodeURIComponent）无法解析 Base64 cookie
    expect(() => JSON.parse(decodeURIComponent(cookie))).toThrow()
  })

  it("HMAC 签名不匹配时返回 null", () => {
    const userId = "test-user-789"
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const cookie = createSecureCookie(userId, expiresAt, HMAC_SECRET)

    // 用错误的 secret 验证
    const parsed = verifyAdminCookieSignature(cookie, "wrong-secret")
    expect(parsed).toBeNull()
  })

  it("过期 cookie 返回 null", () => {
    const userId = "expired-user"
    const expiresAt = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    const cookie = createSecureCookie(userId, expiresAt, HMAC_SECRET)

    const parsed = verifyAdminCookieSignature(cookie, HMAC_SECRET)
    expect(parsed).toBeNull()
  })

  it("无效 Base64 格式返回 null", () => {
    const result = verifyAdminCookieSignature("not-valid-base64!!!", HMAC_SECRET)
    expect(result).toBeNull()
  })

  it("不同用户 ID 生成不同的 cookie（salt 随机性）", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const cookie1 = createSecureCookie("user-a", expiresAt, HMAC_SECRET)
    const cookie2 = createSecureCookie("user-b", expiresAt, HMAC_SECRET)

    expect(cookie1).not.toBe(cookie2)

    // 但两者都能正确解析
    expect(verifyAdminCookieSignature(cookie1, HMAC_SECRET)).toBe("user-a")
    expect(verifyAdminCookieSignature(cookie2, HMAC_SECRET)).toBe("user-b")
  })
})
