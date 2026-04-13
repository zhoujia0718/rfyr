/**
 * Middleware: 管理后台服务端权限拦截
 *
 * 路由规则：
 * - /admin/login/*   → 放行（无需认证）
 * - /admin/*        → 检查认证，无则 redirect 到 /admin/login
 *
 * 认证方式（任一满足即可）：
 * 1. cookie 中存在 admin-session（admin/login 登录成功后写入）
 * 2. cookie 中存在 Supabase session（sb-*）
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 仅拦截 /admin 路由（排除 /admin/login）
  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    console.log('[Middleware] pass (not admin or admin/login):', pathname)
    return NextResponse.next()
  }

  console.log('[Middleware] checking auth for:', pathname)
  console.log('[Middleware] all cookies:', request.cookies.getAll())

  // 1. 检查 admin-session-local cookie（新版登录接口写入）
  // cookie 本身有 max-age=604800（7天），直接信任存在即有效
  // loginTime 仅用于兼容旧数据格式校验
  const adminSessionLocal = request.cookies.get("admin-session-local")
  if (adminSessionLocal?.value) {
    try {
      JSON.parse(decodeURIComponent(adminSessionLocal.value))
      return NextResponse.next()
    } catch {
      // cookie 解析失败，继续其他检查
    }
  }

  // 2. 检查 admin-session cookie（旧版直接存 userId）
  const adminSession = request.cookies.get("admin-session")
  if (adminSession?.value) {
    return NextResponse.next()
  }

  // 3. 检查 Supabase session cookie（supabase.auth.getUser() 依赖此 cookie）
  const supabaseCookies = request.cookies.getAll().filter((c) => c.name.startsWith("sb-"))
  if (supabaseCookies.length > 0) {
    return NextResponse.next()
  }

  // 未认证 → 重定向到 admin 登录页（而非首页）
  const loginUrl = new URL("/admin/login", request.url)
  loginUrl.searchParams.set("from", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/admin/:path*", "/admin"],
}
