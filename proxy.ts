/**
 * Proxy (middleware): 管理后台服务端权限拦截 + 全站安全响应头
 *
 * 认证拦截：
 * - /admin/login/*   → 放行（无需认证）
 * - /admin/*        → 检查认证，无则 redirect 到 /admin/login
 *
 * 安全头：
 * - X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy 等
 *
 * 静态资源缓存：
 * - .ico .svg .png .jpg .woff2 等文件 Cache-Control: max-age=31536000
 *
 * 认证方式：
 * 1. cookie 中存在 admin-session-local（Base64 编码的 HMAC 签名格式）
 * 2. cookie 中存在 admin-session（旧版，直接存 userId）
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createHmac } from "crypto"

const staticExtensions = [".ico", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2", ".woff", ".ttf"]

function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  )
  return response
}

/**
 * 验证 HMAC 签名 cookie（与 app/api/admin/login/route.ts 保持一致）
 * 格式: Base64(salt_userId_expiresAt_signature)
 */
function verifyAdminCookie(cookieValue: string): boolean {
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8")
    const parts = decoded.split("_")

    if (parts.length !== 4) return false

    const [salt, userId, expiresAtStr, signature] = parts
    const expiresAt = parseInt(expiresAtStr, 10)

    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
      return false // 过期
    }

    const HMAC_SECRET = process.env.HMAC_SECRET
    if (!HMAC_SECRET) return false

    const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
    const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET, "utf-8"))
      .update(msgBuf)
      .digest("hex")

    return signature === expectedSig
  } catch {
    return false
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 静态资源长期缓存
  const isStatic = staticExtensions.some((ext) => pathname.endsWith(ext))

  // ── 安全头（所有响应） ─────────────────────────────────────────
  let response = NextResponse.next()
  setSecurityHeaders(response)

  if (isStatic) {
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable")
  }

  // ── 管理后台鉴权 ───────────────────────────────────────────
  // 放行 /admin/login 开头的所有路径（登录页无需认证）
  if (pathname.startsWith("/admin/login")) {
    return response
  }
  if (!pathname.startsWith("/admin")) {
    return response
  }

  // 检查管理员认证
  let isAuthenticated = false

  // 1. 检查 admin-session-local cookie（Base64 编码的 HMAC 签名格式）
  const adminSessionLocal = request.cookies.get("admin-session-local")
  if (adminSessionLocal?.value) {
    if (verifyAdminCookie(adminSessionLocal.value)) {
      isAuthenticated = true
    }
  }

  // 2. 检查 admin-session cookie（旧版）
  if (!isAuthenticated) {
    const adminSession = request.cookies.get("admin-session")
    if (adminSession?.value && adminSession.value.length > 0) {
      isAuthenticated = true
    }
  }

  if (!isAuthenticated) {
    // 未认证 → 重定向到 admin 登录页
    const loginUrl = new URL("/admin/login", request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // 匹配所有路径，为静态资源和 /admin/* 提供不同的处理
    "/((?!_next/static|_next/image|api|favicon.ico).*)",
  ],
}
