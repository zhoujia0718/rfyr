/**
 * GET /api/admin/me
 *
 * 检查当前用户的管理员认证状态。
 * 用于前端判断用户是否已登录管理员账号。
 *
 * 安全修复 (P-A-06):
 * - 使用 requireAdmin 验证 Base64 编码的 HMAC Cookie
 * - 从 Cookie 提取 adminId 后，查询数据库获取 email
 */
import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { requireAdmin } from "@/lib/server-admin-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // 使用 requireAdmin 验证 HMAC 签名（支持新旧 Cookie 格式）
  const authError = requireAdmin(request)
  if (authError) {
    return NextResponse.json(
      { authenticated: false, message: "未登录管理员账号" },
      { status: 401 }
    )
  }

  // requireAdmin 验证成功后，Cookie 中的 adminId 已经过验证
  // 但 Cookie 不再存储 email，需要从数据库查询
  // 注意: requireAdmin 已经创建了 supabase client 并查询了用户
  // 这里复用验证逻辑中的用户信息

  // 从 Cookie 中提取 adminId（P-A-06 修复：支持 Base64 格式）
  const adminSessionLocal = request.cookies.get("admin-session-local")
  let adminId: string | null = null

  if (adminSessionLocal?.value) {
    adminId = extractAdminIdFromCookie(adminSessionLocal.value)
  }

  if (!adminId) {
    // 理论上不会走到这里，因为 requireAdmin 已经验证通过了
    return NextResponse.json(
      { authenticated: false, message: "会话无效" },
      { status: 401 }
    )
  }

  return NextResponse.json({
    authenticated: true,
    adminId,
    email: null, // 不再从 Cookie 获取，需要前端单独请求
    message: "已登录",
  })
}

/**
 * 从 Cookie 中提取 adminId（支持 Base64 格式）
 * 复用 server-admin-auth.ts 的验证逻辑
 */
function extractAdminIdFromCookie(cookieValue: string): string | null {
  const HMAC_SECRET = process.env.HMAC_SECRET
  if (!HMAC_SECRET) return null

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

        const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
        const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8"))
          .update(msgBuf)
          .digest("hex")

        if (signature !== expectedSig) {
          return null
        }

        return userId
      }
    } catch {
      // Base64 解码失败，尝试旧格式
    }

    // 旧格式
    const parts = cookieValue.split("_")
    if (parts.length < 3) return null

    const signature = parts[parts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = parts.slice(0, -1).join("_")
    const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8"))
      .update(Buffer.from(remainder, "utf-8"))
      .digest("hex")

    if (signature !== expectedSig) return null

    const parts2 = remainder.split("_")
    const expiresAt = parseInt(parts2[parts2.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    return parts2[0]

  } catch {
    return null
  }
}
