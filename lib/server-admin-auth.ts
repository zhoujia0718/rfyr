/**
 * 服务端管理员认证中间件
 *
 * 安全修复 (P-A-06):
 * - 支持新的 Base64 编码 Cookie 格式（userId 不明文）
 * - 保持向后兼容旧的 HMAC 格式
 * - 移除旧版 admin-session 的不安全 fallback
 *
 * 从 admin-session-local cookie 验证管理员身份（HMAC 签名验证）。
 * 解析失败 → 401。
 */
import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"

const HMAC_SECRET = process.env.HMAC_SECRET

/**
 * 验证 admin-session-local cookie 的 HMAC 签名
 *
 * 支持两种格式：
 * 1. 新格式（Base64 编码）: Base64(salt_userId_expiresAt_signature)
 * 2. 旧格式（纯文本）: userId_expiresAt_signature
 *
 * P-A-06 修复: Cookie 中 userId 不再明文可见
 */
function verifyAdminCookieSignature(cookieValue: string): string | null {
  if (!HMAC_SECRET) {
    console.error("[AdminAuth] HMAC_SECRET 未配置，无法验证 admin-session-local")
    return null
  }

  try {
    // 尝试判断格式
    // 新格式是 Base64 编码的字符串，解码后应该是 4 部分
    // 旧格式是直接的 userId_expiresAt_signature

    let parts: string[]

    // 尝试 Base64 解码（新格式）
    try {
      const decoded = Buffer.from(cookieValue, "base64").toString("utf-8")
      const decodedParts = decoded.split("_")

      // 新格式: salt_userId_expiresAt_signature (4 parts)
      // salt 是 8 字节 hex = 16 字符
      if (decodedParts.length === 4 && decodedParts[0].length === 16) {
        const [salt, userId, expiresAtStr, signature] = decodedParts
        const expiresAt = parseInt(expiresAtStr, 10)

        if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
          return null // 过期
        }

        // 验证 HMAC
        const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
        const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8"))
          .update(msgBuf)
          .digest("hex")

        if (signature !== expectedSig) {
          return null // 签名不匹配
        }

        return userId
      }
    } catch {
      // Base64 解码失败，尝试旧格式
    }

    // 旧格式: userId_expiresAt_signature (3+ parts, signature 是 64 字符)
    const allParts = cookieValue.split("_")
    if (allParts.length < 3) return null

    const signature = allParts[allParts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = allParts.slice(0, -1).join("_")
    const keyBuf = Buffer.from(HMAC_SECRET, "utf-8")
    const msgBuf = Buffer.from(remainder, "utf-8")
    const expectedSig = createHmac("sha256", keyBuf).update(msgBuf).digest("hex")

    if (signature !== expectedSig) return null

    // 提取 expiresAt 和 userId
    // remainder 格式: userId_expiresAt 或 userId_subId_expiresAt（UUID 可能包含 _）
    const parts2 = remainder.split("_")
    const expiresAt = parseInt(parts2[parts2.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    // userId 是除了最后一个（expiresAt）和倒数第二个（signature 位置）之外的部分
    // 但对于旧格式，remainder = userId_expiresAt（UUID 不包含 _）
    // 所以 userId = parts2[0]
    return parts2[0]

  } catch {
    return null
  }
}

/**
 * 管理员认证中间件
 *
 * 验证流程:
 * 1. 获取 admin-session-local cookie
 * 2. 验证 HMAC 签名和过期时间（支持新旧两种格式）
 *
 * Cookie 由 /api/admin/login 在管理员邮箱验证通过后签发，
 * HMAC 验证通过即可信任身份，无需再次查询数据库。
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const adminSessionLocal = request.cookies.get("admin-session-local")

  if (!adminSessionLocal?.value) {
    return NextResponse.json(
      { error: "请先登录管理员账号" },
      { status: 401 }
    )
  }

  const userId = verifyAdminCookieSignature(adminSessionLocal.value)

  if (!userId) {
    return NextResponse.json(
      { error: "请先登录管理员账号" },
      { status: 401 }
    )
  }

  // HMAC 签名验证通过即代表管理员身份合法，返回 null 表示成功
  return null
}

/**
 * 从 Cookie 提取管理员 userId（不验证权限）
 * 供其他 API 直接复用正确的 Base64/HMAC 解析逻辑
 */
export function parseAdminFromCookie(request: NextRequest): { userId: string | null } {
  const adminSessionLocal = request.cookies.get("admin-session-local")
  if (!adminSessionLocal?.value) {
    return { userId: null }
  }
  const userId = verifyAdminCookieSignature(adminSessionLocal.value)
  return { userId }
}
