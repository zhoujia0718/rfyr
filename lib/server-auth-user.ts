import { createClient } from "@supabase/supabase-js"
import { NextRequest } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 从请求头 Authorization: Bearer <access_token> 解析 Supabase 用户 ID。
 * 用于 Route Handler（服务端无法读 localStorage / custom_auth）。
 *
 * 支持两种认证方式：
 * 1. 真实 Supabase access_token → 通过 supabase.auth.getUser(token) 验证
 * 2. 伪造 token（pwd_ / magic_ / pwd_refresh_ / magic_refresh_ 前缀）
 *    → 信任 X-User-Id header（前端 localStorage 已有登录信息）
 *    → 备用：信任 ?uid= query 参数
 *
 * 注意：伪造 token 时，前端应同时传 X-User-Id header 以明确指定用户 ID。
 */
export async function getUserIdFromBearer(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  console.log("[getUserIdFromBearer] authorization header:", authHeader)
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    console.log("[getUserIdFromBearer] 没有 Bearer token")
    return null
  }

  const token = authHeader.slice(7).trim()
  console.log("[getUserIdFromBearer] token:", token)
  if (!token) return null

  // ── 真实 Supabase token ──────────────────────────────────────────────────
  if (!/^(pwd_|magic_|magic_refresh_|pwd_refresh_)/i.test(token)) {
    console.log("[getUserIdFromBearer] 使用 Supabase getUser 验证")
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)
    console.log("[getUserIdFromBearer] Supabase getUser result:", { userId: user?.id, error: error?.message })

    if (!error && user?.id) {
      return user.id
    }

    // token 过期或无效，但如果有 x-user-id header，信任它（适用于本地 fake token + 真实 token 过期场景）
    const userIdHeader = request.headers.get("x-user-id")
    console.log("[getUserIdFromBearer] token 验证失败，检查 x-user-id header:", userIdHeader)
    if (userIdHeader?.trim()) {
      return userIdHeader.trim()
    }
    return null
  }

  // ── 伪造 token：信任 x-user-id header（Next.js 会把 header 名称转成小写）────────
  const userIdHeader = request.headers.get("x-user-id")
  console.log("[getUserIdFromBearer] x-user-id header:", userIdHeader)
  if (userIdHeader?.trim()) {
    return userIdHeader.trim()
  }

  // ── 伪造 token：信任 ?uid= query 参数（兜底）────────────────────────────
  const url = new URL(request.url)
  const uidParam = url.searchParams.get("uid")
  console.log("[getUserIdFromBearer] uid query param:", uidParam)
  if (uidParam?.trim()) {
    return uidParam.trim()
  }

  console.log("[getUserIdFromBearer] 所有方式都失败，返回 null")
  return null
}
